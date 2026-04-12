import json
import os

os.environ.setdefault("ATHENA_DATABASE", "test-db")
os.environ.setdefault("ATHENA_OUTPUT_BUCKET", "test-bucket")
os.environ.setdefault("SUMMARY_CACHE_TABLE", "test-summary-cache")

from unittest.mock import MagicMock, patch

import pytest


# ── helpers ────────────────────────────────────────────────────────────────────

def _auth_event(days=None):
    event = {
        "rawPath": "/summary",
        "requestContext": {
            "authorizer": {
                "jwt": {"claims": {"sub": "12345678-1234-1234-1234-123456789abc"}}
            }
        },
    }
    if days is not None:
        event["queryStringParameters"] = {"days": str(days)}
    return event


def _make_athena_mock(rows=None):
    """Return a mock athena client that returns SUCCEEDED with given rows."""
    mock = MagicMock()
    mock.start_query_execution.return_value = {"QueryExecutionId": "qid-test"}
    mock.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    if rows is None:
        rows = [
            {
                "Data": [
                    {"VarCharValue": "date"},
                    {"VarCharValue": "fatigue_avg"},
                    {"VarCharValue": "fatigue_max"},
                    {"VarCharValue": "fatigue_min"},
                    {"VarCharValue": "mood_avg"},
                    {"VarCharValue": "mood_max"},
                    {"VarCharValue": "mood_min"},
                    {"VarCharValue": "motivation_avg"},
                    {"VarCharValue": "motivation_max"},
                    {"VarCharValue": "motivation_min"},
                    {"VarCharValue": "record_count"},
                ]
            },
            {
                "Data": [
                    {"VarCharValue": "2026-04-10"},
                    {"VarCharValue": "65.0"},
                    {"VarCharValue": "80"},
                    {"VarCharValue": "50"},
                    {"VarCharValue": "70.0"},
                    {"VarCharValue": "90"},
                    {"VarCharValue": "55"},
                    {"VarCharValue": "60.0"},
                    {"VarCharValue": "75"},
                    {"VarCharValue": "45"},
                    {"VarCharValue": "2"},
                ]
            },
        ]
    mock.get_query_results.return_value = {"ResultSet": {"Rows": rows}}
    return mock


def _make_dynamo_miss():
    """DynamoDB mock that returns cache miss."""
    mock = MagicMock()
    mock.get_item.return_value = {}  # no 'Item' key → cache miss
    return mock


def _make_dynamo_hit(payload: dict):
    """DynamoDB mock that returns a cache hit."""
    mock = MagicMock()
    mock.get_item.return_value = {
        "Item": {"cache_key": {"S": "hit"}, "payload": {"S": json.dumps(payload)}}
    }
    return mock


# ── Auth tests ─────────────────────────────────────────────────────────────────

def test_missing_auth():
    import handler
    result = handler.lambda_handler({"rawPath": "/summary"}, None)
    assert result["statusCode"] == 401


def test_invalid_user_id():
    import handler
    event = {
        "rawPath": "/summary",
        "requestContext": {
            "authorizer": {"jwt": {"claims": {"sub": "not-a-uuid"}}}
        },
    }
    result = handler.lambda_handler(event, None)
    assert result["statusCode"] == 401


# ── Param validation ───────────────────────────────────────────────────────────

def test_invalid_days_returns_400():
    import handler
    event = _auth_event()
    event["queryStringParameters"] = {"days": "abc"}
    result = handler.lambda_handler(event, None)
    assert result["statusCode"] == 400


def test_days_out_of_range_returns_400():
    """days > 365 should be rejected."""
    import handler
    event = _auth_event()
    event["queryStringParameters"] = {"days": "400"}
    result = handler.lambda_handler(event, None)
    assert result["statusCode"] == 400


# ── DynamoDB cache hit ─────────────────────────────────────────────────────────

@patch("handler.dynamo")
@patch("handler.athena")
def test_cache_hit_returns_cached_data(mock_athena, mock_dynamo):
    """Cache hit should return cached payload without calling Athena."""
    cached = {"days": 7, "summary": [{"date": "2026-04-10", "record_count": 1}]}
    mock_dynamo.get_item.return_value = {
        "Item": {"cache_key": {"S": "k"}, "payload": {"S": json.dumps(cached)}}
    }

    import handler
    result = handler.lambda_handler(_auth_event(days=7), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["days"] == 7
    # Athena must NOT have been called
    mock_athena.start_query_execution.assert_not_called()


# ── Successful Athena query (cache miss) ───────────────────────────────────────

@patch("handler.dynamo")
@patch("handler.athena")
def test_handler_success_with_cache_miss(mock_athena, mock_dynamo):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-1"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {
            "Rows": [
                {
                    "Data": [
                        {"VarCharValue": "date"},
                        {"VarCharValue": "fatigue_avg"},
                        {"VarCharValue": "fatigue_max"},
                        {"VarCharValue": "fatigue_min"},
                        {"VarCharValue": "mood_avg"},
                        {"VarCharValue": "mood_max"},
                        {"VarCharValue": "mood_min"},
                        {"VarCharValue": "motivation_avg"},
                        {"VarCharValue": "motivation_max"},
                        {"VarCharValue": "motivation_min"},
                        {"VarCharValue": "record_count"},
                    ]
                },
                {
                    "Data": [
                        {"VarCharValue": "2026-04-10"},
                        {"VarCharValue": "65.0"},
                        {"VarCharValue": "80"},
                        {"VarCharValue": "50"},
                        {"VarCharValue": "70.0"},
                        {"VarCharValue": "90"},
                        {"VarCharValue": "55"},
                        {"VarCharValue": "60.0"},
                        {"VarCharValue": "75"},
                        {"VarCharValue": "45"},
                        {"VarCharValue": "2"},
                    ]
                },
            ]
        }
    }
    mock_dynamo.get_item.return_value = {}  # cache miss

    import handler
    result = handler.lambda_handler(_auth_event(days=7), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["days"] == 7
    assert len(body["summary"]) == 1
    day = body["summary"][0]
    assert day["date"] == "2026-04-10"
    assert day["fatigue_avg"] == 65.0
    assert day["fatigue_max"] == 80
    assert day["fatigue_min"] == 50
    assert day["mood_avg"] == 70.0
    assert day["record_count"] == 2

    # Cache must have been written
    mock_dynamo.put_item.assert_called_once()


# ── SQL validation ─────────────────────────────────────────────────────────────

@patch("handler.dynamo")
@patch("handler.athena")
def test_sql_uses_date_recorded_at_not_dt(mock_athena, mock_dynamo):
    """Query must use DATE(recorded_at) for filtering, NOT the dt partition column."""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-sql"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {"Rows": [{"Data": [{"VarCharValue": "date"}]}]}
    }
    mock_dynamo.get_item.return_value = {}

    import handler
    handler.lambda_handler(_auth_event(days=7), None)
    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]

    # Must use DATE(recorded_at) for the range filter
    assert "DATE(recorded_at)" in qs
    # Must NOT use dt partition column directly
    assert "dt >=" not in qs
    assert "dt <=" not in qs
    assert "WHERE dt" not in qs


@patch("handler.dynamo")
@patch("handler.athena")
def test_sql_groups_by_date_recorded_at(mock_athena, mock_dynamo):
    """Query must GROUP BY DATE(recorded_at)."""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-grp"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {"Rows": [{"Data": [{"VarCharValue": "date"}]}]}
    }
    mock_dynamo.get_item.return_value = {}

    import handler
    handler.lambda_handler(_auth_event(days=7), None)
    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "GROUP BY DATE(recorded_at)" in qs
    assert "AVG" in qs
    assert "MAX" in qs
    assert "MIN" in qs


# ── Athena failure ─────────────────────────────────────────────────────────────

@patch("handler.dynamo")
@patch("handler.athena")
def test_athena_query_failed_returns_500(mock_athena, mock_dynamo):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-fail"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "FAILED"}}
    }
    mock_dynamo.get_item.return_value = {}

    import handler
    result = handler.lambda_handler(_auth_event(days=7), None)
    assert result["statusCode"] == 500


# ── Default days parameter ─────────────────────────────────────────────────────

@patch("handler.dynamo")
@patch("handler.athena")
def test_default_days_is_7(mock_athena, mock_dynamo):
    """When days is not provided, default should be 7."""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-def"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {"Rows": [{"Data": [{"VarCharValue": "date"}]}]}
    }
    mock_dynamo.get_item.return_value = {}

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["days"] == 7
