---
skill: ci_cd
purpose: GitHub Actions による CI/CD パイプライン設計・運用・トラブルシューティングパターン
used_by: [devops, project_management]
---

## Purpose

health-logger の GitHub Actions ワークフローを理解・管理し、
CI/CD パイプラインの問題を迅速に解決するためのパターン集。

## Responsibilities

- ワークフロー構造の理解と修正
- CI 失敗の診断とトラブルシューティング
- GitHub Secrets の管理方針
- OIDC 認証フローの管理
- デプロイパイプラインの確認

## ワークフロー一覧

| ファイル | トリガー | 内容 |
|---------|---------|------|
| `ci.yml` | PR/push | pytest + tsc + npm build |
| `deploy.yml` | main push | Lambda ZIP→S3 → terraform apply → Amplify |
| `terraform.yml` | terraform/** 変更 | PR: plan / main: apply |

## ci.yml 構造

```yaml
jobs:
  lambda-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.13" }
      - run: pip install pytest pydantic boto3
      - run: pytest lambda/ -v

  frontend-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: cd frontend && npm ci
      - run: cd frontend && npx tsc --noEmit
      - run: cd frontend && npm run build
```

## OIDC 認証（GitHub → AWS）

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: ${{ secrets.AWS_ROLE_ARN_PROD }}
      aws-region: ap-northeast-1
```

## 必要な GitHub Secrets

```
AWS_ROLE_ARN_PROD            # GitHub OIDC ロール ARN
AMPLIFY_APP_ID_PROD          # Amplify アプリ ID
LAMBDA_ARTIFACTS_BUCKET_PROD # Lambda ZIP 格納 S3 バケット名
VAPID_PRIVATE_KEY_PROD       # Web Push 秘密鍵
```

## トラブルシューティングコマンド

```bash
# ワークフロー一覧
gh run list --limit 10

# 失敗ログ確認
gh run view <run-id>
gh run view <run-id> --log-failed

# 特定ジョブのログ
gh run view <run-id> --job <job-id>

# PR の CI 状態
gh pr checks <PR番号>

# ワークフロー再実行
gh run rerun <run-id> --failed
```

## Lambda デプロイフロー（deploy.yml）

```
1. checkout
2. AWS OIDC 認証
3. Lambda ごとに ZIP を作成
4. S3 に ZIP をアップロード
5. terraform apply（lambda_s3_keys を更新）
6. Amplify ビルドトリガー
```

## Best Practices

- CI は PR マージ前に必ず通過させる
- シークレット値は GitHub Secrets のみ（コードや PR 説明文に書かない）
- OIDC 認証を使用（アクセスキーを Secrets に保存しない）
- `lambda_s3_keys` のプレースホルダ値でデプロイしない
- Terraform apply は deploy.yml / terraform.yml から自動実行
  （ローカルからの apply はユーザー確認後のみ）

## Output Format

- CI 失敗時: 失敗ステップ・エラーメッセージ・修正案
- デプロイ成功時: デプロイされた Lambda 名・Amplify ビルド URL
