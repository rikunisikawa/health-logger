# デプロイガイド

> 対象読者: 開発者・運用担当者
> prod 環境への初回デプロイ手順と、継続的デプロイの説明を記載する。

---

## 前提条件

以下のツールがインストールされていること:

| ツール | バージョン目安 | 用途 |
|-------|-------------|------|
| AWS CLI | v2 | AWS リソース操作・確認 |
| Docker / Docker Compose | 最新版 | Terraform 実行 |
| gh CLI | 最新版 | GitHub Secrets 設定 |
| git | 2.x | リポジトリ操作 |

AWS 認証情報が設定済みであること（`~/.aws/credentials` または環境変数）。

---

## 初回デプロイ手順

### ステップ 1: Terraform バックエンドの準備

Terraform のリモートステートを保存する S3 バケットと DynamoDB テーブルを事前に作成しておく:

```bash
# S3 バケット（バージョニング有効）
aws s3api create-bucket \
  --bucket health-logger-tfstate-prod \
  --region ap-northeast-1 \
  --create-bucket-configuration LocationConstraint=ap-northeast-1

aws s3api put-bucket-versioning \
  --bucket health-logger-tfstate-prod \
  --versioning-configuration Status=Enabled

# DynamoDB（ロック用）
aws dynamodb create-table \
  --table-name health-logger-tflock-prod \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-northeast-1
```

### ステップ 2: terraform.tfvars の設定

```bash
cd terraform/envs/prod
```

`terraform.tfvars` に以下を設定する（シークレット値はここに書かない）:

```hcl
project            = "health-logger"
env                = "prod"
aws_region         = "ap-northeast-1"
github_repository  = "your-org/health-logger"

# 初回は localhost を指定（Amplify URL 確定後に更新）
cognito_callback_urls = ["https://localhost:3000"]
cors_allow_origins    = ["https://localhost:3000"]
```

VAPID キーは環境変数で渡す（tfvars に書かない）:

```bash
export TF_VAR_vapid_private_key="<VAPID秘密鍵>"
export TF_VAR_vapid_public_key="<VAPID公開鍵>"
```

VAPID キーの生成方法（未生成の場合）:

```bash
docker run --rm node:20-slim npx web-push generate-vapid-keys
```

生成したキーは `~/.secrets/health-logger/vapid-keys.txt` に保存しておく（パーミッション 600）。

### ステップ 3: Terraform init と初回 apply

```bash
BASE="docker compose -f docker-compose.terraform.yml run --rm terraform -chdir=terraform/envs/prod"

# 初期化
$BASE init

# 検証
$BASE validate

# プラン確認（Lambda ZIP はまだないのでプレースホルダを指定）
$BASE plan \
  -var='lambda_s3_keys={"create_record":"placeholder","get_latest":"placeholder","push_subscribe":"placeholder","push_notify":"placeholder","get_item_config":"placeholder","save_item_config":"placeholder","delete_record":"placeholder","get_env_data":"placeholder","get_env_data_latest":"placeholder"}'
```

問題がなければ apply を実行する（必ずユーザーが手動で確認してから実行すること）:

```bash
$BASE apply \
  -var='lambda_s3_keys={"create_record":"placeholder","get_latest":"placeholder","push_subscribe":"placeholder","push_notify":"placeholder","get_item_config":"placeholder","save_item_config":"placeholder","delete_record":"placeholder","get_env_data":"placeholder","get_env_data_latest":"placeholder"}'
```

### ステップ 4: Terraform 出力値の確認

```bash
$BASE output
```

以下の値を記録しておく:

| 出力キー | 説明 |
|---------|------|
| `amplify_app_url` | Amplify のデプロイ URL（`https://main.XXXX.amplifyapp.com`） |
| `lambda_artifacts_bucket` | Lambda ZIP 保存用 S3 バケット名 |
| `github_actions_role` | GitHub OIDC ロール ARN |
| `api_endpoint` | API Gateway のエンドポイント URL |
| `cognito_user_pool_id` | Cognito ユーザープール ID |
| `cognito_client_id` | Cognito クライアント ID |

### ステップ 5: GitHub Secrets の設定

```bash
gh secret set AWS_ROLE_ARN_PROD --body "<github_actions_role の値>"
gh secret set LAMBDA_ARTIFACTS_BUCKET_PROD --body "<lambda_artifacts_bucket の値>"
gh secret set AMPLIFY_APP_ID_PROD --body "<amplify_app_url から取得した App ID>"
gh secret set VAPID_PRIVATE_KEY_PROD --body "<VAPID秘密鍵>"
```

> VAPID 秘密鍵は GitHub Secrets に設定するのみ。コード・PR・チャットには絶対に書かない。
> 過去に PR 説明文に誤記載してしまった事故がある（その際は即時鍵再生成で対応した）。

### ステップ 6: Amplify GitHub 接続の確認

1. AWS Console → Amplify を開く
2. 作成されたアプリを選択
3. 「リポジトリを接続」または「ブランチを管理」から GitHub App OAuth で接続を確認する
4. GitHub App 経由の接続が確立していれば PAT（GitHub Personal Access Token）は不要

接続が表示されない場合は「リポジトリを再接続」から GitHub App OAuth フローで再接続する。

### ステップ 7: Cognito callback_urls と CORS を本番値に更新

`terraform.tfvars` を更新する:

```hcl
cognito_callback_urls = ["https://main.XXXX.amplifyapp.com"]
cors_allow_origins    = ["https://main.XXXX.amplifyapp.com"]
```

再度 apply を実行する（必ずユーザーが確認してから）:

```bash
$BASE apply
```

> `cors_allow_origins = ["*"]` のまま本番運用しない。Amplify の実際のドメインに必ず制限すること。

### ステップ 8: main ブランチへの push でデプロイ確認

```bash
git push origin main
```

GitHub Actions の `deploy.yml` が起動し、以下が自動実行される:
1. Lambda ZIP のビルドと S3 へのアップロード
2. `terraform apply`（Lambda の実コードを参照した S3 キーを使用）
3. Amplify の自動ビルド（GitHub push に連動）

---

## 継続的デプロイ（通常の開発フロー）

`main` ブランチへの push が発生すると自動デプロイが実行される。

### 変更検知による最適化

`deploy.yml` は変更パスを検知し、不要なステップをスキップする:

| 変更パス | Lambda ビルド | Terraform apply | Amplify ビルド |
|---------|-------------|----------------|---------------|
| `lambda/**` のみ | 実行 | 実行 | スキップ |
| `terraform/**` のみ | 実行 | 実行 | スキップ |
| `frontend/**` のみ | スキップ | スキップ | 実行（GitHub push で自動） |

### デプロイ状況の確認

```bash
# GitHub Actions の実行履歴を確認
gh run list --workflow=deploy.yml

# 特定の実行の詳細
gh run view <run-id>
```

---

## Iceberg スキーマ変更後の ALTER TABLE 手順

Glue テーブルにカラムを追加した後は、Athena で DDL を手動実行すること。

```bash
aws athena start-query-execution \
  --query-string "ALTER TABLE health_records ADD COLUMNS (new_column_name string)" \
  --query-execution-context Database=health_logger_prod_health_logs \
  --result-configuration OutputLocation=s3://health-logger-prod-health-export/athena-results/ \
  --region ap-northeast-1
```

クエリの実行状態を確認する:

```bash
aws athena get-query-execution \
  --query-execution-id <上記コマンドで返された QueryExecutionId> \
  --region ap-northeast-1
```

`State` が `SUCCEEDED` になれば完了。

> この手順を省略すると `get_latest` Lambda が `COLUMN_NOT_FOUND` エラーで全件 500 になる。
> 詳細は `DATABASE_SCHEMA.md` の「Iceberg スキーマ変更の注意事項」を参照。

---

## Amplify GitHub 接続の再接続手順

Amplify と GitHub の接続が切れた場合（定期的な認証期限切れなどで発生する）:

1. AWS Console → Amplify → 該当アプリを選択
2. 「アプリの設定」→「リポジトリを管理」
3. 「リポジトリを再接続」ボタンをクリック
4. GitHub App OAuth フローで再認証する

Terraform 側は `lifecycle { ignore_changes = [access_token] }` を設定しているため、
Console から接続を変更しても terraform の状態は影響を受けない。

---

## ロールバック手順

### Lambda のロールバック

特定のコミット SHA の ZIP がまだ S3 に残っている場合、そのキーを指定して apply する:

```bash
PREV_SHA="<ロールバック先のコミット SHA>"
$BASE apply \
  -var="lambda_s3_keys={\"create_record\":\"create_record/${PREV_SHA}.zip\",\"get_latest\":\"get_latest/${PREV_SHA}.zip\",...}"
```

### フロントエンドのロールバック

Amplify Console から以前のデプロイを再デプロイできる:

1. AWS Console → Amplify → 該当ブランチ
2. 「デプロイ履歴」から対象のデプロイを選択
3. 「再デプロイ」ボタンをクリック

### Terraform のロールバック

Terraform のリモートステートは S3 でバージョン管理されているため、過去のステートを参照可能。
ただし、Terraform によるロールバックはリソースの破壊・再作成を伴う場合があるため、
実施前にプランを十分に確認すること。
