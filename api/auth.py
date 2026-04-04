# ---------------------------------------------------------------------------
# DEVELOPMENT AUTH STUB — accepts any credentials, no real validation.
# Replace this entire module with a proper auth provider (OAuth, OIDC, etc.)
# before deploying to any shared or production environment.
# ---------------------------------------------------------------------------

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyHeader

from api.config import (
    API_KEY,
    AUTH_ADMIN_USERS,
    AUTH_SESSION_COOKIE_NAME,
    AUTH_SESSION_SECRET,
    AUTH_SESSION_TTL_SECONDS,
)

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


@dataclass(frozen=True)
class AuthPrincipal:
    username: str
    auth_type: str
    is_admin: bool


def _is_admin_username(username: str) -> bool:
    return username.strip().lower() in AUTH_ADMIN_USERS


def create_auth_principal(username: str, auth_type: str = "session") -> AuthPrincipal:
    normalized_username = username.strip()
    return AuthPrincipal(
        username=normalized_username,
        auth_type=auth_type,
        is_admin=_is_admin_username(normalized_username),
    )


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


def create_session_token(username: str) -> str:
    issued_at = int(time.time())
    payload = {
        "sub": username,
        "iat": issued_at,
        "exp": issued_at + AUTH_SESSION_TTL_SECONDS,
    }
    encoded_payload = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _sign_payload(encoded_payload)
    return f"{encoded_payload}.{signature}"


def parse_session_token(token: str) -> AuthPrincipal | None:
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

    username = str(payload.get("sub", "")).strip()
    if not username:
        return None

    return create_auth_principal(username, auth_type="session")


def get_session_principal(request: Request) -> AuthPrincipal | None:
    token = request.cookies.get(AUTH_SESSION_COOKIE_NAME)
    if not token:
        return None
    return parse_session_token(token)


async def api_key_auth(key: str | None = Depends(_api_key_header)):
    """FastAPI dependency — validates the X-API-Key header."""
    if key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing API key",
        )


async def session_auth(request: Request) -> AuthPrincipal:
    principal = get_session_principal(request)
    if principal is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing session",
        )
    return principal


async def session_admin_auth(
    principal: AuthPrincipal = Depends(session_auth),
) -> AuthPrincipal:
    if not principal.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges are required for this operation",
        )
    return principal


async def api_key_or_session_auth(
    request: Request,
    key: str | None = Depends(_api_key_header),
) -> AuthPrincipal:
    """Accept either API key auth or cookie session auth."""
    session_principal = get_session_principal(request)
    if session_principal is not None:
        return session_principal

    if key is not None:
        if key == API_KEY:
            return AuthPrincipal(username="api-key", auth_type="api_key", is_admin=True)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing API key",
        )

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Missing authentication credentials",
    )
