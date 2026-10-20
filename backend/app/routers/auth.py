"""Account registration, sign-in, and current-account endpoints."""

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import Credentials, RegisterRequest
from app.security import create_access_token, require_user


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register(credentials: RegisterRequest, session: Session = Depends(get_db)):
    email = credentials.email.lower()
    if session.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Email already registered")

    user = User(
        name=credentials.name,
        email=email,
        password_hash=bcrypt.hashpw(
            credentials.password.encode(),
            bcrypt.gensalt(),
        ).decode(),
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        if session.scalar(select(User.id).where(User.email == email)):
            raise HTTPException(409, "Email already registered") from error
        raise
    return create_access_token(user)


@router.post("/login")
def login(credentials: Credentials, session: Session = Depends(get_db)):
    user = session.scalar(
        select(User).where(User.email == credentials.email.lower())
    )
    if user is None or not bcrypt.checkpw(
        credentials.password.encode(),
        user.password_hash.encode(),
    ):
        raise HTTPException(401, "Invalid credentials")
    return create_access_token(user)


@router.get("/me")
def current_user(user: User = Depends(require_user)):
    return {"id": user.id, "name": user.name, "email": user.email}
