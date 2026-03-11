import sys
import os

# Insert get_env_data/ and clients/ at the FRONT of sys.path to override other lambda paths
_here = os.path.dirname(os.path.abspath(__file__))
_clients = os.path.join(_here, "clients")
for _p in (_clients, _here):
    if _p in sys.path:
        sys.path.remove(_p)
    sys.path.insert(0, _p)

from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

import pytest

from clients.open_meteo import OpenMeteoClient, _safe_get, _fetch_with_retry
from env_models import EnvironmentRecord


def _make_archive_response():
    return {
        "hourly": {
            "time": ["2024-01-15T00:00", "2024-01-15T01:00"],
            "temperature_2m": [10.0, 11.0],
            "apparent_temperature": [8.0, 9.0],
            "precipitation": [0.0, 0.5],
            "weather_code": [0, 61],
            "surface_pressure": [1010.0, 1011.0],
            "relative_humidity_2m": [70.0, 72.0],
            "wind_speed_10m": [3.0, 4.0],
            "uv_index": [0.0, 0.0],
        }
    }


def _make_aq_response():
    return {
        "hourly": {
            "time": ["2024-01-15T00:00", "2024-01-15T01:00"],
            "pm2_5": [12.0, 13.0],
            "european_aqi": [30.0, 32.0],
            "birch_pollen": [2.0, 2.5],
            "grass_pollen": [1.0, 1.2],
            "weed_pollen": [0.5, 0.6],
        }
    }


@patch("clients.open_meteo.requests.get")
def test_fetch_hourly_returns_records(mock_get):
    """Test that fetch_hourly returns correct EnvironmentRecord list."""
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.side_effect = [_make_archive_response(), _make_aq_response()]
    mock_get.return_value = mock_response

    client = OpenMeteoClient()
    records = client.fetch_hourly(
        lat=35.5733,
        lng=139.6590,
        date_from="2024-01-15",
        date_to="2024-01-15",
        location_id="musashikosugi",
    )

    assert len(records) == 2
    assert all(isinstance(r, EnvironmentRecord) for r in records)
    assert records[0].temperature_c == 10.0
    assert records[0].pressure_hpa == 1010.0
    assert records[0].humidity_pct == 70.0
    assert records[0].pm25 == 12.0
    assert records[0].birch_pollen == 2.0
    assert records[0].source_name == "open_meteo"
    assert records[0].location_id == "musashikosugi"
    assert records[0].observation_hour == 0


@patch("clients.open_meteo.requests.get")
def test_fetch_hourly_merges_aq_data(mock_get):
    """Test that AQ data is correctly merged with weather data."""
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.side_effect = [_make_archive_response(), _make_aq_response()]
    mock_get.return_value = mock_response

    client = OpenMeteoClient()
    records = client.fetch_hourly(
        lat=35.5733,
        lng=139.6590,
        date_from="2024-01-15",
        date_to="2024-01-15",
        location_id="musashikosugi",
    )

    r = records[1]
    assert r.temperature_c == 11.0
    assert r.pm25 == 13.0
    assert r.aqi == 32.0
    assert r.grass_pollen == 1.2
    assert r.weed_pollen == 0.6


@patch("clients.open_meteo.requests.get")
def test_fetch_hourly_missing_aq_time(mock_get):
    """Test that missing AQ times result in None pollen/aqi values."""
    archive = _make_archive_response()
    aq = {
        "hourly": {
            "time": ["2024-01-15T00:00"],  # Only first hour
            "pm2_5": [12.0],
            "european_aqi": [30.0],
            "birch_pollen": [2.0],
            "grass_pollen": [1.0],
            "weed_pollen": [0.5],
        }
    }
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.side_effect = [archive, aq]
    mock_get.return_value = mock_response

    client = OpenMeteoClient()
    records = client.fetch_hourly(
        lat=35.5733,
        lng=139.6590,
        date_from="2024-01-15",
        date_to="2024-01-15",
        location_id="musashikosugi",
    )

    assert records[0].pm25 == 12.0
    assert records[1].pm25 is None
    assert records[1].birch_pollen is None


@patch("clients.open_meteo.time.sleep")
@patch("clients.open_meteo.requests.get")
def test_fetch_with_retry_succeeds_after_failure(mock_get, mock_sleep):
    """Test that _fetch_with_retry retries on failure and succeeds."""
    import requests as req

    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {"hourly": {}}

    # Fail twice, then succeed
    mock_get.side_effect = [
        req.RequestException("Timeout"),
        req.RequestException("Timeout"),
        mock_response,
    ]

    result = _fetch_with_retry("https://example.com", {})
    assert result == {"hourly": {}}
    assert mock_get.call_count == 3


@patch("clients.open_meteo.time.sleep")
@patch("clients.open_meteo.requests.get")
def test_fetch_with_retry_raises_after_max_retries(mock_get, mock_sleep):
    """Test that _fetch_with_retry raises after max retries."""
    import requests as req

    mock_get.side_effect = req.RequestException("Connection refused")

    with pytest.raises(RuntimeError, match="Failed to fetch"):
        _fetch_with_retry("https://example.com", {}, max_retries=3)

    assert mock_get.call_count == 3


def test_safe_get_normal():
    data = {"values": [1, 2, 3]}
    assert _safe_get(data, "values", 0) == 1
    assert _safe_get(data, "values", 2) == 3


def test_safe_get_missing_key():
    data = {}
    assert _safe_get(data, "values", 0) is None


def test_safe_get_out_of_bounds():
    data = {"values": [1]}
    assert _safe_get(data, "values", 5) is None
