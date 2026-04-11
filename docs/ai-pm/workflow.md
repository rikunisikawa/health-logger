# AI PM ワークフロー

Issue 作成から Deploy まで、AI と人間がどう協働するかを示す。

## フロー全体図

```
[人間] Issue 作成
    ↓
[pm-agent] /issue-triage → 分類・優先度付け提案
[人間] 承認
[integration-agent] ラベル付与・マイルストーン割り当て
    ↓
[pm-agent] /sprint-plan → スプリント候補提案
[人間] 承認
[integration-agent] マイルストーン確定
    ↓
[人間 or pm-agent] /implement #<Issue番号>
[engineer-agent or lambda/frontend] 実装
[qa-agent or testing] テスト
    ↓
[qa-agent] pr-review-prep スキル → レビューチェックリスト
[人間] コードレビュー・マージ判断
[integration-agent] レビューコメント投稿
    ↓
[人間] PR マージ（AI は実行不可）
    ↓
[CI/CD] 自動デプロイ（deploy.yml）
[人間] 本番確認
```

## 各ステップの詳細

### Step 1: Issue → Triage

```bash
# 新しい Issue が作成されたら
/issue-triage

# pm-agent が分類し、ラベル付与案を提示
# 人間が承認 → integration-agent が実行
```

### Step 2: Triage → Sprint Planning

```bash
# スプリント開始時（2週間ごと）
/sprint-plan

# pm-agent が候補を提示
# 人間が承認 → integration-agent がマイルストーン割り当て
```

### Step 3: Sprint → Implement

```bash
# 着手する Issue を選んで実装
/implement #42

# 既存の implement コマンドが
# ブランチ作成 → TDD → 実装 → テスト → コミット → PR を自動化
```

### Step 4: PR → Review

```bash
# PR 作成後にレビュー準備
# qa-agent または /code-review を実行

# pr-review-prep スキルが
# セキュリティ・品質・テスト観点でチェックリストを生成
# integration-agent が PR にレビューコメントを投稿（承認後）
```

### Step 5: Review → Deploy

```bash
# 人間がコードレビューしてマージ（AI は実行不可）
# CI/CD が自動でデプロイ（deploy.yml）
# 人間が本番確認
```

### Step 6: 週次レビュー

```bash
# 毎週金曜日など定期的に
/status-report

# status-report スキルが
# closed Issue・merged PR・CI 結果をまとめてレポート生成
# docs/ai-pm/reports/YYYY-MM-DD-weekly.md に保存
```

## 人間が必ず行うこと

- Issue の新規作成（仕様の起点）
- ラベル付与・マイルストーン割り当ての承認
- スプリント計画の承認
- コードレビューとマージの判断
- 本番環境の最終確認
- セキュリティ・アーキテクチャの重要判断
