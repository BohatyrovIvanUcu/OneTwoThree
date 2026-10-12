from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import Participant, User
from app.schemas import (
    AiMeetingCreateRequest,
    AiMeetingParseRequest,
    AiMeetingParseResponse,
    AiModelInfo,
    MeetingCreate,
    MeetingRead,
    ParticipantCreate,
)
from app.services import bedrock as bedrock_service
from app.services import meetings as meeting_service

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/models", response_model=list[AiModelInfo])
def get_ai_models(_: User = Depends(get_current_user)):
    """List available AWS Bedrock foundation models supported for meeting scheduling."""
    return bedrock_service.list_ai_models()


@router.post("/parse-meeting", response_model=AiMeetingParseResponse)
def parse_meeting_from_prompt(
    request: AiMeetingParseRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Parse a natural language prompt using AWS Bedrock and return structured meeting parameters."""
    participants = list(db.scalars(select(Participant)).all())

    try:
        parsed_data, model_used = bedrock_service.parse_meeting_with_bedrock(
            prompt=request.prompt,
            current_time=request.current_time or datetime.now(UTC),
            existing_participants=participants,
            model_id=request.model_id,
        )
    except (RuntimeError, ValueError) as err:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(err),
        ) from err

    # Ensure required fields or valid defaults
    title = str(parsed_data.get("title") or "Meeting").strip()
    description = parsed_data.get("description")
    call_link = parsed_data.get("call_link")
    place = parsed_data.get("place")
    starts_at = parsed_data.get("starts_at")
    ends_at = parsed_data.get("ends_at")

    # Participant IDs cleanup
    raw_p_ids = parsed_data.get("participant_ids") or []
    valid_p_ids: list[UUID] = []
    for pid in raw_p_ids:
        try:
            valid_p_ids.append(UUID(str(pid)))
        except (ValueError, TypeError):
            continue

    raw_new_p = parsed_data.get("new_participants") or []
    new_participants: list[ParticipantCreate] = []
    for np in raw_new_p:
        if isinstance(np, dict) and np.get("name") and np.get("email"):
            try:
                new_participants.append(
                    ParticipantCreate(name=str(np["name"]), email=str(np["email"]))
                )
            except Exception:
                continue

    return AiMeetingParseResponse(
        title=title,
        description=description,
        call_link=call_link,
        place=place,
        starts_at=starts_at,
        ends_at=ends_at,
        participant_ids=valid_p_ids,
        new_participants=new_participants,
        model_used=model_used,
    )


@router.post("/meetings", response_model=MeetingRead, status_code=status.HTTP_201_CREATED)
def create_meeting_with_ai(
    request: AiMeetingCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Parse a natural language prompt via AWS Bedrock and create the meeting directly."""
    participants = list(db.scalars(select(Participant)).all())

    try:
        parsed_data, _ = bedrock_service.parse_meeting_with_bedrock(
            prompt=request.prompt,
            current_time=request.current_time or datetime.now(UTC),
            existing_participants=participants,
            model_id=request.model_id,
        )
    except (RuntimeError, ValueError) as err:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(err),
        ) from err

    participant_ids: list[UUID] = []
    for pid in parsed_data.get("participant_ids") or []:
        try:
            participant_ids.append(UUID(str(pid)))
        except (ValueError, TypeError):
            continue

    # Auto-create new participants if requested
    if request.auto_create_participants:
        for np in parsed_data.get("new_participants") or []:
            if isinstance(np, dict) and np.get("name") and np.get("email"):
                name = str(np["name"]).strip()
                email = str(np["email"]).strip().lower()
                existing = db.scalar(
                    select(Participant).where(Participant.email == email)
                )
                if existing:
                    if existing.id not in participant_ids:
                        participant_ids.append(existing.id)
                else:
                    new_p = Participant(name=name, email=email)
                    db.add(new_p)
                    db.flush()
                    participant_ids.append(new_p.id)

    # Validate into MeetingCreate
    try:
        meeting_data = MeetingCreate(
            title=parsed_data.get("title") or "Meeting",
            description=parsed_data.get("description"),
            call_link=parsed_data.get("call_link"),
            place=parsed_data.get("place"),
            starts_at=parsed_data.get("starts_at"),
            ends_at=parsed_data.get("ends_at"),
            participant_ids=participant_ids,
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Parsed meeting failed validation: {err}",
        ) from err

    return meeting_service.create_meeting(db, meeting_data, user)
