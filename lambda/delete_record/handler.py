import json
import os
import re
import time

import boto3

athena = boto3.client("athena")

DATABASE      = os.environ["ATHENA_DATABASE"]
OUTPUT_BUCKET = os.environ["ATHENA_OUTPUT_BUCKET"]
TABLE         = os.environ.get("ATHENA_TABLE", "health_records")

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)


def lambda_handler(event, context):
    try:
        user_id = event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
    except (KeyError, TypeError):
        return _json(401, {"error": "Unauthorized"})

    if not _UUID_RE.match(user_id):
        return _json(401, {"error": "Invalid user ID"})

    record_id = (event.get("pathParameters") or {}).get("id", "")
    if not _UUID_RE.match(record_id):
        return _json(400, {"error": "Invalid record ID"})

    query = f"""
        DELETE FROM "{TABLE}"
        WHERE id = '{record_id}'
          AND user_id = '{user_id}'
    """

    response = athena.start_query_execution(
        QueryString=query,
        QueryExecutionContext={"Database": DATABASE},
        ResultConfiguration={
            "OutputLocation": f"s3://{OUTPUT_BUCKET}/athena-results/"
        },
    )
    execution_id = response["QueryExecutionId"]

    for _ in range(20):
        time.sleep(0.5)
        status = athena.get_query_execution(QueryExecutionId=execution_id)
        state = status["QueryExecution"]["Status"]["State"]
        if state == "SUCCEEDED":
            return _json(200, {"message": "deleted"})
        if state in ("FAILED", "CANCELLED"):
            reason = status["QueryExecution"]["Status"].get("StateChangeReason", "")
            return _json(500, {"error": "Delete failed", "reason": reason})

    return _json(504, {"error": "Query timeout"})


def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
