import csv
import io
import json
import os
import re
import time
from datetime import datetime, timezone

import boto3

athena = boto3.client("athena")
s3 = boto3.client("s3")

DATABASE = os.environ["ATHENA_DATABASE"]
OUTPUT_BUCKET = os.environ["ATHENA_OUTPUT_BUCKET"]
EXPORT_BUCKET = os.environ["EXPORT_BUCKET"]

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_VALID_FORMATS = {"csv", "json"}

_EXPORT_COLUMNS = [
    "id", "record_type", "fatigue_score", "mood_score", "motivation_score",
    "concentration_score", "flags", "note", "recorded_at", "timezone",
    "device_id", "app_version", "custom_fields", "written_at",
]

# Presigned URL expiry: 1 hour
_PRESIGNED_EXPIRY = 3600


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

    fmt = params.get("format", "csv")
    if fmt not in _VALID_FORMATS:
        return _json(400, {"error": "Invalid format: must be 'csv' or 'json'"})

    date_from = params.get("date_from")
    if date_from is not None and not _DATE_RE.match(date_from):
        return _json(400, {"error": "Invalid date_from"})

    date_to = params.get("date_to")
    if date_to is not None and not _DATE_RE.match(date_to):
        return _json(400, {"error": "Invalid date_to"})

    # Build WHERE conditions
    conditions = [f"user_id = '{user_id}'"]
    if date_from:
        conditions.append(f"DATE(recorded_at) >= DATE '{date_from}'")
    if date_to:
        conditions.append(f"DATE(recorded_at) <= DATE '{date_to}'")

    where_clause = " AND ".join(conditions)
    columns = ", ".join(_EXPORT_COLUMNS)

    query = f"""
        SELECT {columns}
        FROM health_records
        WHERE {where_clause}
        ORDER BY recorded_at DESC
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

    # Poll for completion (up to 30 seconds for export)
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

    # Collect all result pages
    rows = []
    headers = None
    paginator_kwargs = {"QueryExecutionId": execution_id}

    page = athena.get_query_results(**paginator_kwargs)
    all_rows = page["ResultSet"]["Rows"]
    if all_rows:
        headers = [col["VarCharValue"] for col in all_rows[0]["Data"]]
        rows.extend(all_rows[1:])

    # Handle pagination
    next_token = page.get("NextToken")
    while next_token:
        page = athena.get_query_results(
            QueryExecutionId=execution_id, NextToken=next_token
        )
        rows.extend(page["ResultSet"]["Rows"])
        next_token = page.get("NextToken")

    if headers is None:
        headers = _EXPORT_COLUMNS

    records = [
        {headers[i]: col.get("VarCharValue", "") for i, col in enumerate(row["Data"])}
        for row in rows
    ]

    # Generate output
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if fmt == "csv":
        content = _build_csv(headers, records)
        content_type = "text/csv"
        filename = f"health-log-{today}.csv"
        s3_key = f"exports/{user_id}/{today}.csv"
    else:
        content = json.dumps({"records": records, "count": len(records)}, ensure_ascii=False)
        content_type = "application/json"
        filename = f"health-log-{today}.json"
        s3_key = f"exports/{user_id}/{today}.json"

    # Upload to S3
    s3.put_object(
        Bucket=EXPORT_BUCKET,
        Key=s3_key,
        Body=content.encode("utf-8"),
        ContentType=content_type,
    )

    # Generate presigned URL
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": EXPORT_BUCKET, "Key": s3_key},
        ExpiresIn=_PRESIGNED_EXPIRY,
    )

    return _json(200, {"url": url, "filename": filename, "count": len(records)})


def _build_csv(headers: list[str], records: list[dict]) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(records)
    return buf.getvalue()


def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
