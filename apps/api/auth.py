"""
AquaSentinel — JWT Authentication & RBAC
=========================================
Provides:
  - Password hashing with bcrypt
  - JWT access tokens + refresh tokens
  - FastAPI dependency for current user extraction
  - RBAC permission checks by role

Roles (lowest → highest privilege):
  viewer < analyst < operator < org_admin < super_admin

Auth flow:
  POST /api/v1/auth/login   → {access_token, refresh_token}
  POST /api/v1/auth/refresh → {access_token}
  GET  /api/v1/auth/me      → {user info}

Tokens:
  - Access token: short-lived JWT (60 min default)
  - Refresh token: long-lived JWT (30 days default), stored server-side in future
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Annotated, Any

import structlog
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from apps.api.config import get_settings

log = structlog.get_logger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# Role hierarchy
# ---------------------------------------------------------------------------

class Role(str, Enum):
    viewer = "viewer"
    analyst = "analyst"
    operator = "operator"
    org_admin = "org_admin"
    super_admin = "super_admin"


_ROLE_RANK = {
    Role.viewer: 0,
    Role.analyst: 1,
    Role.operator: 2,
    Role.org_admin: 3,
    Role.super_admin: 4,
}


def has_permission(user_role: str, required_role: str) -> bool:
    """Returns True if user_role >= required_role in the role hierarchy."""
    try:
        return _ROLE_RANK[Role(user_role)] >= _ROLE_RANK[Role(required_role)]
    except (ValueError, KeyError):
        return False


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------

ALGORITHM = "HS256"
TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"


class TokenPayload(BaseModel):
    sub: str                # user ID
    email: str
    role: str
    org_id: str
    token_type: str
    exp: int


def create_access_token(user_id: str, email: str, role: str, org_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "org_id": org_id,
        "token_type": TOKEN_TYPE_ACCESS,
        "exp": int(expire.timestamp()),
        "iat": int(datetime.now(timezone.utc).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(user_id: str, email: str, role: str, org_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "org_id": org_id,
        "token_type": TOKEN_TYPE_REFRESH,
        "exp": int(expire.timestamp()),
        "iat": int(datetime.now(timezone.utc).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> TokenPayload:
    """Decode and validate a JWT. Raises HTTPException on failure."""
    try:
        raw = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return TokenPayload(**raw)
    except JWTError as exc:
        log.warning("jwt.decode_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


class CurrentUser(BaseModel):
    user_id: str
    email: str
    role: str
    org_id: str


async def get_current_user(
    token: Annotated[str | None, Depends(_oauth2_scheme)],
) -> CurrentUser:
    """FastAPI dependency: extract and validate user from Bearer token."""
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(token)
    if payload.token_type != TOKEN_TYPE_ACCESS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token cannot be used for API access",
        )
    return CurrentUser(
        user_id=payload.sub,
        email=payload.email,
        role=payload.role,
        org_id=payload.org_id,
    )


async def get_current_user_optional(
    token: Annotated[str | None, Depends(_oauth2_scheme)],
) -> CurrentUser | None:
    """Like get_current_user but returns None instead of raising for unauthenticated requests."""
    if token is None:
        return None
    try:
        payload = decode_token(token)
        return CurrentUser(
            user_id=payload.sub,
            email=payload.email,
            role=payload.role,
            org_id=payload.org_id,
        )
    except HTTPException:
        return None


def require_role(minimum_role: str):
    """Dependency factory: require a minimum role for a route."""
    async def _check(current_user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if not has_permission(current_user.role, minimum_role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required: {minimum_role}",
            )
        return current_user
    return _check


# Convenience role dependencies
require_operator = require_role("operator")
require_analyst = require_role("analyst")
require_org_admin = require_role("org_admin")
require_super_admin = require_role("super_admin")
