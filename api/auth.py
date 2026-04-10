"""
Authentication — session token creation/parsing + FastAPI dependencies.

The `get_current_user` dependency is the SINGLE abstraction every route uses.
When migrating to an external provider, only this module changes.
"""

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import (
    API_KEY,
    AUTH_SESSION_COOKIE_NAME,
    AUTH_SESSION_SECRET,
    AUTH_SESSION_TTL_SECONDS,
)
from api.db.engine import get_db
from api.db.models import User

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


@dataclass(frozen=True)
class AuthPrincipal:
    user_id: int
    email: str
    company_id: int
    company_name: str
    role: str
    auth_type: str
    is_admin: bool


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("utf-8"))


def _sign_payload(encoded_payload: str) -> str:
    digest = hmac.new(
        AUTH_SESSION_SECRET.encode("utf-8"),
        encoded_payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return _b64url_encode(digest)


def create_session_token(user_id: int) -> str:
    issued_at = int(time.time())
    payload = {
        "sub": user_id,
        "iat": issued_at,
        "exp": issued_at + AUTH_SESSION_TTL_SECONDS,
    }
    encoded_payload = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _sign_payload(encoded_payload)
    return f"{encoded_payload}.{signature}"


def parse_session_token(token: str) -> int | None:
    if "." not in token:
        return None

    encoded_payload, signature = token.split(".", maxsplit=1)
    expected_signature = _sign_payload(encoded_payload)
    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        payload_bytes = _b64url_decode(encoded_payload)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None

    expires_at = int(payload.get("exp", 0))
    if expires_at <= int(time.time()):
        return None

    user_id = payload.get("sub")
    if not isinstance(user_id, int):
        return None

    return user_id


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthPrincipal:
    token = request.cookies.get(AUTH_SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authenticated")

    user_id = parse_session_token(token)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired session")

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not found or inactive")

    if not user.company.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company is inactive")

    return AuthPrincipal(
        user_id=user.id,
        email=user.email,
        company_id=user.company_id,
        company_name=user.company.name,
        role=user.role,
        auth_type="session",
        is_admin=user.role == "super_admin",
    )


async def require_admin(
    principal: AuthPrincipal = Depends(get_current_user),
) -> AuthPrincipal:
    if not principal.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return principal


async def require_company_admin(
    principal: AuthPrincipal = Depends(get_current_user),
) -> AuthPrincipal:
    if principal.role not in ("super_admin", "owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company admin privileges required")
    return principal


async def api_key_auth(key: str | None = Depends(_api_key_header)):
    if key != API_KEY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or missing API key")
