from typing import Optional
from datetime import datetime

from pydantic import BaseModel, Field


class EnvironmentRecord(BaseModel):
    observation_datetime_jst: datetime
    observation_date: str
    observation_hour: int
    location_id: str
    latitude: float
    longitude: float
    source_name: str
    temperature_c: float
    apparent_temperature_c: Optional[float] = None
    pressure_hpa: float
    humidity_pct: float
    weather_code: Optional[int] = None
    precipitation_mm: Optional[float] = None
    wind_speed_mps: Optional[float] = None
    uv_index: Optional[float] = None
    aqi: Optional[float] = None
    pm25: Optional[float] = None
    birch_pollen: Optional[float] = None
    grass_pollen: Optional[float] = None
    weed_pollen: Optional[float] = None
    raw_ingested_at: datetime
    request_id: Optional[str] = None
    record_created_at: datetime


class IngestionPayload(BaseModel):
    backfill: bool = False
    date_from: Optional[str] = None  # YYYY-MM-DD
    date_to: Optional[str] = None    # YYYY-MM-DD
    location_id: str = "musashikosugi"
