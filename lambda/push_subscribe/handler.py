import json
import os

import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["PUSH_SUBSCRIPTIONS_TABLE"])


def lambda_handler(event, context):
    try:
        user_id = event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
    except (KeyError, TypeError):
        return _json(401, {"error": "Unauthorized"})

    method = event.get("requestContext", {}).get("http", {}).get("method", "POST")

    if method == "DELETE":
        table.delete_item(Key={"user_id": user_id})
        return _json(200, {"message": "unsubscribed"})

    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return _json(400, {"error": "Invalid JSON"})

    subscription = body.get("subscription")
    if not subscription or not isinstance(subscription, dict):
        return _json(400, {"error": "subscription required"})

    if "endpoint" not in subscription or "keys" not in subscription:
        return _json(400, {"error": "Invalid subscription format"})

    table.put_item(Item={
        "user_id": user_id,
        "subscription": json.dumps(subscription),
    })
    return _json(200, {"message": "subscribed"})


def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
