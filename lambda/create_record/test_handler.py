import sys, os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import json
import os

# Set env vars before module import so boto3 client initialises correctly
os.environ.setdefault("FIREHOSE_STREAM_NAME", "test-stream")

from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from models import HealthRecordInput


# ── Model tests ────────────────────────────────────────────────────────────────

def test_valid_record():
    rec = HealthRecordInput(
        fatigue_score=50, mood_score=70, motivation_score=80,
        recorded_at="2024-01-01T00:00:00Z",
    )
    assert rec.fatigue_score == 50
    assert rec.flags == 0
    assert rec.note == ""
    assert rec.record_type == "daily"
    assert rec.custom_fields == []


def test_event_record_no_scores():
    rec = HealthRecordInput(
        record_type="event",
        recorded_at="2024-01-01T10:30:00Z",
        custom_fields=[{"item_id": "abc", "label": "水分補給", "type": "number", "value": 500}],
    )
    assert rec.record_type == "event"
    assert rec.fatigue_score is None
    assert rec.custom_fields[0].value == 500


def test_custom_field_invalid_type():
    with pytest.raises(ValidationError):
        HealthRecordInput(
            fatigue_score=50, mood_score=50, motivation_score=50,
            recorded_at="2024-01-01T00:00:00Z",
            custom_fields=[{"item_id": "x", "label": "test", "type": "invalid", "value": 1}],
        )


def test_score_above_max():
    with pytest.raises(ValidationError):
        HealthRecordInput(fatigue_score=101, mood_score=50, motivation_score=50,
                          recorded_at="2024-01-01T00:00:00Z")


def test_score_below_min():
    with pytest.raises(ValidationError):
        HealthRecordInput(fatigue_score=-1, mood_score=50, motivation_score=50,
                          recorded_at="2024-01-01T00:00:00Z")


def test_note_too_long():
    with pytest.raises(ValidationError):
        HealthRecordInput(fatigue_score=50, mood_score=50, motivation_score=50,
                          note="x" * 281, recorded_at="2024-01-01T00:00:00Z")


def test_flags_out_of_range():
    with pytest.raises(ValidationError):
        HealthRecordInput(fatigue_score=50, mood_score=50, motivation_score=50,
                          flags=64, recorded_at="2024-01-01T00:00:00Z")


def test_flags_max_valid():
    rec = HealthRecordInput(fatigue_score=50, mood_score=50, motivation_score=50,
                            flags=63, recorded_at="2024-01-01T00:00:00Z")
    assert rec.flags == 63


# ── Handler tests ──────────────────────────────────────────────────────────────

def _make_event(body: dict) -> dict:
    return {
        "requestContext": {
            "authorizer": {"jwt": {"claims": {"sub": "user-uuid-1234"}}}
        },
        "body": json.dumps(body),
    }


@patch("handler.firehose")
def test_handler_success(mock_firehose):
    mock_firehose.put_record.return_value = {"RecordId": "rec-1"}

    import handler
    result = handler.lambda_handler(
        _make_event({
            "fatigue_score": 60, "mood_score": 70, "motivation_score": 80,
            "recorded_at": "2024-06-01T10:00:00Z",
        }),
        None,
    )

    assert result["statusCode"] == 201
    body = json.loads(result["body"])
    assert "record_id" in body
    mock_firehose.put_record.assert_called_once()


@patch("handler.firehose")
def test_handler_missing_auth(mock_firehose):
    import handler
    result = handler.lambda_handler({"body": "{}"}, None)
    assert result["statusCode"] == 401


@patch("handler.firehose")
def test_handler_invalid_json(mock_firehose):
    import handler
    result = handler.lambda_handler(
        {
            "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "uid"}}}},
            "body": "not-json",
        },
        None,
    )
    assert result["statusCode"] == 400


@patch("handler.firehose")
def test_handler_validation_error(mock_firehose):
    import handler
    result = handler.lambda_handler(
        _make_event({"fatigue_score": 200, "mood_score": 50, "motivation_score": 50,
                     "recorded_at": "2024-01-01T00:00:00Z"}),
        None,
    )
    assert result["statusCode"] == 400
    body = json.loads(result["body"])
    assert body["error"] == "Validation failed"
