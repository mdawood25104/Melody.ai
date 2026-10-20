"""Authentication dependencies and signed access-token helpers."""

import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.config import SECRET_KEY
from app.database import get_db
from app.models import User


def require_user(
    authorization: str = Header(default=""),
    session: Session = Depends(get_db),
) -> User:
    """Resolve the bearer token to its account or reject the request."""
    try:
        user_id = jwt.decode(
            authorization.removeprefix("Bearer "),
            SECRET_KEY,
            algorithms=["HS256"],
        )["sub"]
    except (jwt.InvalidTokenError, KeyError, TypeError):
        raise HTTPException(401, "Not authenticated") from None

    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(401, "Not authenticated")
    return user


def create_access_token(user: User) -> dict[str, str]:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    )
    encoded = jwt.encode(
        {"sub": user.id, "exp": expires_at},
        SECRET_KEY,
        algorithm="HS256",
    )
    return {"access_token": encoded}
