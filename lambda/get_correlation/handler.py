import json
import math
import os
import re
import time

import boto3

athena = boto3.client("athena")

DATABASE = os.environ["ATHENA_DATABASE"]
OUTPUT_BUCKET = os.environ["ATHENA_OUTPUT_BUCKET"]

# Cognito sub is a UUID; validate to prevent SQL injection
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)

# Items included in the correlation matrix
ITEMS = [
    "fatigue",
    "mood",
    "motivation",
    "poor_sleep",
    "headache",
    "stomachache",
    "exercise",
    "alcohol",
    "caffeine",
]

# Minimum sample count to report a correlation (fewer → None)
MIN_SAMPLES = 7

# Flags bitmask values
_FLAG_BITS = {
    "poor_sleep": 1,
    "headache": 2,
    "stomachache": 4,
    "exercise": 8,
    "alcohol": 16,
    "caffeine": 32,
}


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
        days = int(params.get("days", 30))
    except (ValueError, TypeError):
        return _json(400, {"error": "Invalid days parameter"})

    if days < 1 or days > 365:
        return _json(400, {"error": "days must be between 1 and 365"})

    query = f"""
        SELECT fatigue_score, mood_score, motivation_score, flags
        FROM health_records
        WHERE user_id = '{user_id}'
          AND record_type = 'daily'
          AND DATE(recorded_at) >= CURRENT_DATE - INTERVAL '{days}' DAY
          AND fatigue_score IS NOT NULL
          AND mood_score IS NOT NULL
          AND motivation_score IS NOT NULL
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

    if not rows or len(rows) < 2:
        return _json(200, _empty_response())

    headers = [col["VarCharValue"] for col in rows[0]["Data"]]

    # Build data vectors for each item
    vectors: dict[str, list[float]] = {item: [] for item in ITEMS}

    for row in rows[1:]:
        cells = {headers[i]: col.get("VarCharValue", "") for i, col in enumerate(row["Data"])}

        fatigue = _to_float(cells.get("fatigue_score"))
        mood = _to_float(cells.get("mood_score"))
        motivation = _to_float(cells.get("motivation_score"))
        flags = _to_int(cells.get("flags"))

        if fatigue is None or mood is None or motivation is None or flags is None:
            continue

        vectors["fatigue"].append(fatigue)
        vectors["mood"].append(mood)
        vectors["motivation"].append(motivation)

        for flag_name, bit in _FLAG_BITS.items():
            vectors[flag_name].append(1.0 if (flags & bit) != 0 else 0.0)

    # Compute pairwise Pearson correlation
    n = len(vectors["fatigue"])
    matrix: dict[str, dict[str, float | None]] = {}
    sample_counts: dict[str, int] = {}

    for a in ITEMS:
        matrix[a] = {}
        for b in ITEMS:
            if a == b:
                matrix[a][b] = 1.0
                continue

            xs = vectors[a]
            ys = vectors[b]
            pair_n = len(xs)

            key = f"{a}-{b}"
            sample_counts[key] = pair_n

            if pair_n < MIN_SAMPLES:
                matrix[a][b] = None
                continue

            corr = _pearson(xs, ys)
            matrix[a][b] = corr

    return _json(200, {
        "items": ITEMS,
        "matrix": matrix,
        "sample_counts": sample_counts,
    })


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 2:
        return None

    mean_x = sum(xs) / n
    mean_y = sum(ys) / n

    ss_xx = sum((x - mean_x) ** 2 for x in xs)
    ss_yy = sum((y - mean_y) ** 2 for y in ys)
    ss_xy = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))

    if ss_xx == 0 or ss_yy == 0:
        return None

    r = ss_xy / math.sqrt(ss_xx * ss_yy)
    # Clamp to [-1, 1] to handle floating-point drift
    return max(-1.0, min(1.0, r))


def _to_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _to_int(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _empty_response() -> dict:
    matrix = {a: {b: None for b in ITEMS} for a in ITEMS}
    for item in ITEMS:
        matrix[item][item] = 1.0
    return {
        "items": ITEMS,
        "matrix": matrix,
        "sample_counts": {},
    }


def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
