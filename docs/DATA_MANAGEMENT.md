# DATA_MANAGEMENT.md — データ管理ガイドライン（DMBOK準拠）

**プロジェクト**: health-logger
**オーナー / スチュワード**: Riku Nishikawa（個人プロジェクト）
**最終更新**: 2026-03-20
**対象読者**: プロジェクトオーナー・将来の自分・AI エージェント

---

## 概要

本ドキュメントは DMBOK（Data Management Body of Knowledge）の 11 の知識領域に沿って、
health-logger プロジェクトのデータ管理方針・現状・改善事項を整理したものである。
コード変更や設計変更が生じた際は、このドキュメントを合わせて更新すること。

---

## データリネージ概要図

```
[ユーザー操作（ブラウザ）]
  fatigue / mood / motivation スライダー
  flags チェックボックス (poor_sleep, headache ...)
  note テキスト
       |
       | HTTPS POST  /records  (JWT Bearer)
       v
[API Gateway]  JWT 検証 (Cognito issuer)
       |
       v
[Lambda: create_record]  Pydantic バリデーション
  付与: id(UUID), user_id(JWT sub), written_at
       |
       v
[Kinesis Firehose]  バッファ 60秒 / 5MB
       |
       v
[S3 Tables: health_records (Iceberg)]  ← Glue Catalog
       |
       v
[Athena]  get_latest Lambda がポーリング (max 10秒)
       |
       v
[React フロントエンド]  グラフ・履歴表示


[EventBridge Scheduler (日次)]
       |
       v
[Lambda: get_env_data]  Open-Meteo API 呼び出し
       |
       v
[S3: ext_environment_raw/]  JSON パーティション保存
       |
       v
[Glue Crawler / Catalog]  テーブル定義更新
       |
       v
[dbt (Athena adapter)]
  staging:      stg_health__records
                stg_env__hourly
       |
  intermediate: int_health__daily_scores  (FLAGS デコード)
                int_env__daily_agg
                int_env__pressure_features
       |
  marts:        fct_health_env_joined_hourly
                fct_environment_hourly
                fct_environment_daily
       |
[Athena / 手動分析クエリ]
```

---

## 1. データガバナンス（Data Governance）

### 現状

| 項目 | 内容 |
|------|------|
| データオーナー | Riku Nishikawa（個人プロジェクト・唯一のユーザー） |
| データスチュワード | Riku Nishikawa |
| ポリシー管理 | CLAUDE.md・本ドキュメント・.claude/rules/ で管理 |
| 変更管理 | GitHub Issues / PR ベース（ブランチ戦略: feature/xxx） |
| AI エージェントの権限 | `terraform apply` の自律実行禁止、ドキュメント専用エージェントはコード変更禁止 |

### 設計判断の根拠

- 個人プロジェクトのため組織横断的なガバナンス委員会は不要
- CLAUDE.md の「禁止事項」が最優先ルールとして機能する
- AI エージェントを複数運用するため、エージェントごとの権限スコープを .claude/rules/ で制御する

### 既知の制限・改善候補

- データ保持ポリシー（retention policy）が未定義。S3 Tables に S3 Lifecycle を設定していない
- カラム追加手順（Terraform apply → Athena ALTER TABLE）がエラーを起こした経緯がある（PR #16 参照）。手順をチェックリスト化して必ず実行すること

---

## 2. データアーキテクチャ（Data Architecture）

### 現状

```
レイヤー構成（Medallion Architecture）:

Bronze  S3 Tables (Iceberg): health_records
        S3: ext_environment_raw/ (JSON)

Silver  dbt staging views: stg_health__records, stg_env__hourly
        dbt intermediate views: int_health__daily_scores,
                                int_env__daily_agg,
                                int_env__pressure_features

Gold    dbt marts tables: fct_health_env_joined_hourly,
                          fct_environment_hourly,
                          fct_environment_daily
```

### 主要 AWS サービスの役割

| サービス | 役割 |
|----------|------|
| Cognito | 認証・ユーザー管理（OAuth 2.0 PKCE） |
| API Gateway HTTP API | JWT 検証・ルーティング |
| Lambda (Python 3.13) | バリデーション・Firehose/Athena 呼び出し |
| Kinesis Firehose | バッファ転送（health_records 書き込み） |
| S3 Tables (Iceberg) | health_records の永続ストレージ |
| S3 (standard) | 環境データ raw JSON・Athena 結果・Lambda 成果物 |
| Glue Data Catalog | テーブルスキーマ管理 |
| Athena | SQL クエリエンジン |
| EventBridge Scheduler | 環境データ定期取得のトリガー |
| DynamoDB | item_configs・push_subscriptions（非分析データ） |
| Amplify Hosting | React PWA の配信 |

### 設計判断の根拠

- Firehose を経由することで Lambda が Iceberg に直接書き込む複雑さを回避し、書き込み耐障害性を確保している
- Iceberg 形式を採用することでタイムトラベルクエリ・スキーマエボリューション・ACID トランザクションに対応できる
- dbt を変換レイヤーに集中させ、Lambda 側に変換ロジックを持ち込まない（Lambda は取得・保存・最小限の正規化のみ）

### 既知の制限・改善候補

- Terraform の `glue:UpdateTable` は Glue カタログのみ更新し Iceberg メタデータは更新しないため、カラム追加後に Athena で `ALTER TABLE ... ADD COLUMNS` を手動実行する必要がある
- dbt は CI/CD 未組み込み（手動実行）。EventBridge + Lambda または Step Functions による自動化が将来課題
- dev 環境が常時稼働していないため、手元での動作確認は prod に対して実施している

---

## 3. データモデリング・設計（Data Modeling & Design）

### 3-1. health_records（S3 Tables / Iceberg）

#### データディクショナリ

| カラム名 | 型 | 必須 | 発生源 | 説明 |
|----------|----|------|--------|------|
| `id` | string (UUID v4) | 必須 | Lambda 生成 | レコード一意識別子 |
| `user_id` | string (UUID) | 必須 | JWT sub | Cognito ユーザー識別子（仮名化済み） |
| `record_type` | string | 必須 | フロントエンド | `daily` / `event` / `status` |
| `fatigue_score` | integer | 任意 | スライダー | 疲労感 0〜100。NULL 許容 |
| `mood_score` | integer | 任意 | スライダー | 気分 0〜100。NULL 許容 |
| `motivation_score` | integer | 任意 | スライダー | やる気 0〜100。NULL 許容 |
| `concentration_score` | integer | 任意 | スライダー | 集中力 0〜10。NULL 許容（将来拡張）|
| `flags` | integer | 必須 | チェックボックス | ライフスタイルフラグ（ビットマスク 0〜63） |
| `note` | string | 任意 | テキスト入力 | メモ。280文字以内。デフォルト空文字 |
| `recorded_at` | string (ISO 8601) | 必須 | ブラウザ | ユーザーが記録した日時 |
| `timezone` | string | 任意 | ブラウザ | タイムゾーン名（例: `Asia/Tokyo`） |
| `device_id` | string | 任意 | ブラウザ | デバイス識別子（User-Agent ベース） |
| `app_version` | string | 任意 | アプリ | バージョン（例: `1.2.0`） |
| `custom_fields` | string (JSON) | 任意 | フロントエンド | カスタム項目値配列（JSON 文字列） |
| `written_at` | string (ISO 8601) | 必須 | Lambda | Lambda が処理した UTC 日時 |
| `dt` | string (YYYY-MM-DD) | 必須 | Lambda | パーティション列（`recorded_at` の日付部分） |

#### パーティション戦略

```
パーティション列: dt (YYYY-MM-DD)
目的: Athena のパーティションプルーニングによるスキャンコスト削減
```

### 3-2. ext_environment_raw（S3 / Glue）

#### データディクショナリ

| カラム名 | 型 | 必須 | 説明 |
|----------|----|------|------|
| `observation_datetime_jst` | timestamp | 必須 | 観測日時（Asia/Tokyo） |
| `location_id` | string | 必須 | 観測地点識別子 |
| `temperature_c` | double | 推奨 | 気温（℃）|
| `pressure_hpa` | double | 推奨 | 気圧（hPa） |
| `humidity_pct` | double | 推奨 | 湿度（%） |
| `weather_code` | integer | 推奨 | WMO 天気コード |
| `precipitation_mm` | double | 推奨 | 降水量（mm） |
| `wind_speed_mps` | double | 任意 | 風速（m/s） |
| `uv_index` | double | 任意 | 紫外線指数 |
| `aqi` | double | 任意 | 大気質指数 |
| `pm25` | double | 任意 | PM2.5 濃度（µg/m³） |
| `birch_pollen` | double | 任意 | 白樺花粉量 |
| `grass_pollen` | double | 任意 | イネ科花粉量 |
| `weed_pollen` | double | 任意 | 雑草花粉量 |
| `raw_ingested_at` | timestamp | 必須 | Lambda による取り込み日時（UTC） |

### 3-3. FLAGS ビットマスク参照表

| フラグ名 | ビット | 値 | 説明 |
|----------|--------|----|------|
| `poor_sleep` | bit 0 | 1 | 睡眠の質が悪かった |
| `headache` | bit 1 | 2 | 頭痛あり |
| `stomachache` | bit 2 | 4 | 腹痛あり |
| `exercise` | bit 3 | 8 | 運動した |
| `alcohol` | bit 4 | 16 | 飲酒した |
| `caffeine` | bit 5 | 32 | カフェイン摂取 |

**最大値**: 63（全フラグ ON = 1+2+4+8+16+32）

```sql
-- Athena での FLAGS デコード例
SELECT
  bitwise_and(flags, 1)  != 0 AS has_poor_sleep,
  bitwise_and(flags, 2)  != 0 AS has_headache,
  bitwise_and(flags, 4)  != 0 AS has_stomachache,
  bitwise_and(flags, 8)  != 0 AS did_exercise,
  bitwise_and(flags, 16) != 0 AS had_alcohol,
  bitwise_and(flags, 32) != 0 AS had_caffeine
FROM health_records;
```

### 3-4. dbt モデルのデータディクショナリ

#### staging: stg_health__records

`source()` で health_records を参照。型変換・NULL 正規化のみ実施。
ビジネスロジックは書かない。

| カラム名 | 型 | 説明 |
|----------|----|------|
| `record_id` | string | `id` をリネーム |
| `user_id` | string | そのまま引き継ぎ |
| `record_type` | string | `daily` / `event` / `status` |
| `fatigue_score` | integer | 0〜100 |
| `mood_score` | integer | 0〜100 |
| `motivation_score` | integer | 0〜100 |
| `flags` | integer | ビットマスク |
| `recorded_at` | timestamp | ISO 8601 → timestamp 変換 |
| `written_at` | timestamp | |

#### staging: stg_env__hourly

`source()` で ext_environment_raw を参照。列名標準化・型変換のみ。

| カラム名 | 型 | 説明 |
|----------|----|------|
| `observation_datetime_jst` | timestamp | |
| `location_id` | string | |
| `temperature_c` | double | safe_cast 使用 |
| `pressure_hpa` | double | safe_cast 使用 |
| `humidity_pct` | double | safe_cast 使用 |
| `weather_code` | integer | |
| `raw_ingested_at` | timestamp | freshness チェック用 |

#### intermediate: int_health__daily_scores

FLAGS ビットマスクをデコードし、日次単位で集約する中間テーブル。

| カラム名 | 型 | 説明 |
|----------|----|------|
| `user_id` | string | |
| `record_date` | date | `recorded_at` の日付部分 |
| `avg_fatigue` | double | 日次平均疲労スコア |
| `avg_mood` | double | 日次平均気分スコア |
| `avg_motivation` | double | 日次平均やる気スコア |
| `has_poor_sleep` | boolean | FLAGS デコード |
| `has_headache` | boolean | FLAGS デコード |
| `did_exercise` | boolean | FLAGS デコード |
| `had_alcohol` | boolean | FLAGS デコード |
| `had_caffeine` | boolean | FLAGS デコード |

#### intermediate: int_env__pressure_features

気圧の時系列特徴量を計算するウィンドウ関数レイヤー。

| カラム名 | 型 | 説明 |
|----------|----|------|
| `observation_datetime_jst` | timestamp | |
| `location_id` | string | |
| `pressure_hpa` | double | 元の気圧値 |
| `pressure_lag_3h` | double | 3時間前との差分 |
| `pressure_lag_24h` | double | 24時間前との差分 |
| `pressure_ma_3h` | double | 直近3時間移動平均 |

#### marts: fct_health_env_joined_hourly

体調記録と環境データを時間粒度で結合したファクトテーブル。
分析の主要テーブル。

| カラム名 | 型 | 説明 |
|----------|----|------|
| `user_id` | string | |
| `recorded_at_hour` | timestamp | 時間粒度に丸めた記録日時 |
| `fatigue_score` | integer | |
| `mood_score` | integer | |
| `motivation_score` | integer | |
| `has_poor_sleep` | boolean | FLAGS デコード |
| `has_headache` | boolean | FLAGS デコード |
| `did_exercise` | boolean | FLAGS デコード |
| `had_alcohol` | boolean | FLAGS デコード |
| `had_caffeine` | boolean | FLAGS デコード |
| `temperature_c` | double | 環境データ（同時間帯） |
| `pressure_hpa` | double | 環境データ |
| `humidity_pct` | double | 環境データ |
| `pressure_lag_3h` | double | 気圧3時間差分フィーチャー |
| `weather_description` | string | weather_codes seed で結合 |

---

## 4. データストレージ・運用（Data Storage & Operations）

### 保存場所一覧

| データ種別 | 保存場所 | 形式 | 保持期間 | 備考 |
|----------|---------|------|---------|------|
| 健康記録 | S3 Tables (Iceberg) | Parquet（Iceberg 管理） | 無期限 | Lifecycle 未設定 |
| 環境データ raw | S3 `ext_environment_raw/` | JSON Lines | 無期限 | パーティション: `dt=YYYY-MM-DD/hh=HH/` |
| Athena クエリ結果 | S3 `athena-results/` | CSV | 明示設定なし | 定期クリーンアップ未設定 |
| Lambda 成果物 | S3 `artifacts/` | ZIP | デプロイ履歴分 | |
| Terraform State | S3 `health-logger-tfstate-prod` | JSON | 無期限 | バージョニング有効 |
| ユーザー情報 | Cognito User Pool | AWS 管理 | アカウント削除まで | |
| カスタム項目設定 | DynamoDB `item_configs` | JSON | アカウント削除まで | |
| Push 購読情報 | DynamoDB `push_subscriptions` | JSON | 自動削除（410 応答時） | |
| Lambda 実行ログ | CloudWatch Logs | テキスト | 30日 | 個人情報の過剰出力なし |

### SLA テーブル（鮮度期待値）

| データ | フレッシュネス目標 | 警告しきい値 | エラーしきい値 | 備考 |
|--------|-----------------|------------|-------------|------|
| health_records | ユーザー操作後 5分以内 | — | — | Firehose バッファ最大 60秒 |
| ext_environment_raw | 毎時 + 最大 60分遅延 | 2時間 | 6時間 | dbt source freshness 設定済み |
| fct_health_env_joined_hourly | 日次バッチ後 | — | — | dbt 手動実行のため SLA は非公式 |

### 運用上の注意事項

- Iceberg スキーマ変更は Terraform apply 後に必ず Athena で `ALTER TABLE ... ADD COLUMNS` を実行すること。省略すると `get_latest` Lambda が `COLUMN_NOT_FOUND` で全件 500 エラーになる（PR #16 の失敗実績あり）
- Firehose は `60秒` または `5MB` 超過でフラッシュする。リアルタイム性は最大 60秒の遅延がある
- dbt は現時点で CI/CD 未組み込みのため、手動で `dbt build` を実行する必要がある

---

## 5. データセキュリティ（Data Security）

### 認証・認可

| 制御点 | 方式 | 説明 |
|--------|------|------|
| ユーザー認証 | Cognito Hosted UI + OAuth 2.0 PKCE | パスワードはアプリ側を通過しない |
| API 認可 | API Gateway JWT Authorizer | 全エンドポイントに認証必須 |
| データアクセス制御 | Lambda が JWT `sub` を使ってフィルタリング | 他ユーザーのデータへのアクセス不可 |
| SQL インジェクション対策 | user_id を UUID 正規表現 `^[0-9a-f-]{36}$` で検証 | Athena クエリへの埋め込み前に検証 |

### 暗号化

| 対象 | 方式 |
|------|------|
| 通信（ブラウザ↔API） | HTTPS TLS 1.2+ |
| S3 保存データ | SSE-S3（サーバーサイド暗号化） |
| Lambda 内部通信 | AWS 内部ネットワーク暗号化 |

### PII（個人情報）の取り扱い

`user_id` は Cognito の `sub`（サブジェクト）クレームであり、メールアドレス・氏名などの直接的な個人識別情報（PII）ではない。ただし Cognito User Pool と突き合わせると個人を特定できるため、**仮名化データ（pseudonymous data）**として扱う。

| フィールド | 性質 | 対応 |
|-----------|------|------|
| `user_id` (Cognito sub) | 仮名化済み識別子 | Athena クエリで直接公開しない |
| `note` | ユーザー自由入力（PII 含む可能性あり） | ログに出力しない |
| `device_id` (User-Agent) | 準識別子 | 個人特定には不十分 |
| Cognito メール / 氏名 | 直接 PII | Cognito User Pool 内にのみ保存 |

### シークレット管理

| シークレット | 保存場所 | 管理方法 |
|------------|---------|---------|
| VAPID 秘密鍵 | GitHub Secrets | CI/CD 経由で Lambda 環境変数に注入 |
| Cognito クライアントシークレット | Terraform State (S3) | Terraform が管理 |
| AWS アクセスキー | 使用しない | GitHub OIDC 一時クレデンシャルで代替 |
| Open-Meteo API キー | 不要 | Open-Meteo は無料・認証不要 |

**禁止事項**: シークレット値をコード・PR 説明文・チャット・tfvars にコミットしないこと。過去に VAPID 鍵を PR #13 の説明文に記載してしまった事故があり、即時鍵再生成で対応した。

### セキュリティリスク対応状況

| リスク | 深刻度 | 対応状況 |
|-------|-------|---------|
| 不正ログイン | 高 | Cognito 管理。MFA はオプション（未強制） |
| データ漏洩（通信） | 高 | 全通信 HTTPS。対応済み |
| SQL インジェクション | 高 | UUID 正規表現検証済み。対応済み |
| XSS | 中 | React デフォルト保護 + 危険な API 不使用。対応済み |
| 過剰なデータアクセス | 中 | user_id フィルタリング。対応済み |
| MFA 未強制 | 低〜中 | 個人利用のため許容（改善候補） |
| CloudTrail 未設定 | 低 | 個人利用のため許容（改善候補） |

---

## 6. データ統合・相互運用性（Data Integration & Interoperability）

### 統合パターン

| パターン | 実装 | 用途 |
|---------|------|------|
| Event-driven（ストリーミング） | Lambda → Firehose → S3 | health_records の書き込み |
| Batch（定期取得） | EventBridge → Lambda | 環境データの取り込み |
| ELT（変換後ロード） | dbt（Athena adapter） | Silver / Gold レイヤー構築 |
| API 呼び出し | Lambda → Open-Meteo HTTPS | 気象・環境データ取得 |

### dbt モデル依存関係

```
source: health_logs.health_records
    └─ stg_health__records
         └─ int_health__daily_scores
              └─ fct_health_env_joined_hourly

source: health_logger_env_prod.ext_environment_raw
    └─ stg_env__hourly
         ├─ int_env__daily_agg
         │    └─ fct_environment_daily
         └─ int_env__pressure_features
              ├─ fct_environment_hourly
              └─ fct_health_env_joined_hourly

seeds: weather_codes, location_master, flags_master
    └─ fct_environment_hourly (weather_description 結合)
    └─ fct_health_env_joined_hourly (flags デコードラベル)
```

### provider インターフェース設計方針

環境データ取得 Lambda は provider interface を実装しており、Open-Meteo を第一候補とするが WeatherAPI・Tomorrow.io 等への差し替えが可能な設計にしている。取得クライアントと変換ロジックは分離する。

### 既知の制限・改善候補

- dbt と Athena の接続設定（profiles.yml）は `profiles.yml.example` のままであり、実行環境ごとに手動設定が必要
- バックフィル（過去日分の再取得）は Lambda のイベントペイロードで `target_date` を指定して手動実行する

---

## 7. ドキュメント・コンテンツ管理（Document & Content Management）

### 管理ドキュメント一覧

| ファイル | 目的 | 更新トリガー |
|---------|------|------------|
| `README.md` | プロジェクト概要・セットアップ手順 | 構成変更時 |
| `CLAUDE.md` | 開発ガイドライン・禁止事項 | ポリシー変更時 |
| `docs/DATA_MANAGEMENT.md` | 本ドキュメント（DMBOK ガイドライン） | スキーマ・アーキテクチャ変更時 |
| `docs/DATABASE_SCHEMA.md` | テーブル定義・FLAGS 詳細 | スキーマ変更時 |
| `docs/dbt-design.md` | dbt 設計方針・materialization 戦略 | dbt モデル変更時 |
| `docs/data-lineage.md` | データの流れと変換ポイント | アーキテクチャ変更時 |
| `docs/security.md` | セキュリティ設計 | 認証・認可変更時 |
| `docs/system-overview.md` | 非技術者向けシステム説明 | 機能追加・変更時 |
| `specs/get-web-api.md` | Web API 仕様 | エンドポイント変更時 |
| `specs/aws_managed_structure.md` | AWS リソース構成 | インフラ変更時 |
| `specs/requirements-external-env-data.md` | 環境データ取り込み要件 | 要件変更時 |

### ドキュメント管理ルール

- コードを変更する際は、影響する docs/ と specs/ を同一 PR で更新する
- 手順書には「なぜそうするか」の理由と「過去の失敗例」も記載する（例: PR #16 の ALTER TABLE 忘れ）
- シークレット値・個人情報はドキュメントに記載しない

---

## 8. 参照データ・マスターデータ管理（Reference & Master Data）

### 参照データ（dbt seeds）

| seed ファイル | 内容 | 更新頻度 |
|-------------|------|---------|
| `weather_codes.csv` | WMO 天気コード → 日本語ラベル・カテゴリ | 不定期（コード追加時） |
| `location_master.csv` | 観測地点 ID・緯度経度・タイムゾーン | 地点追加時 |
| `flags_master.csv` | FLAGS ビット定義（新規追加予定） | フラグ追加時 |

### マスターデータ設計方針

- `weather_codes` と `location_master` は dbt seeds として CSV でバージョン管理する
- `flags_master` は `flags` カラムのビット定義を文書化するための参照 seed。実際のビットマスクロジックは Lambda（Pydantic モデル）と dbt macro（`decode_flag`）で管理する
- location_id の追加は `location_master.csv` を更新してから Lambda の環境変数に反映する

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

## 9. データウェアハウジング・BI（Data Warehousing & BI）

### ウェアハウス構成（Medallion Architecture）

| レイヤー | 名称 | materialization | 目的 |
|---------|------|----------------|------|
| Bronze | `health_records`, `ext_environment_raw` | Iceberg / S3 JSON | 生データの永続保存 |
| Silver | `stg_*`, `int_*` | dbt view | 型変換・正規化・特徴量計算 |
| Gold | `fct_*` | dbt table / incremental | 分析・クエリ用ファクトテーブル |

### incremental 更新戦略

```sql
-- fct_environment_hourly の差分条件
{% if is_incremental() %}
where observation_date >= date_add('day', -3, current_date)
{% endif %}
```

直近 3 日分を毎回再処理することで遅延着信データに対応する。パーティション単位の `insert_overwrite` で安全に再実行できる。

### 現在の分析用途

- 体調スコアの時系列トレンド確認（フロントエンドの DashboardPage）
- 気圧変動と頭痛・体調悪化の相関分析（`fct_health_env_joined_hourly` を手動クエリ）
- FLAGS（睡眠・運動・飲酒・カフェイン）と翌日スコアの関係探索

### 既知の制限・改善候補

- dbt 実行は手動。EventBridge Scheduler + Lambda（または GitHub Actions スケジュール）での自動化が改善候補
- Athena のクエリコスト削減のため Gold レイヤーは `table` materialization を採用しているが、データ増加に応じて `incremental` への移行を検討する
- BI ダッシュボードは未整備（Athena コンソールでの手動クエリが現状）

---

## 10. メタデータ管理（Metadata）

### メタデータの種類と保存場所

| メタデータ種別 | 保存場所 | 説明 |
|-------------|---------|------|
| テーブルスキーマ | Glue Data Catalog | カラム名・型・パーティション定義 |
| Iceberg メタデータ | S3（`metadata/` 配下） | スナップショット・マニフェスト・スキーマ履歴 |
| dbt モデル定義 | `_schema.yml` | カラム説明・テスト定義・depends_on |
| dbt リネージグラフ | `dbt docs generate` で生成 | モデル間の依存関係 |
| Terraform State | S3 `health-logger-tfstate-prod` | AWS リソース構成の状態 |
| Lambda ログ | CloudWatch Logs | 実行ログ（30日保持） |

### dbt のメタデータ活用

```bash
# リネージグラフの確認
dbt docs generate && dbt docs serve

# source freshness チェック（鮮度メタデータ）
dbt source freshness

# モデルの依存関係込みで実行
dbt run --select +fct_health_env_joined_hourly
```

### テクニカルメタデータの整備方針

- dbt の `_schema.yml` には全モデルのカラム説明を記載する
- `description` は英語または日本語どちらでもよいが、分析者が理解できる粒度で書く
- dbt exposure を定義することで下流依存（フロントエンド・分析クエリ）を可視化する

---

## 11. データ品質（Data Quality）

### データ品質ルール一覧

#### health_records

| ルール | 対象カラム | チェック方法 | severity | 対応アクション |
|-------|----------|------------|---------|--------------|
| NOT NULL | `id`, `user_id`, `record_type`, `flags`, `recorded_at`, `written_at` | Lambda Pydantic + dbt not_null | error | 400 エラー返却（Lambda）/ パイプライン停止（dbt） |
| 範囲チェック | `fatigue_score`, `mood_score`, `motivation_score` | Lambda Pydantic (0〜100) | error | 400 エラー返却 |
| 範囲チェック | `flags` | Lambda Pydantic (0〜63) | error | 400 エラー返却 |
| 文字数制限 | `note` | Lambda Pydantic (280文字以内) | error | 400 エラー返却 |
| UUID 形式 | `user_id` | Lambda 正規表現 `^[0-9a-f-]{36}$` | error | 401 エラー返却（SQL インジェクション防止） |
| accepted_values | `record_type` | dbt accepted_values | error | CI 失敗 |
| 重複チェック | `id` | dbt unique | error | CI 失敗 |
| 未来日付 | `recorded_at` | dbt singular test | warn | 検出のみ（ログ出力） |

#### ext_environment_raw / stg_env__hourly

| ルール | 対象カラム | 範囲 | severity |
|-------|----------|------|---------|
| 気温範囲 | `temperature_c` | -50〜60℃ | error |
| 気圧範囲 | `pressure_hpa` | 800〜1100 hPa | error |
| 湿度範囲 | `humidity_pct` | 0〜100% | error |
| 花粉量 | `birch_pollen`, `grass_pollen`, `weed_pollen` | 0以上 | warn |
| NOT NULL | `observation_datetime_jst`, `location_id`, `raw_ingested_at` | — | error |

### 品質チェックの実行

```bash
# dbt テストの実行
dbt test --select staging.*
dbt test --select fct_health_env_joined_hourly

# Athena での直接確認
-- 重複チェック
SELECT id, COUNT(*) FROM health_records
GROUP BY id HAVING COUNT(*) > 1;

-- 範囲外スコアの検出
SELECT * FROM health_records
WHERE fatigue_score NOT BETWEEN 0 AND 100
   OR mood_score NOT BETWEEN 0 AND 100;
```

### データ品質の多層防御アーキテクチャ

```
[Layer 1] フロントエンド（TypeScript strict）
  → 型定義で不正な型の送信をコンパイル段階で防ぐ

[Layer 2] Lambda（Pydantic v2 バリデーション）
  → サーバー側で必ずスコア範囲・文字数・UUID 形式を検証

[Layer 3] dbt テスト（not_null / unique / accepted_values）
  → データパイプライン上でスキーマ整合性を継続検証

[Layer 4] dbt singular tests（SQL アサーション）
  → ビジネスルール違反（未来日付・気圧異常値）を検出
```

### 既知の制限・改善候補

- `recorded_at` の未来日付チェックが Lambda 側に未実装（dbt warn のみ）
- `device_id` の内容検証なし（任意フィールド）
- dbt テストが CI/CD に未組み込みのため、定期的な手動実行が必要
- Athena の `athena-results/` にクエリ結果が蓄積されているが、定期クリーンアップが未設定

---

## 変更ログ

| 日付 | 変更内容 | 関連 |
|------|---------|------|
| 2026-03-20 | 初版作成（DMBOK 11 領域に沿ったデータ管理ガイドライン） | — |

---

*本ドキュメントは `docs/DATA_MANAGEMENT.md` として管理する。スキーマ・アーキテクチャ・ポリシーの変更時は必ず更新すること。*
