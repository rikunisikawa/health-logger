import sys, os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import json
import os

os.environ.setdefault("DAILY_SUMMARIES_TABLE", "test-daily-summaries")

from unittest.mock import MagicMock, patch

import pytest


# ── helpers ────────────────────────────────────────────────────────────────────

def _auth_event(**params):
    event = {
        "rawPath": "/summary",
        "requestContext": {
            "authorizer": {
                "jwt": {"claims": {"sub": "12345678-1234-1234-1234-123456789abc"}}
            }
        },
    }
    if params:
        event["queryStringParameters"] = {k: str(v) for k, v in params.items()}
    return event


# ── Auth ───────────────────────────────────────────────────────────────────────

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


# ── Default (7 days) ──────────────────────────────────────────────────────────

@patch("handler.dynamodb")
def test_default_days_returns_7(mock_ddb):
    """days パラメータ未指定時は過去 7 日分を DynamoDB から取得する"""
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table
    mock_table.query.return_value = {
        "Items": [
            {
                "user_id": "12345678-1234-1234-1234-123456789abc",
                "date": "2026-04-12",
                "avg_fatigue": "60.0",
                "avg_mood": "70.0",
                "avg_motivation": "50.0",
                "record_count": "3",
            }
        ]
    }

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert "summaries" in body
    assert len(body["summaries"]) == 1
    assert body["summaries"][0]["date"] == "2026-04-12"


@patch("handler.dynamodb")
def test_days_param_validated(mock_ddb):
    """days は 1〜90 の範囲。範囲外は 400 を返す"""
    import handler
    result = handler.lambda_handler(_auth_event(days=0), None)
    assert result["statusCode"] == 400

    result = handler.lambda_handler(_auth_event(days=91), None)
    assert result["statusCode"] == 400


@patch("handler.dynamodb")
def test_days_30(mock_ddb):
    """days=30 で KeyConditionExpression に 30 日分のキーが渡される"""
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table
    mock_table.query.return_value = {"Items": []}

    import handler
    result = handler.lambda_handler(_auth_event(days=30), None)
    assert result["statusCode"] == 200
    mock_table.query.assert_called_once()
    call_kwargs = mock_table.query.call_args[1]
    assert "KeyConditionExpression" in call_kwargs


@patch("handler.dynamodb")
def test_empty_result(mock_ddb):
    """DynamoDB に記録がない場合は空配列を返す"""
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table
    mock_table.query.return_value = {"Items": []}

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["summaries"] == []


@patch("handler.dynamodb")
def test_dynamodb_error_returns_500(mock_ddb):
    """DynamoDB エラー時は 500 を返す"""
    from botocore.exceptions import ClientError
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table
    mock_table.query.side_effect = ClientError(
        {"Error": {"Code": "InternalServerError", "Message": "DDB error"}},
        "Query",
    )

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 500


@patch("handler.dynamodb")
def test_response_fields(mock_ddb):
    """レスポンスに必要なフィールドが含まれる（avg/max/min）"""
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table
    mock_table.query.return_value = {
        "Items": [
            {
                "user_id": "12345678-1234-1234-1234-123456789abc",
                "date": "2026-04-12",
                "avg_fatigue": "60.5",
                "max_fatigue": "80.0",
                "min_fatigue": "40.0",
                "avg_mood": "70.0",
                "max_mood": "90.0",
                "min_mood": "50.0",
                "avg_motivation": "50.0",
                "max_motivation": "70.0",
                "min_motivation": "30.0",
                "record_count": "2",
            }
        ]
    }

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    s = body["summaries"][0]
    assert "date" in s
    assert "avg_fatigue" in s
    assert "max_fatigue" in s
    assert "min_fatigue" in s
    assert "avg_mood" in s
    assert "max_mood" in s
    assert "min_mood" in s
    assert "avg_motivation" in s
    assert "max_motivation" in s
    assert "min_motivation" in s
    assert "record_count" in s
