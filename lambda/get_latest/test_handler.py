import sys, os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
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
    # limit=9999 should be capped at 1000 in the SQL
    result = handler.lambda_handler(_auth_event(limit=9999), None)
    assert result["statusCode"] == 200
    call_args = mock_athena.start_query_execution.call_args
    assert "LIMIT 1000" in call_args[1]["QueryString"]


@patch("handler.athena")
def test_handler_query_failed(mock_athena):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-3"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "FAILED"}}
    }

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 500


# ── record_type / date_from / date_to ─────────────────────────────────────────

def _auth_event_params(**params):
    return {
        "rawPath": "/records/latest",
        "requestContext": {
            "authorizer": {
                "jwt": {"claims": {"sub": "12345678-1234-1234-1234-123456789abc"}}
            }
        },
        "queryStringParameters": params,
    }


@patch("handler.athena")
def test_record_type_status_filter(mock_athena):
    """record_type=status adds record_type = 'status' to WHERE clause"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-rt"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {"Rows": [{"Data": [{"VarCharValue": "id"}]}]}
    }

    import handler
    result = handler.lambda_handler(_auth_event_params(record_type="status"), None)
    assert result["statusCode"] == 200
    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "record_type = 'status'" in qs


def test_invalid_record_type_returns_400():
    """Unknown / injection attempt record_type returns 400"""
    import handler
    result = handler.lambda_handler(
        _auth_event_params(record_type="'; DROP TABLE health_records --"),
        None,
    )
    assert result["statusCode"] == 400


@patch("handler.athena")
def test_date_from_filter(mock_athena):
    """date_from adds dt >= '...' to WHERE clause"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-df"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {"Rows": [{"Data": [{"VarCharValue": "id"}]}]}
    }

    import handler
    result = handler.lambda_handler(_auth_event_params(date_from="2024-01-01"), None)
    assert result["statusCode"] == 200
    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "dt >= '2024-01-01'" in qs


@patch("handler.athena")
def test_date_to_filter(mock_athena):
    """date_to adds dt <= '...' to WHERE clause"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-dt"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {"Rows": [{"Data": [{"VarCharValue": "id"}]}]}
    }

    import handler
    result = handler.lambda_handler(_auth_event_params(date_to="2024-01-31"), None)
    assert result["statusCode"] == 200
    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "dt <= '2024-01-31'" in qs


def test_invalid_date_from_returns_400():
    import handler
    result = handler.lambda_handler(_auth_event_params(date_from="2024-1-1"), None)
    assert result["statusCode"] == 400


def test_invalid_date_to_returns_400():
    import handler
    result = handler.lambda_handler(_auth_event_params(date_to="not-a-date"), None)
    assert result["statusCode"] == 400


@patch("handler.athena")
def test_limit_cap_increased_to_1000(mock_athena):
    """limit is capped at 1000 (raised from 100 to support status history)"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-cap"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {"Rows": [{"Data": [{"VarCharValue": "id"}]}]}
    }

    import handler
    result = handler.lambda_handler(_auth_event_params(limit="9999"), None)
    assert result["statusCode"] == 200
    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "LIMIT 1000" in qs
