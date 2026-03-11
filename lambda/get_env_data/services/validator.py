import logging
import os
import sys
from typing import List

# Ensure the package root (get_env_data/) is on sys.path for sibling imports
_pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _pkg_root not in sys.path:
    sys.path.insert(0, _pkg_root)

from env_models import EnvironmentRecord

logger = logging.getLogger(__name__)

TEMPERATURE_MIN = -50.0
TEMPERATURE_MAX = 60.0
PRESSURE_MIN = 800.0
PRESSURE_MAX = 1100.0
HUMIDITY_MIN = 0.0
HUMIDITY_MAX = 100.0


def validate_records(records: List[EnvironmentRecord]) -> List[EnvironmentRecord]:
    """Validate data quality of environment records.

    Logs WARNING for out-of-range values.
    Raises ValueError if required fields (temperature_c, pressure_hpa, humidity_pct) are None.
    """
    validated = []
    for record in records:
        _validate_required_fields(record)
        _check_ranges(record)
        validated.append(record)
    return validated


def _validate_required_fields(record: EnvironmentRecord) -> None:
    """Raise ValueError if required fields are missing."""
    missing = []
    if record.temperature_c is None:
        missing.append("temperature_c")
    if record.pressure_hpa is None:
        missing.append("pressure_hpa")
    if record.humidity_pct is None:
        missing.append("humidity_pct")
    if missing:
        raise ValueError(
            f"Required fields are None for record at {record.observation_datetime_jst}: "
            f"{', '.join(missing)}"
        )


def _check_ranges(record: EnvironmentRecord) -> None:
    """Log warnings for out-of-range values."""
    label = str(record.observation_datetime_jst)

    if not (TEMPERATURE_MIN <= record.temperature_c <= TEMPERATURE_MAX):
        logger.warning(
            '{"level": "WARNING", "message": "temperature_c out of range",'
            ' "value": %s, "observation_datetime_jst": "%s"}',
            record.temperature_c,
            label,
        )

    if not (PRESSURE_MIN <= record.pressure_hpa <= PRESSURE_MAX):
        logger.warning(
            '{"level": "WARNING", "message": "pressure_hpa out of range",'
            ' "value": %s, "observation_datetime_jst": "%s"}',
            record.pressure_hpa,
            label,
        )

    if not (HUMIDITY_MIN <= record.humidity_pct <= HUMIDITY_MAX):
        logger.warning(
            '{"level": "WARNING", "message": "humidity_pct out of range",'
            ' "value": %s, "observation_datetime_jst": "%s"}',
            record.humidity_pct,
            label,
        )
