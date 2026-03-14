---
skill: git_workflow
purpose: Git ブランチ戦略・コミット規約・PR フローのパターン
used_by: [project_management, orchestrator]
---

## Purpose

health-logger における Git/GitHub の標準操作パターン集。
CLAUDE.md の開発サイクルに準拠した一貫したワークフローを提供する。

## Responsibilities

- ブランチ命名規則
- コミットメッセージ規約
- PR 作成フォーマット
- Issue 管理
- マージ戦略

## Branch Naming

```
<prefix>/<issue番号>-<簡潔な説明>

feature/42-add-sleep-score
fix/43-offline-queue-flush
chore/44-update-dependencies
terraform/45-add-env-data-lambda
```

| prefix | 用途 |
|--------|------|
| `feature/` | 新機能追加 |
| `fix/` | バグ修正 |
| `chore/` | 設定・依存・リファクタ |
| `terraform/` | インフラ変更のみ |

## Commit Convention

```
<type>: <変更内容の要約（日本語可）>

feat: ダッシュボードに気圧グラフを追加
fix: Athena クエリのタイムアウトを 10 秒に修正
test: flags バリデーションのテストを追加
refactor: useOfflineQueue フックを分離
chore: boto3 を 1.42.0 にアップグレード
terraform: env_data_ingest モジュールを追加
```

## Issue テンプレート

```bash
gh issue create \
  --title "<変更内容の要約>" \
  --body "$(cat <<'EOF'
## 背景・目的
- ...

## やること
- [ ] ...

## 完了条件
- ...
EOF
)"
```

## PR テンプレート

```bash
gh pr create \
  --title "<変更内容>" \
  --body "$(cat <<'EOF'
## 関連イシュー
Closes #<issue番号>

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

## Merge Strategy

```bash
# squash merge（コミット履歴をクリーンに保つ）
gh pr merge <PR番号> --squash --delete-branch
```

## よく使うコマンド

```bash
# 状態確認
git status
git log --oneline -10
git diff HEAD~1

# ブランチ操作
git switch main && git pull origin main
git switch -c feature/42-xxx

# ステージング（個別指定）
git add lambda/create_record/handler.py
git add lambda/create_record/test_handler.py

# Issue/PR 操作
gh issue list --state open
gh pr list --state open
gh pr checks <PR番号>
gh run list --limit 5
```

## Best Practices

- `git add -A` / `git add .` は使わない（センシティブファイルの誤コミット防止）
- `git push --force` は禁止（共有ブランチの履歴破壊防止）
- 1 コミット = 1 つの論理的な変更
- 1 PR = 1 機能/1 修正（複数変更の混在は避ける）
- CI 通過前にマージしない
- PR 説明文にシークレット値を書かない（VAPID 鍵・PAT 等）

## Output Format

- 実行した Git コマンドの結果
- Issue 番号・PR 番号・ブランチ名
- CI の通過状況
