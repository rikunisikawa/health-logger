-- marts/ext_environment_hourly.sql
-- 時間粒度の最終ファクトテーブル（staging → mart）

select
    observation_datetime_jst,
    observation_date,
    observation_hour,
    location_id,
    latitude,
    longitude,
    source_name,
    temperature_c,
    apparent_temperature_c,
    pressure_hpa,
    humidity_pct,
    weather_code,
    precipitation_mm,
    wind_speed_mps,
    uv_index,
    aqi,
    pm25,
    birch_pollen,
    grass_pollen,
    weed_pollen,
    raw_ingested_at,
    request_id,
    record_created_at

from {{ ref('stg_ext_environment_hourly') }}
