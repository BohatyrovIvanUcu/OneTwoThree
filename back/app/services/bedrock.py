from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

import boto3

from app.config import settings
from app.models import Participant
from app.schemas import AiModelInfo

logger = logging.getLogger(__name__)

SUPPORTED_MODELS: list[dict[str, str]] = [
    {
        "id": "us.amazon.nova-micro-v1:0",
        "name": "Amazon Nova Micro",
        "description": "Fastest and most cost-effective foundation model for calendar parsing",
    },
    {
        "id": "us.amazon.nova-lite-v1:0",
        "name": "Amazon Nova Lite",
        "description": "Balanced speed and reasoning for complex meeting descriptions",
    },
    {
        "id": "us.amazon.nova-pro-v1:0",
        "name": "Amazon Nova Pro",
        "description": "Advanced reasoning model for complex scheduling constraints",
    },
    {
        "id": "meta.llama3-8b-instruct-v1:0",
        "name": "Meta Llama 3 8B Instruct",
        "description": "Open-weights instruction-tuned model via Amazon Bedrock",
    },
]


def list_ai_models() -> list[AiModelInfo]:
    default_id = settings.bedrock_model_id or "us.amazon.nova-micro-v1:0"
    models: list[AiModelInfo] = []
    found_default = False
    for m in SUPPORTED_MODELS:
        is_default = m["id"] == default_id
        if is_default:
            found_default = True
        models.append(
            AiModelInfo(
                id=m["id"],
                name=m["name"],
                description=m["description"],
                is_default=is_default,
            )
        )
    if not found_default and models:
        models[0].is_default = True
    return models


def get_bedrock_client():
    kwargs: dict[str, Any] = {
        "region_name": settings.bedrock_region or settings.aws_region or "us-east-1"
    }
    if settings.aws_access_key_id and settings.aws_secret_access_key:
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
        if settings.aws_session_token:
            kwargs["aws_session_token"] = settings.aws_session_token

    return boto3.client("bedrock-runtime", **kwargs)


def _extract_json(raw_text: str) -> dict[str, Any]:
    text = raw_text.strip()
    if text.startswith("```"):
        # Remove opening code fence
        lines = text.split("\n", 1)
        if len(lines) > 1:
            text = lines[1].rsplit("```", 1)[0].strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Fallback: extract substring between first { and last }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(text[start : end + 1])

    raise ValueError(f"Model output did not contain valid JSON: {raw_text[:200]}")


def parse_meeting_with_bedrock(
    prompt: str,
    current_time: datetime | None = None,
    existing_participants: list[Participant] | None = None,
    model_id: str | None = None,
) -> tuple[dict[str, Any], str]:
    if not current_time:
        current_time = datetime.now(UTC)
    elif current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=UTC)

    active_model_id = (
        model_id.strip()
        if model_id and model_id.strip()
        else (settings.bedrock_model_id or "us.amazon.nova-micro-v1:0")
    )

    now_iso = current_time.isoformat()
    day_name = current_time.strftime("%A")

    participants_desc = "None"
    if existing_participants:
        participants_desc = "\n".join(
            f'  - id: "{p.id}", name: "{p.name}", email: "{p.email}"'
            for p in existing_participants
        )

    system_prompt = f"""You are an intelligent scheduling assistant for a calendar application.
Your task is to parse a natural language prompt from the user into meeting details.

Context:
- Current reference datetime: {now_iso} ({day_name})
- Directory of existing participants:
{participants_desc}

Response format:
You MUST respond with a single valid JSON object and NOTHING ELSE. No extra markdown.

The JSON object MUST contain the following fields:
- "title": string (concise, clear title of the meeting, 1-200 chars)
- "description": string or null (agenda or additional details, or null if not provided)
- "call_link": valid URL string (e.g. "https://meet.google.com/...") or null
- "place": string or null (room name, address or office location, or null)
- "starts_at": ISO 8601 string with timezone offset (e.g. "2026-10-13T15:00:00+03:00")
- "ends_at": ISO 8601 string with timezone offset (e.g. "2026-10-13T16:00:00+03:00")
- "participant_ids": list of UUID strings matching existing participants mentioned in prompt
- "new_participants": list of objects {{"name": string, "email": string}} for new people

Rules:
1. Relative dates ("today", "tomorrow", "this Friday", "next Monday"):
   Calculate the date strictly into the future relative to the Current reference datetime.
2. Duration:
   If end time or duration is not mentioned, make ends_at exactly 1 hour after starts_at.
   The meeting MUST end strictly after it starts.
3. Call link vs Place:
   At least one of "call_link" or "place" must be provided:
   - If user specified a place but no link, set "call_link" to null.
   - If user specified a link but no place, set "place" to null.
   - If user specified neither, set "call_link" to "https://meet.google.com/new" and "place" to null.
4. Participant matching:
   - If a participant matches someone in the directory, add their "id" to "participant_ids".
   - If an email is mentioned that is not in the directory, add it to "new_participants".
"""

    client = get_bedrock_client()

    try:
        response = client.converse(
            modelId=active_model_id,
            system=[{"text": system_prompt}],
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"temperature": 0.1, "maxTokens": 1000},
        )
    except Exception as err:
        logger.exception("AWS Bedrock Converse call failed for model %s: %s", active_model_id, err)
        raise RuntimeError(f"AWS Bedrock error ({active_model_id}): {err}") from err

    try:
        output_content = response["output"]["message"]["content"]
        raw_text = "".join(part.get("text", "") for part in output_content if "text" in part)
        parsed = _extract_json(raw_text)
    except Exception as err:
        logger.exception("Failed to parse Bedrock response into JSON: %s", err)
        raise ValueError(f"Could not parse structured meeting from AI response: {err}") from err

    return parsed, active_model_id
