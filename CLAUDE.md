# CLAUDE.md

## プロジェクト概要

毎日の体調（疲労感・気分・やる気）をすばやく記録する PWA。
フルサーバーレス AWS 構成。**prod 環境のみ**運用。

```
React+TS (Amplify) → API Gateway → Lambda (Python 3.13)
                                        ↓            ↓
                                   Firehose      Athena
                                        ↓
                              S3 (Iceberg) ← Glue
```

アーキテクチャ詳細（認証・データフロー・FLAGS・Terraform 依存・状態管理）は `project-architecture` スキルを参照。

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
pytest lambda/ -v
pytest lambda/create_record/ -v   # 個別実行
pytest lambda/get_latest/ -v
```

### Terraform（Docker 経由）

```bash
BASE="docker compose -f docker-compose.terraform.yml run --rm terraform -chdir=terraform/envs/prod"
$BASE fmt -recursive && $BASE validate
$BASE plan -var='lambda_s3_keys={"create_record":"placeholder","get_latest":"placeholder"}'
```

> **⚠️ `terraform apply` は必ずユーザーに確認してから実行すること。Claude が自律的に apply することは禁止。**

---

## コーディング規約

### Python (Lambda)

- Pydantic v2 でバリデーション（`models.py` に型定義を分離、`handler.py` に書かない）
- boto3 クライアントはモジュールレベルで初期化（関数内は NG）
- SQL に埋め込む `user_id` は必ず UUID 正規表現で検証（インジェクション防止）
- エラーレスポンスは `_json(status, body)` ヘルパー関数で統一

### TypeScript (フロントエンド)

- `strict: true` を維持すること（`tsconfig.json` を緩めない）
- 環境変数は `import.meta.env.VITE_*` 経由で参照（`as string` でキャスト）
- Amplify Auth は `aws-amplify/auth` からサブパスインポート
- IndexedDB は `useOfflineQueue` フックに集約（コンポーネントで直接触らない）

### Terraform

- AWS provider バージョン `>= 5.75` 必須（`aws_s3tables_*` リソースのため）
- センシティブな変数（`github_access_token` など）は `sensitive = true` を付与
- `terraform.tfvars` にシークレット値を直接書かないこと
- **IAM ポリシー変更時は PR 作成前に `aws iam simulate-principal-policy` で権限を確認する**（詳細は `.claude/rules/terraform/workflow.md` 参照）

---

## 開発フロー

**Issue 作成 → ブランチ作成 → テスト先行（Red）→ 実装（Green）→ 全テスト通過確認 → コミット → PR**

詳細な手順・コミット規約・ブランチ命名・PR テンプレートは `git-workflow` スキルを参照。

---

## 重要な禁止事項

- **`terraform apply` を Claude が自律的に実行してはいけない**（必ず事前確認）
- **`app/`、`terraform/envs/dev/` を編集・デプロイしない**（参照用のみ）
- `terraform.tfvars` にシークレット値（PAT など）を直接コミットしない
- `lambda_s3_keys` のプレースホルダ値でデプロイしない（Lambda が起動しなくなる）
- `cors_allow_origins = ["*"]` のまま本番運用しない（Amplify URL に制限すること）

## 開発環境レビューの定期実行

Claude Code の設定（settings.json / hooks / MCP / agents）を定期的にレビューし、改善案を自動生成する仕組み。  
**Claude.ai Pro サブスクリプションの範囲内で動作**（API 別途課金不要）。

### 実行方法

#### A. インタラクティブ実行（Claude Code セッション内）

```
/dev-env-review
```

#### B. 非インタラクティブ実行（CLI から直接）

```bash
bash scripts/run-dev-env-review.sh              # デフォルト（sonnet）
bash scripts/run-dev-env-review.sh --model haiku  # 高速・低コスト版
bash scripts/run-dev-env-review.sh --dry-run      # 動作確認のみ
```

### 定期実行セットアップ（Windows / WSL）

詳細は `scripts/setup-schedule.md` を参照。

**WSL の cron を使う場合（推奨）:**

```bash
# cron を起動
sudo service cron start

# crontab を編集（毎月1日 AM 9:00）
crontab -e
# 以下を追記:
# 0 9 1 * * bash ~/dev/health-logger/health-logger/scripts/run-dev-env-review.sh --model haiku >> /tmp/dev-env-review.log 2>&1
```

**Windows タスクスケジューラを使う場合:**

```powershell
# PowerShell で登録（scripts/setup-schedule.md に詳細手順あり）
$action = New-ScheduledTaskAction -Execute "wsl.exe" `
  -Argument "-e bash -c `"cd ~/dev/health-logger/health-logger && bash scripts/run-dev-env-review.sh --model haiku`""
$trigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 4 -DaysOfWeek Monday -At "09:00"
Register-ScheduledTask -TaskName "health-logger: Claude Code Dev Env Review" -Action $action -Trigger $trigger
```

### 成果物

| ファイル | 内容 |
|---------|------|
| `docs/claude-code-dev-env-review.md` | 改善レポート（自動上書き） |

### 関連ファイル

| ファイル | 役割 |
|---------|------|
| `.claude/skills/dev-env-review/SKILL.md` | レビュー知識ベース・チェックリスト |
| `.claude/commands/dev-env-review.md` | `/dev-env-review` スラッシュコマンド定義 |
| `.claude/prompts/dev-env-review.md` | 非インタラクティブ実行用プロンプト |
| `scripts/run-dev-env-review.sh` | 実行スクリプト（cron/launchd から呼び出す） |
| `scripts/setup-schedule.md` | Windows/WSL 定期実行セットアップ手順 |
