-- intermediate/int_env_pressure_features.sql
-- 気圧特徴量の計算
-- - pressure_3h_change: 3時間前との気圧差
-- - pressure_24h_avg: 24時間移動平均
-- - pressure_prev_day_avg_delta: 前日平均気圧との差

with stg as (
    select * from {{ ref('stg_ext_environment_hourly') }}
),

-- 3時間前との気圧差
with_3h_change as (
    select
        *,
        pressure_hpa - lag(pressure_hpa, 3) over (
            partition by location_id
            order by observation_datetime_jst
        ) as pressure_3h_change
    from stg
),

-- 24時間移動平均（過去24時間）
with_24h_avg as (
    select
        *,
        avg(pressure_hpa) over (
            partition by location_id
            order by observation_datetime_jst
            rows between 23 preceding and current row
        ) as pressure_24h_avg
    from with_3h_change
),

-- 前日平均気圧との差
daily_avg as (
    select
        location_id,
        observation_date,
        avg(pressure_hpa) as daily_avg_pressure
    from stg
    group by location_id, observation_date
),

with_prev_day_delta as (
    select
        w.*,
        w.pressure_hpa - lag(d.daily_avg_pressure) over (
            partition by w.location_id
            order by w.observation_date
        ) as pressure_prev_day_avg_delta
    from with_24h_avg w
    left join daily_avg d
        on w.location_id = d.location_id
        and w.observation_date = d.observation_date
)

select
    observation_datetime_jst,
    observation_date,
    observation_hour,
    location_id,
    pressure_hpa,
    pressure_3h_change,
    pressure_24h_avg,
    pressure_prev_day_avg_delta
from with_prev_day_delta
