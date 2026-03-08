import json
import os

import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["ITEM_CONFIGS_TABLE"])


def lambda_handler(event, context):
    try:
        user_id = event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
    except (KeyError, TypeError):
        return _json(401, {"error": "Unauthorized"})

    response = table.get_item(Key={"user_id": user_id})
    item = response.get("Item", {})
    configs = json.loads(item.get("configs", "[]"))
    return _json(200, {"configs": configs})


def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
