-- intermediate/int_env_daily_agg.sql
-- 日次集約モデル

with stg as (
    select * from {{ ref('stg_ext_environment_hourly') }}
)

select
    observation_date,
    location_id,

    -- 気温
    avg(temperature_c)         as avg_temperature_c,
    min(temperature_c)         as min_temperature_c,
    max(temperature_c)         as max_temperature_c,

    -- 気圧
    avg(pressure_hpa)          as avg_pressure_hpa,
    min(pressure_hpa)          as min_pressure_hpa,
    max(pressure_hpa)          as max_pressure_hpa,

    -- 湿度
    avg(humidity_pct)          as avg_humidity_pct,
    min(humidity_pct)          as min_humidity_pct,
    max(humidity_pct)          as max_humidity_pct,

    -- 降水量（合計）
    sum(precipitation_mm)      as total_precipitation_mm,

    -- 花粉（最大値）
    max(birch_pollen)          as max_birch_pollen,
    max(grass_pollen)          as max_grass_pollen,
    max(weed_pollen)           as max_weed_pollen,

    -- PM2.5・AQI（最大値）
    max(pm25)                  as max_pm25,
    max(aqi)                   as max_aqi,

    -- 天気コード（最頻値: 出現回数が最多のコード）
    max_by(weather_code, cnt) as dominant_weather_code,

    -- レコード数（データ品質確認用）
    count(*)                   as record_count

from (
    select
        *,
        count(*) over (partition by observation_date, location_id, weather_code) as cnt
    from stg
    where weather_code is not null
) t
group by observation_date, location_id
