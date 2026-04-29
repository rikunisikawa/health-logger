# ドキュメント一覧

## プロジェクト概要

健康状態（疲労感・気分・やる気）を毎日記録する PWA。
フルサーバーレス AWS 構成。個人利用（prod 環境のみ）。

---

## ドキュメント一覧

### プロダクト戦略

| ファイル | 内容 | 主な読者 |
|---------|------|---------|
| `product/vision.md` | プロダクトビジョン・ロードマップ・KPI・技術的方向性 | プロジェクトオーナー |
| `product/push-notification.md` | プッシュ通知機能の設計 | 開発者 |

---

### 業務・システム理解向け

| ファイル | 内容 | 主な読者 |
|---------|------|---------|
| `security.md` | 認証・認可・暗号化・入力検証・シークレット管理 | プロジェクトオーナー・業務担当者 |
| `data-lineage.md` | データの発生源・変換・保存・削除の全フロー | プロジェクトオーナー・業務担当者 |
| `non-functional-requirements.md` | パフォーマンス・可用性・監視・バックアップ要件 | プロジェクトオーナー・業務担当者 |
| `cost-management.md` | AWS コスト構造・監視・最適化・スケール試算 | プロジェクトオーナー |

### 開発・運用向け

| ファイル | 内容 | 主な読者 |
|---------|------|---------|
| `API_REFERENCE.md` | 全 API エンドポイント仕様（8 エンドポイント） | 開発者 |
| `DATABASE_SCHEMA.md` | S3 Tables (Iceberg) / DynamoDB のスキーマ定義 | 開発者・データエンジニア |
| `DEPLOYMENT_GUIDE.md` | 初回デプロイ・継続的デプロイ・ロールバック手順 | 開発者・運用担当者 |
| `LAMBDA_DEVELOPMENT.md` | Lambda の実装パターン・テスト・新規追加手順 | 開発者 |
| `FRONTEND_DEVELOPMENT.md` | React/TS 開発・Amplify Auth・PWA 構成 | 開発者 |
| `DBT_OPERATIONS.md` | dbt 実行方法・モデル構成・スキーマ変更手順 | 開発者・データエンジニア |
| `TROUBLESHOOTING.md` | よくあるエラーと対処集 | 開発者・運用担当者 |
| `claude-code-usage.md` | Claude Code の使い方・Agent Teams・worktree・並列実行 | 開発者（AI コーディング） |
| `claude-code-setup.md` | Claude Code の設定構成・agents/skills/hooks の設計方針（Mermaid 全体図あり） | 開発者（AI コーディング） |
| `claude-code-system.drawio` | Claude Code 自動開発システム全体図（Draw.io・リンク付き） | 開発者（AI コーディング） |
| `dev-cycle.md` | 自動開発サイクルの構成・実行方法・cron 設定・タスク管理 | 開発者（AI コーディング） |
| `auto-implement.md` | GitHub Issue ベースの自動実装システム（cron + Claude）| 開発者（AI コーディング） |
| `cron.md` | cron 登録済みジョブ一覧・起動確認・ログ確認手順 | 開発者（AI コーディング） |
| `github-tokens.md` | GitHub トークンの管理方法 | 開発者 |
| `infrastructure.drawio` | インフラ構成図（draw.io 形式） | 開発者・アーキテクト |

---

## Agent Teams / Skills のカバー範囲と不足

### 現在の Agent Teams（`.claude/agents/`）

| エージェント | カバー範囲 | 業務視点の不足 |
|------------|----------|--------------|
| `frontend` | React/TS 実装 | — |
| `lambda` | Python Lambda 実装 | — |
| `devops` | Terraform・CI/CD | — |
| `data_engineering` | Firehose/Iceberg/Athena | — |
| `testing` | pytest・型チェック・セキュリティレビュー | 業務向けの説明なし |
| `architecture` | 設計判断・コスト試算 | 断片的 |
| `analysis` | Athena クエリ・データ分析 | — |
| `documentation` | ドキュメント作成 | — |
| `project_management` | Issue・PR 管理 | — |
| `orchestrator` | タスク分解・エージェント調整 | — |

### Agent Teams への追加推奨視点

以下の視点は現状の Skills/Agents に体系的な記載がないため、
AI コーディング時も意識して指示する必要がある:

#### 1. セキュリティレビュー視点
```
現状: testing.md に断片的に記載
不足: 業務視点での説明・GDPR/個人情報保護法との関係
対応: docs/security.md を参照して設計・実装の判断基準にする
```

#### 2. データリネージ視点
```
現状: 記載なし
不足: データの追跡・品質管理・スキーマ変更影響の体系的な管理
対応: docs/data-lineage.md を参照。スキーマ変更時は必ずリネージへの影響を確認する
```

#### 3. 非機能要件の維持
```
現状: 各 agent に断片的に記載
不足: パフォーマンス・可用性・監視の継続的な確認
対応: 新機能追加時は non-functional-requirements.md の各項目に影響がないか確認する
```

#### 4. コスト影響評価
```
現状: architecture.md に1行のみ
不足: 変更がコストに与える影響の定量的評価
対応: Athena クエリ・Lambda 実行数・S3 書き込みが増える変更時は cost-management.md を参照
```

#### 5. 監視・運用の整備
```
現状: CloudWatch のアラート未設定
不足: エラー検知・異常通知の仕組み
対応: CloudWatch Alarm の設定（non-functional-requirements.md 参照）
```

---

## よくある質問（FAQ）

### Q: ローカルで動作確認できる？
→ `FRONTEND_DEVELOPMENT.md` の「ローカルでの Cognito 設定」を参照。
Cognito callback URL に localhost を追加する設定変更が必要。

### Q: API の仕様を確認したい
→ `API_REFERENCE.md` を参照。リクエスト・レスポンスの JSON スキーマがまとまっている。

### Q: Lambda を新しく追加したい
→ `LAMBDA_DEVELOPMENT.md` の「新規 Lambda 関数の追加手順」を参照。

### Q: 本番デプロイの手順を確認したい
→ `DEPLOYMENT_GUIDE.md` を参照。初回デプロイから Amplify 接続まで手順が記載されている。

### Q: データが消えた場合の対応は？
→ 現状 S3 Iceberg のバックアップ未設定。`non-functional-requirements.md` のバックアップセクション参照。

### Q: コストが急増した場合は？
→ AWS Cost Explorer で原因サービスを特定。`cost-management.md` のリスクシナリオを参照。

### Q: 新しい記録項目を追加したい場合は？
→ Iceberg スキーマ変更が必要。`DATABASE_SCHEMA.md` の「Iceberg スキーマ変更の注意事項」と
`DEPLOYMENT_GUIDE.md` の「Iceberg スキーマ変更後の ALTER TABLE 手順」を参照。

### Q: エラーが発生した場合は？
→ `TROUBLESHOOTING.md` を参照。COLUMN_NOT_FOUND・クエリタイムアウト・認証ループなどの
対処法がまとまっている。

### Q: dbt を実行したい
→ `DBT_OPERATIONS.md` を参照。Docker Compose での実行方法とコマンドリファレンスが記載されている。
