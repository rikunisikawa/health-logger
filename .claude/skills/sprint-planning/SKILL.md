---
name: sprint-planning
description: backlog から次スプリントの候補 Issue を選定し、マイルストーン割り当てを提案する PM スキル。GitHub MCP で Issue・マイルストーン情報を取得し、優先度・工数・依存関係を考慮してスプリントボードを提案する。/sprint-plan コマンド実行時や pm-agent がスプリント計画を立てるときに自動参照される。
user-invocable: false
---

# sprint-planning スキル

## 目的

open Issue の中から次スプリントで着手すべき項目を選定し、
マイルストーン割り当て案をユーザーに提示する。

## 入力

- スプリント期間（デフォルト: 2週間）
- 前回のベロシティ（Issue クローズ数/スプリント、不明時は 5 を仮定）
- 除外条件（特定ラベル・担当者を除く など）

## 出力

- スプリント候補 Issue のテーブル（優先度・工数・領域付き）
- マイルストーン割り当て案（ユーザー承認後に integration-agent が実行）
- 持ち越し Issue の一覧

## 実行手順

### Step 1: 現状把握

```bash
# open Issue を取得
gh issue list --state open --json number,title,labels,milestone,assignees --limit 50

# 現在のマイルストーン一覧
gh milestone list --json title,dueOn,openIssues,closedIssues
```

### Step 2: 選定ロジック

優先度の高い順に並べ、以下の観点でフィルタリング:

1. `priority: high` ラベルが付いている Issue を最優先
2. 依存 Issue が解決済みのものを優先
3. 領域のバランスを考慮（frontend/lambda/infra を混在させる）
4. 前回スプリントから持ち越した Issue を考慮

### Step 3: スプリントボード提案

```markdown
## Sprint-N 提案（YYYY-MM-DD 〜 YYYY-MM-DD）

| # | タイトル | 優先度 | 領域 | 工数感 |
|---|---------|--------|------|--------|
| #42 | ... | high | lambda | M |
| #43 | ... | medium | frontend | S |
| #44 | ... | medium | infra | L |

合計: S×1 + M×2 + L×1（前回ベロシティ 5 Issue に対して適切な量）

持ち越し候補:
- #38: 依存先 #36 が未完了
- #40: 工数見積もり不明、要調査
```

### Step 4: 承認後の実行

ユーザーが承認したら `integration-agent` に委譲:

```
integration-agent: マイルストーン「Sprint-N」を作成し、
Issue #42 #43 #44 に割り当ててください。
期限: YYYY-MM-DD
```

## 禁止事項

- ユーザー確認なしのマイルストーン作成・Issue 移動
- スコープの大幅な変更（10 Issue 以上の一括追加）
- 完了基準（DoD）の変更

## Provider

- **github**（デフォルト）: GitHub MCP + gh CLI
- **backlog**（将来）: `.claude/skills/sprint-planning/providers/backlog.md` を参照
