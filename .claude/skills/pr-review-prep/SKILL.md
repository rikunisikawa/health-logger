---
name: pr-review-prep
description: PR マージ前のレビューチェックリストを自動生成し、レビューコメントを投稿する QA スキル。変更ファイルを分析し、セキュリティ・品質・テスト観点の確認項目を整理する。/code-review コマンドや qa-agent がPR品質確認を行うときに自動参照される。
user-invocable: false
---

# pr-review-prep スキル

## 目的

PR の変更差分を分析し、レビュアーが見るべき観点をチェックリスト形式で整理する。
GitHub MCP でレビューコメントを投稿する（ユーザー承認後）。

## 入力

- PR 番号

## 出力

- レビューチェックリスト（Markdown）
- 発見した問題点の一覧（CRITICAL / HIGH / MEDIUM）
- GitHub PR へのレビューコメント案（ユーザー承認後に投稿）

## 実行手順

### Step 1: PR 情報取得

```bash
# PR の詳細と変更ファイル
gh pr view <PR番号> --json title,body,files,reviews,checks

# 変更差分
gh pr diff <PR番号>
```

### Step 2: 観点別チェック

#### セキュリティ（CRITICAL）

- `user_id` への UUID バリデーション（SQL インジェクション防止）
- シークレット・PAT・VAPID 鍵のハードコードがないか
- `cors_allow_origins = ["*"]` になっていないか
- TypeScript の `strict: true` が維持されているか

#### 品質（HIGH）

- pytest が lambda/ の変更に対して存在するか
- 型定義が適切か（TypeScript strict）
- `boto3` クライアントがモジュールレベルで初期化されているか
- エラーレスポンスが `_json(status, body)` ヘルパーで統一されているか

#### 運用（MEDIUM）

- CLAUDE.md の禁止事項に違反していないか
- ドキュメントの更新が必要な変更か
- Terraform 変更時に IAM シミュレーションが必要か

### Step 3: レビューコメント案の提示

```markdown
## PR #15 レビュー観点

### 🔴 CRITICAL（マージ前に必ず修正）
- なし

### 🟠 HIGH（強く推奨）
- `lambda/create_record/handler.py` L42: boto3 クライアントが関数内で初期化されている

### 🟡 MEDIUM（推奨）
- この変更に対応する docs/ の更新が必要かもしれません

### ✅ 確認済み
- user_id UUID バリデーション: 実装済み
- pytest: 対応テストあり
- secrets: ハードコードなし
```

### Step 4: GitHub へのレビュー投稿（承認後）

```bash
# integration-agent に委譲
# mcp__github__create_review: PR へのレビューコメント投稿
```

## 禁止事項

- **PR のマージ実行**（ユーザーのみ可）
- **コードの自動修正**（指摘のみ）
- **CRITICAL 問題がある PR を承認する**

## Provider

- **github**（デフォルト）: GitHub MCP + gh CLI
- **backlog**（将来）: `.claude/skills/pr-review-prep/providers/backlog.md` を参照
