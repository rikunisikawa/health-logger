# dbt 設計方針ドキュメント

## 概要

health-logger の dbt プロジェクトは、AWS Athena（Iceberg / Glue カタログ）上のデータを変換する。
外部 API から収集した環境データと、Lambda 経由で書き込まれた体調記録を結合し、分析可能な形に整形する。

---

## 1. プロジェクト構造設計

### ディレクトリ構成

```
data/dbt/
├── analyses/              # 探索的分析クエリ（dbt compile 後に Athena 実行）
├── docs/                  # dbt docs 用 overview.md
├── macros/                # 再利用可能な SQL マクロ
├── models/
│   ├── staging/           # 生データの型変換・正規化（source → staging）
│   ├── intermediate/      # 再利用可能なビジネスロジック・集約
│   └── marts/
│       ├── environment/   # 環境データのファクトテーブル
│       └── health/        # 体調データのファクトテーブル
├── seeds/                 # マスタデータ CSV（天気コード・地点マスタ）
├── snapshots/             # SCD Type 2 変更履歴
├── tests/                 # singular tests（SQL アサーション）
├── dbt_project.yml
├── packages.yml
└── profiles.yml.example
```

### 命名規則

| レイヤー | プレフィックス | 例 |
|---|---|---|
| staging | `stg_` | `stg_env__hourly`, `stg_health__records` |
| intermediate | `int_` | `int_env__daily_agg`, `int_health__daily_scores` |
| marts (fact) | `fct_` | `fct_environment_hourly`, `fct_health_env_joined_hourly` |
| marts (dim) | `dim_` | `dim_location`（将来用） |
| snapshots | `snp_` | `snp_health_records` |

エンティティとサブエンティティの区切りには二重アンダースコア（`__`）を使う。
例: `stg_env__hourly`（ソース: env、粒度: hourly）

---

## 2. モデル設計方針

### staging 層の責務

- `source()` マクロで生テーブルを参照する唯一のレイヤー
- 型変換・カラム名標準化・NULL 除外のみ実施
- ビジネスロジック（集約・フラグデコード等）は書かない
- `safe_cast` マクロを使って変換失敗時に NULL を返す

### intermediate 層の責務

- staging 層の `ref()` のみ参照（source() は使わない）
- 他のモデルから再利用される集約・計算を定義
- ウィンドウ関数・日次集約・フィーチャー計算などを担当
- 単独で最終的な分析に使うことは想定しない

### marts 層の責務

- 下流アプリ・分析ツールが直接参照するテーブル
- `ref()` で staging または intermediate を参照
- `source()` は絶対に参照しない（バグの温床）
- materialization は基本 `table` または `incremental`

---

## 3. materialization 戦略

| レイヤー | materialization | 理由 |
|---|---|---|
| staging | view | 生データの正規化は軽量。毎回フルスキャンでよい |
| intermediate | view | marts から参照されるため、marts のビルド時に評価される |
| marts (小テーブル) | table | Athena のスキャンコスト削減 |
| marts (大テーブル) | incremental | 時系列データは差分更新で効率化 |

### ephemeral の使い所

- 1回しか参照しない CTE の代替として使う
- 現状のプロジェクトでは使用しない

---

## 4. incremental model 設計

### 基本設定（Athena + Iceberg）

```sql
{{
  config(
    materialized         = 'incremental',
    unique_key           = ['observation_datetime_jst', 'location_id'],
    incremental_strategy = 'insert_overwrite',
    partitioned_by       = ['observation_date'],
    on_schema_change     = 'append_new_columns'
  )
}}
```

### 差分条件

Athena の incremental は `insert_overwrite` を使う。
パーティション単位で上書きするため、安全に再実行できる。

```sql
{% if is_incremental() %}
where observation_date >= date_add('day', -3, current_date)
{% endif %}
```

直近3日分を再処理することで、遅延着信データや再処理に対応する。

### フルリフレッシュ

```bash
dbt run --full-refresh --select fct_environment_hourly
```

スキーマ変更やデータ修正が必要な場合に実行する。

---

## 5. テスト設計

### schema tests（_schema.yml）

| テスト | 対象 | severity |
|---|---|---|
| not_null | 全必須カラム | error |
| unique | 主キー相当のカラム | error |
| accepted_values | record_type, source_name | error |
| dbt_utils.accepted_range | スコア・気圧・気温・湿度 | warn（スコア）/ error（気象） |

### singular tests（tests/ ディレクトリ）

SQL アサーション形式。「行が返ってきたらテスト失敗」のセマンティクス。

- `assert_pressure_range.sql`: 気圧が物理的にあり得ない値（900未満 or 1100超）を検出
- `assert_health_records_no_future_dates.sql`: 未来日付の体調記録を検出

### severity の使い分け

- `error`: パイプラインを止めるべき深刻な品質問題
- `warn`: 監視は必要だが処理は継続できる品質劣化

---

## 6. sources 管理

### freshness 設定

```yaml
freshness:
  warn_after: {count: 2, period: hour}
  error_after: {count: 6, period: hour}
loaded_at_field: raw_ingested_at
```

`dbt source freshness` で定期的に鮮度チェックを実行する。

### ガバナンス

- source は `models/staging/_sources.yml` で一元管理
- staging 層以外から `source()` を呼ばない（marts で source() を呼ぶのは厳禁）
- source テーブルのスキーマ変更は staging モデルで吸収する

---

## 7. macros 設計

### decode_flag

FLAGS ビットマスクから特定フラグを真偽値としてデコードする。

```sql
{{ decode_flag('flags', 2) }}  -- headache フラグ
-- 展開結果: (cast(flags as bigint) & 2) = 2
```

FLAGS ビット割り当て:

| bit | 値 | 意味 |
|---|---|---|
| 0 | 1 | 睡眠不足 (poor_sleep) |
| 1 | 2 | 頭痛 (headache) |
| 2 | 4 | 腹痛 (stomachache) |
| 3 | 8 | 運動 (exercise) |
| 4 | 16 | アルコール (alcohol) |
| 5 | 32 | カフェイン (caffeine) |

### safe_cast

`try_cast` のラッパー。変換失敗時に NULL またはデフォルト値を返す。

```sql
{{ safe_cast('temperature_c', 'double') }}
-- 展開結果: try_cast(temperature_c as double)

{{ safe_cast('precipitation_mm', 'double', 0.0) }}
-- 展開結果: coalesce(try_cast(precipitation_mm as double), 0.0)
```

### pressure_lag_feature

気圧の時間差分フィーチャーを計算するウィンドウ関数のラッパー。

```sql
{{ pressure_lag_feature('pressure_hpa', 3) }}
-- 3時間前との気圧差
```

### generate_schema_name

dbt デフォルトでは `<target_schema>_<custom_schema>` となるが、
`custom_schema` をそのまま使うようにオーバーライドしている。

---

## 8. snapshots 設計（SCD Type 2）

体調記録のスコアやフラグが修正された場合の変更履歴を保持する。

```sql
{% snapshot snp_health_records %}
{{
  config(
    target_schema = 'health_logger_snapshots',
    unique_key    = 'record_id',
    strategy      = 'check',
    check_cols    = ['fatigue_score', 'mood_score', 'motivation_score', 'flags', 'note'],
  )
}}
{% endsnapshot %}
```

- `strategy = 'check'`: 指定カラムの値が変化したときに新しいレコードを挿入
- `dbt_valid_from` / `dbt_valid_to` カラムが自動付与される

---

## 9. seeds 活用（マスタデータ管理）

### weather_codes.csv

WMO 天気コードの日本語ラベルとカテゴリ。
`fct_environment_hourly` で結合して `weather_description` カラムを付与する。

### location_master.csv

観測地点のマスタ。緯度・経度・タイムゾーンを管理。

### column_types の明示

```yaml
seeds:
  health_logger:
    weather_codes:
      +column_types:
        weather_code: bigint
    location_master:
      +column_types:
        latitude: double
        longitude: double
```

Athena の型推論に依存しないよう、数値型は明示的に指定する。

---

## 10. exposures（下流依存の可視化）

dbt のデータリネージグラフに下流の依存先を可視化する。

```yaml
exposures:
  - name: health_logger_app
    type: application
    depends_on:
      - source('health_logs', 'health_records')
  - name: health_environment_analysis
    type: analysis
    depends_on:
      - ref('fct_health_env_joined_hourly')
```

`dbt docs generate` 後に `dbt docs serve` でリネージグラフを確認できる。

---

## 11. 運用コマンド集

```bash
# 依存パッケージのインストール
dbt deps

# source の鮮度チェック
dbt source freshness

# 全モデル run + test（推奨）
dbt build

# 特定レイヤーのみ実行
dbt run --select staging.*
dbt run --select intermediate.*
dbt run --select marts.*

# 依存ツリーごと実行（+ は上流も含む）
dbt run --select +fct_health_env_joined_hourly

# テストのみ実行
dbt test --select staging.*
dbt test --select fct_health_env_joined_hourly

# incremental のフルリフレッシュ
dbt run --full-refresh --select fct_environment_hourly

# ドキュメント生成・確認
dbt docs generate && dbt docs serve

# スナップショット実行（定期実行を想定）
dbt snapshot

# 探索的クエリの SQL 生成
dbt compile --select pressure_headache_correlation
# target/compiled/ 配下の SQL を Athena で実行する
```

---

## 12. CI/CD 組み込み方針

### CI（GitHub Actions）

```yaml
- name: dbt build (dry-run)
  run: |
    cd data/dbt
    dbt deps
    dbt compile  # SQL 生成のみ（Athena 接続不要）
```

`dbt compile` は Athena への接続なしに SQL 生成・Jinja 展開の検証ができるため CI に組み込みやすい。

### CD（本番実行）

定期的なデータ更新は以下のフローを想定:

1. Lambda が Open-Meteo API からデータを取得し Firehose 経由で S3 に書き込む
2. 定期バッチ（EventBridge Scheduler + Lambda or Step Functions）が `dbt build` を実行
3. incremental モデルが差分データを処理する

### スキーマ変更時の注意

Terraform の `glue:UpdateTable` は Glue カタログのみ更新し、Iceberg メタデータは更新しない。
カラム追加後は必ず Athena で `ALTER TABLE ... ADD COLUMNS` を実行すること。
詳細は MEMORY.md の「Iceberg スキーマ変更の注意事項」を参照。
