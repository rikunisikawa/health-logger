-- models/marts/environment/fct_environment_daily.sql
{{
  config(
    materialized         = 'incremental',
    unique_key           = ['observation_date', 'location_id'],
    incremental_strategy = 'insert_overwrite',
    partitioned_by       = ['observation_date'],
    on_schema_change     = 'append_new_columns'
  )
}}

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
from {{ ref('int_env__daily_agg') }}

{% if is_incremental() %}
where observation_date >= date_add('day', -3, current_date)
{% endif %}
