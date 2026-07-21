"""
A tiny tool that tells the agent the current date and time.

Language models don't actually know "now" — their knowledge is frozen at
training time. Without this, Aria would guess (often wrongly) whenever a
question depends on the current date. This tool gives her the real answer.

This is intentionally the simplest possible tool: no external services,
no arguments — just a clear docstring and a return value. It's the
template for every tool that follows.
"""

from datetime import datetime

from langchain_core.tools import tool


@tool
def get_current_datetime() -> str:
    """
    Get the current date, time, and day of the week.

    Use this whenever the answer depends on "now" — for example the
    today's date, the current time, what day of the week it is, or
    relative periods like "this week", "next month", or a deadline.
    """

    # .astimezone() attaches the server's local timezone to "now",
    # so the result reflects local time (and shows the zone name).
    now = datetime.now().astimezone()

    return now.strftime(
        "%A, %d %B %Y, %I:%M %p (%Z)"
    )
