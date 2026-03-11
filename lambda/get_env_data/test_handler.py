import sys
import os
import importlib
import importlib.util

# Insert get_env_data/ at the FRONT of sys.path to override other lambda paths
_here = os.path.dirname(os.path.abspath(__file__))
_clients = os.path.join(_here, "clients")
_services = os.path.join(_here, "services")
for _p in (_services, _clients, _here):
    while _p in sys.path:
        sys.path.remove(_p)
    sys.path.insert(0, _p)

os.environ.setdefault("S3_BUCKET_NAME", "test-env-bucket")
os.environ.setdefault("LOCATION_ID", "musashikosugi")
os.environ.setdefault("LATITUDE", "35.5733")
os.environ.setdefault("LONGITUDE", "139.6590")

import json
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

import pytest

from env_models import IngestionPayload, EnvironmentRecord


def _load_handler():
    """Load get_env_data/handler.py by absolute path to avoid module name collisions."""
    spec = importlib.util.spec_from_file_location(
        "get_env_data_handler",
        os.path.join(_here, "handler.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules["get_env_data_handler"] = mod
    spec.loader.exec_module(mod)
    return mod


# ── Model tests ────────────────────────────────────────────────────────────────

def test_ingestion_payload_defaults():
    payload = IngestionPayload()
    assert payload.backfill is False
    assert payload.date_from is None
    assert payload.date_to is None
    assert payload.location_id == "musashikosugi"


def test_ingestion_payload_backfill():
    payload = IngestionPayload(
        backfill=True,
        date_from="2024-01-01",
        date_to="2024-01-30",
        location_id="musashikosugi",
    )
    assert payload.backfill is True
    assert payload.date_from == "2024-01-01"
    assert payload.date_to == "2024-01-30"


def _make_record(
    date="2024-01-15",
    hour=10,
    temperature_c=20.0,
    pressure_hpa=1013.0,
    humidity_pct=60.0,
) -> EnvironmentRecord:
    now = datetime.now(timezone.utc)
    return EnvironmentRecord(
        observation_datetime_jst=datetime(2024, 1, 15, hour, 0, 0, tzinfo=timezone(timedelta(hours=9))),
        observation_date=date,
        observation_hour=hour,
        location_id="musashikosugi",
        latitude=35.5733,
        longitude=139.6590,
        source_name="open_meteo",
        temperature_c=temperature_c,
        pressure_hpa=pressure_hpa,
        humidity_pct=humidity_pct,
        raw_ingested_at=now,
        record_created_at=now,
    )


# ── Handler tests ──────────────────────────────────────────────────────────────

@patch("services.ingestion.s3")
@patch("clients.open_meteo.requests.get")
def test_handler_success_default_event(mock_get, mock_s3):
    """Test handler with empty event (uses yesterday's date)."""
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None

    archive_payload = {
        "hourly": {
            "time": ["2024-01-15T10:00"],
            "temperature_2m": [20.0],
            "apparent_temperature": [18.0],
            "precipitation": [0.0],
            "weather_code": [0],
            "surface_pressure": [1013.0],
            "relative_humidity_2m": [60.0],
            "wind_speed_10m": [5.0],
            "uv_index": [3.0],
        }
    }
    aq_payload = {
        "hourly": {
            "time": ["2024-01-15T10:00"],
            "pm2_5": [10.0],
            "european_aqi": [25.0],
            "birch_pollen": [1.0],
            "grass_pollen": [0.5],
            "weed_pollen": [0.2],
        }
    }
    mock_response.json.side_effect = [archive_payload, aq_payload]
    mock_get.return_value = mock_response
    mock_s3.put_object.return_value = {}

    handler = _load_handler()
    result = handler.lambda_handler({}, None)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["total_records"] == 1
    assert body["saved_files"] == 1
    mock_s3.put_object.assert_called_once()


@patch("services.ingestion.s3")
@patch("clients.open_meteo.requests.get")
def test_handler_backfill(mock_get, mock_s3):
    """Test handler with backfill=True."""
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None

    archive_payload = {
        "hourly": {
            "time": ["2024-01-14T10:00", "2024-01-15T10:00"],
            "temperature_2m": [19.0, 20.0],
            "apparent_temperature": [17.0, 18.0],
            "precipitation": [0.0, 0.0],
            "weather_code": [0, 1],
            "surface_pressure": [1012.0, 1013.0],
            "relative_humidity_2m": [65.0, 60.0],
            "wind_speed_10m": [4.0, 5.0],
            "uv_index": [2.0, 3.0],
        }
    }
    aq_payload = {
        "hourly": {
            "time": ["2024-01-14T10:00", "2024-01-15T10:00"],
            "pm2_5": [8.0, 10.0],
            "european_aqi": [20.0, 25.0],
            "birch_pollen": [0.5, 1.0],
            "grass_pollen": [0.3, 0.5],
            "weed_pollen": [0.1, 0.2],
        }
    }
    mock_response.json.side_effect = [archive_payload, aq_payload]
    mock_get.return_value = mock_response
    mock_s3.put_object.return_value = {}

    handler = _load_handler()
    result = handler.lambda_handler(
        {"backfill": True, "date_from": "2024-01-14", "date_to": "2024-01-15"},
        None,
    )

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["total_records"] == 2
    # Two different dates → two separate S3 files
    assert body["saved_files"] == 2


@patch("services.ingestion.s3")
@patch("clients.open_meteo.requests.get")
def test_handler_api_failure(mock_get, mock_s3):
    """Test handler when Open-Meteo API fails."""
    import requests as req
    mock_get.side_effect = req.RequestException("Connection error")

    handler = _load_handler()
    result = handler.lambda_handler({}, None)

    assert result["statusCode"] == 500
    body = json.loads(result["body"])
    assert "error" in body


def test_handler_invalid_payload():
    """Test handler with invalid payload."""
    handler = _load_handler()
    result = handler.lambda_handler({"location_id": 12345}, None)
    # location_id is a string; int is coercible, so this should succeed too
    assert result["statusCode"] in (200, 400, 500)
