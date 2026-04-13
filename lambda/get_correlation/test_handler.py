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
    result = handler.lambda_handler({"rawPath": "/correlation"}, None)
    assert result["statusCode"] == 401


def test_invalid_user_id():
    import handler
    event = {
        "rawPath": "/correlation",
        "requestContext": {
            "authorizer": {"jwt": {"claims": {"sub": "not-a-uuid"}}}
        },
    }
    result = handler.lambda_handler(event, None)
    assert result["statusCode"] == 401


# ── Parameter validation ───────────────────────────────────────────────────────

def _auth_event(params=None):
    event = {
        "rawPath": "/correlation",
        "requestContext": {
            "authorizer": {
                "jwt": {"claims": {"sub": "12345678-1234-1234-1234-123456789abc"}}
            }
        },
    }
    if params:
        event["queryStringParameters"] = params
    return event


def test_invalid_days_param():
    import handler
    result = handler.lambda_handler(_auth_event({"days": "notanumber"}), None)
    assert result["statusCode"] == 400
    body = json.loads(result["body"])
    assert "error" in body


def test_days_out_of_range():
    import handler
    result = handler.lambda_handler(_auth_event({"days": "400"}), None)
    assert result["statusCode"] == 400


# ── SQL query validation ───────────────────────────────────────────────────────

@patch("handler.athena")
def test_query_uses_date_function_not_dt(mock_athena):
    """dt カラムを直接 WHERE 句に使わず DATE(recorded_at) を使うこと"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-1"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {
            "Rows": [
                {
                    "Data": [
                        {"VarCharValue": "fatigue_score"},
                        {"VarCharValue": "mood_score"},
                        {"VarCharValue": "motivation_score"},
                        {"VarCharValue": "flags"},
                    ]
                }
            ]
        }
    }

    import handler
    handler.lambda_handler(_auth_event({"days": "30"}), None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "DATE(recorded_at)" in qs
    assert "dt >=" not in qs
    assert "dt <=" not in qs


@patch("handler.athena")
def test_query_contains_required_columns(mock_athena):
    """必要なカラムがクエリに含まれること"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-2"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {"Rows": [{"Data": [{"VarCharValue": "fatigue_score"}, {"VarCharValue": "flags"}]}]}
    }

    import handler
    handler.lambda_handler(_auth_event(), None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "fatigue_score" in qs
    assert "mood_score" in qs
    assert "motivation_score" in qs
    assert "flags" in qs


# ── Successful response structure ──────────────────────────────────────────────

@patch("handler.athena")
def test_success_response_structure(mock_athena):
    """レスポンスに items / matrix / sample_counts が含まれること"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-3"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }

    # fatigue=70, mood=80, motivation=60, flags=0 (poor_sleep=0, headache=0, ...)
    # fatigue=50, mood=40, motivation=70, flags=3 (poor_sleep=1, headache=1)
    mock_athena.get_query_results.return_value = {
        "ResultSet": {
            "Rows": [
                {
                    "Data": [
                        {"VarCharValue": "fatigue_score"},
                        {"VarCharValue": "mood_score"},
                        {"VarCharValue": "motivation_score"},
                        {"VarCharValue": "flags"},
                    ]
                },
                {
                    "Data": [
                        {"VarCharValue": "70"},
                        {"VarCharValue": "80"},
                        {"VarCharValue": "60"},
                        {"VarCharValue": "0"},
                    ]
                },
                {
                    "Data": [
                        {"VarCharValue": "50"},
                        {"VarCharValue": "40"},
                        {"VarCharValue": "70"},
                        {"VarCharValue": "3"},
                    ]
                },
            ]
        }
    }

    import handler
    result = handler.lambda_handler(_auth_event({"days": "30"}), None)
    assert result["statusCode"] == 200
    body = json.loads(result["body"])

    assert "items" in body
    assert "matrix" in body
    assert "sample_counts" in body

    # items に全変数が含まれること
    items = body["items"]
    assert "fatigue" in items
    assert "mood" in items
    assert "motivation" in items
    assert "poor_sleep" in items
    assert "headache" in items
    assert "stomachache" in items
    assert "exercise" in items
    assert "alcohol" in items
    assert "caffeine" in items


@patch("handler.athena")
def test_matrix_is_symmetric(mock_athena):
    """相関行列は対称であること (corr(a,b) == corr(b,a))"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-4"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    # Provide 10 rows of data so we have enough samples
    rows = [
        {"Data": [{"VarCharValue": "fatigue_score"}, {"VarCharValue": "mood_score"}, {"VarCharValue": "motivation_score"}, {"VarCharValue": "flags"}]}
    ]
    import random
    random.seed(42)
    for _ in range(10):
        rows.append({
            "Data": [
                {"VarCharValue": str(random.randint(20, 80))},
                {"VarCharValue": str(random.randint(20, 80))},
                {"VarCharValue": str(random.randint(20, 80))},
                {"VarCharValue": str(random.randint(0, 63))},
            ]
        })

    mock_athena.get_query_results.return_value = {"ResultSet": {"Rows": rows}}

    import handler
    result = handler.lambda_handler(_auth_event({"days": "30"}), None)
    body = json.loads(result["body"])
    matrix = body["matrix"]

    items = body["items"]
    for i, a in enumerate(items):
        for b in items[i + 1:]:
            if matrix.get(a, {}).get(b) is not None and matrix.get(b, {}).get(a) is not None:
                assert abs(matrix[a][b] - matrix[b][a]) < 1e-9, f"matrix[{a}][{b}] != matrix[{b}][{a}]"


@patch("handler.athena")
def test_diagonal_is_one(mock_athena):
    """対角線（自己相関）は 1.0 であること"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-5"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    rows = [
        {"Data": [{"VarCharValue": "fatigue_score"}, {"VarCharValue": "mood_score"}, {"VarCharValue": "motivation_score"}, {"VarCharValue": "flags"}]}
    ]
    import random
    random.seed(0)
    for _ in range(10):
        rows.append({
            "Data": [
                {"VarCharValue": str(random.randint(20, 80))},
                {"VarCharValue": str(random.randint(20, 80))},
                {"VarCharValue": str(random.randint(20, 80))},
                {"VarCharValue": str(random.randint(0, 63))},
            ]
        })

    mock_athena.get_query_results.return_value = {"ResultSet": {"Rows": rows}}

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    body = json.loads(result["body"])
    matrix = body["matrix"]

    for item in body["items"]:
        if matrix.get(item, {}).get(item) is not None:
            assert matrix[item][item] == 1.0, f"diagonal for {item} should be 1.0"


@patch("handler.athena")
def test_insufficient_samples_returns_null(mock_athena):
    """サンプル数 < 7 の場合は相関係数が None であること"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-6"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    # Only 3 rows (< 7 threshold)
    rows = [
        {"Data": [{"VarCharValue": "fatigue_score"}, {"VarCharValue": "mood_score"}, {"VarCharValue": "motivation_score"}, {"VarCharValue": "flags"}]},
        {"Data": [{"VarCharValue": "70"}, {"VarCharValue": "80"}, {"VarCharValue": "60"}, {"VarCharValue": "0"}]},
        {"Data": [{"VarCharValue": "50"}, {"VarCharValue": "40"}, {"VarCharValue": "70"}, {"VarCharValue": "3"}]},
        {"Data": [{"VarCharValue": "60"}, {"VarCharValue": "55"}, {"VarCharValue": "65"}, {"VarCharValue": "1"}]},
    ]
    mock_athena.get_query_results.return_value = {"ResultSet": {"Rows": rows}}

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    body = json.loads(result["body"])
    matrix = body["matrix"]

    # With only 3 samples, fatigue-mood correlation should be None
    assert matrix["fatigue"]["mood"] is None


# ── Error handling ─────────────────────────────────────────────────────────────

@patch("handler.athena")
def test_athena_query_failed(mock_athena):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-7"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "FAILED"}}
    }

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 500


@patch("handler.athena")
def test_athena_query_timeout(mock_athena):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-8"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "RUNNING"}}
    }

    import handler
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 504


@patch("handler.athena")
def test_default_days_is_30(mock_athena):
    """days パラメータ未指定時は 30 日分をクエリすること"""
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-9"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {"Rows": [{"Data": [{"VarCharValue": "fatigue_score"}, {"VarCharValue": "flags"}]}]}
    }

    import handler
    handler.lambda_handler(_auth_event(), None)

    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "INTERVAL '30'" in qs or "30" in qs
