from datetime import date
import pytest
from pydantic import ValidationError

from app.ai.agenda import (
    ActionItem,
    AgendaItem,
    AgendaParseError,
    ParsedAgenda,
    calculate_cost_usd,
)


def test_agenda_item_validation():
    # Valid item
    item = AgendaItem(topic="Discuss Q3 results", owner="Olena", minutes=15)
    assert item.topic == "Discuss Q3 results"
    assert item.owner == "Olena"
    assert item.minutes == 15

    # Optional fields default to None
    item2 = AgendaItem(topic="Simple topic")
    assert item2.owner is None
    assert item2.minutes is None

    # Empty topic is rejected
    with pytest.raises(ValidationError):
        AgendaItem(topic="")

    # Minutes out of bounds rejected
    with pytest.raises(ValidationError):
        AgendaItem(topic="Too long", minutes=500)


def test_action_item_validation():
    # Valid action item
    action = ActionItem(task="Compile report", owner="Taras", due=date(2026, 10, 30))
    assert action.task == "Compile report"
    assert action.owner == "Taras"
    assert action.due == date(2026, 10, 30)

    # Empty task rejected
    with pytest.raises(ValidationError):
        ActionItem(task="")


def test_parsed_agenda_schema():
    raw_data = {
        "title": "Pricing sync",
        "starts_at": "2026-10-19T10:00:00+03:00",
        "duration_minutes": 45,
        "items": [
            {"topic": "Нові тарифи Pro", "owner": "Олена", "minutes": 15},
            {"topic": "Фідбек від клієнтів", "owner": "Taras", "minutes": None},
            {"topic": "Що робимо з річною знижкою", "owner": None, "minutes": None},
        ],
        "action_items": [
            {"task": "Збирає порівняння з конкурентами", "owner": "Taras", "due": "2026-10-23"},
        ],
        "language": "uk",
    }

    agenda = ParsedAgenda.model_validate(raw_data)
    assert agenda.title == "Pricing sync"
    assert agenda.duration_minutes == 45
    assert len(agenda.items) == 3
    assert agenda.items[0].owner == "Олена"
    assert agenda.items[0].minutes == 15
    assert len(agenda.action_items) == 1
    assert agenda.action_items[0].owner == "Taras"
    assert agenda.action_items[0].due == date(2026, 10, 23)
    assert agenda.language == "uk"


def test_calculate_cost_usd():
    # Haiku 5.5: input $0.10/M, output $0.50/M
    usage = {"input_tokens": 1500, "output_tokens": 300}
    # 1500 * 0.10 / 1e6 = 0.00015
    # 300 * 0.50 / 1e6 = 0.00015
    # Total = 0.00030
    cost = calculate_cost_usd("anthropic.claude-haiku-5-5", usage)
    assert cost == pytest.approx(0.0003, rel=1e-4)

    # Opus 5.5: input $4.00/M, output $20.00/M
    # 1500 * 4 / 1e6 = 0.006
    # 300 * 20 / 1e6 = 0.006
    # Total = 0.012
    cost_opus = calculate_cost_usd("anthropic.claude-opus-5-5", usage)
    assert cost_opus == pytest.approx(0.012, rel=1e-4)

