"""
Tests for weekly_push_notify handler.

TDD order:
 1. Run pytest → RED (handler not yet implemented)
 2. Implement handler.py
 3. Run pytest → GREEN
"""
import importlib.util
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock, call, patch

import pytest

os.environ.setdefault("PUSH_SUBSCRIPTIONS_TABLE", "test-subscriptions")
os.environ.setdefault("VAPID_PRIVATE_KEY", "test-vapid-key")
os.environ.setdefault("ATHENA_DATABASE", "test_db")
os.environ.setdefault("ATHENA_OUTPUT_BUCKET", "test-bucket")

_spec = importlib.util.spec_from_file_location(
    "weekly_push_notify_handler",
    os.path.join(os.path.dirname(__file__), "handler.py"),
)
handler = importlib.util.module_from_spec(_spec)
sys.modules["weekly_push_notify_handler"] = handler
_spec.loader.exec_module(handler)

from pywebpush import WebPushException

VALID_SUBSCRIPTION = json.dumps(
    {
        "endpoint": "https://fcm.googleapis.com/fcm/send/dummy",
        "keys": {"p256dh": "key123", "auth": "auth456"},
    }
)

VALID_USER_ID = "11111111-2222-3333-4444-555555555555"


def _make_item(user_id=VALID_USER_ID, subscription=VALID_SUBSCRIPTION):
    return {"user_id": user_id, "subscription": subscription}


def _mock_athena_succeeded(mock_athena, avg_fatigue=60.0, avg_mood=70.0, avg_motivation=50.0, count=5):
    """Set up mock Athena to return a weekly summary."""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-001"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {
            "Rows": [
                # header row
                {"Data": [
                    {"VarCharValue": "avg_fatigue"},
                    {"VarCharValue": "avg_mood"},
                    {"VarCharValue": "avg_motivation"},
                    {"VarCharValue": "record_count"},
                ]},
                # data row
                {"Data": [
                    {"VarCharValue": str(avg_fatigue)},
                    {"VarCharValue": str(avg_mood)},
                    {"VarCharValue": str(avg_motivation)},
                    {"VarCharValue": str(count)},
                ]},
            ]
        }
    }


def _mock_athena_no_records(mock_athena):
    """Athena returns only header row (no data)."""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-002"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {
            "Rows": [
                {"Data": [
                    {"VarCharValue": "avg_fatigue"},
                    {"VarCharValue": "avg_mood"},
                    {"VarCharValue": "avg_motivation"},
                    {"VarCharValue": "record_count"},
                ]},
            ]
        }
    }


# ── _get_last_week_range ──────────────────────────────────────────────────────


def test_last_week_range_from_monday():
    """Called on Monday JST → last_monday and last_sunday span the previous Mon-Sun."""
    JST = timezone(timedelta(hours=9))
    # Simulate Monday 2026-04-13 08:00 JST
    monday = datetime(2026, 4, 13, 8, 0, 0, tzinfo=JST)
    with patch("weekly_push_notify_handler.datetime") as mock_dt:
        mock_dt.now.return_value = monday
        last_monday, last_sunday = handler._get_last_week_range()

    assert last_monday == "2026-04-06"
    assert last_sunday == "2026-04-12"


# ── Athena SQL content ────────────────────────────────────────────────────────


@patch.object(handler, "athena")
def test_athena_sql_uses_date_recorded_at_not_dt(mock_athena):
    """SQL must use DATE(recorded_at) not dt for filtering."""
    _mock_athena_succeeded(mock_athena)

    handler._query_weekly_summary(VALID_USER_ID, "2026-04-06", "2026-04-12")

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "DATE(recorded_at) >= DATE '2026-04-06'" in qs
    assert "DATE(recorded_at) <= DATE '2026-04-12'" in qs
    # Must NOT use dt column directly for range filters
    assert "dt >=" not in qs
    assert "dt <=" not in qs


@patch.object(handler, "athena")
def test_athena_sql_filters_daily_record_type(mock_athena):
    """SQL must filter record_type = 'daily' to exclude event/status records."""
    _mock_athena_succeeded(mock_athena)

    handler._query_weekly_summary(VALID_USER_ID, "2026-04-06", "2026-04-12")

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "record_type = 'daily'" in qs


@patch.object(handler, "athena")
def test_athena_sql_contains_user_id(mock_athena):
    """SQL must include the validated user_id."""
    _mock_athena_succeeded(mock_athena)

    handler._query_weekly_summary(VALID_USER_ID, "2026-04-06", "2026-04-12")

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert VALID_USER_ID in qs


# ── _build_message ────────────────────────────────────────────────────────────


def test_build_message_with_full_summary():
    """When the user has records, message includes avg scores and count."""
    summary = {
        "avg_fatigue": 62.4,
        "avg_mood": 71.0,
        "avg_motivation": 55.0,
        "record_count": 5,
    }
    msg = handler._build_message(summary)
    assert "5" in msg
    assert "62" in msg  # fatigue rounded
    assert "71" in msg
    assert "55" in msg


def test_build_message_with_no_records():
    """When record_count == 0, return encouragement message."""
    summary = {
        "avg_fatigue": None,
        "avg_mood": None,
        "avg_motivation": None,
        "record_count": 0,
    }
    msg = handler._build_message(summary)
    assert "先週の記録がありません" in msg or "今週" in msg


def test_build_message_with_none_summary():
    """When Athena query failed (None), return fallback message."""
    msg = handler._build_message(None)
    assert len(msg) > 0  # non-empty fallback


# ── lambda_handler: happy path ────────────────────────────────────────────────


@patch.object(handler, "webpush")
@patch.object(handler, "athena")
@patch.object(handler, "table")
def test_handler_sends_weekly_summary(mock_table, mock_athena, mock_webpush):
    """Main handler scans subscriptions, queries Athena, sends push."""
    mock_table.scan.return_value = {"Items": [_make_item()]}
    _mock_athena_succeeded(mock_athena)
    mock_webpush.return_value = None

    result = handler.lambda_handler({}, None)

    assert result["sent"] == 1
    assert result["failed"] == 0
    assert result["removed"] == 0

    # Verify push payload contains title and body
    push_call = mock_webpush.call_args
    data = json.loads(push_call[1]["data"])
    assert "先週" in data["title"] or "サマリー" in data["title"] or "週次" in data["title"]
    assert len(data["body"]) > 0


@patch.object(handler, "webpush")
@patch.object(handler, "athena")
@patch.object(handler, "table")
def test_handler_no_records_sends_encouragement(mock_table, mock_athena, mock_webpush):
    """When Athena returns no rows, still sends a push with encouragement."""
    mock_table.scan.return_value = {"Items": [_make_item()]}
    _mock_athena_no_records(mock_athena)
    mock_webpush.return_value = None

    result = handler.lambda_handler({}, None)

    assert result["sent"] == 1
    push_call = mock_webpush.call_args
    data = json.loads(push_call[1]["data"])
    assert "先週" in data["body"] or "今週" in data["body"] or "記録" in data["body"]


# ── lambda_handler: empty subscriptions ──────────────────────────────────────


@patch.object(handler, "webpush")
@patch.object(handler, "athena")
@patch.object(handler, "table")
def test_handler_empty_subscriptions(mock_table, mock_athena, mock_webpush):
    """When no subscriptions exist, nothing is sent."""
    mock_table.scan.return_value = {"Items": []}

    result = handler.lambda_handler({}, None)

    assert result["sent"] == 0
    assert result["failed"] == 0
    mock_webpush.assert_not_called()
    mock_athena.start_query_execution.assert_not_called()


# ── lambda_handler: expired subscription ─────────────────────────────────────


@patch.object(handler, "webpush")
@patch.object(handler, "athena")
@patch.object(handler, "table")
def test_handler_expired_subscription_removed(mock_table, mock_athena, mock_webpush):
    """410 from push endpoint → subscription deleted from DynamoDB."""
    mock_table.scan.return_value = {"Items": [_make_item()]}
    mock_table.delete_item.return_value = {}
    _mock_athena_succeeded(mock_athena)

    exc = WebPushException("Gone")
    resp_mock = MagicMock()
    resp_mock.status_code = 410
    exc.response = resp_mock
    mock_webpush.side_effect = exc

    result = handler.lambda_handler({}, None)

    assert result["removed"] == 1
    assert result["sent"] == 0
    mock_table.delete_item.assert_called_once_with(Key={"user_id": VALID_USER_ID})


# ── lambda_handler: push failure (non-expiry) ─────────────────────────────────


@patch.object(handler, "webpush")
@patch.object(handler, "athena")
@patch.object(handler, "table")
def test_handler_push_failure_counted(mock_table, mock_athena, mock_webpush):
    """5xx from push endpoint → counted as failed, not removed."""
    mock_table.scan.return_value = {"Items": [_make_item()]}
    _mock_athena_succeeded(mock_athena)

    exc = WebPushException("Internal Server Error")
    resp_mock = MagicMock()
    resp_mock.status_code = 500
    exc.response = resp_mock
    mock_webpush.side_effect = exc

    result = handler.lambda_handler({}, None)

    assert result["failed"] == 1
    assert result["sent"] == 0
    assert result["removed"] == 0


# ── lambda_handler: invalid user_id skipped ──────────────────────────────────


@patch.object(handler, "webpush")
@patch.object(handler, "athena")
@patch.object(handler, "table")
def test_handler_invalid_user_id_skipped(mock_table, mock_athena, mock_webpush):
    """Non-UUID user_id in DB is skipped without calling Athena or webpush."""
    mock_table.scan.return_value = {"Items": [_make_item(user_id="not-a-uuid")]}

    result = handler.lambda_handler({}, None)

    assert result["skipped"] == 1
    assert result["sent"] == 0
    mock_athena.start_query_execution.assert_not_called()
    mock_webpush.assert_not_called()


# ── lambda_handler: Athena failure still sends fallback ──────────────────────


@patch.object(handler, "webpush")
@patch.object(handler, "athena")
@patch.object(handler, "table")
def test_handler_athena_failure_sends_fallback(mock_table, mock_athena, mock_webpush):
    """When Athena query fails, a fallback notification is still sent."""
    mock_table.scan.return_value = {"Items": [_make_item()]}
    mock_athena.start_query_execution.side_effect = Exception("Athena unavailable")
    mock_webpush.return_value = None

    result = handler.lambda_handler({}, None)

    assert result["sent"] == 1
    push_call = mock_webpush.call_args
    data = json.loads(push_call[1]["data"])
    assert len(data["body"]) > 0
