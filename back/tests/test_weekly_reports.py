import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Meeting, Participant, User
from app.reports.weekly import build_weekly_report, parse_iso_week


def test_parse_iso_week_valid():
    curr_start, curr_end, prev_start, prev_end = parse_iso_week("2026-W40")
    assert curr_start == datetime(2026, 9, 28, 0, 0, 0, tzinfo=UTC)
    assert curr_end == datetime(2026, 10, 5, 0, 0, 0, tzinfo=UTC)
    assert prev_start == datetime(2026, 9, 21, 0, 0, 0, tzinfo=UTC)
    assert prev_end == datetime(2026, 9, 28, 0, 0, 0, tzinfo=UTC)


def test_parse_iso_week_invalid():
    with pytest.raises(ValueError, match="Invalid ISO week format"):
        parse_iso_week("2026-40")

    with pytest.raises(ValueError, match="Invalid week number"):
        parse_iso_week("2026-W55")


@pytest.fixture
def sqlite_session():
    engine = create_engine("sqlite:///:memory:")
    Session = sessionmaker(bind=engine)
    Base.metadata.create_all(engine)
    with Session() as session:
        yield session
    Base.metadata.drop_all(engine)


def test_build_weekly_report_empty(sqlite_session):
    csv_bytes = build_weekly_report("2026-W40", session=sqlite_session)
    content = csv_bytes.decode("utf-8")

    assert "# Weekly Meetings Report,2026-W40" in content
    assert "Total Meetings,0,0,+0,N/A" in content
    assert "Total Duration (hours),0.0,0.0,+0.00,N/A" in content


def test_build_weekly_report_with_data(sqlite_session):
    alice = User(id=uuid.uuid4(), cognito_sub="sub-alice", email="alice@example.com", name="Alice Wonderland")
    bob = User(id=uuid.uuid4(), cognito_sub="sub-bob", email="bob@example.com", name="Bob Builder")
    sqlite_session.add_all([alice, bob])
    sqlite_session.flush()

    p1 = Participant(id=uuid.uuid4(), name="John Doe", email="john@example.com")
    p2 = Participant(id=uuid.uuid4(), name="Jane Smith", email="jane@example.com")
    sqlite_session.add_all([p1, p2])
    sqlite_session.flush()

    # Current week: 2026-W40 (2026-09-28 to 2026-10-05)
    m1 = Meeting(
        id=uuid.uuid4(),
        title="Meeting 1 - Short",
        starts_at=datetime(2026, 9, 29, 10, 0, 0, tzinfo=UTC),
        ends_at=datetime(2026, 9, 29, 11, 0, 0, tzinfo=UTC),  # 1.0 h
        owner_id=alice.id,
        participants=[p1],
    )
    m2 = Meeting(
        id=uuid.uuid4(),
        title="Meeting 2 - Long",
        starts_at=datetime(2026, 9, 30, 14, 0, 0, tzinfo=UTC),
        ends_at=datetime(2026, 9, 30, 16, 30, 0, tzinfo=UTC),  # 2.5 h
        owner_id=bob.id,
        participants=[p1, p2],
    )

    # Previous week: 2026-W39 (2026-09-21 to 2026-09-28)
    m_prev = Meeting(
        id=uuid.uuid4(),
        title="Meeting Prev Week",
        starts_at=datetime(2026, 9, 22, 12, 0, 0, tzinfo=UTC),
        ends_at=datetime(2026, 9, 22, 14, 0, 0, tzinfo=UTC),  # 2.0 h
        owner_id=alice.id,
    )

    sqlite_session.add_all([m1, m2, m_prev])
    sqlite_session.commit()

    # Run report
    csv_bytes_1 = build_weekly_report("2026-W40", session=sqlite_session)
    csv_bytes_2 = build_weekly_report("2026-W40", session=sqlite_session)

    # Idempotency check
    assert csv_bytes_1 == csv_bytes_2

    content = csv_bytes_1.decode("utf-8")
    assert "Total Meetings,2,1,+1,+100.0%" in content
    assert "Total Duration (hours),3.5,2.0,+1.50,+75.0%" in content
    assert "Meeting 2 - Long" in content
    assert "2.5" in content
    assert "Alice Wonderland" in content
    assert "Bob Builder" in content
