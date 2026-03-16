#!/usr/bin/env python3
"""
Athena スキーママイグレーションスクリプト

migrations/athena/*.sql を昇順に読み込み、未適用のものを Athena で実行する。
適用済みマイグレーションは DynamoDB テーブルで管理する（冪等性あり）。

環境変数:
  ATHENA_DATABASE          - Athena データベース名
  ATHENA_OUTPUT_BUCKET     - Athena クエリ結果の S3 バケット名
  MIGRATION_TRACKING_TABLE - DynamoDB テーブル名（マイグレーション追跡用）
  AWS_REGION               - AWS リージョン（デフォルト: ap-northeast-1）
"""

import os
import sys
import time
from pathlib import Path

import boto3

AWS_REGION = os.environ.get("AWS_REGION", "ap-northeast-1")
ATHENA_DATABASE = os.environ["ATHENA_DATABASE"]
ATHENA_OUTPUT_BUCKET = os.environ["ATHENA_OUTPUT_BUCKET"]
MIGRATION_TRACKING_TABLE = os.environ["MIGRATION_TRACKING_TABLE"]

athena = boto3.client("athena", region_name=AWS_REGION)
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
table = dynamodb.Table(MIGRATION_TRACKING_TABLE)

MIGRATIONS_DIR = Path(__file__).parent.parent / "migrations" / "athena"


def get_applied_migrations() -> set[str]:
    response = table.scan(ProjectionExpression="migration_name")
    return {item["migration_name"] for item in response.get("Items", [])}


def mark_applied(migration_name: str) -> None:
    table.put_item(Item={
        "migration_name": migration_name,
        "applied_at": int(time.time()),
    })


def run_query(sql: str) -> None:
    response = athena.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": ATHENA_DATABASE},
        ResultConfiguration={
            "OutputLocation": f"s3://{ATHENA_OUTPUT_BUCKET}/athena-migrations/"
        },
    )
    execution_id = response["QueryExecutionId"]

    for _ in range(40):
        time.sleep(0.5)
        status = athena.get_query_execution(QueryExecutionId=execution_id)
        state = status["QueryExecution"]["Status"]["State"]
        if state == "SUCCEEDED":
            return
        if state in ("FAILED", "CANCELLED"):
            reason = status["QueryExecution"]["Status"].get("StateChangeReason", "")
            raise RuntimeError(f"Query {state}: {reason}")

    raise TimeoutError(f"Query timed out after 20s (execution_id={execution_id})")


def main() -> None:
    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migration_files:
        print("No migration files found.")
        return

    applied = get_applied_migrations()
    pending = [f for f in migration_files if f.stem not in applied]

    if not pending:
        print(f"All {len(migration_files)} migration(s) already applied.")
        return

    print(f"Applying {len(pending)} pending migration(s)...")

    for migration_file in pending:
        name = migration_file.stem
        sql = migration_file.read_text().strip()
        # コメント行を除いた実行用 SQL
        statements = [
            line for line in sql.splitlines()
            if line.strip() and not line.strip().startswith("--")
        ]
        sql_to_run = "\n".join(statements)

        print(f"  Running: {name}")
        try:
            run_query(sql_to_run)
            mark_applied(name)
            print(f"  ✓ Applied: {name}")
        except RuntimeError as e:
            if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                # カラムが既に存在する場合はスキップして適用済みとしてマーク
                print(f"  ⚠ Already applied (column exists): {name}")
                mark_applied(name)
            else:
                print(f"  ✗ Failed: {name} — {e}", file=sys.stderr)
                sys.exit(1)

    print("Migration complete.")


if __name__ == "__main__":
    main()
