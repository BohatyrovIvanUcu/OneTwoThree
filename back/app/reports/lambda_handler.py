import json
import logging
import os
from datetime import UTC, datetime, timedelta
from typing import Any

import boto3

from app.config import settings
from app.reports.weekly import build_weekly_report

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Formatter to ensure structured logs show both plain text and fields in CloudWatch
if not logger.handlers:
    handler_stdout = logging.StreamHandler()
    formatter = logging.Formatter("[%(levelname)s] %(asctime)s - %(name)s - %(message)s")
    handler_stdout.setFormatter(formatter)
    logger.addHandler(handler_stdout)


def get_default_previous_week() -> str:
    """Return the previous ISO week formatted as YYYY-Www (e.g. 2026-W40)."""
    now = datetime.now(UTC)
    prev_date = now - timedelta(days=7)
    iso_year, iso_week, _ = prev_date.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def detect_trigger(event: dict[str, Any], payload: dict[str, Any]) -> str:
    """Detect whether this invocation came from the schedule, SQS, or direct invocation."""
    source = payload.get("source") or event.get("source")
    if source == "schedule":
        return "schedule"

    records = event.get("Records", [])
    if records:
        record = records[0]
        event_source = record.get("eventSource") or record.get("EventSource")
        if event_source == "aws:sqs":
            return "sqs"

    if source in ("sqs", "on-demand", "api"):
        return "sqs"

    return "direct"


def parse_payload_and_trigger(event: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """Extract the payload and determine the trigger type from either an SQS or direct event."""
    records = event.get("Records", [])
    if records:
        # SQS event shape
        record = records[0]
        raw_body = record.get("body", "{}")
        try:
            body = json.loads(raw_body)
        except Exception:
            body = {"raw": raw_body}
        trigger = detect_trigger(event, body)
        return body, trigger

    # Direct invocation shape
    trigger = detect_trigger(event, event)
    return event, trigger


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Lambda entry point for report-builder.

    Receives SQS messages or direct invocation events, generates the weekly meetings CSV,
    and uploads it to S3 at reports/<week>.csv.
    """
    payload, trigger = parse_payload_and_trigger(event)

    # Determine target week
    week = payload.get("week")
    if not week:
        week = get_default_previous_week()

    # Required exact log line for Lab 5 submission
    log_msg = f"report-builder triggered: trigger={trigger}, week={week}"
    logger.info(log_msg, extra={"trigger": trigger, "week": week})
    # Also print to stdout to guarantee appearance in CloudWatch logs
    print(f"[INFO] report-builder triggered: trigger={trigger}, week={week}")

    # Generate CSV report bytes
    logger.info("Generating report for ISO week %s...", week)
    csv_bytes = build_weekly_report(week)

    # Upload to S3
    bucket = os.getenv("REPORTS_BUCKET") or getattr(settings, "reports_bucket", "")
    if not bucket:
        raise ValueError("REPORTS_BUCKET environment variable is not set")

    key = f"reports/{week}.csv"
    logger.info("Uploading weekly report to s3://%s/%s (%d bytes)...", bucket, key, len(csv_bytes))

    s3_client = boto3.client("s3")
    s3_client.put_object(
        Bucket=bucket,
        Key=key,
        Body=csv_bytes,
        ContentType="text/csv",
    )

    logger.info("Report successfully uploaded to s3://%s/%s", bucket, key)
    print(f"[INFO] Report generated and uploaded: s3://{bucket}/{key}")

    return {
        "status": "success",
        "week": week,
        "bucket": bucket,
        "key": key,
        "trigger": trigger,
        "size_bytes": len(csv_bytes),
    }
