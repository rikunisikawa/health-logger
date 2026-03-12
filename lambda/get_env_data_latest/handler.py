import json
import os
from datetime import date, timedelta

import boto3

s3 = boto3.client("s3")
BUCKET = os.environ["S3_ENV_DATA_BUCKET"]
LOCATION_ID = os.environ.get("LOCATION_ID", "musashikosugi")
MAX_DAYS = 30


def lambda_handler(event, context):
    try:
        event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
    except (KeyError, TypeError):
        return _json(401, {"error": "Unauthorized"})

    params = event.get("queryStringParameters") or {}
    try:
        days = min(int(params.get("days", 14)), MAX_DAYS)
        if days < 1:
            days = 14
    except (ValueError, TypeError):
        days = 14

    today = date.today()
    records = []
    for i in range(days, 0, -1):
        date_str = (today - timedelta(days=i)).isoformat()
        records.append({"date": date_str, **_fetch_day(date_str)})

    return _json(200, {"records": records})


def _fetch_day(date_str: str) -> dict:
    prefix = f"raw/source_name=open_meteo/date={date_str}/hour=00/location_id={LOCATION_ID}/"
    try:
        resp = s3.list_objects_v2(Bucket=BUCKET, Prefix=prefix)
        objects = resp.get("Contents", [])
        if not objects:
            return {"pressure_hpa": None, "pm25": None}

        obj = s3.get_object(Bucket=BUCKET, Key=objects[0]["Key"])
        hourly = [
            json.loads(line)
            for line in obj["Body"].read().decode("utf-8").splitlines()
            if line.strip()
        ]

        # 気圧: 日中（6〜18時）の平均
        pressure_vals = [
            r["pressure_hpa"]
            for r in hourly
            if r.get("observation_hour") in range(6, 19) and r.get("pressure_hpa") is not None
        ]
        # PM2.5: 全時間の平均（null を除く）
        pm25_vals = [r["pm25"] for r in hourly if r.get("pm25") is not None]

        return {
            "pressure_hpa": round(sum(pressure_vals) / len(pressure_vals), 1) if pressure_vals else None,
            "pm25": round(sum(pm25_vals) / len(pm25_vals), 1) if pm25_vals else None,
        }
    except Exception:
        return {"pressure_hpa": None, "pm25": None}


def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
