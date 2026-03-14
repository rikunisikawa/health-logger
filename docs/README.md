# ドキュメント一覧

## プロジェクト概要

健康状態（疲労感・気分・やる気）を毎日記録する PWA。
フルサーバーレス AWS 構成。個人利用（prod 環境のみ）。

---

## ドキュメント一覧

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
| `claude-code-usage.md` | Claude Code の使い方・Agent Teams の起動方法 | 開発者（AI コーディング） |
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
→ `docs/claude-code-usage.md` の「ローカル確認方法」を参照。  
Cognito callback URL に localhost を追加する設定変更が必要。

### Q: データが消えた場合の対応は？
→ 現状 S3 Iceberg のバックアップ未設定。`non-functional-requirements.md` のバックアップセクション参照。

### Q: コストが急増した場合は？
→ AWS Cost Explorer で原因サービスを特定。`cost-management.md` のリスクシナリオを参照。

### Q: 新しい記録項目を追加したい場合は？
→ Iceberg スキーマ変更が必要。`data-lineage.md` のスキーマ変更手順と CLAUDE.md の「Iceberg スキーマ変更の注意事項」を参照。
