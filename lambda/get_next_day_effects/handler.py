import json
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

MIN_SAMPLES = 10

EVENTS = ["exercise", "alcohol", "caffeine"]

_FLAG_BITS = {
    "exercise": 8,
    "alcohol": 16,
    "caffeine": 32,
}


def lambda_handler(event, context):
    try:
        user_id = event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
    except (KeyError, TypeError):
        return _json(401, {"error": "Unauthorized"})

    if not _UUID_RE.match(user_id):
        return _json(401, {"error": "Invalid user ID"})

    params = event.get("queryStringParameters") or {}
    days_str = params.get("days", "90")
    if not _DAYS_RE.match(str(days_str)):
        return _json(400, {"error": "Invalid days parameter"})
    days = int(days_str)

    query = _build_query(user_id, days)

    response = athena.start_query_execution(
        QueryString=query,
        QueryExecutionContext={"Database": DATABASE},
        ResultConfiguration={
            "OutputLocation": f"s3://{OUTPUT_BUCKET}/athena-results/"
        },
    )
    execution_id = response["QueryExecutionId"]

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

    results = athena.get_query_results(QueryExecutionId=execution_id)
    rows = results["ResultSet"]["Rows"]

    insights = _parse_and_filter(rows)

    return _json(200, {"insights": insights})


def _build_query(user_id: str, days: int) -> str:
    union_parts = []
    for evt in EVENTS:
        bit = _FLAG_BITS[evt]
        union_parts.append(f"""
SELECT
  '{evt}' AS event,
  CASE WHEN bitwise_and(y.flags, {bit}) > 0 THEN 1 ELSE 0 END AS had_event,
  ROUND(AVG(t.fatigue_score), 2) AS avg_fatigue,
  ROUND(AVG(t.mood_score), 2) AS avg_mood,
  ROUND(AVG(t.motivation_score), 2) AS avg_motivation,
  COUNT(*) AS n
FROM (
  SELECT DATE(recorded_at) AS d, fatigue_score, mood_score, motivation_score
  FROM health_records
  WHERE user_id = '{user_id}'
    AND record_type = 'daily'
    AND DATE(recorded_at) >= DATE_ADD('day', -{days}, CURRENT_DATE)
) t
JOIN (
  SELECT DATE(recorded_at) AS d, flags
  FROM health_records
  WHERE user_id = '{user_id}'
    AND record_type = 'daily'
    AND DATE(recorded_at) >= DATE_ADD('day', -{days + 1}, CURRENT_DATE)
) y ON y.d = DATE_ADD('day', -1, t.d)
GROUP BY CASE WHEN bitwise_and(y.flags, {bit}) > 0 THEN 1 ELSE 0 END""")

    return "\nUNION ALL\n".join(union_parts)


def _parse_and_filter(rows: list) -> list:
    if len(rows) < 2:
        return []

    headers = [col["VarCharValue"] for col in rows[0]["Data"]]

    raw: dict[str, dict] = {}
    for row in rows[1:]:
        values = {headers[i]: col.get("VarCharValue", "") for i, col in enumerate(row["Data"])}
        evt = values.get("event", "")
        had = values.get("had_event", "")
        if evt not in EVENTS or had not in ("0", "1"):
            continue

        try:
            group = {
                "avg_fatigue": float(values["avg_fatigue"]),
                "avg_mood": float(values["avg_mood"]),
                "avg_motivation": float(values["avg_motivation"]),
                "n": int(values["n"]),
            }
        except (KeyError, ValueError):
            continue

        key = f"{evt}-{had}"
        raw[key] = group

    insights = []
    for evt in EVENTS:
        with_evt = raw.get(f"{evt}-1")
        without_evt = raw.get(f"{evt}-0")
        if with_evt is None or without_evt is None:
            continue
        if with_evt["n"] < MIN_SAMPLES or without_evt["n"] < MIN_SAMPLES:
            continue
        insights.append({
            "event": evt,
            "with_event": with_evt,
            "without_event": without_evt,
        })

    return insights


def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
