# Athena スキーママイグレーション

## 仕組み

`migrations/athena/NNN_description.sql` ファイルを追加するだけで、
次回 `terraform apply` 時（main ブランチへの push 後）に自動で Athena DDL が実行される。

実行状況は DynamoDB テーブル `health-logger-prod-athena-migrations` で管理される。
適用済みのマイグレーションは再実行されない（冪等性あり）。

## 新規カラム追加の手順

1. `NNN_description.sql` ファイルを追加（NNN は 3 桁の連番）
2. `terraform/modules/glue/main.tf` の `storage_descriptor.columns` に同じカラムを追加
3. dbt の staging モデルに同じカラムを追加（該当する場合）
4. PR を作成して main にマージ → terraform.yml が自動で apply + migrate

## ファイル命名規則

```
001_add_concentration_score.sql
002_add_some_new_column.sql
003_add_another_column.sql
```

## 手動実行

CI を経由せず手動で適用する場合:

```bash
ATHENA_DATABASE=health_logger_prod_health_logs \
ATHENA_OUTPUT_BUCKET=health-logger-prod \
MIGRATION_TRACKING_TABLE=health-logger-prod-athena-migrations \
python3 scripts/athena-migrate.py
```
