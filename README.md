# Health Logger

毎日の体調（疲労度・気分・やる気）を10秒で記録できるPWA対応Webアプリ。

## Architecture

```
Browser (PWA)
    │  IndexedDB offline queue + Service Worker
    ▼
AWS Amplify Hosting (React + TypeScript)
    │
    ▼
API Gateway (HTTP API + JWT Authorizer)
    │
    ├── POST /records ──→ Lambda: create_record (Python 3.13)
    │                          │
    │                          ▼
    │                    Kinesis Firehose
    │                          │
    │                          ▼
    │                    S3 Tables (Iceberg) ← Glue Catalog
    │
    └── GET /records/latest → Lambda: get_latest (Python 3.13)
                                   │
                                   ▼
                             Athena (ポーリング, max 10秒)

Cognito User Pool (OAuth PKCE code flow) → JWT Authorizer
```

### 技術選定

| 項目 | 採用 | 理由 |
|------|------|------|
| フロントエンド | React + TypeScript + Vite | 型安全、高速ビルド |
| ホスティング | AWS Amplify | GitHub連携の自動デプロイ |
| 認証 | Amazon Cognito | OAuth PKCE、JWT検証をAPI GWに委譲 |
| API | API Gateway HTTP API | マネージド、JWT Authorizerが標準搭載 |
| バックエンド | Lambda (Python 3.13) | サーバーレス、コールドスタート許容 |
| ストレージ | S3 Tables (Iceberg) + Glue | スキーマ管理付きのサーバーレスOLAP |
| クエリ | Athena | サーバーレスSQL、Icebergネイティブ対応 |
| オフライン | Service Worker + IndexedDB | PWA標準、復帰時に自動同期 |
| IaC | Terraform | 宣言的インフラ管理 |

## Project Structure

```
.
├── frontend/                        # React + TypeScript + Vite
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api.ts                   # API通信
│   │   ├── types.ts
│   │   ├── hooks/
│   │   │   ├── useAuth.ts           # Amplify Auth ラッパー
│   │   │   └── useOfflineQueue.ts   # IndexedDB キュー管理
│   │   └── components/
│   │       ├── AuthGuard.tsx
│   │       ├── HealthForm.tsx       # メインUI（スライダー + フラグ）
│   │       └── LoadingSpinner.tsx
│   └── public/
│       ├── sw.js                    # Service Worker
│       └── manifest.json
├── lambda/
│   ├── create_record/               # 記録投稿 Lambda
│   │   ├── handler.py
│   │   ├── models.py                # Pydantic v2 モデル
│   │   ├── requirements.txt
│   │   └── test_handler.py
│   └── get_latest/                  # 最新記録取得 Lambda
│       ├── handler.py
│       ├── requirements.txt
│       └── test_handler.py
├── terraform/
│   ├── modules/                     # 再利用可能モジュール
│   │   ├── cognito/
│   │   ├── s3tables/
│   │   ├── glue/
│   │   ├── firehose/
│   │   ├── lambda/
│   │   ├── apigw/
│   │   └── amplify/
│   └── envs/prod/                   # prod環境エントリポイント
├── amplify.yml                      # Amplifyビルド仕様
├── .github/workflows/
│   ├── ci.yml                       # Lambda テスト + フロントエンドビルド
│   ├── deploy.yml                   # Lambda ZIP → S3 → terraform apply → Amplify
│   └── terraform.yml                # Plan (PR) / Apply (main push)
└── app/                             # Rails (参照用のみ・デプロイ不要)
```

## HealthRecord Schema

| フィールド | 型 | 説明 |
|-----------|-----|------|
| record_id | string (UUID) | レコードID |
| user_id | string | Cognito sub |
| fatigue_score | integer (0-100) | 疲労度 |
| mood_score | integer (0-100) | 気分 |
| motivation_score | integer (0-100) | やる気 |
| flags | integer (bitmask) | 体調フラグ |
| note | string (max 280) | メモ |
| custom_fields | string (JSON) | カスタム項目 |
| record_type | string | レコード種別 |
| recorded_at | string (ISO 8601) | 記録日時 |
| timezone | string | タイムゾーン |
| device_id | string | デバイス識別子 |

### Flags Bitmask

| ビット値 | 意味 |
|---------|------|
| 1 | poor_sleep（睡眠不足） |
| 2 | headache（頭痛） |
| 4 | stomachache（腹痛） |
| 8 | exercise（運動） |
| 16 | alcohol（アルコール） |
| 32 | caffeine（カフェイン） |

## API Endpoints

```
POST /records        # 記録を作成
GET  /records/latest # 最新記録を取得
```

### POST /records

```bash
curl -X POST https://<api-id>.execute-api.ap-northeast-1.amazonaws.com/records \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <cognito-id-token>" \
  -d '{
    "fatigue_score": 70,
    "mood_score": 60,
    "motivation_score": 80,
    "flags": 9,
    "note": "今日は少し疲れた",
    "timezone": "Asia/Tokyo",
    "device_id": "dev_abc123"
  }'
```

## Development

### フロントエンド

```bash
cd frontend
npm install
npm run dev          # ローカル開発サーバー
npm run build        # 本番ビルド
npx tsc --noEmit     # 型チェック
```

### Lambda テスト

```bash
pip install pytest pydantic boto3
pytest lambda/ -v

# 個別実行
pytest lambda/create_record/ -v
pytest lambda/get_latest/ -v
```

### Terraform

```bash
cd terraform/envs/prod
terraform init -reconfigure
terraform fmt -recursive
terraform validate
terraform plan \
  -var='lambda_s3_keys={"create_record":"placeholder","get_latest":"placeholder"}'
```

> **`terraform apply` は必ずユーザーに確認してから実行。自動実行禁止。**

## Deploy

### GitHub Secrets

```
AWS_ROLE_ARN_PROD            # GitHub OIDC ロール ARN
AMPLIFY_APP_ID_PROD          # 初回 apply 後に設定
LAMBDA_ARTIFACTS_BUCKET_PROD # 初回 apply 後に設定
```

### CI/CD ワークフロー

| ワークフロー | トリガー | 役割 |
|------------|---------|------|
| `ci.yml` | PR / push | Lambda テスト・フロントエンドビルド |
| `deploy.yml` | main push | Lambda ZIP → S3 → terraform apply → Amplify build |
| `terraform.yml` | terraform/** 変更 | Plan (PR) / Apply (main push) |

### 初回デプロイ手順

```bash
# 1. Terraform apply
cd terraform/envs/prod
terraform init && terraform apply

# 2. 出力値で GitHub Secrets を更新
#    amplify_app_url → AMPLIFY_APP_ID_PROD
#    lambda_artifacts_bucket → LAMBDA_ARTIFACTS_BUCKET_PROD

# 3. terraform.tfvars の cognito_callback_urls / cors_allow_origins を
#    実際の Amplify URL に更新して再 apply
```

## Terraform 状態管理

| 項目 | 値 |
|------|----|
| S3 バケット | `health-logger-tfstate-prod` |
| DynamoDB ロック | `health-logger-tflock-prod` |
| AWS リージョン | `ap-northeast-1` |

## PWA（オフライン対応）

- Service Worker (`public/sw.js`) がページをキャッシュ
- オフライン時の POST は IndexedDB キューに保存（`useOfflineQueue` hook）
- オンライン復帰時に自動送信

