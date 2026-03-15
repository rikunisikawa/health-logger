-- models/marts/health/fct_health_env_joined_hourly.sql
-- 体調記録 × 環境データの結合ファクトテーブル

with health as (
    -- source()ではなく ref()を使う（staging経由）
    select * from {{ ref('stg_health__records') }}
    where record_type = 'daily'
),

env as (
    select * from {{ ref('fct_environment_hourly') }}
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
        -- FLAGS デコード
        {{ decode_flag('h.flags', 1) }}  as has_poor_sleep,
        {{ decode_flag('h.flags', 2) }}  as has_headache,
        {{ decode_flag('h.flags', 4) }}  as has_stomachache,
        {{ decode_flag('h.flags', 8) }}  as did_exercise,
        {{ decode_flag('h.flags', 16) }} as had_alcohol,
        {{ decode_flag('h.flags', 32) }} as had_caffeine,
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
        e.weather_description,
        e.weather_category,
        e.precipitation_mm,
        e.wind_speed_mps,
        e.uv_index,
        e.aqi,
        e.pm25,
        e.birch_pollen,
        e.grass_pollen,
        e.weed_pollen,
        -- 気圧フィーチャー（頭痛との相関分析に重要）
        e.pressure_3h_change,
        e.pressure_24h_avg,
        e.pressure_prev_day_avg_delta
    from health h
    left join env e
        on  h.recorded_date = e.observation_date
        and h.recorded_hour = e.observation_hour
)

select * from joined
