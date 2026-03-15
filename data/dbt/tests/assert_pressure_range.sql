-- 気圧の物理的にあり得ない値を検出（センサー障害・データ破損の検知）
select
    observation_datetime_jst,
    location_id,
    pressure_hpa
from {{ ref('stg_env__hourly') }}
where pressure_hpa < 900
   or pressure_hpa > 1100
