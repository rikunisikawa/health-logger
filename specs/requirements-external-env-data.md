# 外部環境データ取込基盤 要件定義書

バージョン: 3.0（確定版）
作成日: 2026-03-11
対象プロジェクト: health-logger (prod 環境のみ)

---

## 決定済み仕様一覧

| 項目 | 決定内容 |
|------|---------|
| 取得地点 | 武蔵小杉近辺（川崎市中原区）固定 `lat: 35.5733, lng: 139.6590, location_id: musashikosugi` |
| 地点選択UI | なし（固定。将来GPS取得・選択UIに拡張）|
| Lambda実行頻度 | 1日1回（EventBridge `cron(0 1 * * ? *)`、JST 10:00）|
| 1回あたり取得データ | 前日分の24時間（時間粒度）|
| 気象データAPI | Open-Meteo（無料・APIキー不要）|
| 花粉データAPI | Open-Meteo Air Quality API |
| S3バケット | 新規作成 |
| Glue Database | 新規作成 |
| API取得ログ | CloudWatch Logs のみ（テーブル管理なし）|
| dbt | dbt core（Athena adapter）/ ローカル実行 |
| dbtディレクトリ | リポジトリ内 `data/dbt/` |
| ヘルスケア結合粒度 | 時間単位（`observation_datetime_jst` の時単位）|
| ユーザー対応 | 現在1ユーザー・複数ユーザー対応設計 |
| バックフィル | 直近1ヶ月分（実行時から30日前まで）|
| terraform apply | GitHub Actions（PR マージで自動実行）/ PR作成時に plan を確認 |
| マージ | 行わない（PR 作成まで）|

---

## 1. 背景・目的

個人のヘルスケアデータ（疲労感・気分・やる気・FLAGS）と、外部の気象・環境データを時系列で統合し、体調や行動との関連性を分析する。

**分析したい内容（例）**
- 気圧変動と体調悪化（headache フラグ）の関係
- 気温・湿度と睡眠や活動量の関係
- 花粉量と症状（鼻症状・頭痛 FLAGS）の関係
- 天気・降水と行動量・気分の関係

**第一段階のゴール**
Open-Meteo から毎時データを取得し、Athena で参照可能なテーブルへ蓄積して、`health_records` テーブルと時間単位で結合できる状態にする。

---

## 2. スコープ

### 対象に含むもの

- Open-Meteo Forecast API・Air Quality API からの環境データ取込
- Lambda（Python 3.13）による API 呼び出し処理
- EventBridge による毎時スケジュール実行
- S3（新規バケット）への raw JSON 保管
- Glue（新規 Database）/ Athena によるテーブル構築
- dbt core（Athena adapter）での stage / intermediate / mart 変換
- エラーハンドリング・リトライ設計
- バックフィル（直近1ヶ月分の再取得）
- CloudWatch Logs への構造化ログ出力
- 既存 health-logger Terraform 構成への統合
- pytest による単体テスト

### 対象に含まないもの

- フロントエンドへの地点選択 UI・可視化機能追加
- GPS 連携（将来対応）
- 複数地点の同時取得（将来対応）
- dbt Fusion（dbt core で代替）
- dbt の CI/CD 自動実行（ローカル実行のみ）
- API 取得ログの Athena テーブル化（CloudWatch Logs で代替）
- 医療診断・本番 ML

---

## 3. 取得データ仕様

### 3.1 気象データ（Open-Meteo Forecast API）

**エンドポイント例（通常実行: 前日分取得）**

```
https://archive-api.open-meteo.com/v1/archive
  ?latitude=35.5733&longitude=139.6590
  &hourly=temperature_2m,apparent_temperature,precipitation,weather_code,
          surface_pressure,relative_humidity_2m,wind_speed_10m,uv_index
  &start_date=YYYY-MM-DD&end_date=YYYY-MM-DD   # 前日の日付
  &timezone=Asia%2FTokyo
```

> Lambda は毎日 JST 10:00 に起動し、前日（`today - 1`）の 24時間分を取得する。

### 3.2 花粉・大気質データ（Open-Meteo Air Quality API）

**エンドポイント例**

```
https://air-quality-api.open-meteo.com/v1/air-quality
  ?latitude=35.5733&longitude=139.6590
  &hourly=pm2_5,european_aqi,dust,uv_index,birch_pollen,grass_pollen,weed_pollen
  &start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
  &timezone=Asia%2FTokyo
```

> **注**: Open-Meteo の花粉データは欧州植生ベースのモデル値。日本向けには精度が限定的だが、現時点では最善の選択肢として採用。将来的に日本専用 API（気象庁・weathernews 等）への差し替えを考慮した provider interface を実装する。

### 3.3 取得項目一覧

| カラム名 | ソース | 必須 |
|---------|--------|------|
| `observation_datetime_jst` | 計算 | ◯ |
| `observation_date` | 計算 | ◯ |
| `observation_hour` | 計算 | ◯ |
| `location_id` | 固定値 | ◯ |
| `latitude` | 固定値 | ◯ |
| `longitude` | 固定値 | ◯ |
| `source_name` | 固定値 | ◯ |
| `temperature_c` | Forecast API | ◯ |
| `apparent_temperature_c` | Forecast API | 推奨 |
| `pressure_hpa` | Forecast API | ◯ |
| `humidity_pct` | Forecast API | ◯ |
| `weather_code` | Forecast API | ◯ |
| `precipitation_mm` | Forecast API | ◯ |
| `wind_speed_mps` | Forecast API | 推奨 |
| `uv_index` | Forecast API | 推奨 |
| `aqi` | Air Quality API | 推奨 |
| `pm25` | Air Quality API | 推奨 |
| `birch_pollen` | Air Quality API | 推奨 |
| `grass_pollen` | Air Quality API | 推奨 |
| `weed_pollen` | Air Quality API | 推奨 |
| `raw_ingested_at` | Lambda | ◯ |
| `request_id` | Lambda | 推奨 |
| `record_created_at` | Lambda | ◯ |

---

## 4. システムアーキテクチャ

### 全体フロー

```
EventBridge (rate: 1 hour)
  └─→ Lambda: get_env_data (Python 3.13)
        ├─→ Open-Meteo Forecast API
        ├─→ Open-Meteo Air Quality API
        ├─→ S3: health-logger-env-data-prod
        │     └─ raw/source_name=.../date=.../hour=.../location_id=.../
        └─→ CloudWatch Logs: /aws/lambda/get_env_data (構造化ログ)

（手動: dbt run）
  └─→ Athena クエリ
        ├─→ stg_ext_environment_hourly
        ├─→ int_env_pressure_features
        └─→ mart_ext_environment_hourly
            mart_ext_environment_daily
            mart_health_env_joined_hourly
```

### 既存構成との統合方針

| 項目 | 既存 | 追加 |
|------|------|------|
| Lambda | `lambda/<fn>/` 形式 | `lambda/get_env_data/` を同形式で追加 |
| Terraform | `terraform/modules/` | `terraform/modules/env_data_ingest/` を追加 |
| Python | 3.13 / Pydantic v2 / pytest | 同一バージョン・ライブラリで統一 |
| State | `health-logger-tfstate-prod` | 同 S3 state バケットを共用 |
| CI/CD | `ci.yml` の Lambda テスト | `get_env_data` を既存テストジョブに追加 |

---

## 5. AWS リソース設計

### 新規作成リソース

| リソース | 名前 | 用途 |
|---------|------|------|
| S3 バケット | `health-logger-env-data-prod` | raw JSON / Athena 参照データ |
| Glue Database | `health_logger_env_prod` | 環境データテーブル定義 |
| Lambda 関数 | `health-logger-prod-get-env-data` | API 取得処理 |
| EventBridge Rule | `health-logger-prod-env-data-daily` | 日次スケジュール（JST 10:00）|
| IAM Role | `health-logger-prod-get-env-data-role` | Lambda 実行ロール |
| CloudWatch Log Group | `/aws/lambda/get_env_data` | 構造化ログ |

### Lambda 実行ロール権限（最小権限）

```hcl
# S3: 新規バケットへの PutObject / GetObject のみ
# Glue: GetDatabase / GetTable / CreateTable / UpdateTable
# Athena: StartQueryExecution / GetQueryExecution / GetQueryResults
# CloudWatch Logs: CreateLogGroup / CreateLogStream / PutLogEvents
# SSM: GetParameter（地点設定パラメータのみ）
```

### S3 パス設計

```
s3://health-logger-env-data-prod/
  raw/
    source_name=open_meteo_forecast/
      date=YYYY-MM-DD/
        hour=HH/
          location_id=kanagawa/
            <request_id>.json
    source_name=open_meteo_air_quality/
      date=YYYY-MM-DD/
        hour=HH/
          location_id=kanagawa/
            <request_id>.json
  stage/
    ext_environment_hourly/
      date=YYYY-MM-DD/
        <parquet files>
  athena-results/
    (Athena クエリ結果)
```

---

## 6. Lambda 実装設計

### ディレクトリ構成

```
lambda/
  get_env_data/
    handler.py              # エントリポイント
    models.py               # Pydantic v2 スキーマ定義
    clients/
      __init__.py
      base.py               # provider interface (ABC)
      open_meteo.py         # Open-Meteo Forecast + Air Quality 実装
    services/
      __init__.py
      ingestion.py          # S3 保存処理
      validator.py          # データ品質チェック
    requirements.txt
    test_handler.py
    test_clients.py
    test_validator.py
```

### handler.py の動作フロー

```python
# 通常実行（EventBridge から）
event = {}  # target は現在時刻の1時間前

# バックフィル実行
event = {
    "backfill": True,
    "date_from": "2026-02-11",
    "date_to": "2026-03-11",
    "location_id": "kanagawa"
}
```

### provider interface（base.py）

```python
from abc import ABC, abstractmethod
from typing import List
from .models import EnvironmentRecord

class WeatherProvider(ABC):
    @abstractmethod
    def fetch_hourly(self, lat: float, lng: float,
                     date: str, hour: int) -> List[EnvironmentRecord]:
        ...
```

### エラーハンドリング・リトライ

- HTTP エラー（4xx/5xx）: 最大3回リトライ（exponential backoff: 1s, 2s, 4s）
- 必須カラム欠損: 異常として CloudWatch に構造化ログ出力後、処理を継続
- Lambda タイムアウト: 5分に設定（通常 30秒以内に完了見込み）

---

## 7. データ品質要件

### バリデーション（validator.py）

| 項目 | 正常範囲 | 異常時の処理 |
|------|---------|-------------|
| `temperature_c` | -50〜60 | WARNING ログ出力・レコードは保存 |
| `pressure_hpa` | 800〜1100 | WARNING ログ出力・レコードは保存 |
| `humidity_pct` | 0〜100 | WARNING ログ出力・レコードは保存 |
| 必須カラム欠損 | - | ERROR ログ出力・該当レコードをスキップ |

### 冪等性

- S3 パスに `date/hour/location_id` を含めることで、同一時刻・地点の上書きを防止
- 再実行時は同一パスへの上書き保存（S3 の PUT は冪等）

---

## 8. dbt 設計

### プロジェクト配置

```
data/
  dbt/
    dbt_project.yml
    profiles.yml           # Athena 接続設定（.gitignore 対象）
    profiles.yml.example   # テンプレート
    models/
      staging/
        _sources.yml              # S3 / Athena ソース定義
        stg_ext_environment_hourly.sql
      intermediate/
        int_env_pressure_features.sql   # 気圧変化量・移動平均
        int_env_daily_agg.sql           # 日次集約
      marts/
        ext_environment_hourly.sql      # 時間粒度マート
        ext_environment_daily.sql       # 日次集約マート
        health_env_joined_hourly.sql    # ヘルスケアデータとの結合マート
      _schema.yml                       # dbt テスト定義
    macros/
    seeds/
```

### dbt テスト定義

```yaml
# ext_environment_hourly
- unique: [observation_datetime_jst, location_id, source_name]
- not_null: [observation_datetime_jst, location_id, temperature_c, pressure_hpa]
- accepted_range: pressure_hpa (800, 1100)
- accepted_range: humidity_pct (0, 100)
- accepted_range: temperature_c (-50, 60)
```

### ヘルスケアデータとの結合（health_env_joined_hourly）

```sql
-- 結合キー: user_id × observation_datetime_jst (時間単位)
-- health_records: recorded_at を JST 変換して時間単位に丸める
-- ext_environment_hourly: observation_datetime_jst と結合
SELECT
    h.user_id,
    h.recorded_at_jst,
    h.fatigue, h.mood, h.motivation, h.flags,
    e.temperature_c, e.pressure_hpa, e.humidity_pct,
    e.weather_code, e.precipitation_mm,
    e.birch_pollen, e.grass_pollen,
    e.aqi, e.pm25
FROM health_records h
LEFT JOIN ext_environment_hourly e
    ON h.user_id IS NOT NULL  -- マルチユーザー対応: user_id でフィルタ可能
    AND DATE_TRUNC('hour', h.recorded_at_jst) = e.observation_datetime_jst
    AND e.location_id = h.location_id  -- 将来: ユーザーごとの地点設定
```

> **マルチユーザー対応設計**: `location_id` をユーザーごとに設定できる構造にする（現在は全ユーザー `kanagawa` 固定。将来は `user_locations` テーブルを作成して結合）

### dbt 実行方法

```bash
cd data/dbt

# 初期セットアップ
pip install dbt-athena-community
dbt deps

# 通常実行
dbt run
dbt test

# 特定モデルのみ
dbt run --select staging
dbt run --select marts.health_env_joined_hourly
```

---

## 9. バックフィル設計

### 実行方法

```bash
# AWS CLI で Lambda を直接呼び出す
aws lambda invoke \
  --function-name health-logger-prod-get-env-data \
  --payload '{"backfill": true, "date_from": "2026-02-11", "date_to": "2026-03-11", "location_id": "kanagawa"}' \
  --cli-binary-format raw-in-base64-out \
  response.json
```

### バックフィル動作

- `date_from` 〜 `date_to` の全時間帯（24時間 × 日数）を順次取得
- Open-Meteo の Historical API（`archive-api.open-meteo.com`）を使用
- 処理時間: 30日分 × 2API × 1リクエスト/日 = 60リクエスト（数秒で完了）
- Lambda タイムアウト対策: 30日超の場合は日付範囲を分割して複数回実行

---

## 10. 地点設定（将来拡張考慮）

### 現在の設定

```python
# SSM Parameter Store または Lambda 環境変数
LOCATION_ID = "kanagawa"
LATITUDE = 35.4478
LONGITUDE = 139.6425
TIMEZONE = "Asia/Tokyo"
```

### 将来の拡張パス

1. **フェーズ2**: SSM Parameter Store で複数地点を管理できる設計に変更
2. **フェーズ3**: GPS 取得・フロントエンドでの地点選択 UI 追加
3. **フェーズ4**: ユーザーごとの地点設定（`user_locations` テーブル）

---

## 11. セキュリティ要件

- Open-Meteo は API キー不要のため Secrets Manager / SSM へのシークレット保存なし
- Lambda IAM ロールは最小権限（対象 S3 バケットのみ）
- S3 は SSE-S3 暗号化
- ログに個人 ID（user_id / Cognito sub）を出力しない
- `data/dbt/profiles.yml` は `.gitignore` 対象（Athena 接続情報を含む可能性があるため）

---

## 12. Terraform 設計

### モジュール構成

```
terraform/
  modules/
    env_data_ingest/      # 新規モジュール
      main.tf             # Lambda + EventBridge + IAM + S3 + Glue
      variables.tf
      outputs.tf
  envs/
    prod/
      main.tf             # module "env_data_ingest" を追加
```

### module 入力変数

```hcl
variable "environment"        { default = "prod" }
variable "location_id"        { default = "kanagawa" }
variable "latitude"           { default = 35.4478 }
variable "longitude"          { default = 139.6425 }
variable "schedule_expression"{ default = "cron(0 1 * * ? *)" }  # JST 10:00
variable "lambda_s3_bucket"   { description = "Lambda ZIP 格納バケット" }
variable "lambda_s3_key"      { description = "Lambda ZIP の S3 キー" }
```

---

## 13. CI/CD 統合

### ci.yml への追加

```yaml
# 既存の lambda-test ジョブに get_env_data を追加
- name: Test get_env_data
  run: pytest lambda/get_env_data/ -v
```

### deploy.yml への追加

```yaml
# 既存の Lambda ZIP → S3 → terraform apply の流れに追加
- name: Package get_env_data
  run: |
    cd lambda/get_env_data
    pip install -r requirements.txt -t package/
    zip -r ../get_env_data.zip package/ handler.py models.py clients/ services/
```

---

## 14. 実装前チェックリスト

### AWS

- [ ] `terraform apply` で `env_data_ingest` モジュールをデプロイ
- [ ] S3 バケット `health-logger-env-data-prod` の作成確認
- [ ] Glue Database `health_logger_env_prod` の作成確認
- [ ] Lambda 関数 `health-logger-prod-get-env-data` の作成確認
- [ ] EventBridge Rule の有効化確認

### dbt

- [ ] `pip install dbt-athena-community` でインストール
- [ ] `data/dbt/profiles.yml` に Athena 接続情報を設定
- [ ] `dbt debug` で接続確認
- [ ] `dbt run` で初回実行
- [ ] `dbt test` でテスト通過確認

### バックフィル

- [ ] AWS CLI で Lambda 直接呼び出しによる30日分のバックフィル実行
- [ ] Athena で `SELECT COUNT(*) FROM ext_environment_hourly` で件数確認

---

## 15. 受け入れ条件

- [ ] Open-Meteo から気圧・気温・天気・花粉を含む主要項目を取得できる
- [ ] raw データが `s3://health-logger-env-data-prod/raw/` に保存される
- [ ] Athena から `ext_environment_hourly` テーブルを参照できる
- [ ] 直近1ヶ月分のバックフィルが実行できる
- [ ] dbt で staging / mart が構築される
- [ ] dbt tests が全件 PASSED
- [ ] 失敗時に CloudWatch Logs から原因を追跡できる
- [ ] `health_records` と時間単位で結合できる（`health_env_joined_hourly`）
- [ ] `pytest lambda/get_env_data/ -v` が全件 PASSED
- [ ] `terraform plan` でエラーなし

---

## 16. 実装タスク一覧（優先順位順）

### フェーズ 1: コア実装

| # | タスク |
|---|--------|
| 1 | GitHub Issue 作成・ブランチ作成 |
| 2 | `lambda/get_env_data/` ディレクトリ・骨格作成 |
| 3 | Pydantic v2 モデル定義（`models.py`） |
| 4 | provider interface（`clients/base.py`） |
| 5 | Open-Meteo クライアント実装（`clients/open_meteo.py`） |
| 6 | バリデーションサービス（`services/validator.py`） |
| 7 | S3 保存サービス（`services/ingestion.py`） |
| 8 | Lambda ハンドラ（`handler.py`）|
| 9 | pytest テスト作成・全 PASSED 確認 |
| 10 | Terraform モジュール（`terraform/modules/env_data_ingest/`） |
| 11 | `terraform/envs/prod/main.tf` への組み込み |

### フェーズ 2: dbt

| # | タスク |
|---|--------|
| 12 | `data/dbt/` プロジェクト初期化 |
| 13 | sources.yml + staging モデル作成 |
| 14 | intermediate モデル（気圧特徴量）作成 |
| 15 | mart モデル（hourly / daily / joined）作成 |
| 16 | dbt tests 定義・全 PASSED 確認 |

### フェーズ 3: 統合・検証

| # | タスク |
|---|--------|
| 17 | CI/CD への統合（ci.yml / deploy.yml 更新） |
| 18 | terraform apply（ユーザー確認後） |
| 19 | バックフィル実行（直近1ヶ月） |
| 20 | Athena でのデータ確認 |
| 21 | PR 作成 |

### リスクと対策

| リスク | 対策 |
|--------|------|
| Open-Meteo 花粉データが日本で精度不足 | provider interface で将来差し替え可能にする |
| Iceberg スキーマ変更時の Athena 不整合 | ALTER TABLE を手動実行（MEMORY.md の注意事項に従う） |
| Lambda タイムアウト（バックフィル時） | 日付範囲を分割して複数回呼び出す設計にする |
| dbt Athena adapter の設定が複雑 | `dbt debug` で段階的に接続確認する |
