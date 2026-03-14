---
name: data-pipeline
description: Firehose → S3 Tables (Iceberg) → Glue → Athena データパイプラインのパターン集。Iceberg スキーマ変更手順・Athena DDL・Firehose JSON Lines フォーマットを含む。データパイプラインの設計・変更・スキーマ更新をするときに自動適用する。
user-invocable: false
---

## Purpose

health-logger のサーバーレスデータパイプラインを設計・管理するためのパターン集。
Iceberg スキーマ管理の落とし穴を含む実践的なガイド。

## Responsibilities

- Firehose ストリームへのデータ送信フォーマット
- Iceberg テーブルスキーマ設計
- Glue Catalog との同期
- Athena DDL によるスキーマ更新
- データ品質チェッククエリ

## Pipeline Overview

```
Lambda (JSON Lines)
  ↓  put_record(Data="{...}\n")
Kinesis Firehose
  ↓  バッファ: 5MB または 300秒
S3 Tables (Apache Iceberg)
  ↓  Glue Catalog でメタデータ管理
Athena (SQL クエリ)
  ↓  結果 CSV
S3 (athena-results/)
```

## Iceberg テーブルスキーマ設計

### health_records テーブル

```hcl
# terraform/modules/glue/main.tf
resource "aws_glue_catalog_table" "health_records" {
  name          = "health_records"
  database_name = aws_glue_catalog_database.this.name

  table_type = "EXTERNAL_TABLE"
  parameters = {
    "table_type"       = "ICEBERG"
    "metadata_location" = "s3tables://${var.table_bucket_arn}/..."
  }

  storage_descriptor {
    columns {
      name = "user_id";      type = "string"
    }
    columns {
      name = "recorded_at";  type = "timestamp"
    }
    columns {
      name = "fatigue";      type = "int"
    }
    columns {
      name = "mood";         type = "int"
    }
    columns {
      name = "motivation";   type = "int"
    }
    columns {
      name = "flags";        type = "int"
    }
  }
}
```

## Iceberg スキーマ変更手順

⚠️ **重要**: `terraform apply` だけでは Iceberg メタデータは更新されない。
Glue Catalog を更新した後、必ず Athena DDL を実行すること。

```bash
# 1. Terraform でスキーマ変更を apply（ユーザー確認後）

# 2. Athena DDL でカラム追加
QUERY="ALTER TABLE health_records ADD COLUMNS (new_col string)"

QUERY_ID=$(aws athena start-query-execution \
  --query-string "$QUERY" \
  --query-execution-context Database=health_logger_prod_health_logs \
  --result-configuration OutputLocation=s3://health-logger-prod/athena-results/ \
  --region ap-northeast-1 \
  --query 'QueryExecutionId' --output text)

# 3. 実行確認
aws athena get-query-execution \
  --query-execution-id "$QUERY_ID" \
  --region ap-northeast-1 \
  --query 'QueryExecution.Status.State'

# 4. テストクエリ
aws athena start-query-execution \
  --query-string "SELECT new_col FROM health_records LIMIT 1" \
  --query-execution-context Database=health_logger_prod_health_logs \
  --result-configuration OutputLocation=s3://health-logger-prod/athena-results/ \
  --region ap-northeast-1
```

## Athena クエリ最適化

```sql
-- NG: フルスキャン
SELECT * FROM health_records;

-- OK: パーティション絞り込み
SELECT user_id, recorded_at, fatigue, mood, motivation
FROM health_records
WHERE user_id = 'xxx'
  AND recorded_at >= current_date - INTERVAL '30' DAY
ORDER BY recorded_at DESC
LIMIT 100;
```

## Firehose JSON Lines フォーマット

```python
# 必ず末尾に "\n" を付ける（Firehose の要件）
record = json.dumps({
    "user_id":     user_id,
    "recorded_at": datetime.now(timezone.utc).isoformat(),
    "fatigue":     5,
    "mood":        7,
    "motivation":  6,
    "flags":       9,
}, ensure_ascii=False) + "\n"

firehose.put_record(
    DeliveryStreamName=STREAM_NAME,
    Record={"Data": record.encode("utf-8")},
)
```

## Best Practices

- Iceberg スキーマ変更後は必ず Athena DDL も実行する（過去の失敗: PR #16）
- Athena SELECT は必要カラムのみ指定（`*` は使わない）
- WHERE 句に `recorded_at` の範囲を必ず入れる
- Firehose JSON Lines の末尾 `\n` を忘れない
- カラム削除・型変更は既存データへの影響を先に確認する

## Output Format

- スキーマ変更の内容（変更前 → 変更後）
- 実行した DDL / DML
- Athena クエリの実行結果サマリ
