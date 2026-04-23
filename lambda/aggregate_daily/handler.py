"""
aggregate_daily — 日次バッチ集計 Lambda

EventBridge Scheduler から毎日 AM 2:00 JST (17:00 UTC 前日) に呼び出される。
前日の health_records を Athena で集計し、DynamoDB に保存する。
"""
import json
import os
import time
from datetime import date, timedelta

import boto3

athena = boto3.client("athena")
dynamodb = boto3.resource("dynamodb")

DATABASE = os.environ["ATHENA_DATABASE"]
OUTPUT_BUCKET = os.environ["ATHENA_OUTPUT_BUCKET"]
DAILY_SUMMARIES_TABLE = os.environ["DAILY_SUMMARIES_TABLE"]


def lambda_handler(event, context):
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    query = f"""
        SELECT
            user_id,
            CAST(AVG(fatigue_score) AS VARCHAR) AS avg_fatigue,
            CAST(MAX(fatigue_score) AS VARCHAR) AS max_fatigue,
            CAST(MIN(fatigue_score) AS VARCHAR) AS min_fatigue,
            CAST(AVG(mood_score) AS VARCHAR) AS avg_mood,
            CAST(MAX(mood_score) AS VARCHAR) AS max_mood,
            CAST(MIN(mood_score) AS VARCHAR) AS min_mood,
            CAST(AVG(motivation_score) AS VARCHAR) AS avg_motivation,
            CAST(MAX(motivation_score) AS VARCHAR) AS max_motivation,
            CAST(MIN(motivation_score) AS VARCHAR) AS min_motivation,
            CAST(COUNT(*) AS VARCHAR) AS record_count
        FROM health_records
        WHERE dt = '{yesterday}'
          AND record_type = 'daily'
        GROUP BY user_id
    """

    response = athena.start_query_execution(
        QueryString=query,
        QueryExecutionContext={"Database": DATABASE},
        ResultConfiguration={
            "OutputLocation": f"s3://{OUTPUT_BUCKET}/athena-results/"
        },
    )
    execution_id = response["QueryExecutionId"]

    # Poll for completion (up to 30 seconds)
    for _ in range(60):
        time.sleep(0.5)
        status = athena.get_query_execution(QueryExecutionId=execution_id)
        state = status["QueryExecution"]["Status"]["State"]
        if state == "SUCCEEDED":
            break
        if state in ("FAILED", "CANCELLED"):
            return _json(500, {"error": "Query failed", "state": state})
    else:
        return _json(504, {"error": "Query timeout"})

    results = athena.get_query_results(QueryExecutionId=execution_id)
    rows = results["ResultSet"]["Rows"]

    if len(rows) <= 1:
        # header only → no data
        return _json(200, {"message": "No data for yesterday", "saved_count": 0, "date": yesterday})

    headers = [col["VarCharValue"] for col in rows[0]["Data"]]
    table = dynamodb.Table(DAILY_SUMMARIES_TABLE)
    saved_count = 0

    for row in rows[1:]:
        item = {headers[i]: col.get("VarCharValue", "") for i, col in enumerate(row["Data"])}
        table.put_item(Item={
            "user_id": item["user_id"],
            "date": yesterday,
            "avg_fatigue": item.get("avg_fatigue", ""),
            "max_fatigue": item.get("max_fatigue", ""),
            "min_fatigue": item.get("min_fatigue", ""),
            "avg_mood": item.get("avg_mood", ""),
            "max_mood": item.get("max_mood", ""),
            "min_mood": item.get("min_mood", ""),
            "avg_motivation": item.get("avg_motivation", ""),
            "max_motivation": item.get("max_motivation", ""),
            "min_motivation": item.get("min_motivation", ""),
            "record_count": item.get("record_count", "0"),
        })
        saved_count += 1

    return _json(200, {"message": "Aggregation complete", "saved_count": saved_count, "date": yesterday})


def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
