import sys
import os

# Insert get_env_data/ at the FRONT of sys.path to override other lambda paths
_here = os.path.dirname(os.path.abspath(__file__))
_services = os.path.join(_here, "services")
for _p in (_services, _here):
    if _p in sys.path:
        sys.path.remove(_p)
    sys.path.insert(0, _p)

from datetime import datetime, timezone, timedelta

import pytest

from env_models import EnvironmentRecord
from services.validator import validate_records


JST = timezone(timedelta(hours=9))


def _make_record(
    temperature_c=20.0,
    pressure_hpa=1013.0,
    humidity_pct=60.0,
    hour=10,
) -> EnvironmentRecord:
    now = datetime.now(timezone.utc)
    return EnvironmentRecord(
        observation_datetime_jst=datetime(2024, 1, 15, hour, 0, 0, tzinfo=JST),
        observation_date="2024-01-15",
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


# ── Valid records ──────────────────────────────────────────────────────────────

def test_validate_valid_records():
    records = [_make_record(), _make_record(hour=11)]
    result = validate_records(records)
    assert len(result) == 2


def test_validate_empty_list():
    result = validate_records([])
    assert result == []


# ── Range warnings (should pass, not raise) ──────────────────────────────────

def test_validate_temperature_too_high_logs_warning(caplog):
    import logging
    with caplog.at_level(logging.WARNING, logger="services.validator"):
        records = [_make_record(temperature_c=65.0)]
        result = validate_records(records)
    assert len(result) == 1
    assert "temperature_c out of range" in caplog.text


def test_validate_temperature_too_low_logs_warning(caplog):
    import logging
    with caplog.at_level(logging.WARNING, logger="services.validator"):
        records = [_make_record(temperature_c=-55.0)]
        result = validate_records(records)
    assert len(result) == 1
    assert "temperature_c out of range" in caplog.text


def test_validate_pressure_too_high_logs_warning(caplog):
    import logging
    with caplog.at_level(logging.WARNING, logger="services.validator"):
        records = [_make_record(pressure_hpa=1200.0)]
        result = validate_records(records)
    assert len(result) == 1
    assert "pressure_hpa out of range" in caplog.text


def test_validate_pressure_too_low_logs_warning(caplog):
    import logging
    with caplog.at_level(logging.WARNING, logger="services.validator"):
        records = [_make_record(pressure_hpa=700.0)]
        result = validate_records(records)
    assert len(result) == 1
    assert "pressure_hpa out of range" in caplog.text


def test_validate_humidity_too_high_logs_warning(caplog):
    import logging
    with caplog.at_level(logging.WARNING, logger="services.validator"):
        records = [_make_record(humidity_pct=110.0)]
        result = validate_records(records)
    assert len(result) == 1
    assert "humidity_pct out of range" in caplog.text


def test_validate_humidity_negative_logs_warning(caplog):
    import logging
    with caplog.at_level(logging.WARNING, logger="services.validator"):
        records = [_make_record(humidity_pct=-5.0)]
        result = validate_records(records)
    assert len(result) == 1
    assert "humidity_pct out of range" in caplog.text


# ── Boundary values ───────────────────────────────────────────────────────────

def test_validate_boundary_temperature_min():
    records = [_make_record(temperature_c=-50.0)]
    result = validate_records(records)
    assert len(result) == 1


def test_validate_boundary_temperature_max():
    records = [_make_record(temperature_c=60.0)]
    result = validate_records(records)
    assert len(result) == 1


def test_validate_boundary_pressure_min():
    records = [_make_record(pressure_hpa=800.0)]
    result = validate_records(records)
    assert len(result) == 1


def test_validate_boundary_pressure_max():
    records = [_make_record(pressure_hpa=1100.0)]
    result = validate_records(records)
    assert len(result) == 1


# ── Required fields are None → ValueError ─────────────────────────────────────

def test_validate_none_temperature_raises():
    """EnvironmentRecord with temperature_c=None (bypassing model validation)."""
    now = datetime.now(timezone.utc)
    record = EnvironmentRecord.model_construct(
        observation_datetime_jst=datetime(2024, 1, 15, 10, 0, 0, tzinfo=JST),
        observation_date="2024-01-15",
        observation_hour=10,
        location_id="musashikosugi",
        latitude=35.5733,
        longitude=139.6590,
        source_name="open_meteo",
        temperature_c=None,
        pressure_hpa=1013.0,
        humidity_pct=60.0,
        raw_ingested_at=now,
        record_created_at=now,
    )
    with pytest.raises(ValueError, match="temperature_c"):
        validate_records([record])


def test_validate_none_pressure_raises():
    now = datetime.now(timezone.utc)
    record = EnvironmentRecord.model_construct(
        observation_datetime_jst=datetime(2024, 1, 15, 10, 0, 0, tzinfo=JST),
        observation_date="2024-01-15",
        observation_hour=10,
        location_id="musashikosugi",
        latitude=35.5733,
        longitude=139.6590,
        source_name="open_meteo",
        temperature_c=20.0,
        pressure_hpa=None,
        humidity_pct=60.0,
        raw_ingested_at=now,
        record_created_at=now,
    )
    with pytest.raises(ValueError, match="pressure_hpa"):
        validate_records([record])


def test_validate_none_humidity_raises():
    now = datetime.now(timezone.utc)
    record = EnvironmentRecord.model_construct(
        observation_datetime_jst=datetime(2024, 1, 15, 10, 0, 0, tzinfo=JST),
        observation_date="2024-01-15",
        observation_hour=10,
        location_id="musashikosugi",
        latitude=35.5733,
        longitude=139.6590,
        source_name="open_meteo",
        temperature_c=20.0,
        pressure_hpa=1013.0,
        humidity_pct=None,
        raw_ingested_at=now,
        record_created_at=now,
    )
    with pytest.raises(ValueError, match="humidity_pct"):
        validate_records([record])
