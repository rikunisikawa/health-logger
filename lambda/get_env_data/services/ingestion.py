import json
import logging
import os
import sys
import uuid
from typing import List

import boto3

# Ensure the package root (get_env_data/) is on sys.path for sibling imports
_pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _pkg_root not in sys.path:
    sys.path.insert(0, _pkg_root)

from env_models import EnvironmentRecord

logger = logging.getLogger(__name__)

S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "")

s3 = boto3.client("s3")


def save_to_s3(records: List[EnvironmentRecord], source_name: str = "open_meteo") -> str:
    """Save environment records to S3 as JSON Lines.

    S3 path: raw/source_name={source}/date={date}/hour=00/location_id={loc}/{request_id}.json

    All records for a given date are written together as a single file.
    Returns the S3 key of the saved file.
    """
    if not records:
        logger.warning('{"level": "WARNING", "message": "No records to save"}')
        return ""

    bucket = S3_BUCKET_NAME
    if not bucket:
        raise EnvironmentError("S3_BUCKET_NAME environment variable is not set")

    # Use the date and location from the first record (all records share the same date)
    first = records[0]
    date = first.observation_date
    location_id = first.location_id
    request_id = str(uuid.uuid4())

    s3_key = (
        f"raw/source_name={source_name}/date={date}/hour=00/"
        f"location_id={location_id}/{request_id}.json"
    )

    # Serialize records as JSON Lines
    lines = []
    for record in records:
        lines.append(record.model_dump_json())
    body = "\n".join(lines) + "\n"

    s3.put_object(
        Bucket=bucket,
        Key=s3_key,
        Body=body.encode("utf-8"),
        ContentType="application/x-ndjson",
    )

    logger.info(
        '{"level": "INFO", "message": "Saved records to S3",'
        ' "bucket": "%s", "key": "%s", "record_count": %d}',
        bucket,
        s3_key,
        len(records),
    )

    return s3_key
