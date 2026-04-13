import json
import os
import re
import time

import boto3

athena = boto3.client("athena")
dynamo = boto3.client("dynamodb")

DATABASE = os.environ["ATHENA_DATABASE"]
OUTPUT_BUCKET = os.environ["ATHENA_OUTPUT_BUCKET"]
CACHE_TABLE = os.environ["SUMMARY_CACHE_TABLE"]

# DynamoDB cache TTL: 30 minutes
_CACHE_TTL_SECONDS = 1800

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)

_MAX_DAYS = 365


def lambda_handler(event, context):
    # Extract user_id from Cognito JWT
    try:
        user_id = event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
    except (KeyError, TypeError):
        return _json(401, {"error": "Unauthorized"})

    if not _UUID_RE.match(user_id):
        return _json(401, {"error": "Invalid user ID"})

    # Parse days param
    params = event.get("queryStringParameters") or {}
    try:
        days = int(params.get("days", 7))
    except (ValueError, TypeError):
        return _json(400, {"error": "Invalid days parameter"})

    if days < 1 or days > _MAX_DAYS:
        return _json(400, {"error": f"days must be between 1 and {_MAX_DAYS}"})

    # Check DynamoDB cache
    cache_key = f"{user_id}#{days}"
    cached = _get_cache(cache_key)
    if cached is not None:
        return _json(200, cached)

    # Build Athena query — use DATE(recorded_at) NOT dt partition column
    query = f"""
        SELECT
            DATE(recorded_at) AS date,
            AVG(CAST(fatigue_score AS DOUBLE)) AS fatigue_avg,
            MAX(fatigue_score) AS fatigue_max,
            MIN(fatigue_score) AS fatigue_min,
            AVG(CAST(mood_score AS DOUBLE)) AS mood_avg,
            MAX(mood_score) AS mood_max,
            MIN(mood_score) AS mood_min,
            AVG(CAST(motivation_score AS DOUBLE)) AS motivation_avg,
            MAX(motivation_score) AS motivation_max,
            MIN(motivation_score) AS motivation_min,
            COUNT(*) AS record_count
        FROM health_records
        WHERE user_id = '{user_id}'
          AND DATE(recorded_at) >= CURRENT_DATE - INTERVAL '{days}' DAY
        GROUP BY DATE(recorded_at)
        ORDER BY date ASC
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

    summary = []
    if len(rows) > 1:
        headers = [col["VarCharValue"] for col in rows[0]["Data"]]
        for row in rows[1:]:
            raw = {headers[i]: col.get("VarCharValue", "") for i, col in enumerate(row["Data"])}
            summary.append(_parse_row(raw))

    body = {"days": days, "summary": summary}

    # Store in DynamoDB cache
    _put_cache(cache_key, body)

    return _json(200, body)


def _parse_row(raw: dict) -> dict:
    """Convert Athena string values to appropriate numeric types."""
    def _float(v: str):
        try:
            return round(float(v), 2) if v else None
        except ValueError:
            return None

    def _int(v: str):
        try:
            return int(v) if v else None
        except ValueError:
            return None

    return {
        "date": raw.get("date", ""),
        "fatigue_avg": _float(raw.get("fatigue_avg", "")),
        "fatigue_max": _int(raw.get("fatigue_max", "")),
        "fatigue_min": _int(raw.get("fatigue_min", "")),
        "mood_avg": _float(raw.get("mood_avg", "")),
        "mood_max": _int(raw.get("mood_max", "")),
        "mood_min": _int(raw.get("mood_min", "")),
        "motivation_avg": _float(raw.get("motivation_avg", "")),
        "motivation_max": _int(raw.get("motivation_max", "")),
        "motivation_min": _int(raw.get("motivation_min", "")),
        "record_count": _int(raw.get("record_count", "")),
    }


def _get_cache(cache_key: str):
    """Return cached payload dict or None on miss."""
    try:
        resp = dynamo.get_item(
            TableName=CACHE_TABLE,
            Key={"cache_key": {"S": cache_key}},
        )
        item = resp.get("Item")
        if item:
            return json.loads(item["payload"]["S"])
    except Exception:
        pass
    return None


def _put_cache(cache_key: str, payload: dict) -> None:
    """Write payload to DynamoDB with TTL."""
    try:
        expires_at = int(time.time()) + _CACHE_TTL_SECONDS
        dynamo.put_item(
            TableName=CACHE_TABLE,
            Item={
                "cache_key": {"S": cache_key},
                "payload": {"S": json.dumps(payload)},
                "expires_at": {"N": str(expires_at)},
            },
        )
    except Exception:
        pass  # Cache write failure is non-fatal


def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
