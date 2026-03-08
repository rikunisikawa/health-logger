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
