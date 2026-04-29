---
name: risk-review
description: 現在の Issue/PR/コードから潜在リスクを抽出し、リスクマトリクスを生成する PM スキル。ボトルネックや停滞要因を特定し、pm-agent の優先度判断を支援する。/risk-review コマンド実行時や deep-research-agent が分析を行うときに自動参照される。
user-invocable: false
---

# risk-review スキル

## 目的

プロジェクトの現状からリスク・ブロッカー・停滞を特定し、
「今すぐ対処すべきこと」を pm-agent または人間に提示する。

## 入力

- なし（現在のリポジトリ状態を自動スキャン）

## 出力

- リスクマトリクス（影響度 × 発生確率）
- 停滞 Issue/PR の一覧
- 推奨アクション（実行はしない）

## スキャン観点

### 1. GitHub 状態スキャン

```bash
# 14日以上更新のない open Issue
gh issue list --state open --json number,title,updatedAt,labels --limit 50

# レビュー待ちの stale PR
gh pr list --state open --json number,title,updatedAt,reviews --limit 20

# 直近のCIステータス
gh run list --limit 10 --json status,conclusion,name
```

### 2. コードリスクスキャン

```bash
# セキュリティリスクパターン
grep -rn "TODO\|FIXME\|HACK" lambda/ frontend/src/ --include="*.py" --include="*.ts" --include="*.tsx"

# user_id バリデーション漏れ
grep -rn "user_id" lambda/ --include="*.py" | grep -v "UUID_RE\|validate\|test_"

# ハードコードされた設定値の疑い
grep -rn "ap-northeast-1\|us-east-1" lambda/ --include="*.py" | grep -v "os.environ\|ssm\|#"
```

### 3. リスクマトリクス生成

| リスク | 影響度 | 発生確率 | 優先度 |
|--------|--------|---------|--------|
| CI が連続失敗 | High | - | 🔴 即対応 |
| 14日以上未更新の bug Issue | High | Medium | 🟠 今週対応 |
| stale PR（レビュー待ち1週間超） | Medium | High | 🟠 今週対応 |
| TODO コメントが多い領域 | Low | - | 🟡 次スプリント |

## 出力フォーマット

```markdown
## リスクレビュー: YYYY-MM-DD

### 🔴 即対応（High Impact）
- CI が3回連続失敗中（deploy.yml）

### 🟠 今週対応
- Issue #38 が21日間更新なし（bug / lambda）
- PR #12 がレビュー待ち10日

### 🟡 次スプリント検討
- lambda/create_record/handler.py に TODO が5件

### ✅ 問題なし
- open Issue のほとんどは1週間以内に更新あり
```

## 禁止事項

- Issue のクローズ・ラベル変更（レポートのみ）
- コードの変更

## Provider

- **github**（デフォルト）: GitHub MCP + gh CLI
- **backlog**（将来）: `.claude/skills/risk-review/providers/backlog.md` を参照
