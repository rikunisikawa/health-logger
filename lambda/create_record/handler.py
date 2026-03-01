import json
import os
import uuid
from datetime import datetime, timezone

import boto3
from pydantic import ValidationError

from models import HealthRecordInput

firehose = boto3.client("firehose")
STREAM_NAME = os.environ["FIREHOSE_STREAM_NAME"]


def lambda_handler(event, context):
    # Extract Cognito sub from JWT authorizer claims
    try:
        user_id = event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
    except (KeyError, TypeError):
        return _json(401, {"error": "Unauthorized"})

    # Parse body
    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return _json(400, {"error": "Invalid JSON"})

    # Validate with Pydantic
    try:
        rec = HealthRecordInput(**body)
    except ValidationError as e:
        return _json(400, {"error": "Validation failed", "details": e.errors()})

    record_id = str(uuid.uuid4())
    written_at = datetime.now(timezone.utc).isoformat()

    # Determine date partition from recorded_at (first 10 chars = YYYY-MM-DD)
    try:
        dt = rec.recorded_at[:10]
    except Exception:
        dt = written_at[:10]

    payload = {
        "id":               record_id,
        "user_id":          user_id,
        "fatigue_score":    rec.fatigue_score,
        "mood_score":       rec.mood_score,
        "motivation_score": rec.motivation_score,
        "flags":            rec.flags,
        "note":             rec.note,
        "recorded_at":      rec.recorded_at,
        "timezone":         rec.timezone,
        "device_id":        rec.device_id,
        "app_version":      rec.app_version,
        "written_at":       written_at,
        "dt":               dt,
    }

    firehose.put_record(
        DeliveryStreamName=STREAM_NAME,
        Record={"Data": (json.dumps(payload) + "\n").encode()},
    )

    return _json(201, {"record_id": record_id})


def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
