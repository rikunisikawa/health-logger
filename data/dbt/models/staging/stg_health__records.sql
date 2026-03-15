-- models/staging/stg_health__records.sql
-- 責務: health_records 生データの型変換・正規化のみ
-- 実テーブルのカラム: id, user_id, fatigue_score(int), mood_score(int),
--   motivation_score(int), flags(int), note, recorded_at(timestamp),
--   timezone, device_id, app_version, written_at(timestamp),
--   record_type, custom_fields

with source as (
    select * from {{ source('health_logs', 'health_records') }}
),

renamed as (
    select
        cast(id               as varchar)   as record_id,
        cast(user_id          as varchar)   as user_id,
        cast(record_type      as varchar)   as record_type,

        -- スコア（0〜10 の int）
        cast(fatigue_score    as double)    as fatigue_score,
        cast(mood_score       as double)    as mood_score,
        cast(motivation_score as double)    as motivation_score,

        -- フラグ（ビットマスク: poor_sleep=1, headache=2, stomachache=4, exercise=8, alcohol=16, caffeine=32）
        coalesce(cast(flags as bigint), 0)  as flags,

        cast(note             as varchar)   as note,
        cast(timezone         as varchar)   as timezone,
        cast(device_id        as varchar)   as device_id,
        cast(app_version      as varchar)   as app_version,
        cast(custom_fields    as varchar)   as custom_fields,

        -- 時刻
        recorded_at,
        date(recorded_at)                   as recorded_date,
        hour(recorded_at)                   as recorded_hour,

        -- written_at = レコード書き込み日時（created_at の代替）
        written_at

    from source
    where id is not null
      and user_id is not null
      and recorded_at is not null
)

select * from renamed
