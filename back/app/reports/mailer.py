import json
import logging
import os
import urllib.parse
from email.message import EmailMessage
from typing import Any

import boto3

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Formatter for CloudWatch logs
if not logger.handlers:
    handler_stdout = logging.StreamHandler()
    formatter = logging.Formatter("[%(levelname)s] %(asctime)s - %(name)s - %(message)s")
    handler_stdout.setFormatter(formatter)
    logger.addHandler(handler_stdout)

SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "bohatyrov.pn@ucu.edu.ua")
RECIPIENT_EMAIL = os.environ.get("RECIPIENT_EMAIL", "bohatyrov.pn@ucu.edu.ua")
REPORT_REQUESTS_QUEUE_URL = os.environ.get("REPORT_REQUESTS_QUEUE_URL", "")


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Lambda entry point for report-mailer and request dispatcher.

    Handles two S3 ObjectCreated events:
    1. reports/*.csv: Downloads the report and sends it as an attachment via Amazon SES.
    2. requests/*.json (Stretch Goal): Reads the API-submitted report request and forwards it to SQS.
    """
    logger.info("report-mailer invoked with event: %s", json.dumps(event))

    records = event.get("Records", [])
    if not records:
        logger.warning("No records found in event")
        return {"status": "no_records"}

    s3_client = boto3.client("s3")
    ses_client = boto3.client("ses", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    sqs_client = boto3.client("sqs", region_name=os.environ.get("AWS_REGION", "us-east-1"))

    processed_keys = []
    for record in records:
        event_source = record.get("eventSource") or record.get("EventSource")
        trigger = "s3" if event_source == "aws:s3" else "unknown"

        s3_data = record.get("s3", {})
        bucket = s3_data.get("bucket", {}).get("name")
        raw_key = s3_data.get("object", {}).get("key", "")
        key = urllib.parse.unquote_plus(raw_key)

        # Required exact log line for Lab 5 submission
        log_msg = f"report-mailer triggered: trigger={trigger}, key={key}"
        logger.info(log_msg, extra={"trigger": trigger, "bucket": bucket, "key": key})
        print(f"[INFO] report-mailer triggered: trigger={trigger}, key={key}")

        # Stretch Goal: Dispatch requests/*.json -> SQS
        if key.startswith("requests/") and key.endswith(".json"):
            logger.info("Processing on-demand report request file s3://%s/%s...", bucket, key)
            resp = s3_client.get_object(Bucket=bucket, Key=key)
            req_body_str = resp["Body"].read().decode("utf-8")

            queue_url = REPORT_REQUESTS_QUEUE_URL or os.environ.get("QUEUE_URL", "")
            if queue_url:
                sqs_resp = sqs_client.send_message(
                    QueueUrl=queue_url,
                    MessageBody=req_body_str,
                )
                msg_id = sqs_resp.get("MessageId")
                logger.info("Successfully forwarded request to SQS: %s (MessageId=%s)", queue_url, msg_id)
                print(f"[INFO] Forwarded request {key} to SQS queue {queue_url} (MessageId={msg_id})")
            else:
                logger.warning("REPORT_REQUESTS_QUEUE_URL not configured; skipping SQS dispatch")

            processed_keys.append(key)
            continue

        if not (key.startswith("reports/") and key.endswith(".csv")):
            logger.info("Skipping object %s (not a weekly report CSV)", key)
            continue

        # Download report CSV from S3
        logger.info("Downloading s3://%s/%s...", bucket, key)
        resp = s3_client.get_object(Bucket=bucket, Key=key)
        csv_bytes = resp["Body"].read()

        # Extract week name from key: reports/2026-W40.csv -> 2026-W40
        filename = key.split("/")[-1]
        week = filename.replace(".csv", "")

        # Compose Email with attachment
        msg = EmailMessage()
        msg["Subject"] = f"Weekly Meetings Report: {week}"
        msg["From"] = SENDER_EMAIL
        msg["To"] = RECIPIENT_EMAIL
        msg.set_content(
            f"Hello,\n\n"
            f"Please find attached the weekly meetings report for {week}.\n\n"
            f"Report file: s3://{bucket}/{key}\n"
            f"File size: {len(csv_bytes)} bytes\n\n"
            f"Best regards,\n"
            f"Meetings App (Lab 5)\n"
        )
        msg.add_attachment(
            csv_bytes,
            maintype="text",
            subtype="csv",
            filename=f"weekly_report_{week}.csv",
        )

        # Send via SES
        logger.info("Sending email via SES to %s from %s...", RECIPIENT_EMAIL, SENDER_EMAIL)
        ses_resp = ses_client.send_raw_email(
            Source=SENDER_EMAIL,
            Destinations=[RECIPIENT_EMAIL],
            RawMessage={"Data": msg.as_bytes()},
        )
        message_id = ses_resp.get("MessageId")
        logger.info("Email sent successfully! MessageId=%s", message_id)
        print(f"[INFO] Report email sent for {week} to {RECIPIENT_EMAIL}. MessageId={message_id}")
        processed_keys.append(key)

    return {"status": "success", "processed_keys": processed_keys}
