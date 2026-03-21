---
description: Claude Code 開発環境のレビュー・改善案作成。settings.json/hooks/MCP/agents/skills の評価観点・改善チェックリスト・ベストプラクティスを提供する。/dev-env-review コマンド実行時や開発環境設定の見直し時に自動参照される。
user-invocable: false
---

# Claude Code 開発環境レビュー スキル

## 公式ドキュメント参照先

レビュー実施時は以下 URL を fetch して最新情報を確認すること。

| ドキュメント | URL |
|------------|-----|
| Overview | https://docs.anthropic.com/en/docs/claude-code/overview |
| Settings | https://docs.anthropic.com/en/docs/claude-code/settings |
| Hooks | https://docs.anthropic.com/en/docs/claude-code/hooks |
| MCP | https://docs.anthropic.com/en/docs/claude-code/mcp |
| Memory (CLAUDE.md) | https://docs.anthropic.com/en/docs/claude-code/memory |
| Sub-agents | https://docs.anthropic.com/en/docs/claude-code/sub-agents |
| GitHub Actions | https://docs.anthropic.com/en/docs/claude-code/github-actions |
| Security | https://docs.anthropic.com/en/docs/claude-code/security |
| Costs | https://docs.anthropic.com/en/docs/claude-code/costs |

## レビュー観点チェックリスト

### A. CLAUDE.md
- [ ] 90行以内に収まっているか（コンテキスト消費量の観点）
- [ ] 「コードを読めば分かること」が書かれていないか（重複排除）
- [ ] 禁止事項が明確か（`terraform apply`・`git add -A` 等）
- [ ] 開発フローが正確か（Issue→branch→TDD→commit→PR の順序）
- [ ] CI 実行時の制約が記載されているか

### B. `.claude/settings.json`
- [ ] `defaultMode` が適切か（`acceptEdits` / `default` / `plan`）
- [ ] `allow` リストに必要なコマンドのみが入っているか
- [ ] `deny` リストで危険操作が漏れなくブロックされているか
  - `terraform apply/destroy`
  - `git push --force`
  - `aws * delete-*` / `create-*` / `rm` / `sync`
  - `docker compose * terraform apply/destroy`
- [ ] `hooks` のパスが**相対パス**になっているか（絶対パスは CI で動かない）
- [ ] `env` の設定値が適切か
- [ ] `enabledMcpjsonServers` の一覧が `.mcp.json` と一致しているか

### C. Hooks
- [ ] `block-forbidden-dirs.py`: FORBIDDEN リストが最新か（`app/`・`terraform/envs/dev/`）
- [ ] `git-push-reminder.py`: チェック内容が現在の開発フローと合っているか
- [ ] `run-tests-after-edit.py`: 対象ディレクトリ（`lambda/`）が正しいか
- [ ] hooks が stdin から JSON を読み込む形式になっているか（Claude Code の仕様）
- [ ] 終了コード 0=通過 / 2=ブロック が正しく実装されているか
- [ ] hooks がタイムアウト・例外処理を持っているか（メイン処理を止めない設計）

### D. `.mcp.json` と MCP サーバー
- [ ] すべてのコマンドが**コマンド名のみ**（絶対パス不使用）か
  - NG: `/home/user/.local/bin/uvx`
  - OK: `uvx`
- [ ] `GIT_BASE_DIR` に絶対パスが含まれていないか（`${PWD}` を使う）
- [ ] `AWS_PROFILE` にフォールバック（`${AWS_PROFILE:-default}`）があるか
- [ ] `FETCH_ALLOWLIST` に必要なドメインが含まれているか（`docs.anthropic.com` 等）
- [ ] 各サーバーの必要性が明確か（不要なサーバーは起動コスト増）
- [ ] セキュリティ上のリスクがあるサーバーが有効になっていないか

### E. Agents（`.claude/agents/`）
- [ ] 各エージェントの役割が明確に分担されているか
- [ ] `tools:` の指定が最小権限になっているか
- [ ] `orchestrator` がチーム全体をカバーしているか
- [ ] 未使用のエージェントが残っていないか

### F. Skills（`.claude/skills/`）
- [ ] `description` フィールドが自動ロードのトリガーとして機能する文言か
- [ ] `user-invocable: false` が正しく設定されているか（スラッシュコマンドと混在しない）
- [ ] スキルの内容が最新の実装と乖離していないか

### G. Commands（`.claude/commands/`）
- [ ] よく使うフローがコマンド化されているか（`/plan`・`/tdd`・`/dev-env-review`）
- [ ] コマンドの手順が現在の開発フロー（CLAUDE.md）と一致しているか

### H. セキュリティ
- [ ] シークレット値（PAT・VAPID鍵・API鍵）がコードに含まれていないか
- [ ] `deny` リストで権限エスカレーションが防止されているか
- [ ] MCP の fetch サーバーのドメイン許可リストが適切か
- [ ] `.gitignore` にシークレットファイルが含まれているか

### I. コスト最適化
- [ ] セッションごとに必要最小限のファイルのみ読み込んでいるか
- [ ] スキル・エージェントの `description` が過剰に長くないか（プロンプト消費）
- [ ] 定期実行スクリプトのモデル選択が適切か（haiku で十分な場合は haiku）

## 改善案の出力フォーマット

```markdown
# Claude Code 開発環境 改善レポート

生成日時: YYYY-MM-DD HH:MM
生成方法: [インタラクティブ / scripts/run-dev-env-review.sh]

## 参照した公式ドキュメント
- [ドキュメント名](URL): 参照可 / 参照不可

## 現状サマリー
（3〜5行で全体評価）

## 改善案

### A. CLAUDE.md
### B. settings.json
### C. Hooks
### D. MCP サーバー
### E. Agents / Skills / Commands
### F. セキュリティ
### G. コスト最適化
### H. 今後の拡張案

## 優先度マトリクス

| 優先度 | 改善項目 | 工数感 | 理由 |
|--------|---------|--------|------|
| 高 | | | |
| 中 | | | |
| 低 | | | |

## 不明点・確認が必要な事項
```
