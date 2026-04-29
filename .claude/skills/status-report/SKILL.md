---
name: status-report
description: 週次/月次の開発状況レポートを生成する PM スキル。GitHub から closed Issue・merged PR・CI 結果を取得し、進捗・リスク・次アクションをまとめる。/status-report コマンド実行時や pm-agent が定期レポートを生成するときに自動参照される。
user-invocable: false
---

# status-report スキル

## 目的

指定期間の開発状況を自動収集し、マークダウンレポートを生成する。
`docs/ai-pm/reports/YYYY-MM-DD.md` として保存する。

## 入力

- レポート期間（デフォルト: 直近 7 日）
- レポート種別（weekly / monthly / sprint）

## 出力

- `docs/ai-pm/reports/YYYY-MM-DD.md` へのレポートファイル
- コンソールへのサマリー表示

## 実行手順

### Step 1: データ収集

```bash
# 期間内にクローズされた Issue
gh issue list --state closed --json number,title,labels,closedAt --limit 50

# 期間内にマージされた PR
gh pr list --state merged --json number,title,mergedAt,author --limit 20

# CI/CD 実行結果
gh run list --limit 10 --json status,conclusion,name,createdAt
```

### Step 2: レポート生成

```markdown
# 週次レポート: YYYY-MM-DD 〜 YYYY-MM-DD

## サマリー

| 項目 | 件数 |
|------|------|
| クローズした Issue | N件 |
| マージした PR | N件 |
| CI 成功率 | N% |

## 完了した Issue

- #42 タイトル（bug / lambda）
- #43 タイトル（feature / frontend）

## マージした PR

- #15 タイトル（@author）

## 進行中 / ブロック中

| Issue | 状態 | ブロック理由 |
|-------|------|-------------|
| #44   | 進行中 | - |
| #38   | ブロック | 依存 #36 が未完了 |

## リスク・懸念事項

- （あれば記載）

## 次スプリントへの持ち越し

- #38, #40

## 次のアクション

1. #38 の依存を解消する
2. #40 の工数見積もりを行う
```

### Step 3: ファイル保存

```python
# docs/ai-pm/reports/ に保存
# ファイル名: YYYY-MM-DD-weekly.md
```

## 禁止事項

- レポートを外部サービス（Slack 等）に自動投稿する
- コードの変更を含む

## Provider

- **github**（デフォルト）: GitHub MCP + gh CLI
- **backlog**（将来）: `.claude/skills/status-report/providers/backlog.md` を参照
