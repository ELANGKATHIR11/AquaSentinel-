"""
Auth router:
  POST /api/v1/auth/login    — email+password → tokens
  POST /api/v1/auth/refresh  — refresh token → new access token
  GET  /api/v1/auth/me       — current user info
  POST /api/v1/auth/register — create user (org_admin+ only)
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.auth import (
    CurrentUser,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    require_org_admin,
    verify_password,
)
from apps.api.database import get_db_session
from apps.api.models import User, UserRoleEnum

router = APIRouter(prefix="/auth", tags=["Auth"])
log = structlog.get_logger(__name__)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    user_id: str
    email: str
    display_name: str
    role: str
    org_id: str


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5)
    display_name: str = Field(..., min_length=2)
    password: str = Field(..., min_length=8)
    role: str = Field(default="viewer")


@router.post("/login", response_model=TokenResponse)
async def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == form.username, User.is_active == True))  # noqa
    user = result.scalar_one_or_none()

    if user is None or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    from apps.api.config import get_settings
    settings = get_settings()

    access_token = create_access_token(user.id, user.email, user.role.value, user.organization_id)
    refresh_token = create_refresh_token(user.id, user.email, user.role.value, user.organization_id)

    log.info("auth.login", user_id=user.id, email=user.email, role=user.role.value)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh(body: RefreshRequest) -> AccessTokenResponse:
    payload = decode_token(body.refresh_token)
    if payload.token_type != "refresh":
        raise HTTPException(status_code=400, detail="Not a refresh token")

    access_token = create_access_token(payload.sub, payload.email, payload.role, payload.org_id)
    return AccessTokenResponse(access_token=access_token)


@router.get("/me", response_model=UserResponse)
async def me(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db_session),
) -> UserResponse:
    user = await db.get(User, current_user.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role.value,
        org_id=user.organization_id,
    )


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(
    body: RegisterRequest,
    current_user: Annotated[CurrentUser, Depends(require_org_admin)],
    db: AsyncSession = Depends(get_db_session),
) -> UserResponse:
    """Create a new user. Requires org_admin or super_admin role."""
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    import uuid
    user = User(
        id=str(uuid.uuid4()),
        organization_id=current_user.org_id,
        email=body.email,
        display_name=body.display_name,
        hashed_password=hash_password(body.password),
        role=UserRoleEnum(body.role),
        is_active=True,
    )
    db.add(user)
    await db.commit()

    log.info("auth.register", new_user=body.email, by=current_user.email)
    return UserResponse(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role.value,
        org_id=user.organization_id,
    )
