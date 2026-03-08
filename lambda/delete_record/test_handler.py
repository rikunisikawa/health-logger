import importlib.util
import json
import os
import sys
from unittest.mock import patch

os.environ.setdefault("ATHENA_DATABASE", "test-db")
os.environ.setdefault("ATHENA_OUTPUT_BUCKET", "test-bucket")

_spec = importlib.util.spec_from_file_location(
    "delete_record_handler",
    os.path.join(os.path.dirname(__file__), "handler.py"),
)
handler = importlib.util.module_from_spec(_spec)
sys.modules["delete_record_handler"] = handler
_spec.loader.exec_module(handler)

VALID_USER   = "12345678-1234-1234-1234-123456789abc"
VALID_RECORD = "abcdef12-1234-1234-1234-123456789abc"


def _event(record_id=VALID_RECORD, user_id=VALID_USER):
    return {
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": user_id}}}},
        "pathParameters": {"id": record_id},
    }


@patch.object(handler, "athena")
def test_delete_success(mock_athena):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid123"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    resp = handler.lambda_handler(_event(), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["message"] == "deleted"


@patch.object(handler, "athena")
def test_delete_invalid_record_id(mock_athena):
    resp = handler.lambda_handler(_event(record_id="not-a-uuid"), None)
    assert resp["statusCode"] == 400


@patch.object(handler, "athena")
def test_delete_invalid_user_id(mock_athena):
    resp = handler.lambda_handler(_event(user_id="bad-user"), None)
    assert resp["statusCode"] == 401


def test_delete_unauthorized():
    resp = handler.lambda_handler({}, None)
    assert resp["statusCode"] == 401


@patch.object(handler, "athena")
def test_delete_query_failed(mock_athena):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid123"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "FAILED", "StateChangeReason": "Error"}}
    }
    resp = handler.lambda_handler(_event(), None)
    assert resp["statusCode"] == 500
