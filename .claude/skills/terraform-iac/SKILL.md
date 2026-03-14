---
name: terraform-iac
description: Terraform による AWS インフラ定義のパターン集。モジュール構造・variables.tf・outputs.tf の設計、terraform plan/validate の実行、IAM ポリシー定義など、Terraform コードを書く・修正するときに自動適用する。
user-invocable: false
---

## Purpose

health-logger の AWS インフラを Terraform で安全に管理するためのパターン集。
モジュール設計から plan 実行・apply 依頼まで一貫したフローを提供する。

## Responsibilities

- Terraform モジュールの構造設計
- リソース定義パターン
- 変数・出力値の管理
- plan 実行と結果解釈
- センシティブ変数の扱い

## Patterns

### モジュール構造テンプレート

```
terraform/modules/<name>/
  main.tf       # リソース定義
  variables.tf  # 入力変数
  outputs.tf    # 出力値
```

### variables.tf パターン

```hcl
variable "function_name" {
  description = "Lambda 関数名"
  type        = string
}

variable "secret_key" {
  description = "シークレット値（GitHub Secrets から渡す）"
  type        = string
  sensitive   = true   # ← シークレットには必ず付ける
}
```

### outputs.tf パターン

```hcl
output "invoke_arn" {
  description = "Lambda 関数の Invoke ARN"
  value       = aws_lambda_function.this.invoke_arn
}
```

### Lambda モジュール呼び出し（prod/main.tf）

```hcl
module "lambda" {
  source = "../../modules/lambda"

  function_name     = "create_record"
  s3_bucket         = module.s3.bucket_name
  s3_key            = var.lambda_s3_keys["create_record"]
  stream_arn        = module.firehose.stream_arn
  environment_vars  = {
    FIREHOSE_STREAM_NAME   = module.firehose.stream_name
    ATHENA_DATABASE        = module.glue.database_name
    ATHENA_OUTPUT_LOCATION = "s3://${module.s3.bucket_name}/athena-results/"
  }
}
```

### IAM ポリシードキュメント

```hcl
data "aws_iam_policy_document" "lambda_firehose" {
  statement {
    actions   = ["firehose:PutRecord"]
    resources = [module.firehose.stream_arn]
  }
}
```

## Terraform 実行コマンド

```bash
# Docker 経由で実行（ローカルに Terraform 不要）
BASE="docker compose -f docker-compose.terraform.yml run --rm terraform -chdir=terraform/envs/prod"

$BASE fmt -recursive              # フォーマット
$BASE validate                    # 構文検証
$BASE plan \
  -var='lambda_s3_keys={"create_record":"placeholder","get_latest":"placeholder"}'
$BASE output                      # 出力値確認
```

## Best Practices

- `sensitive = true` をシークレット変数に必ず付与
- `terraform.tfvars` にシークレット値を直接書かない（CI は `TF_VAR_xxx` 環境変数で渡す）
- モジュールは単一責任（1 AWS サービス = 1 モジュール）
- `cors_allow_origins` は `["*"]` にしない（Amplify ドメインを指定）
- apply 前に必ず plan を確認し、ユーザーの承認を得る

## Output Format

plan 実行後の以下を報告:
```
Plan: X to add, Y to change, Z to destroy.
変更されるリソース一覧（種別・名前・変更内容）
```
