# ER 図 — Health Logger データモデル

> 対象: S3 Tables (Iceberg) / DynamoDB / dbt 分析レイヤー全体
> 更新: 2026-03-22

---

## 1. コアデータモデル（ストレージ層）

```mermaid
erDiagram
    %% ─────────────────────────────────────────
    %% 認証（Cognito）
    %% ─────────────────────────────────────────
    COGNITO_USER {
        string user_id PK "sub (UUID)"
        string username
        string email
    }

    %% ─────────────────────────────────────────
    %% S3 Tables / Iceberg
    %% ─────────────────────────────────────────
    HEALTH_RECORD {
        string id PK "UUID"
        string user_id FK "Cognito sub"
        string record_type "daily | event | status"
        integer fatigue_score "0-100, nullable"
        integer mood_score "0-100, nullable"
        integer motivation_score "0-100, nullable"
        integer concentration_score "0-100, nullable"
        integer flags "ビットマスク (0-63)"
        string note "max 280 chars"
        string recorded_at "ISO8601 ユーザー記録日時"
        string timezone "例: Asia/Tokyo"
        string device_id
        string app_version
        string custom_fields "JSON 文字列 (CUSTOM_FIELD_VALUE[])"
        string written_at "ISO8601 UTC Lambda 書込日時"
        string dt "YYYY-MM-DD パーティション列"
    }

    %% custom_fields の論理構造（JSON埋め込み）
    CUSTOM_FIELD_VALUE {
        string item_id "ITEM_CONFIG_ENTRY.item_id に対応"
        string label "表示ラベル"
        string type "slider | checkbox | number | text"
        string value "number | boolean | string (JSON)"
    }

    %% ─────────────────────────────────────────
    %% FLAGS ビットマスク（論理エンティティ）
    %% ─────────────────────────────────────────
    FLAG_BIT {
        string name PK "フラグ名"
        integer bit_value "1 | 2 | 4 | 8 | 16 | 32"
        string description
    }

    %% ─────────────────────────────────────────
    %% DynamoDB
    %% ─────────────────────────────────────────
    ITEM_CONFIG {
        string user_id PK "Cognito sub"
        string configs "JSON 文字列 (ITEM_CONFIG_ENTRY[])"
    }

    %% configs の論理構造（JSON埋め込み）
    ITEM_CONFIG_ENTRY {
        string item_id PK "UUID"
        string label "表示名"
        string type "slider | checkbox | number | text"
        string mode "form | event | status"
        integer order "表示順"
        string icon "絵文字（任意）"
        number min "最小値（任意）"
        number max "最大値（任意）"
        string unit "単位（任意）"
    }

    PUSH_SUBSCRIPTION {
        string user_id PK "Cognito sub"
        string endpoint "FCM エンドポイント URL"
        string p256dh_key "暗号化キー"
        string auth_key "認証キー"
    }

    %% ─────────────────────────────────────────
    %% 環境データ（S3 / Athena）
    %% ─────────────────────────────────────────
    ENV_RECORD_RAW {
        string observation_datetime_jst PK "JST 時刻"
        string location_id PK "観測地点 ID"
        date observation_date
        integer observation_hour
        double latitude
        double longitude
        string source_name "データソース名"
        double temperature_c "気温 (℃)"
        double apparent_temperature_c "体感温度"
        double pressure_hpa "気圧 (hPa)"
        double humidity_pct "湿度 (%)"
        integer weather_code "WMO 天気コード"
        double precipitation_mm "降水量 (mm)"
        double wind_speed_mps "風速 (m/s)"
        double uv_index "UV 指数"
        double aqi "大気質指数"
        double pm25 "PM2.5 (μg/m³)"
        double birch_pollen "シラカバ花粉"
        double grass_pollen "イネ科花粉"
        double weed_pollen "雑草花粉"
        string raw_ingested_at "取込日時"
        string request_id "リクエスト ID"
        string record_created_at "レコード生成日時"
    }

    %% ─────────────────────────────────────────
    %% リレーション
    %% ─────────────────────────────────────────
    COGNITO_USER ||--o{ HEALTH_RECORD      : "記録する"
    COGNITO_USER ||--o| ITEM_CONFIG        : "カスタム項目を設定"
    COGNITO_USER ||--o| PUSH_SUBSCRIPTION  : "Push 通知を購読"

    HEALTH_RECORD ||--o{ CUSTOM_FIELD_VALUE : "custom_fields (JSON埋込)"
    HEALTH_RECORD }o..o{ FLAG_BIT           : "flags (ビットマスク参照)"

    ITEM_CONFIG ||--o{ ITEM_CONFIG_ENTRY   : "configs (JSON埋込)"
    ITEM_CONFIG_ENTRY ||--o{ CUSTOM_FIELD_VALUE : "item_id で対応"
```

---

## 2. FLAGS ビットマスク詳細

`HEALTH_RECORD.flags` は整数値 1 つにライフスタイルフラグを詰め込んだビットマスク。

| フラグ名 | ビット値 | チェック式 |
|---------|---------|-----------|
| `poor_sleep` — 睡眠不足 | 1 (2⁰) | `flags & 1 != 0` |
| `headache` — 頭痛 | 2 (2¹) | `flags & 2 != 0` |
| `stomachache` — 腹痛 | 4 (2²) | `flags & 4 != 0` |
| `exercise` — 運動 | 8 (2³) | `flags & 8 != 0` |
| `alcohol` — 飲酒 | 16 (2⁴) | `flags & 16 != 0` |
| `caffeine` — カフェイン | 32 (2⁵) | `flags & 32 != 0` |

> 最大値: 63（全フラグ ON）

---

## 3. dbt 分析レイヤー（データリネージ）

```mermaid
flowchart TD
    subgraph Sources["📦 Sources（生データ）"]
        HR["health_records\n(S3 Tables / Iceberg)"]
        ENV["ext_environment_raw\n(S3 / Athena)"]
        WC["weather_codes\n(seed CSV)"]
    end

    subgraph Staging["🧹 Staging（型変換・正規化のみ）"]
        STG_H["stg_health__records\n user_id, record_type\n fatigue/mood/motivation\n concentration, flags\n custom_fields, recorded_at"]
        STG_E["stg_env__hourly\n observation_datetime_jst\n location_id\n temperature_c, pressure_hpa\n humidity_pct, weather_code\n aqi, pm25, pollen..."]
    end

    subgraph Intermediate["⚙️ Intermediate（集約・特徴量計算）"]
        INT_HS["int_health__daily_scores\n user_id × recorded_date\n avg/min/max スコア\n FLAGS デコード済み集計"]
        INT_ED["int_env_daily_agg\n observation_date × location_id\n avg/min/max 気温・気圧・湿度\n 降水量合計, 最大花粉・PM2.5"]
        INT_PF["int_env_pressure_features\n observation_datetime_jst × location_id\n pressure_3h_change\n pressure_24h_avg\n pressure_prev_day_avg_delta"]
    end

    subgraph Marts["📊 Marts（分析ファクトテーブル）"]
        FCT_EH["fct_environment_hourly\n（incremental）\n 1時間粒度 環境データ\n + 天気ラベル\n + 気圧特徴量"]
        FCT_ED["fct_environment_daily\n 1日粒度 環境集約"]
        FCT_JOIN["fct_health_env_joined_hourly\n 体調記録 × 環境データ結合\n → 健康・環境相関分析の起点"]
    end

    HR  --> STG_H
    ENV --> STG_E
    WC  --> FCT_EH

    STG_H --> INT_HS
    STG_E --> INT_ED
    STG_E --> INT_PF

    STG_E  --> FCT_EH
    INT_PF --> FCT_EH
    STG_E  --> FCT_ED
    INT_ED --> FCT_ED

    STG_H  --> FCT_JOIN
    FCT_EH --> FCT_JOIN
```

---

## 4. record_type 別のカラム利用パターン

`HEALTH_RECORD.record_type` によって意味が変わる。

| カラム | `daily` | `event` | `status` |
|-------|---------|---------|---------|
| `fatigue_score` | ✅ 使用 | — | — |
| `mood_score` | ✅ 使用 | — | — |
| `motivation_score` | ✅ 使用 | — | — |
| `concentration_score` | ✅ 使用 | — | — |
| `flags` | ✅ 使用 | `0` 固定 | `0` 固定 |
| `note` | ✅ 使用 | — | — |
| `custom_fields` | フォーム項目 | イベント内容 | 状態 ON/OFF |

**`custom_fields` の典型例（record_type 別）**

```
daily:  [{"item_id":"sleep_hours","label":"睡眠時間","type":"number","value":7.5}]
event:  [{"item_id":"exercise","label":"運動","type":"checkbox","value":true}]
status: [{"item_id":"working","label":"勤務中","type":"checkbox","value":true}]
```

---

## 5. テーブル / ストレージ対応一覧

| エンティティ | ストレージ | 備考 |
|------------|---------|------|
| `HEALTH_RECORD` | S3 Tables (Apache Iceberg) | Firehose 経由で書き込み。Athena + Glue でクエリ |
| `ITEM_CONFIG` | DynamoDB `health-logger-prod-item-configs` | PK: `user_id`。全設定を 1 アイテムに保存 |
| `PUSH_SUBSCRIPTION` | DynamoDB `health-logger-prod-push-subscriptions` | PK: `user_id`。送信失敗時に自動削除 |
| `ENV_RECORD_RAW` | S3 + Athena (`ext_environment_raw`) | Open-Meteo API から Lambda で取込 |
| `weather_codes` | dbt seed CSV | WMO コード → 天気ラベルのマスタ |
| `COGNITO_USER` | Amazon Cognito User Pool | JWTの `sub` が各テーブルの `user_id` |
