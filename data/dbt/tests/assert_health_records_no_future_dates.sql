-- 未来日付の体調記録は存在しないはず（システム時刻バグの検知）
select record_id, recorded_at
from {{ ref('stg_health__records') }}
where recorded_at > current_timestamp
