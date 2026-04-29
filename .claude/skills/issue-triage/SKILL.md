---
name: issue-triage
description: 新規・未ラベル Issue を自動分類し、ラベル・優先度・担当領域を提案する PM スキル。GitHub MCP または gh CLI を使って Issue を取得し、分類根拠をコメントとして投稿する。/issue-triage コマンド実行時や pm-agent が Issue 整理を行うときに自動参照される。
user-invocable: false
---

# issue-triage スキル

## 目的

open かつ未ラベルの Issue を取得し、内容を分析して以下を提案する:
- 種別ラベル（bug / feature / chore / docs）
- 優先度ラベル（priority: high / medium / low）
- 影響領域（area: frontend / area: lambda / area: infra / area: data）
- 実行前にユーザー確認を挟み、承認後にラベルを付与する

## 入力

- Issue 番号リスト（省略時は直近 20 件の open Issue を対象）
- フィルター条件（例: ラベルなし、特定マイルストーンなし）

## 出力

- 各 Issue の分類結果テーブル（Markdown）
- ラベル付与案（ユーザー承認後に実行）
- 曖昧な Issue は「情報不足」として指摘し、追加情報を要求するコメント案を提示

## 実行手順

### Step 1: Issue 取得

```bash
# GitHub MCP が利用可能な場合
# mcp__github__list_issues で state=open を取得

# フォールバック（gh CLI）
gh issue list --state open --json number,title,labels,body --limit 20
```

### Step 2: 分類ロジック

| 判定条件 | 種別ラベル |
|----------|-----------|
| タイトル/本文に「バグ」「エラー」「壊れ」「not working」「fix」 | `bug` |
| タイトル/本文に「追加」「新機能」「implement」「feature」 | `feature` |
| タイトル/本文に「設定」「CI」「インフラ」「Terraform」「依存」 | `chore` |
| タイトル/本文に「ドキュメント」「README」「docs」 | `docs` |

| 判定条件 | 優先度 |
|----------|--------|
| 本番障害・セキュリティ脆弱性・データ損失リスク | `priority: high` |
| ユーザー影響あり・機能停止 | `priority: medium` |
| 軽微な改善・リファクタリング | `priority: low` |

| キーワード | 領域ラベル |
|-----------|-----------|
| frontend / React / TypeScript / UI | `area: frontend` |
| lambda / Python / Pydantic / API | `area: lambda` |
| Terraform / AWS / インフラ / CI/CD | `area: infra` |
| dbt / Athena / Iceberg / データ | `area: data` |

### Step 3: 結果をユーザーに提示（確認ステップ）

```
以下のラベル付与を実行しますか？

| Issue | タイトル | 種別 | 優先度 | 領域 |
|-------|---------|------|--------|------|
| #42   | ...     | bug  | high   | lambda |
| #43   | ...     | feature | medium | frontend |

[y] 実行する  [n] キャンセル  [e] 個別に編集する
```

### Step 4: ラベル付与（承認後）

```bash
# gh CLI でラベル付与
gh issue edit 42 --add-label "bug,priority: high,area: lambda"

# GitHub MCP でコメント投稿（分類根拠）
# mcp__github__add_issue_comment:
#   body: "🤖 issue-triage: bug/high/area:lambda に分類しました。\n理由: ..."
```

## 禁止事項

- ユーザー確認なしのラベル付与・Issue クローズ
- 仕様変更を提案するコメントの投稿
- 既存ラベルの削除

## 実行例

```
# Claude Code セッション内
/issue-triage

# 特定 Issue を対象
/issue-triage #42 #43

# pm-agent から呼び出す場合
「issue-triage スキルを使って、今週作成された Issue を整理して」
```

## Provider

- **github**（デフォルト）: GitHub MCP + gh CLI を使用
- **backlog**（将来）: `.claude/skills/issue-triage/providers/backlog.md` を参照

現在アクティブなプロバイダー: `github`
