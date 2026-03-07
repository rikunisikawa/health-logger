import json
import os

import boto3
from pywebpush import WebPushException, webpush

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["PUSH_SUBSCRIPTIONS_TABLE"])

VAPID_PRIVATE_KEY = os.environ["VAPID_PRIVATE_KEY"]
VAPID_CLAIMS = {"sub": "mailto:noreply@health-logger.example.com"}

NOTIFICATION_TITLE = "Health Logger"
NOTIFICATION_BODY = "今日の体調を記録しましょう 📋"


def lambda_handler(event, context):
    response = table.scan(ProjectionExpression="user_id, subscription")
    items = response.get("Items", [])

    sent, failed, removed = 0, 0, 0

    for item in items:
        user_id = item["user_id"]
        try:
            subscription = json.loads(item["subscription"])
        except (json.JSONDecodeError, KeyError):
            continue

        try:
            webpush(
                subscription_info=subscription,
                data=json.dumps({"title": NOTIFICATION_TITLE, "body": NOTIFICATION_BODY, "url": "/"}),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims=VAPID_CLAIMS,
            )
            sent += 1
        except WebPushException as e:
            status = e.response.status_code if e.response else None
            if status in (404, 410):
                # Subscription expired or unsubscribed — clean up
                table.delete_item(Key={"user_id": user_id})
                removed += 1
            else:
                print(f"Push failed for {user_id}: {e}")
                failed += 1

    print(f"Push notify: sent={sent}, failed={failed}, removed={removed}")
    return {"sent": sent, "failed": failed, "removed": removed}
