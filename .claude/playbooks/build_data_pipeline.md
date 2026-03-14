---
playbook: build_data_pipeline
goal: 新しいデータパイプライン（外部データ取り込み → Firehose → Iceberg → Athena）を構築する
agents_used: [architecture, data_engineering, lambda, devops, testing, analysis, project_management]
skills_used: [data_pipeline, aws_boto3, python_lambda, terraform_iac, git_workflow]
---

## Goal

外部データソース（API 等）から取り込んだデータを
Firehose → S3 Tables (Iceberg) → Glue → Athena で分析できる状態にする。

## Workflow

```
Step 1  [project_management]
  └── gh issue create
      git switch -c feature/<番号>-<pipeline-name>

Step 2  [architecture]
  └── パイプライン設計
      - データソース（URL・認証・取得頻度）
      - スキーマ設計（Iceberg テーブル定義）
      - Firehose ストリーム設定（バッファ）
      - Lambda トリガー（EventBridge スケジュール等）

Step 3  [devops] ← terraform_iac skill
  ├── modules/s3tables/ に新テーブル追加
  ├── modules/glue/ にテーブル定義追加
  ├── modules/firehose/ に新ストリーム追加
  ├── terraform plan → ユーザー確認 → apply
  └── Athena DDL 実行（Iceberg メタデータ同期）

Step 4  [lambda] ← python_lambda + aws_boto3 skill
  ├── lambda/<name>/ ディレクトリ作成
  ├── 外部 API クライアント実装（services/ または clients/）
  ├── models.py（Pydantic v2 でデータモデル定義）
  ├── handler.py（取得 → 変換 → Firehose 送信）
  └── test_handler.py（モック or サンプルデータでテスト）

Step 5  [testing]
  └── pytest lambda/<name>/ -v → PASSED
      pytest lambda/ -v → 全体 PASSED

Step 6  [data_engineering] ← data_pipeline skill
  └── Athena でデータ品質チェッククエリ実行
      - レコード数・日付範囲・異常値確認

Step 7  [analysis]
  └── 取り込まれたデータの確認クエリ実行
      - サンプルデータ・統計量の確認

Step 8  [project_management]
  └── PR 作成 → CI 確認 → squash merge
```

## Iceberg スキーマ変更の注意事項

```
⚠️ terraform apply だけでは Iceberg メタデータは更新されない！

terraform apply
  ↓
Athena DDL: ALTER TABLE xxx ADD COLUMNS (...)
  ↓
Athena テストクエリで確認
```

## Checklist

```
設計
  [ ] データソース仕様確認（URL・認証・レートリミット）
  [ ] Iceberg テーブルスキーマ決定
  [ ] パーティション戦略決定（recorded_at 日次を基本）

インフラ（Terraform）
  [ ] S3 Tables テーブル追加
  [ ] Glue カタログテーブル定義
  [ ] Firehose ストリーム追加
  [ ] EventBridge スケジュール（定期実行の場合）
  [ ] terraform plan 確認・apply 承認済み
  [ ] Athena DDL 実行済み

Lambda
  [ ] 外部 API クライアント実装
  [ ] Pydantic v2 モデル定義
  [ ] Firehose への JSON Lines 送信（末尾 \n）
  [ ] テスト（pytest PASSED）

データ確認
  [ ] Athena でサンプルデータ確認済み
  [ ] データ品質チェッククエリ実行済み
```

## Expected Output

- `lambda/<name>/` ディレクトリ（handler.py / models.py / test_handler.py）
- Terraform リソース（Firehose ストリーム + Glue テーブル）
- Athena でデータが参照できる状態
- データ品質確認済みのクエリ結果レポート
- マージ済み PR
