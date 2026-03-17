import importlib.util
import json
import os
import sys

os.environ.setdefault("ITEM_CONFIGS_TABLE", "test-item-configs")

from unittest.mock import patch

# Load this directory's handler explicitly to avoid sys.modules conflicts
_spec = importlib.util.spec_from_file_location(
    "save_item_config_handler",
    os.path.join(os.path.dirname(__file__), "handler.py"),
)
handler = importlib.util.module_from_spec(_spec)
sys.modules["save_item_config_handler"] = handler
_spec.loader.exec_module(handler)

VALID_CONFIGS = [
    {"item_id": "1", "label": "水分補給", "type": "number", "mode": "event", "order": 0}
]


def _auth_event(body: dict):
    return {
        "requestContext": {
            "authorizer": {"jwt": {"claims": {"sub": "user-uuid-1234"}}}
        },
        "body": json.dumps(body),
    }


@patch.object(handler, "table")
def test_save_valid_configs(mock_table):
    mock_table.put_item.return_value = {}
    result = handler.lambda_handler(_auth_event({"configs": VALID_CONFIGS}), None)
    assert result["statusCode"] == 200
    mock_table.put_item.assert_called_once()


@patch.object(handler, "table")
def test_save_empty_configs(mock_table):
    mock_table.put_item.return_value = {}
    result = handler.lambda_handler(_auth_event({"configs": []}), None)
    assert result["statusCode"] == 200


@patch.object(handler, "table")
def test_save_invalid_type(mock_table):
    bad = [{"item_id": "1", "label": "test", "type": "invalid", "mode": "form", "order": 0}]
    result = handler.lambda_handler(_auth_event({"configs": bad}), None)
    assert result["statusCode"] == 400


@patch.object(handler, "table")
def test_save_status_mode(mock_table):
    mock_table.put_item.return_value = {}
    configs = [{"item_id": "1", "label": "頭痛", "type": "checkbox", "mode": "status", "order": 0}]
    result = handler.lambda_handler(_auth_event({"configs": configs}), None)
    assert result["statusCode"] == 200


@patch.object(handler, "table")
def test_save_all_modes(mock_table):
    """form / event / status の3モードがすべて保存できること"""
    mock_table.put_item.return_value = {}
    configs = [
        {"item_id": "1", "label": "体重", "type": "number", "mode": "form", "order": 0},
        {"item_id": "2", "label": "運動", "type": "checkbox", "mode": "event", "order": 1},
        {"item_id": "3", "label": "頭痛", "type": "checkbox", "mode": "status", "order": 2},
    ]
    result = handler.lambda_handler(_auth_event({"configs": configs}), None)
    assert result["statusCode"] == 200


@patch.object(handler, "table")
def test_save_invalid_mode(mock_table):
    bad = [{"item_id": "1", "label": "test", "type": "checkbox", "mode": "bad", "order": 0}]
    result = handler.lambda_handler(_auth_event({"configs": bad}), None)
    assert result["statusCode"] == 400


@patch.object(handler, "table")
def test_save_missing_label(mock_table):
    bad = [{"item_id": "1", "type": "checkbox", "mode": "form", "order": 0}]
    result = handler.lambda_handler(_auth_event({"configs": bad}), None)
    assert result["statusCode"] == 400


@patch.object(handler, "table")
def test_save_missing_configs_key(mock_table):
    result = handler.lambda_handler(_auth_event({}), None)
    assert result["statusCode"] == 400


def test_missing_auth():
    result = handler.lambda_handler({}, None)
    assert result["statusCode"] == 401


# --- 追加テストケース（要件名） ---

VALID_USER = "12345678-1234-1234-1234-123456789abc"


def _event(user_id=VALID_USER, body=None):
    return {
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": user_id}}}},
        "body": json.dumps(body) if body is not None else None,
    }


@patch.object(handler, "table")
def test_save_success(mock_table):
    mock_table.put_item.return_value = {}
    configs = [{"item_id": "i1", "label": "体重", "type": "number", "mode": "form"}]
    resp = handler.lambda_handler(_event(body={"configs": configs}), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["message"] == "saved"


def test_unauthorized():
    resp = handler.lambda_handler({}, None)
    assert resp["statusCode"] == 401


def test_invalid_json():
    raw_event = {
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": VALID_USER}}}},
        "body": "this is not json{{{",
    }
    resp = handler.lambda_handler(raw_event, None)
    assert resp["statusCode"] == 400


def test_missing_configs():
    resp = handler.lambda_handler(_event(body={}), None)
    assert resp["statusCode"] == 400


@patch.object(handler, "table")
def test_invalid_type(mock_table):
    configs = [{"item_id": "i1", "label": "test", "type": "INVALID", "mode": "form"}]
    resp = handler.lambda_handler(_event(body={"configs": configs}), None)
    assert resp["statusCode"] == 400


@patch.object(handler, "table")
def test_invalid_mode(mock_table):
    configs = [{"item_id": "i1", "label": "test", "type": "checkbox", "mode": "INVALID"}]
    resp = handler.lambda_handler(_event(body={"configs": configs}), None)
    assert resp["statusCode"] == 400


@patch.object(handler, "table")
def test_missing_required_fields(mock_table):
    # item_id なし
    configs = [{"label": "test", "type": "checkbox", "mode": "form"}]
    resp = handler.lambda_handler(_event(body={"configs": configs}), None)
    assert resp["statusCode"] == 400
