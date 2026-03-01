import json
import os
import re
import time

import boto3

athena = boto3.client("athena")

DATABASE     = os.environ["ATHENA_DATABASE"]
OUTPUT_BUCKET = os.environ["ATHENA_OUTPUT_BUCKET"]

# Cognito sub is a UUID; validate to prevent SQL injection
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)


def lambda_handler(event, context):
    # Health check (no auth required)
    if event.get("rawPath") == "/health":
        return _json(200, {"status": "ok"})

    # Extract user_id from Cognito JWT
    try:
        user_id = event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
    except (KeyError, TypeError):
        return _json(401, {"error": "Unauthorized"})

    if not _UUID_RE.match(user_id):
        return _json(401, {"error": "Invalid user ID"})

    # Parse query params
    params = event.get("queryStringParameters") or {}
    try:
        limit = min(int(params.get("limit", 10)), 100)
    except (ValueError, TypeError):
        limit = 10

    query = f"""
        SELECT id, fatigue_score, mood_score, motivation_score, flags, note,
               recorded_at, timezone, device_id, app_version, written_at, dt
        FROM health_records
        WHERE user_id = '{user_id}'
        ORDER BY recorded_at DESC
        LIMIT {limit}
    """

    # Start Athena query
    response = athena.start_query_execution(
        QueryString=query,
        QueryExecutionContext={"Database": DATABASE},
        ResultConfiguration={
            "OutputLocation": f"s3://{OUTPUT_BUCKET}/athena-results/"
        },
    )
    execution_id = response["QueryExecutionId"]

    # Poll for completion (up to 10 seconds)
    for _ in range(20):
        time.sleep(0.5)
        status = athena.get_query_execution(QueryExecutionId=execution_id)
        state = status["QueryExecution"]["Status"]["State"]
        if state == "SUCCEEDED":
            break
        if state in ("FAILED", "CANCELLED"):
            return _json(500, {"error": "Query failed", "state": state})
    else:
        return _json(504, {"error": "Query timeout"})

    # Fetch results
    results = athena.get_query_results(QueryExecutionId=execution_id)
    rows = results["ResultSet"]["Rows"]

    if not rows:
        return _json(200, {"records": []})

    headers = [col["VarCharValue"] for col in rows[0]["Data"]]
    records = [
        {headers[i]: col.get("VarCharValue", "") for i, col in enumerate(row["Data"])}
        for row in rows[1:]
    ]

    return _json(200, {"records": records})


def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
