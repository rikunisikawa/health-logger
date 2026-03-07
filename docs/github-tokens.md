# GitHub トークン設定ガイド

## 概要

このプロジェクトでは2種類の GitHub 認証が使われています。

| 用途 | 種類 | 管理場所 |
|------|------|----------|
| Amplify → GitHub リポジトリ接続 | PAT (Fine-grained) | GitHub Secret: `AMPLIFY_GITHUB_TOKEN` / Terraform変数 |
| GitHub Actions → AWS 操作 | OIDC (GitHub App) | GitHub Secret: `AWS_ROLE_ARN_PROD` |

---

## 1. Amplify 用 PAT

### なぜ必要か

AWS Amplify が GitHub リポジトリのコードを取得してビルドするために必要です。
Terraform の `aws_amplify_app` リソースを API 経由で作成する場合、`access_token` または `oauth_token` が必須です。

```hcl
# terraform/modules/amplify/main.tf
resource "aws_amplify_app" "main" {
  repository   = "https://github.com/${var.github_repository}"
  access_token = var.github_access_token  ← この認証に使用
}
```

### 作成手順

1. GitHub → 右上アイコン → **Settings**
2. 左サイドバー下部 → **Developer settings**
3. **Personal access tokens** → **Fine-grained tokens**
4. **Generate new token**
5. 以下を設定：

| 項目 | 値 |
|------|-----|
| Token name | `health-logger-amplify` |
| Expiration | 30日（テスト） |
| Repository access | Only select repositories → `health-logger` |
| Permissions → Contents | Read-only |
| Permissions → Webhooks | Read and write |

6. **Generate token** → 表示された `github_pat_...` をコピー（画面を閉じると再表示不可）

### 設定場所

**Terraform apply 時（ローカル）:**

トークンは `.env.local`（git 管理外）に保存しておきます：
```bash
# .env.local に値を記入後、以下で読み込む
source .env.local
```

**GitHub Secrets（CI/CD用）:**
リポジトリの Settings → Secrets and variables → Actions
- シークレット名: `AMPLIFY_GITHUB_TOKEN`

### 注意事項

- `terraform.tfvars` には記載しない（`.gitignore` 対象外のため漏洩リスクあり）
- トークンが切れると Amplify の自動ビルドが停止する → 期限前に更新すること
- Amplify コンソールから GitHub App 接続に移行することで PAT を不要にできるが、Terraform 初回 apply 時は PAT が必須

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
  # trust policy: repo:riku_nishikawa/health-logger:* のみ許可
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
| `AMPLIFY_GITHUB_TOKEN` | Amplify 用 GitHub PAT | Amplify 作成前 |
| `AMPLIFY_APP_ID_PROD` | Amplify アプリ ID | 初回 terraform apply 後 |
| `LAMBDA_ARTIFACTS_BUCKET_PROD` | Lambda ZIP 保存先 S3 バケット名 | 初回 terraform apply 後 |
