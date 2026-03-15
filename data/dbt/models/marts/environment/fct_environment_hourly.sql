-- models/marts/environment/fct_environment_hourly.sql
{{
  config(
    materialized         = 'incremental',
    unique_key           = ['observation_datetime_jst', 'location_id'],
    incremental_strategy = 'insert_overwrite',
    partitioned_by       = ['observation_date'],
    on_schema_change     = 'append_new_columns'
  )
}}

with stg as (
    select * from {{ ref('stg_env__hourly') }}

    {% if is_incremental() %}
    where observation_date >= date_add('day', -3, current_date)
    {% endif %}
),

pressure as (
    select * from {{ ref('int_env__pressure_features') }}
    {% if is_incremental() %}
    where observation_date >= date_add('day', -3, current_date)
    {% endif %}
),

weather_codes as (
    select * from {{ ref('weather_codes') }}
),

joined as (
    select
        stg.observation_datetime_jst,
        stg.observation_date,
        stg.observation_hour,
        stg.location_id,
        stg.latitude,
        stg.longitude,
        stg.source_name,
        stg.temperature_c,
        stg.apparent_temperature_c,
        stg.pressure_hpa,
        stg.humidity_pct,
        stg.weather_code,
        wc.description_ja            as weather_description,
        wc.category                  as weather_category,
        stg.precipitation_mm,
        stg.wind_speed_mps,
        stg.uv_index,
        stg.aqi,
        stg.pm25,
        stg.birch_pollen,
        stg.grass_pollen,
        stg.weed_pollen,
        -- 気圧フィーチャー（頭痛との相関分析用）
        pressure.pressure_3h_change,
        pressure.pressure_24h_avg,
        pressure.pressure_prev_day_avg_delta,
        stg.raw_ingested_at,
        stg.record_created_at
    from stg
    left join pressure using (observation_datetime_jst, location_id)
    left join weather_codes on stg.weather_code = weather_codes.weather_code
)

select * from joined
