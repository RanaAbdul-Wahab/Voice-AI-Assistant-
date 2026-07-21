"""
Reusable auth "gate" for protected endpoints.

`get_current_user` turns an incoming request's token into an actual user,
or blocks the request with 401. Attach it to any endpoint that should
require login:

    def some_endpoint(user = Depends(get_current_user)):
        ...
"""

import jwt

from fastapi import Depends, HTTPException, status
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)

from app.database import get_connection
from app.security import decode_access_token


# HTTPBearer reads the "Authorization: Bearer <token>" header for us.
# If the header is missing, it rejects the request automatically.
bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(
        bearer_scheme,
    ),
) -> dict:
    """
    Validate the token and return the matching user as {id, email}.
    """

    # credentials.credentials is the raw token string after "Bearer ".
    token = credentials.credentials

    # 1. Verify the signature + expiry. Any problem -> reject.
    try:
        payload = decode_access_token(token)
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    # 2. Read the user id we stored in the token's "sub" claim.
    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token payload.",
        ) from exc

    # 3. Confirm the user still exists (they could have been deleted
    #    after the token was issued).
    connection = get_connection()

    try:
        row = connection.execute(
            "SELECT id, email FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    finally:
        connection.close()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists.",
        )

    return {
        "id": row["id"],
        "email": row["email"],
    }
