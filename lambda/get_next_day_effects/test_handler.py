import sys, os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import json
import os

os.environ.setdefault("ATHENA_DATABASE", "test-db")
os.environ.setdefault("ATHENA_OUTPUT_BUCKET", "test-bucket")

from unittest.mock import patch

import pytest

_VALID_USER = "12345678-1234-1234-1234-123456789abc"

# Columns returned by the Athena UNION ALL query
_HEADERS = ["event", "had_event", "avg_fatigue", "avg_mood", "avg_motivation", "n"]

MIN_SAMPLES = 10


def _auth_event(params=None):
    event = {
        "rawPath": "/next-day-effects",
        "requestContext": {
            "authorizer": {"jwt": {"claims": {"sub": _VALID_USER}}}
        },
    }
    if params:
        event["queryStringParameters"] = params
    return event


def _mock_rows(data_rows: list):
    """Build mock Athena ResultSet from list of dicts with _HEADERS keys."""
    rows = [{"Data": [{"VarCharValue": h} for h in _HEADERS]}]
    for row in data_rows:
        rows.append({"Data": [{"VarCharValue": str(row.get(h, ""))} for h in _HEADERS]})
    return {"ResultSet": {"Rows": rows}}


def _typical_rows(n_with=15, n_without=30):
    """Generate 6 rows (2 per event) with sufficient samples."""
    return [
        {"event": "exercise", "had_event": "1", "avg_fatigue": "45.20", "avg_mood": "72.10", "avg_motivation": "80.00", "n": str(n_with)},
        {"event": "exercise", "had_event": "0", "avg_fatigue": "62.30", "avg_mood": "58.40", "avg_motivation": "55.00", "n": str(n_without)},
        {"event": "alcohol",  "had_event": "1", "avg_fatigue": "70.00", "avg_mood": "50.00", "avg_motivation": "45.00", "n": str(n_with)},
        {"event": "alcohol",  "had_event": "0", "avg_fatigue": "55.00", "avg_mood": "65.00", "avg_motivation": "60.00", "n": str(n_without)},
        {"event": "caffeine", "had_event": "1", "avg_fatigue": "50.00", "avg_mood": "60.00", "avg_motivation": "70.00", "n": str(n_with)},
        {"event": "caffeine", "had_event": "0", "avg_fatigue": "52.00", "avg_mood": "62.00", "avg_motivation": "68.00", "n": str(n_without)},
    ]


# ── Auth ──────────────────────────────────────────────────────────────────────

def test_missing_auth():
    import handler
    result = handler.lambda_handler({"rawPath": "/next-day-effects"}, None)
    assert result["statusCode"] == 401


def test_invalid_user_id():
    import handler
    event = {
        "rawPath": "/next-day-effects",
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "not-a-uuid"}}}},
    }
    result = handler.lambda_handler(event, None)
    assert result["statusCode"] == 401


# ── days パラメータ バリデーション ────────────────────────────────────────────

def test_invalid_days_returns_400():
    import handler
    result = handler.lambda_handler(
        _auth_event({"days": "'; DROP TABLE health_records --"}), None
    )
    assert result["statusCode"] == 400


# ── レスポンスフォーマット ────────────────────────────────────────────────────

@patch("handler.athena")
def test_response_has_insights_field(mock_athena):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-1"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = _mock_rows(_typical_rows())

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert "insights" in body
    assert isinstance(body["insights"], list)


@patch("handler.athena")
def test_insight_has_required_fields(mock_athena):
    """各インサイトに event / with_event / without_event が含まれる"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-2"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = _mock_rows(_typical_rows())

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    body = json.loads(result["body"])
    assert len(body["insights"]) > 0
    for insight in body["insights"]:
        assert "event" in insight
        assert "with_event" in insight
        assert "without_event" in insight
        for group in ("with_event", "without_event"):
            for key in ("avg_fatigue", "avg_mood", "avg_motivation", "n"):
                assert key in insight[group], f"{group}.{key} missing"


@patch("handler.athena")
def test_insight_event_names(mock_athena):
    """event フィールドは exercise / alcohol / caffeine のいずれか"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-3"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = _mock_rows(_typical_rows())

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    body = json.loads(result["body"])
    valid_events = {"exercise", "alcohol", "caffeine"}
    for insight in body["insights"]:
        assert insight["event"] in valid_events


# ── サンプル数フィルタリング (< 10 は非表示) ──────────────────────────────────

@patch("handler.athena")
def test_insufficient_samples_excluded(mock_athena):
    """どちらかのグループが < 10 件のイベントは insights に含まれない"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-4"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    # exercise の with_event だけ 5 件（不足）; alcohol/caffeine は十分
    rows = [
        {"event": "exercise", "had_event": "1", "avg_fatigue": "45.20", "avg_mood": "72.10", "avg_motivation": "80.00", "n": "5"},
        {"event": "exercise", "had_event": "0", "avg_fatigue": "62.30", "avg_mood": "58.40", "avg_motivation": "55.00", "n": "30"},
        {"event": "alcohol",  "had_event": "1", "avg_fatigue": "70.00", "avg_mood": "50.00", "avg_motivation": "45.00", "n": "15"},
        {"event": "alcohol",  "had_event": "0", "avg_fatigue": "55.00", "avg_mood": "65.00", "avg_motivation": "60.00", "n": "30"},
        {"event": "caffeine", "had_event": "1", "avg_fatigue": "50.00", "avg_mood": "60.00", "avg_motivation": "70.00", "n": "15"},
        {"event": "caffeine", "had_event": "0", "avg_fatigue": "52.00", "avg_mood": "62.00", "avg_motivation": "68.00", "n": "30"},
    ]
    mock_athena.get_query_results.return_value = _mock_rows(rows)

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    body = json.loads(result["body"])
    events = [ins["event"] for ins in body["insights"]]
    assert "exercise" not in events, "exercise should be excluded (n_with=5 < 10)"
    assert "alcohol" in events
    assert "caffeine" in events


@patch("handler.athena")
def test_sufficient_samples_included(mock_athena):
    """両グループが >= 10 件のイベントは insights に含まれる"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-5"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = _mock_rows(_typical_rows(n_with=10, n_without=10))

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    body = json.loads(result["body"])
    events = [ins["event"] for ins in body["insights"]]
    assert "exercise" in events
    assert "alcohol" in events
    assert "caffeine" in events


@patch("handler.athena")
def test_no_data_returns_empty_insights(mock_athena):
    """データなしの場合 insights は空リスト"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-6"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {"ResultSet": {"Rows": []}}

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["insights"] == []


# ── 数値の正確性 ──────────────────────────────────────────────────────────────

@patch("handler.athena")
def test_avg_values_are_floats(mock_athena):
    """avg_fatigue / avg_mood / avg_motivation は float"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-7"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = _mock_rows(_typical_rows())

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    body = json.loads(result["body"])
    for insight in body["insights"]:
        for group in ("with_event", "without_event"):
            for key in ("avg_fatigue", "avg_mood", "avg_motivation"):
                val = insight[group][key]
                assert isinstance(val, float), f"{group}.{key} should be float, got {type(val)}"


@patch("handler.athena")
def test_n_values_are_ints(mock_athena):
    """n は int"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-8"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = _mock_rows(_typical_rows())

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    body = json.loads(result["body"])
    for insight in body["insights"]:
        for group in ("with_event", "without_event"):
            assert isinstance(insight[group]["n"], int)


# ── SQL アサーション ──────────────────────────────────────────────────────────

@patch("handler.athena")
def test_query_uses_date_function_not_dt(mock_athena):
    """クエリで dt カラムを直接使わず DATE(recorded_at) を使う"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-sql1"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {"ResultSet": {"Rows": []}}

    import handler
    handler.lambda_handler(_auth_event({"days": "90"}), None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "DATE(recorded_at)" in qs
    assert "dt >=" not in qs
    assert "dt <=" not in qs


@patch("handler.athena")
def test_query_includes_user_id(mock_athena):
    """クエリに user_id が含まれる"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-sql2"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {"ResultSet": {"Rows": []}}

    import handler
    handler.lambda_handler(_auth_event(), None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert _VALID_USER in qs


@patch("handler.athena")
def test_query_includes_bitwise_flags(mock_athena):
    """クエリが flags ビット演算で exercise/alcohol/caffeine を抽出する"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-sql3"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {"ResultSet": {"Rows": []}}

    import handler
    handler.lambda_handler(_auth_event(), None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "bitwise_and" in qs
    # exercise=8, alcohol=16, caffeine=32
    assert ", 8)" in qs
    assert ", 16)" in qs
    assert ", 32)" in qs


@patch("handler.athena")
def test_query_joins_yesterday(mock_athena):
    """クエリに翌日比較のための JOIN または サブクエリが含まれる"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-sql4"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {"ResultSet": {"Rows": []}}

    import handler
    handler.lambda_handler(_auth_event(), None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    # Should have a date arithmetic to look at the previous day
    assert "DATE_ADD" in qs


# ── Athena エラー ──────────────────────────────────────────────────────────────

@patch("handler.athena")
def test_query_failed_returns_500(mock_athena):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-fail"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "FAILED"}}
    }
    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 500


@patch("handler.athena")
def test_query_timeout_returns_504(mock_athena):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-to"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "RUNNING"}}
    }
    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 504
