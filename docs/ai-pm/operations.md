# AI PM 実運用ルール

## 日常業務のリズム

### 毎日（任意）

```bash
# セッション開始時に自動ロード（load-context-on-start.py が処理）
# → sprint-current.md と open Issue が自動表示される
```

### スプリント開始時（2週間ごと）

```bash
/issue-triage        # 未分類 Issue を整理
/sprint-plan         # 次スプリントの計画を立案
# → 人間が承認 → integration-agent がマイルストーン割り当て
```

### 実装中

```bash
/implement #<Issue番号>   # 開発サイクルの自動実行（既存コマンド）
/checkpoint              # 中間セーブポイント
```

### PR 作成後

```bash
/code-review             # セキュリティ重視のセルフレビュー
# または qa-agent に「PR #N をレビューして」と依頼
```

### 週次（金曜日など）

```bash
/status-report           # 週次レポート生成 → docs/ai-pm/reports/ に保存
/risk-review             # リスク・停滞の確認
```

### リリース前

```bash
/release-check           # Go/No-go 判定
# → 人間が確認してマージ・デプロイ
```

## エージェントの使い分け

| やりたいこと | 使うエージェント / コマンド |
|-------------|--------------------------|
| Issue を整理したい | `/issue-triage` または `pm-agent` |
| スプリントを計画したい | `/sprint-plan` または `pm-agent` |
| 実装を進めたい | `/implement #N` または `engineer-agent` |
| 設計方針を決めたい | `architect-agent` または `architecture` |
| テスト・品質を確認したい | `qa-agent` または `testing` |
| GitHub を操作したい | `integration-agent` |
| 調査・分析をしたい | `deep-research-agent` |
| ドキュメントを書きたい | `documentation` |
| 週次レポートを作りたい | `/status-report` |
| リスクを確認したい | `/risk-review` |
| デプロイ前チェック | `/release-check` |

## GitHub MCP が使えないとき

`gh CLI` でフォールバック可能。各エージェント・スキルの「フォールバック」セクションを参照。

```bash
# よく使う gh CLI コマンド
gh issue list --state open --json number,title,labels --limit 20
gh pr list --state open
gh run list --limit 5
gh milestone list
```

## Backlog 連携を追加するとき

1. `.mcp.json` に Backlog MCP サーバー設定を追加
2. `.claude/settings.json` の `enabledMcpjsonServers` に追加
3. 各スキルの `providers/backlog.md` を実装
4. `docs/ai-pm/governance.md` に Backlog のルールを追記

## 定期実行の設定

```bash
# 開発環境レビュー（月1回）
# scripts/run-dev-env-review.sh を参照

# status-report の自動実行（任意）
# crontab -e で以下を追加:
# 0 9 * * 5 cd ~/dev/health-logger/health-logger && claude --print /status-report
```
