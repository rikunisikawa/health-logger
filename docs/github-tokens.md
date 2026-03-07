# GitHub トークン設定ガイド

## 概要

このプロジェクトでは以下の GitHub 認証が使われています。

| 用途 | 種類 | 管理場所 |
|------|------|----------|
| Amplify → GitHub リポジトリ接続 | GitHub App (OAuth) | Amplify Console で管理 |
| GitHub Actions → AWS 操作 | OIDC (GitHub App) | GitHub Secret: `AWS_ROLE_ARN_PROD` |

---

## 1. Amplify の GitHub 接続

### 現在の方式

Amplify Console の「リポジトリを再接続」から GitHub App (OAuth) で接続しています。
PAT (Personal Access Token) は不要です。

### 接続手順（再接続が必要な場合）

1. AWS Console → Amplify → `health-logger-prod`
2. **App settings > Repository settings** または **Branch settings**
3. 「リポジトリを再接続」ボタンをクリック
4. GitHub App の OAuth 認証フローで `rikunisikawa/health-logger` へのアクセスを許可

### Terraform との関係

```hcl
# terraform/modules/amplify/main.tf
resource "aws_amplify_app" "main" {
  repository = "https://github.com/${var.github_repository}"
  # access_token は使用しない（GitHub App 接続）
  # lifecycle.ignore_changes = [access_token] で Terraform 管理外
  lifecycle {
    ignore_changes = [access_token]
  }
}
```

`access_token` は `ignore_changes` によって Terraform が管理しないため、
Console 経由での GitHub App 接続が保持されます。

---

## 2. GitHub Actions 用 OIDC ロール

### なぜ必要か

GitHub Actions から AWS を操作（terraform apply / Lambda デプロイ）するための認証です。
PAT や IAM ユーザーのアクセスキーを使わず、OIDC（OpenID Connect）で一時的な認証情報を取得します。

### 仕組み

```
GitHub Actions
  → OIDC トークン発行（GitHub側）
    → AWS STS AssumeRoleWithWebIdentity
      → 一時クレデンシャル取得
        → AWS 操作
```

### AWS 側リソース（Terraform 管理）

```hcl
# terraform/envs/prod/main.tf
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role" "github_actions" {
  # trust policy: repo:rikunisikawa/health-logger:* のみ許可
}
```

### 初回セットアップ手順

1. ローカルで `terraform apply` を実行（IAM ロールを作成）
2. 出力された ARN を確認：
   ```bash
   terraform output github_actions_role
   # → arn:aws:iam::143944071087:role/health-logger-prod-github-actions
   ```
3. GitHub Secrets に登録：
   - シークレット名: `AWS_ROLE_ARN_PROD`
   - 値: 上記 ARN

### GitHub Actions での使用

```yaml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_ARN_PROD }}
    aws-region: ap-northeast-1
```

`permissions: id-token: write` がジョブレベルで必要です。

---

## GitHub Secrets 一覧

| シークレット名 | 内容 | 設定タイミング |
|----------------|------|----------------|
| `AWS_ROLE_ARN_PROD` | GitHub Actions 用 IAM ロール ARN | 初回 terraform apply 後 |
| `AMPLIFY_APP_ID_PROD` | Amplify アプリ ID | 初回 terraform apply 後 |
| `LAMBDA_ARTIFACTS_BUCKET_PROD` | Lambda ZIP 保存先 S3 バケット名 | 初回 terraform apply 後 |
