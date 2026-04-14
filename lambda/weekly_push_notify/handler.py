"""
Weekly health summary push notification Lambda.

Triggered by EventBridge every Monday at 08:00 JST (= Sunday 23:00 UTC).

Flow:
  1. Scan all push subscriptions from DynamoDB
  2. For each subscribed user, query Athena for last week's (Mon-Sun) avg scores
  3. Build a personalized summary message
  4. Send Web Push notification via pywebpush
"""
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone

import boto3
from pywebpush import WebPushException, webpush

JST = timezone(timedelta(hours=9))

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["PUSH_SUBSCRIPTIONS_TABLE"])
athena = boto3.client("athena", region_name="ap-northeast-1")

VAPID_PRIVATE_KEY = os.environ["VAPID_PRIVATE_KEY"]
VAPID_CLAIMS = {"sub": "mailto:noreply@health-logger.example.com"}

ATHENA_DATABASE = os.environ["ATHENA_DATABASE"]
ATHENA_OUTPUT_BUCKET = os.environ["ATHENA_OUTPUT_BUCKET"]

NOTIFICATION_TITLE = "先週の体調サマリー"

_POLL_INTERVAL = 1
_MAX_POLLS = 30


def _get_last_week_range() -> tuple[str, str]:
    """Return (last_monday, last_sunday) as YYYY-MM-DD strings in JST.

    Called on Monday JST, so:
      last_sunday = yesterday
      last_monday = 6 days before last_sunday
    """
    now_jst = datetime.now(JST)
    last_sunday = (now_jst - timedelta(days=1)).date()
    last_monday = last_sunday - timedelta(days=6)
    return str(last_monday), str(last_sunday)


def _query_weekly_summary(user_id: str, last_monday: str, last_sunday: str) -> dict | None:
    """Query Athena for last week's average health scores for one user.

    Returns a dict with avg_fatigue/mood/motivation and record_count,
    or None on query failure.
    """
    query = (
        "SELECT "
        "  AVG(fatigue_score)    AS avg_fatigue, "
        "  AVG(mood_score)       AS avg_mood, "
        "  AVG(motivation_score) AS avg_motivation, "
        "  COUNT(*)              AS record_count "
        "FROM health_records "
        f"WHERE user_id = '{user_id}' "
        f"  AND DATE(recorded_at) >= DATE '{last_monday}' "
        f"  AND DATE(recorded_at) <= DATE '{last_sunday}' "
        "  AND record_type = 'daily'"
    )
    try:
        resp = athena.start_query_execution(
            QueryString=query,
            QueryExecutionContext={"Database": ATHENA_DATABASE},
            ResultConfiguration={
                "OutputLocation": f"s3://{ATHENA_OUTPUT_BUCKET}/weekly-notify/"
            },
        )
        qid = resp["QueryExecutionId"]

        for _ in range(_MAX_POLLS):
            time.sleep(_POLL_INTERVAL)
            status_resp = athena.get_query_execution(QueryExecutionId=qid)
            state = status_resp["QueryExecution"]["Status"]["State"]
            if state == "SUCCEEDED":
                break
            if state in ("FAILED", "CANCELLED"):
                print(f"Athena query {state} for user {user_id}")
                return None
        else:
            print(f"Athena query timeout for user {user_id}")
            return None

        results = athena.get_query_results(QueryExecutionId=qid)
        rows = results["ResultSet"]["Rows"]
        if len(rows) < 2:
            # Only header row — no records for this user last week
            return {"avg_fatigue": None, "avg_mood": None, "avg_motivation": None, "record_count": 0}

        data = rows[1]["Data"]

        def _float_or_none(cell: dict) -> float | None:
            val = cell.get("VarCharValue")
            return float(val) if val else None

        return {
            "avg_fatigue": _float_or_none(data[0]),
            "avg_mood": _float_or_none(data[1]),
            "avg_motivation": _float_or_none(data[2]),
            "record_count": int(data[3].get("VarCharValue") or 0),
        }
    except Exception as e:
        print(f"Athena error for user {user_id}: {e}")
        return None


def _build_message(summary: dict | None) -> str:
    """Build a human-readable notification body from a weekly summary."""
    if summary is None or summary["record_count"] == 0:
        return "先週の記録がありません。今週もコツコツ記録しましょう！"

    parts = []
    if summary["avg_fatigue"] is not None:
        parts.append(f"疲労 {summary['avg_fatigue']:.0f}")
    if summary["avg_mood"] is not None:
        parts.append(f"気分 {summary['avg_mood']:.0f}")
    if summary["avg_motivation"] is not None:
        parts.append(f"やる気 {summary['avg_motivation']:.0f}")

    count = summary["record_count"]
    scores = "、".join(parts) if parts else "スコアなし"
    return f"先週の平均（{count}件）: {scores} /100"


def lambda_handler(event, context):
    last_monday, last_sunday = _get_last_week_range()

    response = table.scan(ProjectionExpression="user_id, subscription")
    items = response.get("Items", [])

    sent, failed, removed, skipped = 0, 0, 0, 0

    for item in items:
        user_id = item["user_id"]

        if not _UUID_RE.match(user_id):
            skipped += 1
            continue

        try:
            subscription = json.loads(item["subscription"])
        except (json.JSONDecodeError, KeyError):
            skipped += 1
            continue

        summary = _query_weekly_summary(user_id, last_monday, last_sunday)
        body = _build_message(summary)

        try:
            webpush(
                subscription_info=subscription,
                data=json.dumps({"title": NOTIFICATION_TITLE, "body": body, "url": "/"}),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims=VAPID_CLAIMS,
            )
            sent += 1
        except WebPushException as e:
            status = e.response.status_code if e.response else None
            if status in (404, 410):
                table.delete_item(Key={"user_id": user_id})
                removed += 1
            else:
                print(f"Weekly push failed for {user_id}: {e}")
                failed += 1

    print(
        f"Weekly push notify: sent={sent}, failed={failed}, "
        f"removed={removed}, skipped={skipped}"
    )
    return {"sent": sent, "failed": failed, "removed": removed, "skipped": skipped}
