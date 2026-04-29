import sys, os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import json
import os

os.environ.setdefault("ATHENA_DATABASE", "test-db")
os.environ.setdefault("ATHENA_OUTPUT_BUCKET", "test-bucket")

from unittest.mock import patch

import pytest

_VALID_USER = "12345678-1234-1234-1234-123456789abc"

ITEMS = ["fatigue", "mood", "motivation", "poor_sleep", "headache", "stomachache", "exercise", "alcohol", "caffeine"]
_HEADERS = ["fatigue_score", "mood_score", "motivation_score", "poor_sleep", "headache", "stomachache", "exercise", "alcohol", "caffeine"]


def _auth_event(params=None):
    event = {
        "rawPath": "/correlation",
        "requestContext": {
            "authorizer": {"jwt": {"claims": {"sub": _VALID_USER}}}
        },
    }
    if params:
        event["queryStringParameters"] = params
    return event


def _mock_athena_rows(data_rows: list):
    """Build mock Athena ResultSet from list of row dicts."""
    rows = [{"Data": [{"VarCharValue": h} for h in _HEADERS]}]
    for row in data_rows:
        rows.append({"Data": [{"VarCharValue": str(row.get(h, ""))} for h in _HEADERS]})
    return {"ResultSet": {"Rows": rows}}


def _make_rows(n: int, fatigue=60, mood=60, motivation=60):
    """Generate n identical data rows with all flags=0."""
    return [
        {
            "fatigue_score": str(fatigue),
            "mood_score": str(mood),
            "motivation_score": str(motivation),
            "poor_sleep": "0",
            "headache": "0",
            "stomachache": "0",
            "exercise": "0",
            "alcohol": "0",
            "caffeine": "0",
        }
        for _ in range(n)
    ]


# ── Auth ───────────────────────────────────────────────────────────────────────

def test_missing_auth():
    import handler
    result = handler.lambda_handler({"rawPath": "/correlation"}, None)
    assert result["statusCode"] == 401


def test_invalid_user_id():
    import handler
    event = {
        "rawPath": "/correlation",
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "not-a-uuid"}}}},
    }
    result = handler.lambda_handler(event, None)
    assert result["statusCode"] == 401


# ── days パラメータ バリデーション ───────────────────────────────────────────────

def test_invalid_days_returns_400():
    import handler
    result = handler.lambda_handler(
        _auth_event({"days": "'; DROP TABLE health_records --"}), None
    )
    assert result["statusCode"] == 400


# ── レスポンスフォーマット ────────────────────────────────────────────────────────

@patch("handler.athena")
def test_response_has_required_fields(mock_athena):
    """items, matrix, sample_counts フィールドを返す"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-1"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    rows = []
    for i in range(10):
        rows.append({
            "fatigue_score": str(50 + i * 5),
            "mood_score": str(80 - i * 3),
            "motivation_score": str(60 + i * 2),
            "poor_sleep": str(i % 2),
            "headache": "0",
            "stomachache": "0",
            "exercise": str((i + 1) % 2),
            "alcohol": "0",
            "caffeine": "0",
        })
    mock_athena.get_query_results.return_value = _mock_athena_rows(rows)

    import handler
    result = handler.lambda_handler(_auth_event({"days": "30"}), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert "items" in body
    assert "matrix" in body
    assert "sample_counts" in body
    assert set(body["items"]) == set(ITEMS)


@patch("handler.athena")
def test_matrix_is_symmetric(mock_athena):
    """matrix[a][b] == matrix[b][a]（対称行列）"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-sym"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    rows = []
    for i in range(10):
        rows.append({
            "fatigue_score": str(50 + i * 5),
            "mood_score": str(80 - i * 3),
            "motivation_score": str(60 + i * 2),
            "poor_sleep": "0", "headache": "0", "stomachache": "0",
            "exercise": "0", "alcohol": "0", "caffeine": "0",
        })
    mock_athena.get_query_results.return_value = _mock_athena_rows(rows)

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    body = json.loads(result["body"])
    for a in body["items"]:
        for b in body["items"]:
            if a != b:
                r_ab = body["matrix"][a][b]
                r_ba = body["matrix"][b][a]
                if r_ab is None:
                    assert r_ba is None
                else:
                    assert abs(r_ab - r_ba) < 1e-9


# ── サンプル数 ────────────────────────────────────────────────────────────────

@patch("handler.athena")
def test_insufficient_samples_returns_null(mock_athena):
    """サンプル数 < 7 のペアは None を返す"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-2"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    # 5 rows → below threshold of 7
    mock_athena.get_query_results.return_value = _mock_athena_rows(_make_rows(5))

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    for item_a in body["items"]:
        for item_b in body["items"]:
            if item_a != item_b:
                assert body["matrix"][item_a][item_b] is None


@patch("handler.athena")
def test_sufficient_samples_returns_value(mock_athena):
    """サンプル数 >= 7 のペアは数値を返す"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-suf"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    rows = []
    for i in range(10):
        rows.append({
            "fatigue_score": str(40 + i * 5),
            "mood_score": str(90 - i * 5),
            "motivation_score": str(60),
            "poor_sleep": "0", "headache": "0", "stomachache": "0",
            "exercise": "0", "alcohol": "0", "caffeine": "0",
        })
    mock_athena.get_query_results.return_value = _mock_athena_rows(rows)

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    body = json.loads(result["body"])
    assert body["matrix"]["fatigue"]["mood"] is not None


@patch("handler.athena")
def test_sample_counts_stored(mock_athena):
    """sample_counts には各ペアのサンプル数が入る"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-5"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = _mock_athena_rows(_make_rows(10))

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    body = json.loads(result["body"])
    assert body["sample_counts"]["fatigue-mood"] == 10


# ── ピアソン相関の計算精度 ─────────────────────────────────────────────────────

@patch("handler.athena")
def test_pearson_perfect_positive_correlation(mock_athena):
    """完全正相関のペアは r ≈ 1.0"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-3"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    # fatigue == mood → r = 1.0
    rows = []
    for i in range(10):
        v = str(40 + i * 5)
        rows.append({
            "fatigue_score": v,
            "mood_score": v,
            "motivation_score": "50",
            "poor_sleep": "0", "headache": "0", "stomachache": "0",
            "exercise": "0", "alcohol": "0", "caffeine": "0",
        })
    mock_athena.get_query_results.return_value = _mock_athena_rows(rows)

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    body = json.loads(result["body"])
    r = body["matrix"]["fatigue"]["mood"]
    assert r is not None
    assert abs(r - 1.0) < 0.001


@patch("handler.athena")
def test_pearson_perfect_negative_correlation(mock_athena):
    """完全負相関のペアは r ≈ -1.0"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-4"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    rows = []
    for i in range(10):
        rows.append({
            "fatigue_score": str(10 + i * 8),
            "mood_score": str(90 - i * 8),
            "motivation_score": "50",
            "poor_sleep": "0", "headache": "0", "stomachache": "0",
            "exercise": "0", "alcohol": "0", "caffeine": "0",
        })
    mock_athena.get_query_results.return_value = _mock_athena_rows(rows)

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    body = json.loads(result["body"])
    r = body["matrix"]["fatigue"]["mood"]
    assert r is not None
    assert abs(r - (-1.0)) < 0.001


@patch("handler.athena")
def test_empty_data_returns_null_matrix(mock_athena):
    """データなしの場合は matrix が null で埋まる"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-6"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {"ResultSet": {"Rows": []}}

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert "matrix" in body


# ── SQL アサーション ────────────────────────────────────────────────────────────

@patch("handler.athena")
def test_query_uses_date_function_not_dt(mock_athena):
    """クエリで dt カラムを直接使わず DATE(recorded_at) を使う"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-sql"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {"ResultSet": {"Rows": []}}

    import handler
    handler.lambda_handler(_auth_event({"days": "30"}), None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "DATE(recorded_at)" in qs
    assert "dt >=" not in qs
    assert "dt <=" not in qs


@patch("handler.athena")
def test_query_includes_user_id(mock_athena):
    """クエリに user_id が含まれる"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-uid"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {"ResultSet": {"Rows": []}}

    import handler
    handler.lambda_handler(_auth_event(), None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert _VALID_USER in qs


@patch("handler.athena")
def test_query_extracts_bitwise_flags(mock_athena):
    """クエリが flags から各フラグをビット演算で抽出している"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-flags"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {"ResultSet": {"Rows": []}}

    import handler
    handler.lambda_handler(_auth_event(), None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    # poor_sleep=1, headache=2, stomachache=4, exercise=8, alcohol=16, caffeine=32
    assert "bitwise_and" in qs


# ── Athena エラー ────────────────────────────────────────────────────────────

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
