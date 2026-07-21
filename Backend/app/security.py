"""
Password hashing helpers.

We NEVER store a user's real password. Instead we store a bcrypt "hash":
a scrambled, one-way fingerprint of the password.

- One-way : you cannot turn a hash back into the original password.
- Salted  : bcrypt mixes in random bytes (a "salt") before hashing, so two
            users with the same password still get different hashes.
- Slow    : bcrypt is deliberately slow, which makes brute-force guessing
            expensive for an attacker.
"""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import settings


def validate_password_strength(value: str) -> str:
    """
    Enforce the password policy. Shared by registration and password reset
    so the rules never drift apart. Raises ValueError on a weak password.
    """

    if len(value) < 8:
        raise ValueError(
            "Password must be at least 8 characters long.",
        )

    if not any(ch.isalpha() for ch in value):
        raise ValueError(
            "Password must contain at least one letter.",
        )

    if not any(ch.isdigit() for ch in value):
        raise ValueError(
            "Password must contain at least one number.",
        )

    return value


def hash_password(plain_password: str) -> str:
    """
    Turn a plain-text password into a bcrypt hash, ready to store in SQLite.
    """

    # bcrypt works on raw bytes, not text, so we encode the string to UTF-8.
    password_bytes = plain_password.encode("utf-8")

    # gensalt() produces fresh random salt every time this runs.
    salt = bcrypt.gensalt()

    # hashpw() combines the password with the salt and hashes it.
    hashed_bytes = bcrypt.hashpw(password_bytes, salt)

    # We store text in the database, so decode the bytes back to a string.
    return hashed_bytes.decode("utf-8")


def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    """
    Check a plain-text password against a stored bcrypt hash.

    Returns True if they match, False otherwise.

    Note: the salt is stored *inside* the hash itself, so bcrypt reads it
    back out automatically — we don't have to store the salt separately.
    """

    password_bytes = plain_password.encode("utf-8")
    hashed_bytes = hashed_password.encode("utf-8")

    return bcrypt.checkpw(password_bytes, hashed_bytes)


def create_access_token(
    user_id: int,
    email: str,
) -> str:
    """
    Build a signed JWT that proves "this request is from this user".

    The dict below is the token's PAYLOAD (its claims). It is readable by
    anyone, so it holds identifiers only — never a password.
    """

    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user_id),   # "subject": who the token is about
        "email": email,        # handy extra info
        "iat": now,            # issued-at: when it was created
        "exp": now             # expiry: when it stops being valid
        + timedelta(
            minutes=settings.jwt_expire_minutes,
        ),
    }

    # jwt.encode signs the payload with our secret key. The result is the
    # "header.payload.signature" string we hand to the frontend.
    return jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> dict:
    """
    Verify a token's signature and expiry, and return its payload.

    Raises a jwt exception if the token was tampered with, signed with a
    different secret, or has expired — which is exactly what we want:
    a bad token must never be trusted.
    """

    return jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
    )
