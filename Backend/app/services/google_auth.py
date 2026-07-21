"""
Google OAuth for user-facing Google APIs (Calendar, Gmail).

Vertex AI uses your service account (Application Default Credentials), but
acting on a person's Calendar or Gmail needs THAT PERSON's permission. OAuth
is how Google grants it: the user consents once in a browser, Google returns
a refresh token, and we store it so we never have to ask again.

Two secret files live in Backend/ (both git-ignored):
  credentials.json  the OAuth CLIENT you download from Google Cloud Console
  token.json        the user's authorization, created after the consent flow
"""

from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow


# The permissions we request. Keep them MINIMAL — the whole point of OAuth
# is least privilege:
#   calendar.events  -> create/read calendar events (not full calendar admin)
#   gmail.send       -> send email only (cannot read the user's inbox)
SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.send",
]


# app/services/google_auth.py -> services -> app -> Backend
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

CREDENTIALS_PATH = _BACKEND_DIR / "credentials.json"
TOKEN_PATH = _BACKEND_DIR / "token.json"


def get_credentials() -> Credentials:
    """
    Return valid credentials for the tools to use.

    Server-safe: this NEVER opens a browser. It loads the saved token and
    refreshes it if expired. If there's no token yet, it raises a clear
    error telling you to run the one-time consent flow.
    """

    if not TOKEN_PATH.exists():
        raise RuntimeError(
            "Google account not authorized yet. Run the one-time consent: "
            "python scripts/authorize_google.py",
        )

    credentials = Credentials.from_authorized_user_file(
        str(TOKEN_PATH),
        SCOPES,
    )

    if credentials.valid:
        return credentials

    # Expired but we have a refresh token -> silently get a new access token.
    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
        TOKEN_PATH.write_text(
            credentials.to_json(),
            encoding="utf-8",
        )
        return credentials

    raise RuntimeError(
        "Google authorization is no longer valid. Re-run: "
        "python scripts/authorize_google.py",
    )


def run_consent_flow() -> None:
    """
    Interactive ONE-TIME consent. Opens a browser for the user to approve,
    then saves token.json. Run this from a script, never inside the server.
    """

    if not CREDENTIALS_PATH.exists():
        raise RuntimeError(
            "Missing Backend/credentials.json. Download your OAuth client "
            "(Desktop app) from Google Cloud Console and save it there.",
        )

    flow = InstalledAppFlow.from_client_secrets_file(
        str(CREDENTIALS_PATH),
        SCOPES,
    )

    # Opens the browser, waits for approval, returns credentials.
    credentials = flow.run_local_server(port=0)

    TOKEN_PATH.write_text(
        credentials.to_json(),
        encoding="utf-8",
    )

    print(f"Authorized! Saved token to {TOKEN_PATH}")
