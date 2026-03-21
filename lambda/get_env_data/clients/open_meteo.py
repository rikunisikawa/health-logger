import logging
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import requests

# Ensure get_env_data/ and clients/ are on sys.path for sibling imports
_pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_clients_dir = os.path.dirname(os.path.abspath(__file__))
for _p in (_clients_dir, _pkg_root):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from base import WeatherProvider
from env_models import EnvironmentRecord

logger = logging.getLogger(__name__)

ARCHIVE_API_URL = "https://archive-api.open-meteo.com/v1/archive"
AIR_QUALITY_API_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

ARCHIVE_HOURLY_PARAMS = ",".join([
    "temperature_2m",
    "apparent_temperature",
    "precipitation",
    "weather_code",
    "surface_pressure",
    "relative_humidity_2m",
    "wind_speed_10m",
    "uv_index",
])

AIR_QUALITY_HOURLY_PARAMS = ",".join([
    "pm2_5",
    "european_aqi",
    "birch_pollen",
    "grass_pollen",
])

JST = timezone(timedelta(hours=9))


def _fetch_with_retry(url: str, params: Dict[str, Any], max_retries: int = 3) -> Dict:
    """Fetch URL with exponential backoff retry."""
    last_exception: Optional[Exception] = None
    for attempt in range(max_retries):
        try:
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            last_exception = e
            wait_seconds = 2 ** attempt  # 1s, 2s, 4s
            logger.warning(
                '{"level": "WARNING", "message": "API request failed, retrying",'
                ' "url": "%s", "attempt": %d, "wait_seconds": %d, "error": "%s"}',
                url, attempt + 1, wait_seconds, str(e),
            )
            if attempt < max_retries - 1:
                time.sleep(wait_seconds)
    raise RuntimeError(
        f"Failed to fetch {url} after {max_retries} attempts: {last_exception}"
    )


class OpenMeteoClient(WeatherProvider):
    def fetch_hourly(
        self,
        lat: float,
        lng: float,
        date_from: str,
        date_to: str,
        location_id: str,
    ) -> List[EnvironmentRecord]:
        """Fetch hourly weather and air quality data from Open-Meteo APIs."""
        now_utc = datetime.now(timezone.utc)

        # Fetch weather archive data
        archive_data = _fetch_with_retry(
            ARCHIVE_API_URL,
            {
                "latitude": lat,
                "longitude": lng,
                "start_date": date_from,
                "end_date": date_to,
                "hourly": ARCHIVE_HOURLY_PARAMS,
                "timezone": "Asia/Tokyo",
            },
        )

        # Fetch air quality data (forecast API: supports only recent ~5 days via past_days)
        # For historical backfill beyond 5 days, this API returns 400 → skip gracefully
        try:
            aq_data = _fetch_with_retry(
                AIR_QUALITY_API_URL,
                {
                    "latitude": lat,
                    "longitude": lng,
                    "start_date": date_from,
                    "end_date": date_to,
                    "hourly": AIR_QUALITY_HOURLY_PARAMS,
                    "timezone": "Asia/Tokyo",
                },
            )
        except Exception as e:
            logger.warning(
                '{"level": "WARNING", "message": "Air quality API unavailable, skipping",'
                ' "date_from": "%s", "date_to": "%s", "error": "%s"}',
                date_from, date_to, str(e),
            )
            aq_data = {"hourly": {}}

        return self._merge_records(
            archive_data=archive_data,
            aq_data=aq_data,
            lat=lat,
            lng=lng,
            location_id=location_id,
            ingested_at=now_utc,
        )

    def _merge_records(
        self,
        archive_data: Dict,
        aq_data: Dict,
        lat: float,
        lng: float,
        location_id: str,
        ingested_at: datetime,
    ) -> List[EnvironmentRecord]:
        archive_hourly = archive_data.get("hourly", {})
        aq_hourly = aq_data.get("hourly", {})

        # Build a lookup dict from AQ data keyed by time string
        aq_by_time: Dict[str, Dict] = {}
        aq_times = aq_hourly.get("time", [])
        for i, t in enumerate(aq_times):
            aq_by_time[t] = {
                "pm25": _safe_get(aq_hourly, "pm2_5", i),
                "aqi": _safe_get(aq_hourly, "european_aqi", i),
                "birch_pollen": _safe_get(aq_hourly, "birch_pollen", i),
                "grass_pollen": _safe_get(aq_hourly, "grass_pollen", i),
            }

        archive_times = archive_hourly.get("time", [])
        records: List[EnvironmentRecord] = []

        for i, time_str in enumerate(archive_times):
            # Parse datetime: Open-Meteo returns "YYYY-MM-DDTHH:MM" in requested timezone
            obs_dt_jst = datetime.fromisoformat(time_str).replace(tzinfo=JST)
            obs_date = obs_dt_jst.strftime("%Y-%m-%d")
            obs_hour = obs_dt_jst.hour

            aq = aq_by_time.get(time_str, {})

            record = EnvironmentRecord(
                observation_datetime_jst=obs_dt_jst,
                observation_date=obs_date,
                observation_hour=obs_hour,
                location_id=location_id,
                latitude=lat,
                longitude=lng,
                source_name="open_meteo",
                temperature_c=_safe_get(archive_hourly, "temperature_2m", i) or 0.0,
                apparent_temperature_c=_safe_get(archive_hourly, "apparent_temperature", i),
                pressure_hpa=_safe_get(archive_hourly, "surface_pressure", i) or 0.0,
                humidity_pct=_safe_get(archive_hourly, "relative_humidity_2m", i) or 0.0,
                weather_code=_safe_get(archive_hourly, "weather_code", i),
                precipitation_mm=_safe_get(archive_hourly, "precipitation", i),
                wind_speed_mps=_safe_get(archive_hourly, "wind_speed_10m", i),
                uv_index=_safe_get(archive_hourly, "uv_index", i),
                aqi=aq.get("aqi"),
                pm25=aq.get("pm25"),
                birch_pollen=aq.get("birch_pollen"),
                grass_pollen=aq.get("grass_pollen"),
                raw_ingested_at=ingested_at,
                record_created_at=ingested_at,
            )
            records.append(record)

        return records


def _safe_get(data: Dict, key: str, index: int):
    """Safely retrieve an element from a list in a dict."""
    values = data.get(key)
    if values is None or index >= len(values):
        return None
    return values[index]
