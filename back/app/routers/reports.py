import json
import logging
import uuid
from datetime import UTC, datetime

import boto3
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user
from app.config import settings
from app.models import User
from app.reports.lambda_handler import get_default_previous_week
from app.reports.weekly import parse_iso_week
from app.schemas import ReportRequest, ReportRequestResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post(
    "/request",
    response_model=ReportRequestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Request weekly meeting report generation (Stretch Goal)",
)
def request_weekly_report(
    body: ReportRequest | None = None,
    current_user: User = Depends(get_current_user),
) -> ReportRequestResponse:
    """Request a weekly meetings report for the specified ISO week.

    Implements the Stretch Goal using Option 3 (Request File via S3 Gateway Endpoint):
    The API writes `requests/<id>.json` to S3 through the VPC Gateway Endpoint.
    An S3 event notification on that prefix triggers the SQS pipeline without requiring NAT Gateway.
    """
    week = body.week if body and body.week else get_default_previous_week()

    try:
        parse_iso_week(week)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        ) from e

    request_id = str(uuid.uuid4())
    req_payload = {
        "request_id": request_id,
        "week": week,
        "requested_by": current_user.email,
        "requested_at": datetime.now(UTC).isoformat(),
        "source": "api",
    }

    bucket = settings.reports_bucket
    if bucket:
        key = f"requests/{request_id}.json"
        try:
            s3_client = boto3.client("s3")
            s3_client.put_object(
                Bucket=bucket,
                Key=key,
                Body=json.dumps(req_payload).encode("utf-8"),
                ContentType="application/json",
            )
            logger.info("Successfully dropped report request file into s3://%s/%s", bucket, key)
        except Exception as e:
            logger.error("Failed to write report request to S3: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to submit report request: {e}",
            ) from e
    else:
        logger.warning(
            "REPORTS_BUCKET is not set; running in local development mode for report request %s",
            request_id,
        )

    return ReportRequestResponse(
        status="queued",
        request_id=request_id,
        week=week,
        message=f"Weekly report for {week} has been queued. It will be emailed to {current_user.email}.",
    )
