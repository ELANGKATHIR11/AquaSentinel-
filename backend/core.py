import os
import json
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from pathlib import Path
from fastapi import Request, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"
ROLE_LEVELS = {"viewer": 1, "analyst": 2, "field_engineer": 3, "operations_manager": 4, "organization_admin": 5, "super_admin": 6}


def utcnow():
    return datetime.now(timezone.utc)


def utcnow_iso():
    return utcnow().isoformat()


def new_id():
    return str(uuid.uuid4())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {"sub": user_id, "email": email, "role": role, "exp": utcnow() + timedelta(hours=8), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": utcnow() + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response, access_token, refresh_token):
    response.set_cookie("access_token", access_token, httponly=True, secure=True, samesite="none", max_age=28800, path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_min_role(min_role: str):
    async def checker(user: dict = Depends(get_current_user)):
        if ROLE_LEVELS.get(user.get("role"), 0) < ROLE_LEVELS[min_role]:
            raise HTTPException(status_code=403, detail=f"Requires {min_role} role or higher")
        return user
    return checker


async def audit(action: str, user: dict = None, resource_type: str = None, resource_id: str = None, details: dict = None, request: Request = None):
    doc = {
        "id": new_id(),
        "timestamp": utcnow_iso(),
        "action": action,
        "actor_id": user.get("id") if user else None,
        "actor_email": user.get("email") if user else "system",
        "actor_role": user.get("role") if user else "system",
        "organization_id": user.get("organization_id") if user else None,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "details": details or {},
        "ip": request.client.host if request and request.client else None,
        "request_id": request.headers.get("X-Request-ID") if request else None,
    }
    await db.audit_logs.insert_one(doc)


class WSManager:
    def __init__(self):
        self.connections = []

    async def connect(self, ws):
        await ws.accept()
        self.connections.append(ws)

    def disconnect(self, ws):
        if ws in self.connections:
            self.connections.remove(ws)

    async def broadcast(self, event_type: str, data: dict):
        message = json.dumps({"event": event_type, "timestamp": utcnow_iso(), "data": data}, default=str)
        dead = []
        for ws in self.connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


ws_manager = WSManager()
