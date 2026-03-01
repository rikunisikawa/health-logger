import json
import os

os.environ.setdefault("ATHENA_DATABASE", "test-db")
os.environ.setdefault("ATHENA_OUTPUT_BUCKET", "test-bucket")

from unittest.mock import MagicMock, patch

import pytest


# ── Health check ───────────────────────────────────────────────────────────────

def test_health_check():
    import handler
    result = handler.lambda_handler({"rawPath": "/health"}, None)
    assert result["statusCode"] == 200
    assert json.loads(result["body"]) == {"status": "ok"}


# ── Auth ───────────────────────────────────────────────────────────────────────

def test_missing_auth():
    import handler
    result = handler.lambda_handler({"rawPath": "/records/latest"}, None)
    assert result["statusCode"] == 401


def test_invalid_user_id():
    import handler
    event = {
        "rawPath": "/records/latest",
        "requestContext": {
            "authorizer": {"jwt": {"claims": {"sub": "not-a-uuid"}}}
        },
    }
    result = handler.lambda_handler(event, None)
    assert result["statusCode"] == 401


# ── Successful query ───────────────────────────────────────────────────────────

def _auth_event(limit=None):
    event = {
        "rawPath": "/records/latest",
        "requestContext": {
            "authorizer": {
                "jwt": {"claims": {"sub": "12345678-1234-1234-1234-123456789abc"}}
            }
        },
    }
    if limit is not None:
        event["queryStringParameters"] = {"limit": str(limit)}
    return event


@patch("handler.athena")
def test_handler_success(mock_athena):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-1"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {
            "Rows": [
                {"Data": [{"VarCharValue": "id"}, {"VarCharValue": "fatigue_score"}]},
                {"Data": [{"VarCharValue": "rec-1"}, {"VarCharValue": "70"}]},
            ]
        }
    }

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert len(body["records"]) == 1
    assert body["records"][0]["fatigue_score"] == "70"


@patch("handler.athena")
def test_handler_limit_capped(mock_athena):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-2"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {"Rows": [{"Data": [{"VarCharValue": "id"}]}]}
    }

    import handler
    # limit=999 should be capped at 100 in the SQL
    result = handler.lambda_handler(_auth_event(limit=999), None)
    assert result["statusCode"] == 200
    call_args = mock_athena.start_query_execution.call_args
    assert "LIMIT 100" in call_args[1]["QueryString"]


@patch("handler.athena")
def test_handler_query_failed(mock_athena):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-3"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "FAILED"}}
    }

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 500
