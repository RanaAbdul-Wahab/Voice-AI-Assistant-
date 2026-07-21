"""
One-time Google authorization.

Run this ONCE (after placing Backend/credentials.json) to approve access
and create Backend/token.json:

    cd Backend
    python scripts/authorize_google.py

A browser window opens; sign in with your test-user account and approve.
After that, the app reuses the saved token automatically.
"""

import sys
from pathlib import Path

# Make the `app` package importable when running this file directly.
sys.path.insert(
    0,
    str(Path(__file__).resolve().parent.parent),
)

from app.services.google_auth import run_consent_flow


if __name__ == "__main__":
    run_consent_flow()
