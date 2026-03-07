import json
import os

import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["ITEM_CONFIGS_TABLE"])

ALLOWED_TYPES = {"slider", "checkbox", "number", "text"}
ALLOWED_MODES = {"form", "event"}


def lambda_handler(event, context):
    try:
        user_id = event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
    except (KeyError, TypeError):
        return _json(401, {"error": "Unauthorized"})

    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return _json(400, {"error": "Invalid JSON"})

    configs = body.get("configs")
    if not isinstance(configs, list):
        return _json(400, {"error": "configs must be an array"})

    for item in configs:
        if not isinstance(item, dict):
            return _json(400, {"error": "each config must be an object"})
        if not item.get("item_id") or not item.get("label"):
            return _json(400, {"error": "item_id and label are required"})
        if item.get("type") not in ALLOWED_TYPES:
            return _json(400, {"error": f"type must be one of {sorted(ALLOWED_TYPES)}"})
        if item.get("mode") not in ALLOWED_MODES:
            return _json(400, {"error": f"mode must be one of {sorted(ALLOWED_MODES)}"})

    table.put_item(Item={"user_id": user_id, "configs": json.dumps(configs)})
    return _json(200, {"message": "saved"})


def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
