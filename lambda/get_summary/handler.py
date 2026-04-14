import json
import os
import re
from datetime import date, timedelta

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")

DAILY_SUMMARIES_TABLE = os.environ["DAILY_SUMMARIES_TABLE"]

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)


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
    try:
        days = int(params.get("days", 7))
    except (ValueError, TypeError):
        return _json(400, {"error": "Invalid days parameter"})

    if days < 1 or days > 90:
        return _json(400, {"error": "days must be between 1 and 90"})

    # Calculate date range
    today = date.today()
    date_from = (today - timedelta(days=days)).isoformat()
    date_to = (today - timedelta(days=1)).isoformat()

    # Query DynamoDB
    table = dynamodb.Table(DAILY_SUMMARIES_TABLE)
    try:
        response = table.query(
            KeyConditionExpression=Key("user_id").eq(user_id) & Key("date").between(date_from, date_to)
        )
    except ClientError as e:
        return _json(500, {"error": "Database error", "reason": str(e)})

    summaries = [
        {
            "date": item["date"],
            "avg_fatigue": item.get("avg_fatigue"),
            "avg_mood": item.get("avg_mood"),
            "avg_motivation": item.get("avg_motivation"),
            "record_count": item.get("record_count"),
        }
        for item in response.get("Items", [])
    ]

    return _json(200, {"summaries": summaries})


def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
