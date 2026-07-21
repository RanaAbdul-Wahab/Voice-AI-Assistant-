"""
Authentication endpoints: register and login.

Both endpoints are plain `def` (not `async def`). Our SQLite calls are
blocking, and FastAPI automatically runs sync endpoints in a thread pool,
so they won't freeze the server.
"""

import hashlib
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import settings
from app.database import get_connection
from app.dependencies import get_current_user
from app.schemas import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    UserResponse,
)
from app.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.services.gmail_service import send_gmail


router = APIRouter(
    prefix="/api/auth",
    tags=["auth"],
)


# How long a password-reset link stays valid.
RESET_TOKEN_EXPIRE_MINUTES = 30


def _hash_reset_token(raw_token: str) -> str:
    """
    Hash a reset token with SHA-256.

    Reset tokens are long random strings (high entropy), so a FAST hash is
    correct here — unlike passwords, which need slow bcrypt. We store only
    this hash; the raw token exists solely in the emailed link.
    """

    return hashlib.sha256(
        raw_token.encode("utf-8"),
    ).hexdigest()


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    request: RegisterRequest,
) -> AuthResponse:
    """
    Create a new user account, then log them straight in (return a token).
    """

    # Normalize the email so "Ali@X.com" and "ali@x.com" are the same account.
    email = request.email.strip().lower()

    # Store only the hash — never the real password.
    hashed = hash_password(request.password)

    connection = get_connection()

    try:
        # The ? placeholders keep this safe from SQL injection.
        cursor = connection.execute(
            "INSERT INTO users (email, hashed_password) "
            "VALUES (?, ?)",
            (email, hashed),
        )

        connection.commit()

        # SQLite hands back the new row's auto-generated id.
        user_id = cursor.lastrowid

    except sqlite3.IntegrityError as exc:
        # The email column is UNIQUE, so a duplicate raises IntegrityError.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        ) from exc

    finally:
        connection.close()

    token = create_access_token(
        user_id=user_id,
        email=email,
    )

    return AuthResponse(
        access_token=token,
        user_id=user_id,
        email=email,
    )


@router.post(
    "/login",
    response_model=AuthResponse,
)
def login(
    request: LoginRequest,
) -> AuthResponse:
    """
    Check the email + password and, if correct, return a fresh token.
    """

    email = request.email.strip().lower()

    connection = get_connection()

    try:
        row = connection.execute(
            "SELECT id, email, hashed_password "
            "FROM users WHERE email = ?",
            (email,),
        ).fetchone()

    finally:
        connection.close()

    # One generic error for BOTH "no such email" and "wrong password",
    # so an attacker can't learn which emails are registered.
    if row is None or not verify_password(
        request.password,
        row["hashed_password"],
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    token = create_access_token(
        user_id=row["id"],
        email=row["email"],
    )

    return AuthResponse(
        access_token=token,
        user_id=row["id"],
        email=row["email"],
    )


@router.get(
    "/me",
    response_model=UserResponse,
)
def read_current_user(
    current_user: dict = Depends(get_current_user),
) -> UserResponse:
    """
    Return the logged-in user. Protected: without a valid token, the
    get_current_user gate rejects the request with 401 before we get here.
    """

    return UserResponse(
        user_id=current_user["id"],
        email=current_user["email"],
    )


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
)
def forgot_password(
    request: ForgotPasswordRequest,
) -> MessageResponse:
    """
    Start a password reset: if the email belongs to an account, create a
    reset token and email a link. Returns the SAME message either way, so
    an attacker can't discover which emails are registered.
    """

    email = request.email.strip().lower()

    generic = MessageResponse(
        message=(
            "If an account exists for that email, "
            "a reset link has been sent."
        ),
    )

    connection = get_connection()

    try:
        row = connection.execute(
            "SELECT id FROM users WHERE email = ?",
            (email,),
        ).fetchone()

        # Unknown email -> stop here, but return the same generic message.
        if row is None:
            return generic

        user_id = row["id"]

        # Random token; store only its hash + an expiry.
        raw_token = secrets.token_urlsafe(32)
        token_hash = _hash_reset_token(raw_token)

        expires_at = (
            datetime.now(timezone.utc)
            + timedelta(
                minutes=RESET_TOKEN_EXPIRE_MINUTES,
            )
        ).isoformat()

        connection.execute(
            "INSERT INTO password_resets "
            "(user_id, token_hash, expires_at) "
            "VALUES (?, ?, ?)",
            (user_id, token_hash, expires_at),
        )

        connection.commit()

    finally:
        connection.close()

    # Build the link the user clicks and email it (reusing our Gmail service).
    reset_link = (
        f"{settings.frontend_origin}"
        f"/?reset_token={raw_token}"
    )

    body = (
        "We received a request to reset your Aria password.\n\n"
        "Click the link below to choose a new password "
        f"(valid for {RESET_TOKEN_EXPIRE_MINUTES} minutes):\n\n"
        f"{reset_link}\n\n"
        "If you didn't request this, you can safely ignore this email."
    )

    try:
        send_gmail(
            to=email,
            subject="Reset your Aria password",
            body=body,
        )
    except Exception:
        # Never leak internal/email errors to the caller.
        pass

    return generic


@router.post(
    "/reset-password",
    response_model=MessageResponse,
)
def reset_password(
    request: ResetPasswordRequest,
) -> MessageResponse:
    """
    Finish a password reset: verify the token, set the new password, and
    burn the token so it can't be reused.
    """

    token_hash = _hash_reset_token(request.token.strip())

    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This reset link is invalid or has expired.",
    )

    connection = get_connection()

    try:
        row = connection.execute(
            "SELECT id, user_id, expires_at, used "
            "FROM password_resets WHERE token_hash = ?",
            (token_hash,),
        ).fetchone()

        # No such token, or already used -> reject.
        if row is None or row["used"]:
            raise invalid

        # Expired -> reject.
        expires_at = datetime.fromisoformat(
            row["expires_at"],
        )

        if datetime.now(timezone.utc) > expires_at:
            raise invalid

        # Set the new password and mark the token used (single-use).
        new_hash = hash_password(request.password)

        connection.execute(
            "UPDATE users SET hashed_password = ? WHERE id = ?",
            (new_hash, row["user_id"]),
        )

        connection.execute(
            "UPDATE password_resets SET used = 1 WHERE id = ?",
            (row["id"],),
        )

        connection.commit()

    finally:
        connection.close()

    return MessageResponse(
        message=(
            "Your password has been reset. "
            "You can now log in."
        ),
    )
