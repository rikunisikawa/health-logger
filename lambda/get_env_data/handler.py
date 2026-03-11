import json
import logging
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

from pydantic import ValidationError

# Allow relative imports when run as a Lambda (package root on sys.path)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from env_models import IngestionPayload
from clients.open_meteo import OpenMeteoClient
from services.validator import validate_records
from services.ingestion import save_to_s3

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

JST = timezone(timedelta(hours=9))

LOCATION_ID = os.environ.get("LOCATION_ID", "musashikosugi")
LATITUDE = float(os.environ.get("LATITUDE", "35.5733"))
LONGITUDE = float(os.environ.get("LONGITUDE", "139.6590"))


def lambda_handler(event, context):
    request_id = (
        context.aws_request_id
        if context and hasattr(context, "aws_request_id")
        else str(uuid.uuid4())
    )

    logger.info(
        json.dumps({
            "level": "INFO",
            "message": "Lambda invoked",
            "request_id": request_id,
            "event": event,
        })
    )

    # Validate payload
    try:
        payload = IngestionPayload(**(event or {}))
    except ValidationError as e:
        logger.error(
            json.dumps({
                "level": "ERROR",
                "message": "Invalid payload",
                "request_id": request_id,
                "details": e.errors(),
            })
        )
        return {"statusCode": 400, "body": json.dumps({"error": "Validation failed", "details": e.errors()})}

    # Determine date range
    if payload.backfill and payload.date_from and payload.date_to:
        date_from = payload.date_from
        date_to = payload.date_to
    else:
        # Default: yesterday in JST
        yesterday = (datetime.now(JST) - timedelta(days=1)).strftime("%Y-%m-%d")
        date_from = yesterday
        date_to = yesterday

    location_id = payload.location_id

    logger.info(
        json.dumps({
            "level": "INFO",
            "message": "Fetching environment data",
            "request_id": request_id,
            "date_from": date_from,
            "date_to": date_to,
            "location_id": location_id,
            "backfill": payload.backfill,
        })
    )

    try:
        client = OpenMeteoClient()
        records = client.fetch_hourly(
            lat=LATITUDE,
            lng=LONGITUDE,
            date_from=date_from,
            date_to=date_to,
            location_id=location_id,
        )

        # Attach request_id to each record
        for record in records:
            record.request_id = request_id

        # Validate data quality
        validated_records = validate_records(records)

        # Group by date and save each date as a separate S3 file
        records_by_date: dict = {}
        for record in validated_records:
            records_by_date.setdefault(record.observation_date, []).append(record)

        saved_keys = []
        for date, date_records in records_by_date.items():
            key = save_to_s3(date_records, source_name="open_meteo")
            saved_keys.append(key)

        logger.info(
            json.dumps({
                "level": "INFO",
                "message": "Ingestion completed",
                "request_id": request_id,
                "total_records": len(validated_records),
                "saved_files": len(saved_keys),
                "s3_keys": saved_keys,
            })
        )

        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "Success",
                "total_records": len(validated_records),
                "saved_files": len(saved_keys),
            }),
        }

    except Exception as e:
        logger.error(
            json.dumps({
                "level": "ERROR",
                "message": "Ingestion failed",
                "request_id": request_id,
                "error": str(e),
            })
        )
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }
