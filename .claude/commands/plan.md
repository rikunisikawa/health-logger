---
description: 要件確認・影響範囲洗い出し・実装計画を作成。ユーザーの CONFIRM を受けるまでコード変更を行わない。
---

# /plan — 実装計画コマンド

## 実行手順

### 1. 要件の復唱
受け取ったタスクを自分の言葉で具体的に復唱する。
曖昧な点は質問してから先に進む。

### 2. 影響範囲の特定
以下のカテゴリ別に変更対象を列挙する:

| カテゴリ | 変更対象ファイル / リソース |
|---------|--------------------------|
| Lambda | `lambda/<fn>/handler.py`, `models.py`, `test_handler.py` |
| Frontend | `frontend/src/` 以下のコンポーネント・フック・API クライアント |
| Terraform | `terraform/envs/prod/main.tf`, 関連モジュール |
| dbt | `data/dbt/models/` 以下のモデル・スキーマ |
| Glue/Athena | スキーマ変更時は `ALTER TABLE` DDL が別途必要 |

### 3. リスク確認
- Terraform 変更が必要か？（必要なら `terraform plan` 確認ステップを明示）
- Iceberg スキーマ変更か？（必要なら Athena ALTER TABLE を明示）
- FLAGS ビットマスク変更か？（Lambda・Frontend・dbt 全レイヤー影響）
- シークレット・CORS・認証の変更か？

### 4. 実装フェーズの分解

**フェーズ 1: テスト（Red）**
- [ ] 失敗テストを先に書く

**フェーズ 2: 実装（Green）**
- [ ] 最小実装でテストを通す

**フェーズ 3: インフラ（Terraform）**
- [ ] `terraform plan` 確認（apply はユーザー実行）

**フェーズ 4: フロントエンド**
- [ ] TypeScript 型チェック通過確認

### 5. 確認待ち

> **⚠️ この計画でよければ「OK」または「LGTM」と返信してください。**
> **確認を受けるまで、いかなるファイル変更も行いません。**
