# Health Logger

毎日の体調（疲労度・気分・やる気）を10秒で記録できるPWA対応Webアプリ。

## Architecture

```
Browser (PWA)
    │  IndexedDB offline queue + Service Worker
    ▼
ALB (AWS)
    │
ECS Fargate (Rails 8.1 + Ruby 3.3)
    │              │
    ▼              ▼
RDS PostgreSQL   S3 (JSON Lines export)
                  │
              Glue Crawler
                  │
              Athena (SQL クエリ)
```

### 技術選定の理由

| 選定項目 | 採用 | 理由 |
|----------|------|------|
| インフラ | ECS Fargate | サーバーレス感覚でコンテナ運用。EC2管理不要、スケーラブル |
| 認証 | Devise | Rails標準、メール/パスワード認証を最速実装。Cognito差し替え設計 |
| データ分析 | S3 + Glue + Athena | サーバーレスOLAP。Parquet変換で将来の高速化も容易 |
| オフライン | Service Worker + IndexedDB | PWA標準。圏外でも記録でき、復帰時に自動同期 |
| IaC | Terraform | 宣言的インフラ管理。dev/prod環境を分離したモジュール構成 |

## Quick Start (Docker)

```bash
# 1. 環境変数コピー
cp .env.example .env

# 2. 起動
docker compose up -d

# 3. DB初期化
docker compose exec web bundle exec rails db:create db:migrate

# 4. ブラウザで開く
open http://localhost:3000
```

アカウント登録は http://localhost:3000/users/sign_up から。

## Development

```bash
# コンテナに入る
docker compose exec web bash

# テスト実行
bundle exec rspec

# RuboCop
bundle exec rubocop

# コンソール
bundle exec rails console

# ログ確認
docker compose logs -f web
```

## Project Structure

```
.
├── app/
│   ├── controllers/records_controller.rb  # API + HTML endpoints
│   ├── jobs/export_health_records_job.rb  # S3エクスポートバッチ
│   ├── models/
│   │   ├── health_record.rb               # メインモデル (バリデーション・フラグ管理)
│   │   └── user.rb                        # Devise認証
│   ├── javascript/offline_queue.js        # オフラインキューフラッシュ
│   └── views/records/new.html.erb         # メインUI (Bootstrap 5 スライダー)
├── public/
│   ├── manifest.json                      # PWAマニフェスト
│   └── sw.js                              # Service Worker
├── spec/
│   ├── models/health_record_spec.rb       # モデルテスト
│   └── requests/records_spec.rb          # APIテスト
├── terraform/
│   ├── modules/{vpc,ecs,rds,s3,glue}/    # 再利用可能モジュール
│   └── envs/{dev,prod}/                  # 環境別設定
└── .github/workflows/
    ├── ci.yml                             # RuboCop + RSpec
    ├── terraform.yml                      # plan on PR, apply on merge
    └── deploy.yml                         # ECR build + ECS rolling deploy
```

## HealthRecord Model

| フィールド | 型 | 説明 |
|-----------|-----|------|
| fatigue_score | integer (0-100) | 疲労度 |
| mood_score | integer (0-100) | 気分 |
| motivation_score | integer (0-100) | やる気 |
| flags | integer (bitmask) | 睡眠不足/頭痛/腹痛/運動/飲酒/カフェイン |
| note | text (max 280) | メモ |
| extra_metrics | jsonb | 拡張メトリクス |
| recorded_at | datetime | 記録日時 |
| timezone | string | タイムゾーン |
| device_id | string | デバイス識別子 |

### Flags Bitmask

```ruby
HealthRecord::FLAGS = {
  poor_sleep:  0b000001,  # 1
  headache:    0b000010,  # 2
  stomachache: 0b000100,  # 4
  exercise:    0b001000,  # 8
  alcohol:     0b010000,  # 16
  caffeine:    0b100000,  # 32
}
```

## API Endpoints

```
POST /records       # 記録を作成 (HTML form / JSON)
GET  /records/latest # 最新記録を取得 (JSON)
```

### POST /records (JSON)

```bash
curl -X POST http://localhost:3000/records \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -d '{
    "health_record": {
      "fatigue_score": 70,
      "mood_score": 60,
      "motivation_score": 80,
      "flags": 9,
      "note": "今日は少し疲れた",
      "timezone": "Asia/Tokyo",
      "device_id": "dev_abc123",
      "app_version": "1.0.0"
    }
  }'
```

## S3 Export & Athena

エクスポートジョブは1時間ごとにEventBridgeから実行され、JSON Linesをパーティション付きで保存：

```
s3://<bucket>/health_logs/dt=YYYY-MM-DD/records.jsonl
```

### Athena クエリ例

```sql
-- 日別平均スコア
SELECT
  dt,
  AVG(fatigue_score)    AS avg_fatigue,
  AVG(mood_score)       AS avg_mood,
  AVG(motivation_score) AS avg_motivation,
  COUNT(*)              AS record_count
FROM "health_logger_dev_health_logs"."health_logs"
WHERE dt >= '2026-01-01'
GROUP BY dt
ORDER BY dt DESC;

-- フラグ別集計（睡眠不足の日の平均疲労度）
SELECT
  dt,
  AVG(fatigue_score) AS avg_fatigue
FROM "health_logger_dev_health_logs"."health_logs"
WHERE BITAND(flags, 1) = 1   -- poor_sleep フラグ
GROUP BY dt
ORDER BY dt DESC;

-- 週次トレンド
SELECT
  DATE_TRUNC('week', CAST(dt AS DATE)) AS week_start,
  AVG(mood_score) AS avg_mood
FROM "health_logger_dev_health_logs"."health_logs"
GROUP BY 1
ORDER BY 1 DESC;
```

## Deploy

### Prerequisites

- AWS アカウント
- GitHub OIDC provider 設定済み
- S3 バックエンドバケット (tfstate 用) 作成済み

### GitHub Secrets 設定

```
AWS_ROLE_ARN_DEV      # dev環境のIAMロールARN
AWS_ROLE_ARN_PROD     # prod環境のIAMロールARN
ECR_REPO_DEV          # ECRリポジトリURL (dev)
ECR_REPO_PROD         # ECRリポジトリURL (prod)
ECS_CLUSTER_DEV       # ECSクラスター名 (dev)
ECS_CLUSTER_PROD      # ECSクラスター名 (prod)
ECS_SERVICE_DEV       # ECSサービス名 (dev)
ECS_SERVICE_PROD      # ECSサービス名 (prod)
DB_PASSWORD_DEV       # DBパスワード (dev)
DB_PASSWORD_PROD      # DBパスワード (prod)
RAILS_MASTER_KEY      # config/master.key の内容
```

### ブランチ戦略

```
main    → prod 環境に自動デプロイ
develop → dev 環境に自動デプロイ
PR      → Terraform plan コメント + CI テスト
```

### 初回Terraformデプロイ

```bash
cd terraform/envs/dev
terraform init
TF_VAR_db_password=<password> \
  terraform apply -var="ecr_image=<ecr_repo>:latest"
```

## PWA (オフライン対応)

- Service Worker (`public/sw.js`) がページをキャッシュ
- オフライン時のPOSTはIndexedDBキューに保存
- オンライン復帰時に自動送信（Background Sync API + フォールバック）
- `manifest.json` でホーム画面への追加に対応

## License

MIT
