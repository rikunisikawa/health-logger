import importlib.util
import json
import os
import sys
from unittest.mock import patch, MagicMock

os.environ.setdefault("PUSH_SUBSCRIPTIONS_TABLE", "test-subscriptions")
os.environ.setdefault("VAPID_PRIVATE_KEY", "test-vapid-key")

_spec = importlib.util.spec_from_file_location(
    "push_notify_handler",
    os.path.join(os.path.dirname(__file__), "handler.py"),
)
handler = importlib.util.module_from_spec(_spec)
sys.modules["push_notify_handler"] = handler
_spec.loader.exec_module(handler)

from pywebpush import WebPushException

VALID_SUBSCRIPTION = json.dumps(
    {
        "endpoint": "https://fcm.googleapis.com/fcm/send/dummy-endpoint",
        "keys": {"p256dh": "key123", "auth": "auth456"},
    }
)


def _make_item(user_id="uid-001"):
    return {"user_id": user_id, "subscription": VALID_SUBSCRIPTION}


@patch.object(handler, "webpush")
@patch.object(handler, "table")
def test_notify_success(mock_table, mock_webpush):
    mock_table.scan.return_value = {"Items": [_make_item()]}
    mock_webpush.return_value = None
    result = handler.lambda_handler({}, None)
    assert result["sent"] == 1
    assert result["failed"] == 0
    assert result["removed"] == 0


@patch.object(handler, "webpush")
@patch.object(handler, "table")
def test_notify_expired_subscription(mock_table, mock_webpush):
    mock_table.scan.return_value = {"Items": [_make_item()]}
    mock_table.delete_item.return_value = {}
    exc = WebPushException("Gone")
    resp_mock = MagicMock()
    resp_mock.status_code = 410
    exc.response = resp_mock
    mock_webpush.side_effect = exc
    result = handler.lambda_handler({}, None)
    assert result["removed"] == 1
    assert result["sent"] == 0
    assert result["failed"] == 0
    mock_table.delete_item.assert_called_once()


@patch.object(handler, "webpush")
@patch.object(handler, "table")
def test_notify_empty_subscriptions(mock_table, mock_webpush):
    mock_table.scan.return_value = {"Items": []}
    result = handler.lambda_handler({}, None)
    assert result["sent"] == 0
    assert result["failed"] == 0
    assert result["removed"] == 0
    mock_webpush.assert_not_called()


@patch.object(handler, "webpush")
@patch.object(handler, "table")
def test_notify_push_failure(mock_table, mock_webpush):
    mock_table.scan.return_value = {"Items": [_make_item()]}
    exc = WebPushException("Internal Server Error")
    resp_mock = MagicMock()
    resp_mock.status_code = 500
    exc.response = resp_mock
    mock_webpush.side_effect = exc
    result = handler.lambda_handler({}, None)
    assert result["failed"] == 1
    assert result["sent"] == 0
    assert result["removed"] == 0
