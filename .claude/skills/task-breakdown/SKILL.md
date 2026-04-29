---
name: task-breakdown
description: 大きな Issue をサブタスクに分解し、子 Issue として作成する PM スキル。要件を実装単位（S/M/L）に分割し、依存関係を整理する。pm-agent がエピックを分割するときや実装着手前の分解フェーズで自動参照される。
user-invocable: false
---

# task-breakdown スキル

## 目的

大きな Issue（エピック）を独立して実装可能なサブタスクに分解し、
依存関係を整理して実装順序を提案する。

## 入力

- 分解対象の Issue 番号

## 出力

- サブタスク一覧（工数感・依存関係付き）
- 子 Issue の作成案（ユーザー承認後に integration-agent が実行）
- 実装順序の推奨

## 実行手順

### Step 1: 親 Issue を読む

```bash
gh issue view <Issue番号> --json title,body,labels,milestone
```

### Step 2: 分解ロジック

分解の単位（工数感の目安）:

| サイズ | 目安 | 例 |
|--------|------|-----|
| S | 半日以内 | 単一 Lambda 関数の修正、型定義の追加 |
| M | 1〜2日 | 新しい Lambda 関数の実装＋テスト |
| L | 3〜5日 | 新しい AWS リソース追加＋Lambda＋フロントエンド連携 |

分解の観点:
1. **領域で分割**: frontend / lambda / infra / data は分ける
2. **依存で順序付け**: インフラ（Terraform）→ Lambda → フロントエンド の順が基本
3. **テスト可能単位**: 1つのサブタスクで動作確認できる粒度にする

### Step 3: 提案の提示

```markdown
## Issue #42「〇〇機能追加」の分解案

| # | サブタスク | サイズ | 依存 | 領域 |
|---|-----------|--------|------|------|
| 1 | Terraform: DynamoDB テーブル追加 | M | なし | infra |
| 2 | Lambda: GET /config ハンドラー実装 | M | #1 | lambda |
| 3 | Lambda: POST /config ハンドラー実装 | M | #1 | lambda |
| 4 | Frontend: 設定画面コンポーネント実装 | L | #2, #3 | frontend |

実装順序: 1 → 2・3（並行可）→ 4
```

### Step 4: 子 Issue 作成（承認後）

ユーザーが承認したら `integration-agent` に委譲:

```
integration-agent: 以下の子 Issue を作成し、親 Issue #42 のタスクリストに追記してください:
- 「[infra] DynamoDB テーブル追加」
- 「[lambda] GET /config ハンドラー実装」
...
```

## 禁止事項

- ユーザー確認なしの子 Issue 作成
- 1つのサブタスクに複数領域を混在させる（分割しきれない場合は相談）

## Provider

- **github**（デフォルト）: GitHub MCP + gh CLI
- **backlog**（将来）: `.claude/skills/task-breakdown/providers/backlog.md` を参照
