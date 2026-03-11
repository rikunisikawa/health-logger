-- marts/health_env_joined_hourly.sql
-- health_records × ext_environment_hourly の結合
-- 体調記録の時刻（JST）と気象データを結合する

with health as (
    select
        id                        as record_id,
        user_id,
        record_type,
        fatigue_score,
        mood_score,
        motivation_score,
        flags,
        note,
        -- recorded_at を JST として扱い、日付と時刻を抽出
        cast(recorded_at as timestamp)                                     as recorded_at,
        date(cast(recorded_at as timestamp))                               as recorded_date,
        hour(cast(recorded_at as timestamp))                               as recorded_hour
    from {{ source('raw_env', 'health_records') }}
    where record_type = 'daily'
),

env as (
    select * from {{ ref('ext_environment_hourly') }}
),

joined as (
    select
        h.record_id,
        h.user_id,
        h.record_type,
        h.fatigue_score,
        h.mood_score,
        h.motivation_score,
        h.flags,
        h.note,
        h.recorded_at,
        h.recorded_date,
        h.recorded_hour,

        -- 環境データ（同日同時刻・固定地点）
        e.location_id,
        e.temperature_c,
        e.apparent_temperature_c,
        e.pressure_hpa,
        e.humidity_pct,
        e.weather_code,
        e.precipitation_mm,
        e.wind_speed_mps,
        e.uv_index,
        e.aqi,
        e.pm25,
        e.birch_pollen,
        e.grass_pollen,
        e.weed_pollen
    from health h
    left join env e
        on  h.recorded_date  = e.observation_date
        and h.recorded_hour  = e.observation_hour
)

select * from joined
