# Side Business Research

Agent Teams による並列分析結果。分析日: 2026-03-14

## Phase 1-2: アイデア生成 & スコアリング

20アイデアを生成し、3エージェント（Strategy / Market Research / Product Architect）の並列分析によりTop 3を選出。

## Phase 3: Top 3 深掘り分析

| # | ファイル | 製品 | 12ヶ月MRR目標 | MVP期間 | 主リスク |
|---|---------|------|------------|--------|---------|
| 1 | [idea-01-dbt-doc-generator.md](./idea-01-dbt-doc-generator.md) | dbt Documentation Auto-Generator | $8K–$15K | 2週間 | dbt Labs が同機能を内製 |
| 2 | [idea-02-incident-postmortem-generator.md](./idea-02-incident-postmortem-generator.md) | AI Incident Post-Mortem Generator | $8K | 3–4週間 | PagerDuty OAuth 承認待ち |
| 3 | [idea-03-aws-cost-explainer.md](./idea-03-aws-cost-explainer.md) | AWS Cost Anomaly Explainer | $15K | 2–3週間 | IAM認証の信頼性 |

## 選出根拠

### 3エージェント共通シグナル

| エージェント | #1推奨 | 理由 |
|-----------|--------|------|
| Strategy Agent | dbt PR Reviewer Bot (25pt) | dbtコミュニティの規模と技術適合性 |
| Market Agent | dbt Automation Tools (8.2/10) | 3万社の市場、競合の価格帯ギャップ |
| Product Agent | dbt Doc Generator | 2週間MVP、セキュリティリスク最小 |

### 推奨ビルド順序

```
Week 1-2  : MVP構築 (dbt Doc Generator)
Week 3-4  : ローンチ (dbt Slack + Product Hunt)
Month 2-3 : AWS Cost Explainer 並行開発
Month 3-4 : Post-Mortem Generator (PagerDuty承認待ち期間を活用)
```

## 次のステップ (Phase 4-6)

- [ ] Phase 4: #1アイデアの詳細MVP設計
- [ ] Phase 5: リポジトリ構造・Issue breakdown
- [ ] Phase 6: コードスキャフォールディング生成
