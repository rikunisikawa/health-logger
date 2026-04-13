"""
aggregate_daily テスト

pytest が複数の test_handler.py を同時に収集すると "handler" モジュールがキャッシュ衝突する。
importlib で aggregate_daily.handler という一意な名前でロードして回避する。
"""
import importlib.util as _ilu
import sys
import os

_HERE = os.path.dirname(os.path.abspath(__file__))

os.environ.setdefault("ATHENA_DATABASE", "test-db")
os.environ.setdefault("ATHENA_OUTPUT_BUCKET", "test-bucket")
os.environ.setdefault("DAILY_SUMMARIES_TABLE", "test-daily-summaries")

_MOD_NAME = "aggregate_daily_handler"
if _MOD_NAME not in sys.modules:
    _spec = _ilu.spec_from_file_location(_MOD_NAME, os.path.join(_HERE, "handler.py"))
    _mod = _ilu.module_from_spec(_spec)
    sys.modules[_MOD_NAME] = _mod
    _spec.loader.exec_module(_mod)

import aggregate_daily_handler as _h

import json
from unittest.mock import MagicMock, patch
import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _succeeded_athena(mock_athena, rows):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-1"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {"ResultSet": {"Rows": rows}}


# ── 正常系 ────────────────────────────────────────────────────────────────────

@patch(f"{_MOD_NAME}.dynamodb")
@patch(f"{_MOD_NAME}.athena")
def test_aggregation_saves_to_dynamodb(mock_athena, mock_ddb):
    """Athena 結果を DynamoDB に保存する"""
    _succeeded_athena(mock_athena, [
        {"Data": [
            {"VarCharValue": "user_id"},
            {"VarCharValue": "avg_fatigue"},
            {"VarCharValue": "avg_mood"},
            {"VarCharValue": "avg_motivation"},
            {"VarCharValue": "record_count"},
        ]},
        {"Data": [
            {"VarCharValue": "12345678-1234-1234-1234-123456789abc"},
            {"VarCharValue": "60.0"},
            {"VarCharValue": "70.0"},
            {"VarCharValue": "50.0"},
            {"VarCharValue": "3"},
        ]},
    ])

    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table
    mock_table.put_item.return_value = {}

    result = _h.lambda_handler({}, None)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["saved_count"] == 1

    mock_table.put_item.assert_called_once()
    item = mock_table.put_item.call_args[1]["Item"]
    assert item["user_id"] == "12345678-1234-1234-1234-123456789abc"
    assert "date" in item
    assert item["avg_fatigue"] == "60.0"


@patch(f"{_MOD_NAME}.dynamodb")
@patch(f"{_MOD_NAME}.athena")
def test_target_date_is_yesterday(mock_athena, mock_ddb):
    """集計対象は昨日の日付（YYYY-MM-DD）である"""
    _succeeded_athena(mock_athena, [
        {"Data": [
            {"VarCharValue": "user_id"},
            {"VarCharValue": "avg_fatigue"},
            {"VarCharValue": "avg_mood"},
            {"VarCharValue": "avg_motivation"},
            {"VarCharValue": "record_count"},
        ]},
    ])
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table

    from datetime import date, timedelta
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    _h.lambda_handler({}, None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert yesterday in qs


@patch(f"{_MOD_NAME}.dynamodb")
@patch(f"{_MOD_NAME}.athena")
def test_query_uses_dt_partition(mock_athena, mock_ddb):
    """Athena クエリはパーティション列 dt を使う（DATE(recorded_at) は使わない）"""
    _succeeded_athena(mock_athena, [
        {"Data": [
            {"VarCharValue": "user_id"},
            {"VarCharValue": "avg_fatigue"},
            {"VarCharValue": "avg_mood"},
            {"VarCharValue": "avg_motivation"},
            {"VarCharValue": "record_count"},
        ]},
    ])
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table

    _h.lambda_handler({}, None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "dt =" in qs or "dt=" in qs
    assert "DATE(recorded_at)" not in qs


@patch(f"{_MOD_NAME}.dynamodb")
@patch(f"{_MOD_NAME}.athena")
def test_no_records_returns_zero(mock_athena, mock_ddb):
    """Athena に結果が 0 件の場合、saved_count=0 を返す"""
    _succeeded_athena(mock_athena, [
        {"Data": [
            {"VarCharValue": "user_id"},
            {"VarCharValue": "avg_fatigue"},
            {"VarCharValue": "avg_mood"},
            {"VarCharValue": "avg_motivation"},
            {"VarCharValue": "record_count"},
        ]},
    ])
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table

    result = _h.lambda_handler({}, None)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["saved_count"] == 0
    mock_table.put_item.assert_not_called()


@patch(f"{_MOD_NAME}.dynamodb")
@patch(f"{_MOD_NAME}.athena")
def test_athena_query_failed(mock_athena, mock_ddb):
    """Athena クエリが FAILED の場合 500 を返す"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-fail"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "FAILED"}}
    }

    result = _h.lambda_handler({}, None)
    assert result["statusCode"] == 500


@patch(f"{_MOD_NAME}.dynamodb")
@patch(f"{_MOD_NAME}.athena")
def test_query_aggregates_avg_scores(mock_athena, mock_ddb):
    """Athena クエリに AVG(fatigue_score), AVG(mood_score), AVG(motivation_score) が含まれる"""
    _succeeded_athena(mock_athena, [
        {"Data": [
            {"VarCharValue": "user_id"},
            {"VarCharValue": "avg_fatigue"},
            {"VarCharValue": "avg_mood"},
            {"VarCharValue": "avg_motivation"},
            {"VarCharValue": "record_count"},
        ]},
    ])
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table

    _h.lambda_handler({}, None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "AVG(fatigue_score)" in qs or "avg(fatigue_score)" in qs.lower()
    assert "AVG(mood_score)" in qs or "avg(mood_score)" in qs.lower()
    assert "AVG(motivation_score)" in qs or "avg(motivation_score)" in qs.lower()
    assert "GROUP BY user_id" in qs or "group by user_id" in qs.lower()


@patch(f"{_MOD_NAME}.dynamodb")
@patch(f"{_MOD_NAME}.athena")
def test_record_type_daily_filter(mock_athena, mock_ddb):
    """集計は record_type = 'daily' のみを対象とする"""
    _succeeded_athena(mock_athena, [
        {"Data": [
            {"VarCharValue": "user_id"},
            {"VarCharValue": "avg_fatigue"},
            {"VarCharValue": "avg_mood"},
            {"VarCharValue": "avg_motivation"},
            {"VarCharValue": "record_count"},
        ]},
    ])
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table

    _h.lambda_handler({}, None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "record_type = 'daily'" in qs


@patch(f"{_MOD_NAME}.dynamodb")
@patch(f"{_MOD_NAME}.athena")
def test_multiple_users_saved(mock_athena, mock_ddb):
    """複数ユーザーの集計結果がそれぞれ DynamoDB に保存される"""
    _succeeded_athena(mock_athena, [
        {"Data": [
            {"VarCharValue": "user_id"},
            {"VarCharValue": "avg_fatigue"},
            {"VarCharValue": "avg_mood"},
            {"VarCharValue": "avg_motivation"},
            {"VarCharValue": "record_count"},
        ]},
        {"Data": [
            {"VarCharValue": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"},
            {"VarCharValue": "60.0"},
            {"VarCharValue": "70.0"},
            {"VarCharValue": "50.0"},
            {"VarCharValue": "1"},
        ]},
        {"Data": [
            {"VarCharValue": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"},
            {"VarCharValue": "40.0"},
            {"VarCharValue": "55.0"},
            {"VarCharValue": "45.0"},
            {"VarCharValue": "2"},
        ]},
    ])
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table
    mock_table.put_item.return_value = {}

    result = _h.lambda_handler({}, None)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["saved_count"] == 2
    assert mock_table.put_item.call_count == 2
