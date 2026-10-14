import csv
import io
import re
from datetime import UTC, datetime, time, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import SessionLocal
from app.models import Meeting, User


def parse_iso_week(week_str: str) -> tuple[datetime, datetime, datetime, datetime]:
    """Parse an ISO week string (e.g. '2026-W40') into UTC datetime ranges:

    (current_week_start, current_week_end, previous_week_start, previous_week_end).
    Weeks start on Monday 00:00:00 UTC and end on the following Monday 00:00:00 UTC.
    """
    match = re.match(r"^(\d{4})-W(\d{1,2})$", week_str.strip())
    if not match:
        raise ValueError(f"Invalid ISO week format '{week_str}'. Expected format: YYYY-Www (e.g. 2026-W40)")

    year = int(match.group(1))
    week = int(match.group(2))
    if week < 1 or week > 53:
        raise ValueError(f"Invalid week number '{week}'. Expected 1-53.")

    # Monday of the ISO week
    start_date = datetime.fromisocalendar(year, week, 1)
    curr_start = datetime.combine(start_date.date(), time.min, tzinfo=UTC)
    curr_end = curr_start + timedelta(days=7)

    prev_start = curr_start - timedelta(days=7)
    prev_end = curr_start

    return curr_start, curr_end, prev_start, prev_end


def _calculate_duration_hours(starts_at: datetime, ends_at: datetime) -> float:
    """Calculate meeting duration in hours, rounded to 2 decimal places."""
    duration_seconds = (ends_at - starts_at).total_seconds()
    if duration_seconds < 0:
        return 0.0
    return round(duration_seconds / 3600.0, 2)


def build_weekly_report(week: str, session: Session | None = None) -> bytes:
    """Query the meetings of one ISO week (e.g. '2026-W40') and return the CSV as bytes.

    Includes:
    - Total meetings count and total duration in hours for the target week.
    - Previous week comparison (totals, absolute change, percentage change).
    - Top 5 longest meetings with title, start, duration and participants count.
    - Breakdown of totals per organizer (owner).
    """
    curr_start, curr_end, prev_start, prev_end = parse_iso_week(week)

    if session is not None:
        return _generate_report_from_session(session, week, curr_start, curr_end, prev_start, prev_end)

    with SessionLocal() as db_session:
        return _generate_report_from_session(db_session, week, curr_start, curr_end, prev_start, prev_end)


def _generate_report_from_session(
    session: Session,
    week: str,
    curr_start: datetime,
    curr_end: datetime,
    prev_start: datetime,
    prev_end: datetime,
) -> bytes:
    # 1. Fetch current week meetings with participants
    curr_stmt = (
        select(Meeting)
        .options(selectinload(Meeting.participants))
        .where(Meeting.starts_at >= curr_start, Meeting.starts_at < curr_end)
        .order_by(Meeting.starts_at)
    )
    curr_meetings = list(session.scalars(curr_stmt).all())

    # 2. Fetch previous week meetings for comparison
    prev_stmt = (
        select(Meeting)
        .where(Meeting.starts_at >= prev_start, Meeting.starts_at < prev_end)
        .order_by(Meeting.starts_at)
    )
    prev_meetings = list(session.scalars(prev_stmt).all())

    # 3. Fetch users for organizer lookup
    user_stmt = select(User)
    users = {u.id: u for u in session.scalars(user_stmt).all()}

    # Calculate metrics
    curr_count = len(curr_meetings)
    curr_duration = round(sum(_calculate_duration_hours(m.starts_at, m.ends_at) for m in curr_meetings), 2)

    prev_count = len(prev_meetings)
    prev_duration = round(sum(_calculate_duration_hours(m.starts_at, m.ends_at) for m in prev_meetings), 2)

    delta_count = curr_count - prev_count
    delta_duration = round(curr_duration - prev_duration, 2)

    pct_count_str = f"{(delta_count / prev_count) * 100:+.1f}%" if prev_count > 0 else "N/A"
    pct_duration_str = f"{(delta_duration / prev_duration) * 100:+.1f}%" if prev_duration > 0 else "N/A"

    # Find 5 longest meetings
    meetings_with_duration = [
        {
            "meeting": m,
            "duration": _calculate_duration_hours(m.starts_at, m.ends_at),
            "participants_count": len(m.participants),
        }
        for m in curr_meetings
    ]
    meetings_with_duration.sort(key=lambda x: x["duration"], reverse=True)
    top_5 = meetings_with_duration[:5]

    # Breakdown per organizer
    organizers: dict[str, dict[str, Any]] = {}
    for m in curr_meetings:
        owner = users.get(m.owner_id) if m.owner_id else None
        org_name = owner.name if owner and owner.name else (owner.email if owner else "Unassigned")
        org_email = owner.email if owner else "none"

        key = str(m.owner_id) if m.owner_id else "none"
        if key not in organizers:
            organizers[key] = {
                "name": org_name,
                "email": org_email,
                "count": 0,
                "duration": 0.0,
            }
        organizers[key]["count"] += 1
        organizers[key]["duration"] = round(
            organizers[key]["duration"] + _calculate_duration_hours(m.starts_at, m.ends_at), 2
        )

    # 4. Generate CSV output
    output = io.StringIO()
    writer = csv.writer(output)

    # Header / Title
    period_end_str = (curr_end - timedelta(seconds=1)).strftime("%Y-%m-%d")
    writer.writerow(["# Weekly Meetings Report", week])
    writer.writerow(["# Period (UTC)", curr_start.strftime("%Y-%m-%d"), "to", period_end_str])
    writer.writerow([])

    # Section 1: KPI Summary
    writer.writerow(["SUMMARY_METRIC", "CURRENT_WEEK", "PREVIOUS_WEEK", "CHANGE_ABSOLUTE", "CHANGE_PERCENT"])
    writer.writerow(["Total Meetings", curr_count, prev_count, f"{delta_count:+d}", pct_count_str])
    writer.writerow(
        [
            "Total Duration (hours)",
            curr_duration,
            prev_duration,
            f"{delta_duration:+.2f}",
            pct_duration_str,
        ]
    )
    writer.writerow([])

    # Section 2: Top 5 Longest Meetings
    writer.writerow(["TOP_LONGEST_MEETINGS"])
    writer.writerow(["Rank", "Title", "Starts At (UTC)", "Duration (hours)", "Participants Count"])
    if not top_5:
        writer.writerow(["-", "No meetings recorded for this week", "-", 0.0, 0])
    else:
        for idx, item in enumerate(top_5, start=1):
            m = item["meeting"]
            writer.writerow(
                [
                    idx,
                    m.title,
                    m.starts_at.strftime("%Y-%m-%d %H:%M:%S UTC"),
                    item["duration"],
                    item["participants_count"],
                ]
            )
    writer.writerow([])

    # Section 3: Breakdown by Organizer
    writer.writerow(["BREAKDOWN_BY_ORGANIZER"])
    writer.writerow(["Organizer Name", "Organizer Email", "Meetings Count", "Total Duration (hours)"])
    if not organizers:
        writer.writerow(["-", "-", 0, 0.0])
    else:
        for org in sorted(organizers.values(), key=lambda x: x["duration"], reverse=True):
            writer.writerow(
                [
                    org["name"],
                    org["email"],
                    org["count"],
                    org["duration"],
                ]
            )

    return output.getvalue().encode("utf-8")
