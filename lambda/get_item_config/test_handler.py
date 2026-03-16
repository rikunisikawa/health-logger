import importlib.util
import json
import os
import sys

os.environ.setdefault("ITEM_CONFIGS_TABLE", "test-item-configs")

from unittest.mock import patch

# Load this directory's handler explicitly to avoid sys.modules conflicts
_spec = importlib.util.spec_from_file_location(
    "get_item_config_handler",
    os.path.join(os.path.dirname(__file__), "handler.py"),
)
handler = importlib.util.module_from_spec(_spec)
sys.modules["get_item_config_handler"] = handler
_spec.loader.exec_module(handler)


def _auth_event():
    return {
        "requestContext": {
            "authorizer": {"jwt": {"claims": {"sub": "user-uuid-1234"}}}
        }
    }


@patch.object(handler, "table")
def test_get_empty_config(mock_table):
    mock_table.get_item.return_value = {}
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 200
    assert json.loads(result["body"])["configs"] == []


@patch.object(handler, "table")
def test_get_existing_config(mock_table):
    configs = [{"item_id": "1", "label": "水分補給", "type": "number", "mode": "event", "order": 0}]
    mock_table.get_item.return_value = {
        "Item": {"user_id": "user-uuid-1234", "configs": json.dumps(configs)}
    }
    result = handler.lambda_handler(_auth_event(), None)
    assert result["statusCode"] == 200
    assert len(json.loads(result["body"])["configs"]) == 1


def test_missing_auth():
    result = handler.lambda_handler({}, None)
    assert result["statusCode"] == 401


# --- 追加テストケース ---

VALID_USER = "12345678-1234-1234-1234-123456789abc"


def _event(user_id=VALID_USER):
    return {"requestContext": {"authorizer": {"jwt": {"claims": {"sub": user_id}}}}}


@patch.object(handler, "table")
def test_get_success(mock_table):
    configs_data = [
        {"item_id": "item1", "label": "疲労度", "type": "slider", "mode": "form"},
        {"item_id": "item2", "label": "頭痛", "type": "checkbox", "mode": "event"},
    ]
    mock_table.get_item.return_value = {
        "Item": {"user_id": VALID_USER, "configs": json.dumps(configs_data)}
    }
    resp = handler.lambda_handler(_event(), None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["configs"] == configs_data


@patch.object(handler, "table")
def test_get_empty(mock_table):
    mock_table.get_item.return_value = {}
    resp = handler.lambda_handler(_event(), None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["configs"] == []


def test_unauthorized():
    resp = handler.lambda_handler({}, None)
    assert resp["statusCode"] == 401
    body = json.loads(resp["body"])
    assert "Unauthorized" in body["error"]
