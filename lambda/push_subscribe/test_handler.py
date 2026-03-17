import importlib.util
import json
import os
import sys
from unittest.mock import patch

os.environ.setdefault("PUSH_SUBSCRIPTIONS_TABLE", "test-subscriptions")

_spec = importlib.util.spec_from_file_location(
    "push_subscribe_handler",
    os.path.join(os.path.dirname(__file__), "handler.py"),
)
handler = importlib.util.module_from_spec(_spec)
sys.modules["push_subscribe_handler"] = handler
_spec.loader.exec_module(handler)

VALID_USER = "12345678-1234-1234-1234-123456789abc"
VALID_SUBSCRIPTION = {
    "endpoint": "https://fcm.googleapis.com/fcm/send/dummy-endpoint",
    "keys": {"p256dh": "key123", "auth": "auth456"},
}


def _event(method="POST", user_id=VALID_USER, body=None):
    return {
        "requestContext": {
            "authorizer": {"jwt": {"claims": {"sub": user_id}}},
            "http": {"method": method},
        },
        "body": json.dumps(body) if body is not None else None,
    }


@patch.object(handler, "table")
def test_subscribe_success(mock_table):
    mock_table.put_item.return_value = {}
    resp = handler.lambda_handler(
        _event(method="POST", body={"subscription": VALID_SUBSCRIPTION}), None
    )
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["message"] == "subscribed"
    mock_table.put_item.assert_called_once()


@patch.object(handler, "table")
def test_unsubscribe_success(mock_table):
    mock_table.delete_item.return_value = {}
    resp = handler.lambda_handler(_event(method="DELETE"), None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["message"] == "unsubscribed"
    mock_table.delete_item.assert_called_once()


def test_unauthorized():
    resp = handler.lambda_handler({}, None)
    assert resp["statusCode"] == 401
    body = json.loads(resp["body"])
    assert "Unauthorized" in body["error"]


def test_missing_subscription():
    resp = handler.lambda_handler(_event(method="POST", body={}), None)
    assert resp["statusCode"] == 400


def test_invalid_subscription_format():
    # endpoint はあるが keys がない
    resp = handler.lambda_handler(
        _event(method="POST", body={"subscription": {"endpoint": "https://example.com"}}),
        None,
    )
    assert resp["statusCode"] == 400
