import importlib.util
import json
import os
import sys
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

os.environ.setdefault("S3_ENV_DATA_BUCKET", "test-bucket")
os.environ.setdefault("LOCATION_ID", "musashikosugi")

# Load this directory's handler explicitly to avoid sys.modules conflicts
_spec = importlib.util.spec_from_file_location(
    "get_env_data_latest_handler",
    os.path.join(os.path.dirname(__file__), "handler.py"),
)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["get_env_data_latest_handler"] = _mod
_spec.loader.exec_module(_mod)

lambda_handler = _mod.lambda_handler
_fetch_day = _mod._fetch_day

VALID_EVENT = {
    "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "user-123"}}}},
    "queryStringParameters": {"days": "3"},
}


def _make_ndjson(records: list) -> bytes:
    return "\n".join(json.dumps(r) for r in records).encode()


def _make_hourly_records(date_str: str, pressure: float = 1015.0, pm25=12.0) -> list:
    return [
        {"observation_date": date_str, "observation_hour": h, "pressure_hpa": pressure, "pm25": pm25}
        for h in range(24)
    ]


@patch("get_env_data_latest_handler.s3")
def test_valid_request(mock_s3):
    def list_objects(Bucket, Prefix):
        return {"Contents": [{"Key": f"{Prefix}test.json"}]}

    def get_object(Bucket, Key):
        date_str = Key.split("date=")[1].split("/")[0]
        body = MagicMock()
        body.read.return_value = _make_ndjson(_make_hourly_records(date_str))
        return {"Body": body}

    mock_s3.list_objects_v2.side_effect = list_objects
    mock_s3.get_object.side_effect = get_object

    resp = lambda_handler(VALID_EVENT, None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert len(body["records"]) == 3
    assert body["records"][0]["pressure_hpa"] == 1015.0
    assert body["records"][0]["pm25"] == 12.0


@patch("get_env_data_latest_handler.s3")
def test_missing_day_returns_nulls(mock_s3):
    mock_s3.list_objects_v2.return_value = {"Contents": []}

    resp = lambda_handler(VALID_EVENT, None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    for r in body["records"]:
        assert r["pressure_hpa"] is None
        assert r["pm25"] is None


def test_missing_auth():
    resp = lambda_handler({"requestContext": {}}, None)
    assert resp["statusCode"] == 401


@patch("get_env_data_latest_handler.s3")
def test_pm25_null_in_data(mock_s3):
    date_str = (date.today() - timedelta(days=1)).isoformat()
    body = MagicMock()
    body.read.return_value = _make_ndjson(_make_hourly_records(date_str, pm25=None))
    mock_s3.list_objects_v2.return_value = {"Contents": [{"Key": f"raw/test/{date_str}.json"}]}
    mock_s3.get_object.return_value = {"Body": body}

    result = _fetch_day(date_str)
    assert result["pressure_hpa"] == 1015.0
    assert result["pm25"] is None


@patch("get_env_data_latest_handler.s3")
def test_days_capped_at_max(mock_s3):
    mock_s3.list_objects_v2.return_value = {"Contents": []}
    event = {
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "user-123"}}}},
        "queryStringParameters": {"days": "999"},
    }
    resp = lambda_handler(event, None)
    body = json.loads(resp["body"])
    assert len(body["records"]) == 30


@patch("get_env_data_latest_handler.s3")
def test_invalid_days_defaults_to_14(mock_s3):
    mock_s3.list_objects_v2.return_value = {"Contents": []}
    event = {
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "user-123"}}}},
        "queryStringParameters": {"days": "abc"},
    }
    resp = lambda_handler(event, None)
    body = json.loads(resp["body"])
    assert len(body["records"]) == 14


@patch("get_env_data_latest_handler.s3")
def test_pressure_averaged_over_daytime_hours(mock_s3):
    """気圧は 6〜18 時のみ平均することを確認"""
    date_str = (date.today() - timedelta(days=1)).isoformat()
    records = [
        {
            "observation_date": date_str,
            "observation_hour": h,
            "pressure_hpa": 1000.0 if h < 6 else 1020.0,
            "pm25": None,
        }
        for h in range(24)
    ]
    body = MagicMock()
    body.read.return_value = _make_ndjson(records)
    mock_s3.list_objects_v2.return_value = {"Contents": [{"Key": f"raw/test/{date_str}.json"}]}
    mock_s3.get_object.return_value = {"Body": body}

    result = _fetch_day(date_str)
    assert result["pressure_hpa"] == 1020.0  # 深夜の 1000.0 は含まれない
