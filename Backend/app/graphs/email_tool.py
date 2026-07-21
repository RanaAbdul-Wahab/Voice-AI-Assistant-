"""
Tool: send an email via the user's Gmail.

This has a SIDE EFFECT — a real email goes out — so the assistant must
confirm the recipient, subject, and body with the user before calling it
(see the system prompt in assistant_graph.py).

The actual sending lives in services/gmail_service.py (shared with the
password-reset flow). Gmail's client is synchronous, so we run it via
asyncio.to_thread to keep the async server responsive.
"""

import asyncio

from langchain_core.tools import tool

from app.services.gmail_service import send_gmail


@tool
async def send_email(
    to: str,
    subject: str,
    body: str,
) -> str:
    """
    Send an email from the user's Gmail account.

    IMPORTANT: only call this AFTER the user has confirmed the recipient,
    subject, and body. Never send an email without explicit confirmation.

    Args:
      to: the recipient's email address.
      subject: the subject line.
      body: the plain-text body of the email.
    """

    try:
        message_id = await asyncio.to_thread(
            send_gmail,
            to.strip(),
            subject.strip(),
            body,
        )

        return (
            f"Email sent to {to} (subject: '{subject}'). "
            f"Message id: {message_id}"
        )
    except Exception as exc:
        return (
            "Could not send the email. "
            f"Error: {exc}"
        )
