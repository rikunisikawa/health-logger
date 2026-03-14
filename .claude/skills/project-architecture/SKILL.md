---
name: project-architecture
description: health-logger のアーキテクチャ詳細。Cognito 認証フロー・Firehose データフロー・FLAGS ビットマスク・Terraform モジュール依存関係・状態管理・GitHub Actions Secrets を含む。設計・実装・インフラ変更時に自動適用する。
user-invocable: false
---

## システム構成

```
React+TS (Amplify) → API Gateway → Lambda (Python 3.13)
                                        ↓            ↓
                                   Firehose      Athena
                                        ↓
                              S3 (Iceberg) ← Glue
```

## 認証フロー

- Cognito User Pool + Hosted UI (OAuth PKCE code flow)
- フロントエンド: `@aws-amplify/auth` v6 でトークン取得
- API: JWT Authorizer で `sub` クレームをユーザー ID として使用

## データフロー

```
POST /records
  → Lambda (create_record)
    → Pydantic バリデーション
    → Firehose.put_record (JSON Lines + "\n")
      → S3 (Iceberg テーブル, Glue カタログ経由)

GET /records/latest
  → Lambda (get_latest)
    → Athena StartQueryExecution（ポーリング最大 10 秒）
    → 結果を JSON で返却
```

## FLAGS ビットマスク

| ビット | 意味 |
|--------|------|
| 1 | poor_sleep（睡眠不足） |
| 2 | headache（頭痛） |
| 4 | stomachache（腹痛） |
| 8 | exercise（運動） |
| 16 | alcohol（アルコール） |
| 32 | caffeine（カフェイン） |

## Terraform モジュール依存関係

```
s3tables → glue → firehose ──→ lambda → apigw ←── cognito
s3 ──────────────────────────→ lambda
apigw.endpoint_url ────────────────────────────────→ amplify
cognito.{user_pool_id,client_id,domain} ───────────→ amplify
```

## Terraform 状態管理

| 項目 | 値 |
|------|----|
| S3 バケット | `health-logger-tfstate-prod` |
| DynamoDB ロック | `health-logger-tflock-prod` |
| AWS リージョン | `ap-northeast-1` |
| AWS アカウント | `143944071087` |

## 初回デプロイ後の必須作業

1. `terraform apply` 出力から `amplify_app_url` と `lambda_artifacts_bucket` を確認
2. GitHub Secrets を更新: `AMPLIFY_APP_ID_PROD`, `LAMBDA_ARTIFACTS_BUCKET_PROD`
3. `terraform.tfvars` の `cognito_callback_urls` と `cors_allow_origins` を Amplify URL に更新して再 apply

## 循環依存の回避策

Cognito `callback_urls` ↔ Amplify domain の循環依存は変数で管理:
- 初回 apply: `cognito_callback_urls = ["https://localhost:3000"]`
- Amplify URL 確認後: `terraform.tfvars` を更新して再 apply

## GitHub Secrets（prod 環境）

```
AWS_ROLE_ARN_PROD            # GitHub OIDC ロール ARN
AMPLIFY_APP_ID_PROD          # Amplify アプリ ID（初回 apply 後に設定）
LAMBDA_ARTIFACTS_BUCKET_PROD # Lambda ZIP 格納 S3 バケット名（初回 apply 後に設定）
VAPID_PRIVATE_KEY_PROD       # Web Push 秘密鍵
```

## ディレクトリ構成

| パス | 内容 |
|------|------|
| `frontend/` | React + TypeScript + Vite |
| `lambda/create_record/` | 記録投稿 Lambda |
| `lambda/get_latest/` | 直近記録取得 Lambda |
| `terraform/modules/` | Terraform モジュール群 |
| `terraform/envs/prod/` | prod 環境エントリポイント |
| `app/`, `docker-compose.yml` | Rails（参照用のみ・編集禁止） |
| `terraform/envs/dev/` | 放置（参照用のみ・編集禁止） |
