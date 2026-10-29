import base64
import json
import logging
import time
from datetime import date
from typing import Any

from app.ai.agenda import (
    PROMPT_VERSION,
    AgendaParseError,
    calculate_cost_usd,
    parse_agenda,
)
from app.auth import LOCAL_IDENTITY, verify_id_token
from app.config import settings

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

if not logger.handlers:
    sh = logging.StreamHandler()
    sh.setFormatter(logging.Formatter("[%(levelname)s] %(asctime)s - %(name)s - %(message)s"))
    logger.addHandler(sh)


CORS_HEADERS = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
}


def extract_header(headers: dict[str, Any], name: str) -> str:
    for k, v in headers.items():
        if k.lower() == name.lower():
            return str(v)
    return ""


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Lambda Function URL entry point for agenda parsing.

    Runs outside the VPC ($0 idle cost), verifies Cognito token against JWKS,
    and returns parsed agenda with structured CloudWatch metrics.
    """
    http_method = (
        event.get("requestContext", {}).get("http", {}).get("method")
        or event.get("httpMethod", "POST")
    )

    # Handle CORS preflight if invoked directly
    if http_method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": "",
        }

    headers = event.get("headers") or {}
    auth_header = extract_header(headers, "authorization")

    # Authenticate via Cognito
    user = None
    if not getattr(settings, "auth_enabled", False) and not auth_header:
        user = LOCAL_IDENTITY
    else:
        if not auth_header.startswith("Bearer "):
            return {
                "statusCode": 401,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Authorization Bearer token required"}),
            }
        token = auth_header.split(" ", 1)[1].strip()
        try:
            user = verify_id_token(token)
        except Exception as err:
            logger.warning("Token verification failed: %s", err)
            return {
                "statusCode": 401,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"Unauthorized: {err}"}),
            }

    # Parse body
    raw_body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw_body = base64.b64decode(raw_body).decode("utf-8")

    try:
        body = json.loads(raw_body)
    except Exception:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Invalid JSON request body"}),
        }

    text = body.get("text", "")
    if not isinstance(text, str) or not text.strip():
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Field 'text' is required"}),
        }

    # Limits: reject > 10,000 characters before calling model (saves cost and protects quota)
    if len(text) > 10_000:
        return {
            "statusCode": 413,
            "headers": CORS_HEADERS,
            "body": json.dumps(
                {"error": f"Payload too large: text length ({len(text)}) exceeds maximum of 10,000 characters"}
            ),
        }

    # Extract date and time zone
    today_str = body.get("today")
    try:
        today = date.fromisoformat(today_str) if today_str else date.today()
    except Exception:
        today = date.today()

    tz = body.get("tz") or "UTC"
    model = body.get("model") or getattr(settings, "parser_model", "anthropic.claude-haiku-5-5")

    started = time.monotonic()
    try:
        agenda, usage = parse_agenda(text=text, today=today, tz=tz, model=model)
    except AgendaParseError as e:
        logger.warning("AgendaParseError: %s", e)
        return {
            "statusCode": 422,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": str(e)}),
        }
    except Exception as e:
        logger.error("Failed to parse agenda: %s", e, exc_info=True)
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": f"LLM parser error: {e}"}),
        }

    latency_ms = int((time.monotonic() - started) * 1000)
    cost = calculate_cost_usd(model, usage)

    # Required single CloudWatch log line in JSON format (Submission Item 4)
    log_line = {
        "event": "agenda_parsed",
        "user": user.sub,
        "model": model,
        "prompt_version": PROMPT_VERSION,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "latency_ms": latency_ms,
        "cost_usd": cost,
    }
    logger.info(json.dumps(log_line))
    print(f"[METRIC] {json.dumps(log_line)}")

    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps(
            {
                "agenda": agenda.model_dump(mode="json"),
                "model": model,
                "prompt_version": PROMPT_VERSION,
                "usage": usage,
                "latency_ms": latency_ms,
                "cost_usd": cost,
            }
        ),
    }

