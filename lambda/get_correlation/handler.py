import json
import math
import os
import re
import time

import boto3

athena = boto3.client("athena")

DATABASE = os.environ["ATHENA_DATABASE"]
OUTPUT_BUCKET = os.environ["ATHENA_OUTPUT_BUCKET"]

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)
_DAYS_RE = re.compile(r"^\d{1,4}$")

# Minimum number of data points required to compute correlation
MIN_SAMPLES = 7

# Items in the correlation matrix (order defines display order)
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

# Mapping from item name to Athena column expression
_ITEM_EXPR = {
    "fatigue":     "CAST(fatigue_score AS DOUBLE)",
    "mood":        "CAST(mood_score AS DOUBLE)",
    "motivation":  "CAST(motivation_score AS DOUBLE)",
    "poor_sleep":  "CAST(bitwise_and(flags, 1) AS DOUBLE)",
    "headache":    "CAST(bitwise_and(flags, 2) AS DOUBLE)",
    "stomachache": "CAST(bitwise_and(flags, 4) AS DOUBLE)",
    "exercise":    "CAST(bitwise_and(flags, 8) AS DOUBLE)",
    "alcohol":     "CAST(bitwise_and(flags, 16) AS DOUBLE)",
    "caffeine":    "CAST(bitwise_and(flags, 32) AS DOUBLE)",
}

# Column aliases returned from Athena (must match _HEADERS in tests)
_ITEM_ALIAS = {
    "fatigue":     "fatigue_score",
    "mood":        "mood_score",
    "motivation":  "motivation_score",
    "poor_sleep":  "poor_sleep",
    "headache":    "headache",
    "stomachache": "stomachache",
    "exercise":    "exercise",
    "alcohol":     "alcohol",
    "caffeine":    "caffeine",
}


def lambda_handler(event, context):
    # Extract user_id from Cognito JWT
    try:
        user_id = event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
    except (KeyError, TypeError):
        return _json(401, {"error": "Unauthorized"})

    if not _UUID_RE.match(user_id):
        return _json(401, {"error": "Invalid user ID"})

    # Parse query params
    params = event.get("queryStringParameters") or {}
    days_str = params.get("days", "90")
    if not _DAYS_RE.match(str(days_str)):
        return _json(400, {"error": "Invalid days parameter"})
    days = int(days_str)

    query = _build_query(user_id, days)

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

    data = _parse_rows(rows)
    matrix, sample_counts = _compute_correlation_matrix(data)

    return _json(200, {
        "items": ITEMS,
        "matrix": matrix,
        "sample_counts": sample_counts,
    })


def _build_query(user_id: str, days: int) -> str:
    select_parts = [
        f"{expr} AS {_ITEM_ALIAS[item]}"
        for item, expr in _ITEM_EXPR.items()
    ]
    select_clause = ",\n    ".join(select_parts)

    return f"""
SELECT
    {select_clause}
FROM health_records
WHERE user_id = '{user_id}'
  AND record_type = 'daily'
  AND DATE(recorded_at) >= DATE_ADD('day', -{days}, CURRENT_DATE)
"""


def _parse_rows(rows: list) -> dict:
    """Parse Athena ResultSet rows into lists per item."""
    if len(rows) < 2:
        return {item: [] for item in ITEMS}

    headers = [col["VarCharValue"] for col in rows[0]["Data"]]
    alias_to_item = {v: k for k, v in _ITEM_ALIAS.items()}

    data: dict = {item: [] for item in ITEMS}
    for row in rows[1:]:
        values = {headers[i]: col.get("VarCharValue", "") for i, col in enumerate(row["Data"])}
        # Collect one data point per row; skip row if any value is missing
        point = {}
        valid = True
        for item in ITEMS:
            alias = _ITEM_ALIAS[item]
            raw = values.get(alias, "")
            if raw == "":
                valid = False
                break
            try:
                point[item] = float(raw)
            except ValueError:
                valid = False
                break
        if valid:
            for item, val in point.items():
                data[item].append(val)

    return data


def _pearson(xs: list, ys: list):
    """Compute Pearson correlation coefficient. Returns (r, n) or (None, n)."""
    # Use only indices where both values are available (already aligned)
    n = len(xs)
    if n < MIN_SAMPLES:
        return None, n

    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den_x = math.sqrt(sum((x - mx) ** 2 for x in xs))
    den_y = math.sqrt(sum((y - my) ** 2 for y in ys))

    if den_x == 0 or den_y == 0:
        return None, n

    r = num / (den_x * den_y)
    # Clamp to [-1, 1] to handle floating point imprecision
    r = max(-1.0, min(1.0, r))
    return round(r, 4), n


def _compute_correlation_matrix(data: dict):
    """Compute pairwise Pearson correlations for all ITEMS."""
    matrix: dict = {item: {} for item in ITEMS}
    sample_counts: dict = {}

    for i, item_a in enumerate(ITEMS):
        for j, item_b in enumerate(ITEMS):
            if item_a == item_b:
                matrix[item_a][item_b] = 1.0
                continue
            # Avoid duplicate computation: use cached result if already computed
            key = f"{item_a}-{item_b}"
            rev_key = f"{item_b}-{item_a}"
            if rev_key in sample_counts:
                matrix[item_a][item_b] = matrix[item_b][item_a]
                sample_counts[key] = sample_counts[rev_key]
                continue

            xs = data[item_a]
            ys = data[item_b]
            # Both lists are the same length (parsed row by row)
            r, n = _pearson(xs, ys)
            matrix[item_a][item_b] = r
            sample_counts[key] = n

    return matrix, sample_counts


def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
