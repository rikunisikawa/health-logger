# AI PM 基盤

health-logger における「GitHub MCP 連携 + AI PM 運用」のドキュメント。

## 思想

```
MCP       = 接続層（GitHub との通信）
Skills    = 再利用可能な手順書
Agents    = 役割分担（PM / Architect / Engineer / QA）
Hooks     = 強制ガードレール（LLM の気分に依存しない）
CLAUDE.md = AI 運用の憲法
```

## エージェント階層

```
pm-agent（戦略・判断）
  ├── deep-research-agent : 情報収集・データ分析
  ├── architect-agent     : 技術設計の起案
  ├── engineer-agent      : 実装の進捗管理
  ├── qa-agent            : 品質確認の統括
  └── integration-agent   : GitHub MCP 操作の代行
```

既存エージェント（orchestrator / frontend / lambda / devops 等）は引き続き有効。
新エージェントは既存を「置き換える」のではなく「上位から調整する」。

## クイックスタート

### Issue を整理したい

```
/issue-triage
```

### スプリント計画を立てたい

```
/sprint-plan
```

### 週次レポートを作りたい

```
/status-report
```

### PR レビュー準備をしたい

```
/code-review
# または pr-review-prep スキルを参照
```

## ディレクトリ構成

```
docs/ai-pm/
├── README.md          # このファイル
├── governance.md      # ガバナンスルール詳細
├── workflow.md        # Issue → Deploy のフロー
├── sprint-current.md  # 現在のスプリント状態（運用中に更新）
└── reports/           # 週次/月次レポート
    └── YYYY-MM-DD-weekly.md
```

## 関連ファイル

| ファイル | 役割 |
|---------|------|
| `.claude/agents/pm-agent.md` | AI PM エージェント定義 |
| `.claude/agents/integration-agent.md` | GitHub MCP 操作代行 |
| `.claude/skills/issue-triage/` | Issue 分類スキル |
| `.claude/skills/sprint-planning/` | スプリント計画スキル |
| `.claude/skills/status-report/` | 進捗レポートスキル |
| `.claude/commands/issue-triage.md` | `/issue-triage` コマンド |
| `.claude/commands/sprint-plan.md` | `/sprint-plan` コマンド |
| `.claude/commands/status-report.md` | `/status-report` コマンド |
| `CLAUDE.md` | AI 運用の憲法（AI PM ガバナンス原則を含む） |
