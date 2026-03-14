---
playbook: deploy_infrastructure
goal: Terraform でインフラ変更を安全に計画・レビュー・適用する
agents_used: [architecture, devops, data_engineering, project_management]
skills_used: [terraform_iac, data_pipeline, ci_cd, git_workflow]
---

## Goal

AWS インフラの変更を Terraform で安全に管理し、
plan の確認 → ユーザー承認 → apply → 動作確認まで完走する。

⚠️ `terraform apply` はユーザーの明示的な承認なしに実行しない。

## Workflow

```
Step 1  [project_management]
  └── gh issue create（インフラ変更内容・理由）
      git switch -c terraform/<番号>-<change-name>

Step 2  [architecture] ※新リソース追加・大規模変更の場合
  └── 設計レビュー
      - 追加リソースのコスト試算
      - モジュール間依存関係への影響
      - セキュリティ（IAM 最小権限・CORS）確認

Step 3  [devops] ← terraform_iac skill
  ├── modules/ または envs/prod/ を編集
  ├── terraform fmt -recursive
  ├── terraform validate
  └── terraform plan（結果をユーザーに提示）

      ★ここでユーザーの承認を得る★

Step 4  [devops] ← ユーザー承認後
  └── terraform apply（ユーザーが実行 or 明示的に依頼）

Step 5  [data_engineering] ※Iceberg スキーマ変更の場合
  └── Athena DDL 実行（ALTER TABLE ADD COLUMNS）
      Athena テストクエリで確認

Step 6  [project_management]
  └── PR 作成（plan 出力を PR に貼付）
      CI 確認 → squash merge
```

## Terraform Plan の提示フォーマット

```markdown
## Terraform Plan 結果

Plan: X to add, Y to change, Z to destroy.

### 追加されるリソース
- aws_lambda_function.xxx
- aws_api_gateway_route.xxx

### 変更されるリソース
- aws_glue_catalog_table.health_records (columns 追加)

### 削除されるリソース
なし

### 承認をお願いします
上記の変更を apply してよいですか？
```

## Checklist

```
計画
  [ ] 変更内容・理由を Issue に記録済み
  [ ] ブランチ作成済み

Terraform
  [ ] terraform fmt 実行済み（フォーマット整合）
  [ ] terraform validate 通過
  [ ] terraform plan 実行済み・ユーザーに提示済み
  [ ] ユーザーの承認取得済み
  [ ] terraform apply 完了

変更後確認
  [ ] Iceberg スキーマ変更 → Athena DDL 実行済み（必要な場合）
  [ ] Lambda 関数が正常に起動することを確認
  [ ] API Gateway エンドポイントが応答することを確認

PR
  [ ] terraform plan 出力を PR 説明文に貼付
  [ ] CI 通過
  [ ] squash merge 完了
```

## 禁止事項

- `terraform apply` のユーザー確認なしでの実行
- `terraform destroy` の実行（必ず確認）
- `cors_allow_origins = ["*"]` のまま apply
- `lambda_s3_keys` のプレースホルダ値での apply
- `terraform.tfvars` へのシークレット値の直接記述

## Expected Output

- Terraform plan の結果レポート
- ユーザー承認後の apply 完了報告
- インフラ変更の動作確認結果
- マージ済み PR（plan 出力付き）
