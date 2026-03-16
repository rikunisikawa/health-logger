---
paths:
  - "terraform/**/*.tf"
  - "terraform/**/*.tfvars"
---
# Terraform ワークフロールール

## apply は Claude が自律実行しない

**`terraform apply` は必ずユーザーに確認してから実行する。**
Claude が自律的に apply することは禁止。

### 正しいフロー

```bash
# 1. plan で変更内容を確認（Claude が実行可能）
BASE="docker compose -f docker-compose.terraform.yml run --rm terraform -chdir=terraform/envs/prod"
$BASE fmt -recursive && $BASE validate
$BASE plan -var='lambda_s3_keys={"create_record":"placeholder","get_latest":"placeholder"}'

# 2. plan 結果をユーザーに提示して確認を待つ
# 3. ユーザーが apply を実行（または明示的に指示を受けた場合のみ Claude が実行）
$BASE apply  # ← ユーザー実行 or 明示的指示のみ
```

## sensitive 変数の必須設定

シークレットを含む変数には必ず `sensitive = true` を付与する。

```hcl
# variables.tf
variable "vapid_private_key" {
  type        = string
  description = "VAPID 秘密鍵（Lambda 環境変数経由で渡す）"
  sensitive   = true  # ← 必須
}

variable "github_access_token" {
  type      = string
  sensitive = true  # ← 必須
}
```

## tfvars へのシークレット直書き禁止

```hcl
# terraform.tfvars — NG
vapid_private_key = "Bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# CI での正しい渡し方（GitHub Secrets → TF_VAR_*）
# TF_VAR_vapid_private_key=${{ secrets.VAPID_PRIVATE_KEY_PROD }}
```

## CORS 設定

本番環境では `cors_allow_origins = ["*"]` のまま運用しない。

```hcl
# terraform.tfvars
cors_allow_origins = ["https://your-app.amplifyapp.com"]  # Amplify URL に制限
```

## provider バージョン

`aws_s3tables_*` リソースのために AWS provider >= 5.75 が必須。

```hcl
# versions.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.75"
    }
  }
}
```

## Iceberg スキーマ変更時の追加手順

Glue カタログへの変更だけでは Iceberg メタデータが更新されない。
`terraform apply` 後に必ず Athena で DDL を実行する。

```bash
aws athena start-query-execution \
  --query-string "ALTER TABLE health_records ADD COLUMNS (new_col string)" \
  --query-execution-context Database=health_logger_prod_health_logs \
  --result-configuration OutputLocation=s3://health-logger-prod/athena-results/ \
  --region ap-northeast-1
```
