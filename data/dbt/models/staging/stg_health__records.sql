-- models/staging/stg_health__records.sql
-- 責務: health_records 生データの型変換・正規化のみ

with source as (
    select * from {{ source('health_logs', 'health_records') }}
),

renamed as (
    select
        cast(id               as varchar)   as record_id,
        cast(user_id          as varchar)   as user_id,
        cast(record_type      as varchar)   as record_type,

        -- スコア（0.0〜10.0）
        try_cast(fatigue_score    as double) as fatigue_score,
        try_cast(mood_score       as double) as mood_score,
        try_cast(motivation_score as double) as motivation_score,

        -- フラグ（ビットマスク: poor_sleep=1, headache=2, stomachache=4, exercise=8, alcohol=16, caffeine=32）
        coalesce(try_cast(flags as bigint), 0) as flags,

        cast(note             as varchar)   as note,

        -- 時刻
        cast(recorded_at as timestamp)                          as recorded_at,
        date(cast(recorded_at as timestamp))                    as recorded_date,
        hour(cast(recorded_at as timestamp))                    as recorded_hour,

        cast(created_at as timestamp)                           as created_at

    from source
    where id is not null
      and user_id is not null
      and recorded_at is not null
)

select * from renamed
