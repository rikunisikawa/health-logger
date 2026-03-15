-- 気圧変化と頭痛の相関分析（探索的クエリ）
-- dbt compile で SQL 生成後、Athena で直接実行する

select
    case
        when pressure_3h_change < -3  then '急激な低下（-3hPa以上）'
        when pressure_3h_change < -1  then '緩やかな低下（-1〜-3hPa）'
        when pressure_3h_change between -1 and 1 then '安定'
        when pressure_3h_change > 1   then '上昇'
        else '不明'
    end                                        as pressure_trend,
    count(*)                                   as total_records,
    sum(case when has_headache then 1 else 0 end) as headache_count,
    round(
        100.0 * sum(case when has_headache then 1 else 0 end) / count(*),
        1
    )                                          as headache_rate_pct,
    avg(fatigue_score)                         as avg_fatigue,
    avg(mood_score)                            as avg_mood

from {{ ref('fct_health_env_joined_hourly') }}
where recorded_at is not null
  and pressure_3h_change is not null

group by 1
order by headache_rate_pct desc
