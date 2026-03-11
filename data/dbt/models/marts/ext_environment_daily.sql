-- marts/ext_environment_daily.sql
-- 日次集約の最終ファクトテーブル（intermediate daily_agg → mart）

select
    observation_date,
    location_id,
    avg_temperature_c,
    min_temperature_c,
    max_temperature_c,
    avg_pressure_hpa,
    min_pressure_hpa,
    max_pressure_hpa,
    avg_humidity_pct,
    min_humidity_pct,
    max_humidity_pct,
    total_precipitation_mm,
    max_birch_pollen,
    max_grass_pollen,
    max_weed_pollen,
    max_pm25,
    max_aqi,
    dominant_weather_code,
    record_count

from {{ ref('int_env_daily_agg') }}
