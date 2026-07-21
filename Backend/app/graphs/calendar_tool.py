"""
Tool: create a Google Calendar event.

This is our first tool with a SIDE EFFECT — it changes the real world (an
event appears on the calendar). The assistant is therefore instructed to
confirm the details with the user before calling it (see the system prompt
in assistant_graph.py).

The Google Calendar client is synchronous, so the actual work happens in a
helper that we run via asyncio.to_thread — keeping the async server free.
"""

import asyncio
from datetime import datetime, timedelta

from googleapiclient.discovery import build
from langchain_core.tools import tool

from app.services.google_auth import get_credentials


# Times without an explicit zone are interpreted in this timezone.
DEFAULT_TIMEZONE = "Asia/Karachi"


def _create_event(
    summary: str,
    start_datetime: str,
    duration_minutes: int,
    description: str,
) -> str:
    """
    Synchronous Calendar API call (runs on a worker thread).
    """

    # The model gives an ISO start time, e.g. "2026-07-22T15:00:00".
    start = datetime.fromisoformat(start_datetime)
    end = start + timedelta(minutes=duration_minutes)

    event_body = {
        "summary": summary,
        "description": description,
        "start": {
            "dateTime": start.isoformat(),
            "timeZone": DEFAULT_TIMEZONE,
        },
        "end": {
            "dateTime": end.isoformat(),
            "timeZone": DEFAULT_TIMEZONE,
        },
    }

    # Build a Calendar client authorized with the user's token.
    service = build(
        "calendar",
        "v3",
        credentials=get_credentials(),
        cache_discovery=False,
    )

    created = (
        service.events()
        .insert(
            calendarId="primary",
            body=event_body,
        )
        .execute()
    )

    link = created.get("htmlLink", "")

    return (
        f"Event created: '{summary}' on "
        f"{start.strftime('%A, %d %B %Y at %I:%M %p')} "
        f"for {duration_minutes} minutes.\nLink: {link}"
    )


@tool
async def create_calendar_event(
    summary: str,
    start_datetime: str,
    duration_minutes: int = 30,
    description: str = "",
) -> str:
    """
    Create an event on the user's Google Calendar.

    IMPORTANT: only call this AFTER the user has confirmed the details.

    Args:
      summary: the event title, e.g. "Team sync".
      start_datetime: ISO 8601 start time, e.g. "2026-07-22T15:00:00".
        If the user gives a relative time like "tomorrow at 3pm", first
        call get_current_datetime to work out the real date.
      duration_minutes: how long the event lasts. Defaults to 30.
      description: optional longer notes for the event.
    """

    try:
        return await asyncio.to_thread(
            _create_event,
            summary.strip(),
            start_datetime.strip(),
            duration_minutes,
            description.strip(),
        )
    except Exception as exc:
        return (
            "Could not create the calendar event. "
            f"Error: {exc}"
        )
