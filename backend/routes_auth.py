import os
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from datetime import timedelta
from core import (db, hash_password, verify_password, create_access_token, create_refresh_token,
                  set_auth_cookies, get_current_user, audit, new_id, utcnow, utcnow_iso, ROLE_LEVELS, get_jwt_secret, JWT_ALGORITHM)
import jwt as pyjwt

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterBody(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginBody(BaseModel):
    email: EmailStr
    password: str


def public_user(u):
    return {k: u.get(k) for k in ("id", "email", "name", "role", "organization_id", "created_at")}


async def check_lockout(identifier):
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if rec and rec.get("count", 0) >= 5:
        if (utcnow() - rec["last_attempt"].replace(tzinfo=utcnow().tzinfo) if hasattr(rec["last_attempt"], "replace") else utcnow()) < timedelta(minutes=15):
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")


@router.post("/register")
async def register(body: RegisterBody, request: Request, response: Response):
    email = body.email.lower()
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    org = await db.organizations.find_one({}, {"_id": 0})
    user = {"id": new_id(), "email": email, "name": body.name, "role": "viewer",
            "organization_id": org["id"] if org else None, "password_hash": hash_password(body.password),
            "created_at": utcnow_iso()}
    await db.users.insert_one(dict(user))
    access, refresh = create_access_token(user["id"], email, "viewer"), create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    await audit("user.registered", user, "user", user["id"], request=request)
    return {**public_user(user), "access_token": access}


@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    email = body.email.lower()
    identifier = f"{request.client.host if request.client else 'na'}:{email}"
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if rec and rec.get("count", 0) >= 5:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.update_one({"identifier": identifier}, {"$inc": {"count": 1}, "$set": {"last_attempt": utcnow_iso()}}, upsert=True)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    access, refresh = create_access_token(user["id"], email, user["role"]), create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    u = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    await audit("user.login", u, "user", u["id"], request=request)
    return {**public_user(u), "access_token": access}


@router.post("/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"status": "logged_out"}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = pyjwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        access = create_access_token(user["id"], user["email"], user["role"])
        response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=28800, path="/")
        return {"status": "refreshed", "access_token": access}
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
