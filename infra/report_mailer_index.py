import json
import logging
import os
import urllib.parse
from email.message import EmailMessage
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "bohatyrov.pn@ucu.edu.ua")
RECIPIENT_EMAIL = os.environ.get("RECIPIENT_EMAIL", "bohatyrov.pn@ucu.edu.ua")
REPORT_REQUESTS_QUEUE_URL = os.environ.get("REPORT_REQUESTS_QUEUE_URL", "")

def handler(event, context):
    logger.info("report-mailer invoked with event: %s", json.dumps(event))
    records = event.get("Records", [])
    if not records:
        return {"status": "no_records"}

    s3_client = boto3.client("s3")
    ses_client = boto3.client("ses", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    sqs_client = boto3.client("sqs", region_name=os.environ.get("AWS_REGION", "us-east-1"))

    for record in records:
        event_source = record.get("eventSource") or record.get("EventSource")
        trigger = "s3" if event_source == "aws:s3" else "unknown"

        s3_data = record.get("s3", {})
        bucket = s3_data.get("bucket", {}).get("name")
        raw_key = s3_data.get("object", {}).get("key", "")
        key = urllib.parse.unquote_plus(raw_key)

        # Required exact log line for Lab 5 item 5
        log_msg = f"report-mailer triggered: trigger={trigger}, key={key}"
        logger.info(log_msg, extra={"trigger": trigger, "bucket": bucket, "key": key})
        print(f"[INFO] report-mailer triggered: trigger={trigger}, key={key}")

        # Stretch goal: forward requests/*.json to SQS
        if key.startswith("requests/") and key.endswith(".json"):
            resp = s3_client.get_object(Bucket=bucket, Key=key)
            req_body_str = resp["Body"].read().decode("utf-8")
            if REPORT_REQUESTS_QUEUE_URL:
                sqs_resp = sqs_client.send_message(
                    QueueUrl=REPORT_REQUESTS_QUEUE_URL,
                    MessageBody=req_body_str,
                )
                print(f"[INFO] Forwarded request {key} to SQS queue {REPORT_REQUESTS_QUEUE_URL} (MessageId={sqs_resp.get('MessageId')})")
            continue

        if not (key.startswith("reports/") and key.endswith(".csv")):
            continue

        resp = s3_client.get_object(Bucket=bucket, Key=key)
        csv_bytes = resp["Body"].read()

        filename = key.split("/")[-1]
        week = filename.replace(".csv", "")

        msg = EmailMessage()
        msg["Subject"] = f"Weekly Meetings Report: {week}"
        msg["From"] = SENDER_EMAIL
        msg["To"] = RECIPIENT_EMAIL
        msg.set_content(
            f"Hello,\n\nPlease find attached the weekly meetings report for {week}.\n\n"
            f"Report file: s3://{bucket}/{key}\n"
            f"File size: {len(csv_bytes)} bytes\n\n"
            f"Best regards,\nMeetings App (Lab 5)\n"
        )
        msg.add_attachment(
            csv_bytes,
            maintype="text",
            subtype="csv",
            filename=f"weekly_report_{week}.csv",
        )

        ses_resp = ses_client.send_raw_email(
            Source=SENDER_EMAIL,
            Destinations=[RECIPIENT_EMAIL],
            RawMessage={"Data": msg.as_bytes()},
        )
        print(f"[INFO] Report email sent for {week} to {RECIPIENT_EMAIL}. MessageId={ses_resp.get('MessageId')}")

    return {"status": "success"}
