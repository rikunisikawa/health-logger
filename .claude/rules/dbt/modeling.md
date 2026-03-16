---
paths:
  - "data/dbt/**/*.sql"
  - "data/dbt/**/*.yml"
---
# dbt モデリングルール

## 命名規則

| レイヤー | プレフィックス | 例 |
|---------|-------------|-----|
| staging | `stg_<source>__<entity>` | `stg_health__records` |
| intermediate | `int_<domain>__<transform>` | `int_health__daily_scores` |
| marts | `fct_<entity>` / `dim_<entity>` | `fct_health_env_joined_hourly` |

ダブルアンダースコア `__` でソースとエンティティを区切る（プロジェクト規約）。

## Materialization 戦略

```yaml
# dbt_project.yml に明示する
models:
  health_logger:
    staging:
      +materialized: view          # staging は view（軽量）
    intermediate:
      +materialized: table         # intermediate は table（再利用）
    marts:
      +materialized: incremental   # marts は incremental（差分更新）
```

incremental モデルの必須設定:

```sql
{{
  config(
    materialized='incremental',
    incremental_strategy='insert_overwrite',
    partitioned_by=['dt'],
    unique_key='id'
  )
}}

{% if is_incremental() %}
WHERE dt >= DATE_ADD('day', -3, current_date)
{% endif %}
```

## スキーマテスト（`_*.yml`）

新しいモデルには必ずスキーマファイルを作成する。

```yaml
models:
  - name: stg_health__records
    description: health_records の staging レイヤー
    columns:
      - name: id
        tests:
          - not_null
          - unique
      - name: user_id
        tests:
          - not_null
      - name: fatigue_score
        tests:
          - accepted_values:
              values: [0, 1, 2, 3, 4, 5]
```

## Macro の使用

プロジェクトのマクロを積極的に活用する:

```sql
-- FLAGS ビットマスクのデコード（macros/decode_flag.sql）
{{ decode_flag('flags', 'poor_sleep', 1) }} AS flag_poor_sleep

-- 気圧ラグフィーチャー（macros/pressure_lag_feature.sql）
{{ pressure_lag_feature('surface_pressure', hours=3) }} AS pressure_diff_3h

-- NULL 安全キャスト（macros/safe_cast.sql）
{{ safe_cast('raw_value', 'INTEGER') }} AS int_value
```

## Athena (S3 Tables) 対応

- `dbt-athena-community` アダプターを使用
- `s3_staging_dir` は必ず設定する（`profiles.yml`）
- パーティションカラムは `dt DATE` を使用
- `MSCK REPAIR TABLE` は不要（S3 Tables は自動パーティション）
- スキーマ変更後は Athena で `ALTER TABLE ... ADD COLUMNS (...)` を実行

## Sources の鮮度確認

```yaml
sources:
  - name: health_logs
    freshness:
      warn_after: {count: 24, period: hour}
      error_after: {count: 48, period: hour}
    loaded_at_field: recorded_at
```

```bash
# 鮮度チェック
dbt source freshness
```

## テスト実行

```bash
# ビルド（compile + run + test）
dbt build

# テストのみ
dbt test --select staging

# 特定モデルのみ
dbt run --select +fct_health_env_joined_hourly
dbt test --select +fct_health_env_joined_hourly
```

## インクリメンタルのフルリフレッシュ

```bash
# 過去データを含めて全件再計算（月次など）
dbt run --full-refresh --select fct_health_env_joined_hourly
```
