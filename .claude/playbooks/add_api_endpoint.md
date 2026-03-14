---
playbook: add_api_endpoint
goal: 新しい Lambda 関数 + API Gateway エンドポイントを追加する
agents_used: [architecture, lambda, devops, frontend, testing, project_management]
skills_used: [python_lambda, aws_boto3, terraform_iac, typescript_react, git_workflow]
---

## Goal

新しい API エンドポイント（Lambda + API Gateway ルート）をゼロから追加し、
フロントエンドから呼び出せる状態にする。

## Workflow

```
Step 1  [project_management]
  └── gh issue create
      git switch -c feature/<番号>-add-<endpoint-name>

Step 2  [architecture]
  └── 設計確認
      - エンドポイント URL・HTTP メソッド
      - リクエスト/レスポンス スキーマ
      - 認証要否（JWT authorizer）
      - Firehose / Athena / DynamoDB の使用有無

Step 3  [lambda] ← python_lambda skill
  ├── lambda/<name>/ ディレクトリ作成
  ├── models.py（Pydantic v2 モデル）
  ├── test_handler.py（テスト先書き → Red 確認）
  ├── handler.py（実装 → Green 確認）
  └── requirements.txt

Step 4  [testing]
  └── pytest lambda/<name>/ -v → PASSED
      pytest lambda/ -v → 全体 PASSED

Step 5  [devops] ← terraform_iac skill
  ├── terraform/modules/lambda/main.tf に関数追加
  ├── terraform/envs/prod/main.tf でモジュール呼び出し
  ├── API Gateway ルート追加（modules/apigw/）
  └── terraform plan → ユーザー確認 → apply

Step 6  [frontend] ← typescript_react skill
  ├── types.ts にリクエスト/レスポンス型追加
  ├── api.ts にエンドポイント関数追加
  └── コンポーネントに組み込み

Step 7  [testing]
  ├── npx tsc --noEmit → エラーなし
  └── npm run build → 成功

Step 8  [project_management]
  └── PR 作成 → CI 確認 → squash merge
```

## 並列実行

Step 3 (Lambda) と Step 5 (Terraform) は並列で進められる。
Step 6 (Frontend) は Step 5 の terraform apply 後（エンドポイント URL 確定後）に実行。

## Checklist

```
Lambda
  [ ] handler.py 実装完了
  [ ] models.py（Pydantic v2）
  [ ] test_handler.py（正常系・異常系・境界値）
  [ ] pytest lambda/<name>/ -v → PASSED
  [ ] pytest lambda/ -v → 全体 PASSED

Terraform
  [ ] Lambda 関数リソース追加
  [ ] API Gateway ルート追加
  [ ] IAM ポリシー（最小権限）
  [ ] terraform plan 確認済み
  [ ] ユーザーによる apply 承認済み

Frontend
  [ ] API 関数追加（api.ts）
  [ ] 型定義追加（types.ts）
  [ ] npx tsc --noEmit → エラーなし
  [ ] npm run build → 成功
```

## Expected Output

- `lambda/<name>/` ディレクトリ（handler.py / models.py / test_handler.py）
- Terraform リソース追加（Lambda + API Gateway ルート）
- `api.ts` に新しいエンドポイント関数
- 全テスト通過・ビルド成功
- マージ済み PR
