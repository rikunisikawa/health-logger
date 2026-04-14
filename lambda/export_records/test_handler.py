import json
import os

os.environ.setdefault("ATHENA_DATABASE", "test-db")
os.environ.setdefault("ATHENA_OUTPUT_BUCKET", "test-bucket")
os.environ.setdefault("EXPORT_BUCKET", "test-export-bucket")

from unittest.mock import MagicMock, patch, call

import pytest


_USER_ID = "12345678-1234-1234-1234-123456789abc"


def _auth_event(**params):
    event = {
        "rawPath": "/export",
        "requestContext": {
            "authorizer": {
                "jwt": {"claims": {"sub": _USER_ID}}
            }
        },
    }
    if params:
        event["queryStringParameters"] = {k: v for k, v in params.items()}
    return event


# ── Health check ───────────────────────────────────────────────────────────────

def test_health_check():
    import handler
    result = handler.lambda_handler({"rawPath": "/health"}, None)
    assert result["statusCode"] == 200
    assert json.loads(result["body"]) == {"status": "ok"}


# ── Auth ───────────────────────────────────────────────────────────────────────

def test_missing_auth():
    import handler
    result = handler.lambda_handler({"rawPath": "/export"}, None)
    assert result["statusCode"] == 401


def test_invalid_user_id():
    import handler
    event = {
        "rawPath": "/export",
        "requestContext": {
            "authorizer": {"jwt": {"claims": {"sub": "not-a-uuid"}}}
        },
    }
    result = handler.lambda_handler(event, None)
    assert result["statusCode"] == 401


# ── Validation ─────────────────────────────────────────────────────────────────

def test_invalid_format_returns_400():
    import handler
    result = handler.lambda_handler(_auth_event(format="xml"), None)
    assert result["statusCode"] == 400
    body = json.loads(result["body"])
    assert "format" in body["error"].lower()


def test_invalid_date_from_returns_400():
    import handler
    result = handler.lambda_handler(_auth_event(format="csv", date_from="2024-1-1"), None)
    assert result["statusCode"] == 400


def test_invalid_date_to_returns_400():
    import handler
    result = handler.lambda_handler(_auth_event(format="json", date_to="not-a-date"), None)
    assert result["statusCode"] == 400


# ── CSV export ─────────────────────────────────────────────────────────────────

@patch("handler.s3")
@patch("handler.athena")
def test_csv_export_success(mock_athena, mock_s3):
    """CSV export: queries Athena, generates CSV, uploads to S3, returns presigned URL."""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-csv"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {
            "Rows": [
                {"Data": [
                    {"VarCharValue": "id"},
                    {"VarCharValue": "recorded_at"},
                    {"VarCharValue": "fatigue_score"},
                    {"VarCharValue": "mood_score"},
                    {"VarCharValue": "motivation_score"},
                    {"VarCharValue": "flags"},
                    {"VarCharValue": "note"},
                ]},
                {"Data": [
                    {"VarCharValue": "rec-1"},
                    {"VarCharValue": "2026-01-01 08:00:00.000"},
                    {"VarCharValue": "60"},
                    {"VarCharValue": "70"},
                    {"VarCharValue": "50"},
                    {"VarCharValue": "9"},
                    {"VarCharValue": "test note"},
                ]},
            ]
        }
    }
    mock_s3.put_object.return_value = {}
    mock_s3.generate_presigned_url.return_value = "https://s3.example.com/export.csv?sig=xxx"

    import handler
    result = handler.lambda_handler(_auth_event(format="csv", date_from="2026-01-01", date_to="2026-01-31"), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert "url" in body
    assert "filename" in body
    assert body["filename"].startswith("health-log-")
    assert body["filename"].endswith(".csv")


@patch("handler.s3")
@patch("handler.athena")
def test_csv_query_uses_date_recorded_at(mock_athena, mock_s3):
    """SQL must use DATE(recorded_at) not dt column."""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-dt"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {"Rows": [{"Data": [{"VarCharValue": "id"}]}]}
    }
    mock_s3.put_object.return_value = {}
    mock_s3.generate_presigned_url.return_value = "https://s3.example.com/export.csv"

    import handler
    handler.lambda_handler(_auth_event(format="csv", date_from="2026-01-01", date_to="2026-01-31"), None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "DATE(recorded_at) >= DATE '2026-01-01'" in qs
    assert "DATE(recorded_at) <= DATE '2026-01-31'" in qs
    # dt column must NOT appear
    assert "dt >=" not in qs
    assert "dt <=" not in qs


@patch("handler.s3")
@patch("handler.athena")
def test_csv_user_id_scoped(mock_athena, mock_s3):
    """SQL must include user_id filter to prevent cross-user data access."""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-uid"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {"Rows": [{"Data": [{"VarCharValue": "id"}]}]}
    }
    mock_s3.put_object.return_value = {}
    mock_s3.generate_presigned_url.return_value = "https://s3.example.com/export.csv"

    import handler
    handler.lambda_handler(_auth_event(format="csv"), None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert f"user_id = '{_USER_ID}'" in qs


# ── JSON export ────────────────────────────────────────────────────────────────

@patch("handler.s3")
@patch("handler.athena")
def test_json_export_success(mock_athena, mock_s3):
    """JSON export returns presigned URL with .json filename."""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-json"}
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
    mock_s3.put_object.return_value = {}
    mock_s3.generate_presigned_url.return_value = "https://s3.example.com/export.json?sig=yyy"

    import handler
    result = handler.lambda_handler(_auth_event(format="json"), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert "url" in body
    assert "filename" in body
    assert body["filename"].endswith(".json")


# ── Athena errors ──────────────────────────────────────────────────────────────

@patch("handler.s3")
@patch("handler.athena")
def test_athena_query_failed_returns_500(mock_athena, mock_s3):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-fail"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "FAILED"}}
    }

    import handler
    result = handler.lambda_handler(_auth_event(format="csv"), None)
    assert result["statusCode"] == 500


@patch("handler.s3")
@patch("handler.athena")
def test_athena_timeout_returns_504(mock_athena, mock_s3):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-timeout"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "RUNNING"}}
    }

    import handler
    result = handler.lambda_handler(_auth_event(format="csv"), None)
    assert result["statusCode"] == 504


# ── Default format ─────────────────────────────────────────────────────────────

@patch("handler.s3")
@patch("handler.athena")
def test_default_format_is_csv(mock_athena, mock_s3):
    """No format param defaults to CSV."""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-def"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {"Rows": [{"Data": [{"VarCharValue": "id"}]}]}
    }
    mock_s3.put_object.return_value = {}
    mock_s3.generate_presigned_url.return_value = "https://s3.example.com/export.csv"

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["filename"].endswith(".csv")
