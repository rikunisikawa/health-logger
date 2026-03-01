# CLAUDE.md

## プロジェクト概要

毎日の体調（疲労感・気分・やる気）をすばやく記録する PWA。
フルサーバーレス AWS 構成。**prod 環境のみ**運用。

```
React+TS (Amplify) → API Gateway → Lambda (Python 3.13)
                                        ↓            ↓
                                   Firehose      Athena
                                        ↓
                              S3 Tables (Iceberg) ← Glue
```

---

## ディレクトリ構成

| パス | 内容 |
|------|------|
| `frontend/` | React + TypeScript + Vite フロントエンド |
| `lambda/create_record/` | 記録投稿 Lambda (Python 3.13, Pydantic) |
| `lambda/get_latest/` | 直近記録取得 Lambda (Python 3.13, Athena) |
| `terraform/modules/` | Terraform モジュール群 |
| `terraform/envs/prod/` | prod 環境の Terraform エントリポイント |
| `amplify.yml` | Amplify ビルド仕様 |
| `app/`, `docker-compose.yml` | **Rails (参照用のみ・デプロイ不要)** |

---

## 開発コマンド

### フロントエンド

```bash
cd frontend
npm install        # 依存関係インストール
npm run dev        # ローカル開発サーバー起動
npm run build      # 本番ビルド
npx tsc --noEmit   # 型チェックのみ
```

### Lambda テスト

```bash
# テスト実行（依存ライブラリのインストールが必要）
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
terraform fmt -recursive          # フォーマット
terraform validate                # 構文検証
terraform plan \
  -var='lambda_s3_keys={"create_record":"placeholder","get_latest":"placeholder"}'
```

> **⚠️ `terraform apply` は必ずユーザーに確認してから実行すること。**
> Claude が自律的に apply することは禁止。plan のみ自動で実行してよい。

---

## アーキテクチャ詳細

### 認証

- Cognito User Pool + Hosted UI (OAuth PKCE code flow)
- フロントエンド: `@aws-amplify/auth` v6 でトークン取得
- API: JWT Authorizer で `sub` クレームをユーザー ID として使用

### データフロー

```
POST /records
  → Lambda (create_record)
    → Pydantic バリデーション
    → Firehose.put_record (JSON Lines + "\n")
      → S3 Tables / Iceberg テーブル (Glue カタログ経由)

GET /records/latest
  → Lambda (get_latest)
    → Athena StartQueryExecution (ポーリング最大 10 秒)
    → 結果を JSON で返却
```

### FLAGS ビットマスク

| ビット | 意味 |
|--------|------|
| 1 | poor_sleep（睡眠不足） |
| 2 | headache（頭痛） |
| 4 | stomachache（腹痛） |
| 8 | exercise（運動） |
| 16 | alcohol（アルコール） |
| 32 | caffeine（カフェイン） |

---

## Terraform モジュール依存関係

```
s3tables → glue → firehose ──→ lambda → apigw ←── cognito
s3 ──────────────────────────→ lambda
apigw.endpoint_url ────────────────────────────────→ amplify
cognito.{user_pool_id,client_id,domain} ───────────→ amplify
```

### 初回デプロイ後の必須作業

1. `terraform apply` 出力から `amplify_app_url` と `lambda_artifacts_bucket` を確認
2. GitHub Secrets を更新: `AMPLIFY_APP_ID_PROD`, `LAMBDA_ARTIFACTS_BUCKET_PROD`
3. `terraform.tfvars` の `cognito_callback_urls` と `cors_allow_origins` を実際の Amplify URL に更新して再 apply

### Terraform 状態管理

| 項目 | 値 |
|------|----|
| S3 バケット | `health-logger-tfstate-prod` |
| DynamoDB ロック | `health-logger-tflock-prod` |
| AWS リージョン | `ap-northeast-1` |
| AWS アカウント | `143944071087` |

---

## コーディング規約

### Python (Lambda)

- Pydantic v2 でバリデーション（`models.py` に型定義を分離）
- boto3 クライアントはモジュールレベルで初期化（Lambda の再利用性のため）
- SQL に埋め込む値は必ず事前に UUID 形式を正規表現で検証すること（`get_latest/handler.py` 参照）
- エラーレスポンスは `_json(status, body)` ヘルパー関数で統一

### TypeScript (フロントエンド)

- `strict: true` を維持すること
- 環境変数は `import.meta.env.VITE_*` 経由で参照（`as string` でキャスト）
- Amplify Auth は `aws-amplify/auth` からサブパスインポート
- オフラインキューは `useOfflineQueue` フックに集約（コンポーネントで直接 IndexedDB を触らない）

### Terraform

- AWS provider バージョン `>= 5.75` 必須（`aws_s3tables_*` リソースのため）
- センシティブな変数（`github_access_token` など）は `sensitive = true` を付与
- `terraform.tfvars` は `.gitignore` に**含まれていない**ため、シークレット値を直接書かないこと

---

## GitHub Actions

| ワークフロー | トリガー | 役割 |
|-------------|---------|------|
| `ci.yml` | PR / push | Lambda テスト・フロントエンドビルド・Ruby CI |
| `deploy.yml` | main push | Lambda ZIP → S3 → terraform apply → Amplify build |
| `terraform.yml` | terraform/** 変更 | Plan (PR) / Apply (main push) |

### 必要な GitHub Secrets (prod)

```
AWS_ROLE_ARN_PROD
AMPLIFY_GITHUB_TOKEN
AMPLIFY_APP_ID_PROD
LAMBDA_ARTIFACTS_BUCKET_PROD
```

---

## 開発サイクル

コーディング作業は必ず以下の順序で行うこと。

### 1. ブランチを切る

```bash
git switch main
git pull origin main
git switch -c <prefix>/<簡潔な名前>
```

| prefix | 用途 |
|--------|------|
| `feature/` | 新機能追加 |
| `fix/` | バグ修正 |
| `chore/` | 設定変更・依存更新・リファクタ |
| `terraform/` | インフラ変更のみ |

例: `feature/add-sleep-quality-score`、`fix/offline-queue-flush`

### 2. テストを先に書く（Red）

実装の前にテストを作成し、失敗することを確認する。

```bash
# Lambda
pytest lambda/<対象>/ -v                 # → FAILED であることを確認

# フロントエンド（型エラーで失敗させる）
cd frontend && npx tsc --noEmit          # → エラーであることを確認
```

- テストは実装の意図を明確にするために書く（後付けではない）
- Lambda: `test_handler.py` にユニットテストを追加
- フロントエンド: 型システムを活用し、型エラーで Red 状態を表現する

### 3. 実装する（Green）

テストが通る最小限のコードを書く。過剰な汎用化・先回りした設計は避ける。

```bash
# Lambda
pytest lambda/<対象>/ -v                 # → PASSED を確認

# フロントエンド
cd frontend && npx tsc --noEmit && npm run build
```

### 4. 全テストを通す

個別テストが通った後、すべてのテストが壊れていないか確認する。

```bash
# Lambda 全体
pytest lambda/ -v

# フロントエンド
cd frontend && npx tsc --noEmit && npm run build
```

すべて通ることを確認してからコミットに進む。失敗があれば必ず修正する。

### 5. 機能単位でコミットする

1 コミット = 1 つの論理的な変更。複数の変更をまとめてコミットしない。

```bash
git add <変更ファイルを個別に指定>      # git add -A は使わない
git commit -m "<type>: <変更内容の要約>"
```

| type | 意味 |
|------|------|
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `test` | テスト追加・修正 |
| `refactor` | 動作を変えないリファクタ |
| `chore` | 設定・依存・ドキュメント |
| `terraform` | インフラ変更 |

コミットメッセージ例:
```
feat: add offline queue flush on app startup
fix: cap Athena query limit to 100
test: add validation tests for flags bitmask range
terraform: restrict CORS to Amplify domain
```

### 6. PR を作成する

```bash
git push origin HEAD
gh pr create --title "<変更内容>" --body "$(cat <<'EOF'
## 変更内容
- ...

## テスト確認
- [ ] pytest lambda/ -v → 全件 PASSED
- [ ] npx tsc --noEmit → エラーなし
- [ ] npm run build → 成功

## レビュー観点
- ...
EOF
)"
```

- PR は 1 機能 = 1 PR を原則とする
- CI（`ci.yml`）が通ることを確認してからレビューを依頼する
- `terraform/**` を変更した場合は `terraform plan` の出力を PR に貼る

---

## 重要な禁止事項

- **`terraform apply` を Claude が自律的に実行してはいけない**（必ず事前確認）
- `terraform.tfvars` にシークレット値（PAT など）を直接コミットしない
- `lambda_s3_keys` のプレースホルダ値でデプロイしない（Lambda が起動しなくなる）
- `cors_allow_origins = ["*"]` のまま本番運用しない（Amplify URL に制限すること）
- `app/`、`terraform/envs/dev/` を編集・デプロイしない（参照用）
