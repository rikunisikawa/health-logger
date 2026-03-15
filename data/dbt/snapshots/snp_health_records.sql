-- snp_health_records.sql
-- 体調記録の変更履歴を保持（スコア修正・フラグ変更の追跡）

{% snapshot snp_health_records %}

{{
  config(
    target_schema = 'health_logger_snapshots',
    unique_key    = 'record_id',
    strategy      = 'check',
    check_cols    = ['fatigue_score', 'mood_score', 'motivation_score', 'flags', 'note'],
  )
}}

select
    id        as record_id,
    user_id,
    record_type,
    fatigue_score,
    mood_score,
    motivation_score,
    flags,
    note,
    recorded_at,
    created_at
from {{ source('health_logs', 'health_records') }}

{% endsnapshot %}
