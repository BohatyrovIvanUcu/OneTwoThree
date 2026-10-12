from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient


def test_get_ai_models(client: TestClient):
    response = client.get("/api/ai/models")
    assert response.status_code == 200
    models = response.json()
    assert isinstance(models, list)
    assert len(models) >= 1
    # Check schema
    model_ids = [m["id"] for m in models]
    assert "us.amazon.nova-micro-v1:0" in model_ids
    assert any(m["is_default"] for m in models)


def test_parse_meeting_with_mock_bedrock(client: TestClient):
    mock_llm_json = """{
        "title": "Design Review",
        "description": "Review new mockups",
        "call_link": "https://meet.google.com/abc-xyz",
        "place": null,
        "starts_at": "2026-10-15T14:00:00+00:00",
        "ends_at": "2026-10-15T15:00:00+00:00",
        "participant_ids": [],
        "new_participants": [{"name": "Charlie", "email": "charlie@example.com"}]
    }"""

    mock_client = MagicMock()
    mock_client.converse.return_value = {
        "output": {"message": {"content": [{"text": mock_llm_json}]}}
    }

    with patch("app.services.bedrock.get_bedrock_client", return_value=mock_client):
        response = client.post(
            "/api/ai/parse-meeting",
            json={
                "prompt": "Design review on Oct 15 at 2pm on Meet with Charlie charlie@example.com",
                "model_id": "us.amazon.nova-micro-v1:0",
            },
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["title"] == "Design Review"
        assert data["call_link"] == "https://meet.google.com/abc-xyz"
        assert data["starts_at"] == "2026-10-15T14:00:00Z"
        assert len(data["new_participants"]) == 1
        assert data["new_participants"][0]["name"] == "Charlie"
        assert data["model_used"] == "us.amazon.nova-micro-v1:0"


def test_create_meeting_with_ai(client: TestClient):
    existing_participant_id = str(uuid4())
    mock_llm_json = f"""{{
        "title": "Architecture Sync",
        "description": "Discuss AWS Bedrock integration",
        "call_link": null,
        "place": "Conference Room A",
        "starts_at": "2026-10-16T10:00:00+00:00",
        "ends_at": "2026-10-16T11:00:00+00:00",
        "participant_ids": ["{existing_participant_id}"],
        "new_participants": [{{"name": "Diana", "email": "diana@example.com"}}]
    }}"""

    # First seed existing participant
    p_resp = client.post(
        "/api/participants",
        json={"name": "Existing Person", "email": "existing@example.com"},
    )
    assert p_resp.status_code == 201
    real_pid = p_resp.json()["id"]

    mock_llm_json = mock_llm_json.replace(existing_participant_id, real_pid)

    mock_client = MagicMock()
    mock_client.converse.return_value = {
        "output": {"message": {"content": [{"text": mock_llm_json}]}}
    }

    with patch("app.services.bedrock.get_bedrock_client", return_value=mock_client):
        response = client.post(
            "/api/meetings/ai",
            json={
                "prompt": (
                    "Architecture sync in Room A with Existing Person and Diana diana@example.com"
                ),
                "auto_create_participants": True,
            },
        )
        assert response.status_code == 201, response.text
        meeting = response.json()
        assert meeting["title"] == "Architecture Sync"
        assert meeting["place"] == "Conference Room A"
        assert meeting["call_link"] is None
        participant_emails = [p["email"] for p in meeting["participants"]]
        assert "existing@example.com" in participant_emails
        assert "diana@example.com" in participant_emails


def test_ai_bedrock_failure_returns_502(client: TestClient):
    mock_client = MagicMock()
    mock_client.converse.side_effect = Exception("AWS Bedrock service error")

    with patch("app.services.bedrock.get_bedrock_client", return_value=mock_client):
        response = client.post(
            "/api/ai/parse-meeting",
            json={"prompt": "Some meeting"},
        )
        assert response.status_code == 502
        assert "AWS Bedrock error" in response.json()["detail"]
