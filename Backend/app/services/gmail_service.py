"""
Send email via the user's Gmail (Gmail API).

Shared by BOTH the assistant's send_email tool and the password-reset flow,
so the actual sending logic lives in exactly one place.
"""

import base64
from email.message import EmailMessage

from googleapiclient.discovery import build

from app.services.google_auth import get_credentials


def send_gmail(
    to: str,
    subject: str,
    body: str,
) -> str:
    """
    Send a plain-text email from the authenticated Gmail account.
    Returns the sent message's id.
    """

    # Build the MIME email envelope.
    message = EmailMessage()
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    # Gmail wants the whole message base64url-encoded.
    raw = base64.urlsafe_b64encode(
        message.as_bytes(),
    ).decode()

    service = build(
        "gmail",
        "v1",
        credentials=get_credentials(),
        cache_discovery=False,
    )

    sent = (
        service.users()
        .messages()
        .send(
            userId="me",
            body={"raw": raw},
        )
        .execute()
    )

    return sent.get("id", "")
