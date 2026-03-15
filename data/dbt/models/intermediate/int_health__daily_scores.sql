-- models/intermediate/int_health__daily_scores.sql
-- 責務: ユーザー×日付ごとの体調スコア集約 + FLAGS デコード

with stg as (
    select * from {{ ref('stg_health__records') }}
    where record_type = 'daily'
),

decoded as (
    select
        *,
        -- FLAGS ビットマスクのデコード
        {{ decode_flag('flags', 1) }}  as has_poor_sleep,
        {{ decode_flag('flags', 2) }}  as has_headache,
        {{ decode_flag('flags', 4) }}  as has_stomachache,
        {{ decode_flag('flags', 8) }}  as did_exercise,
        {{ decode_flag('flags', 16) }} as had_alcohol,
        {{ decode_flag('flags', 32) }} as had_caffeine
    from stg
)

select
    user_id,
    recorded_date,
    avg(fatigue_score)        as avg_fatigue,
    min(fatigue_score)        as min_fatigue,
    max(fatigue_score)        as max_fatigue,
    avg(mood_score)           as avg_mood,
    avg(motivation_score)     as avg_motivation,
    bool_or(has_headache)     as had_headache_today,
    bool_or(has_poor_sleep)   as had_poor_sleep_today,
    bool_or(has_stomachache)  as had_stomachache_today,
    bool_or(did_exercise)     as did_exercise_today,
    bool_or(had_alcohol)      as had_alcohol_today,
    bool_or(had_caffeine)     as had_caffeine_today,
    count(*)                  as record_count
from decoded
group by user_id, recorded_date
