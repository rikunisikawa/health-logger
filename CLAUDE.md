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

---

## 開発フロー（厳守）

**必ずこの順序で行うこと。Issue なしで実装を始めてはいけない。**

```
1. gh issue create          # 必ず最初に Issue を作る
2. git switch -c fix/<issue番号>-<名前>  # Issue 番号をブランチ名に含める
3. テスト先行（Red）         # 失敗するテストを先に書く
4. 実装（Green）             # テストが通る最小実装
5. pytest lambda/ -v        # 全テスト通過確認
6. git add <個別ファイル>   # git add -A は使わない
7. git commit               # Conventional Commits 形式
8. git push && gh pr create # Closes #<issue番号> を本文に含める
```

詳細な手順・コミット規約・ブランチ命名・PR テンプレートは `git-workflow` スキルを参照。

---

## 重要な禁止事項

- **`terraform apply` を Claude が自律的に実行してはいけない**（必ず事前確認）
- **`app/`、`terraform/envs/dev/` を編集・デプロイしない**（参照用のみ）
- **Issue を作らずに実装・コミットを始めてはいけない**
- **既存の機能ブランチに無関係な fix をコミットしない**（1 PR = 1 修正）
- `terraform.tfvars` にシークレット値（PAT など）を直接コミットしない
- `lambda_s3_keys` のプレースホルダ値でデプロイしない（Lambda が起動しなくなる）
- `cors_allow_origins = ["*"]` のまま本番運用しない（Amplify URL に制限すること）
