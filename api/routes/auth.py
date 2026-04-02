# ---------------------------------------------------------------------------
# DEVELOPMENT AUTH STUB — the /login endpoint accepts any non-empty
# username/password without real credential checks.  Replace before deployment.
# ---------------------------------------------------------------------------

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from api.auth import AuthPrincipal, create_auth_principal, create_session_token, session_auth
from api.config import (
    AUTH_SESSION_COOKIE_NAME,
    AUTH_SESSION_SAMESITE,
    AUTH_SESSION_SECURE_COOKIE,
    AUTH_SESSION_TTL_SECONDS,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=120)


class SessionResponse(BaseModel):
    username: str
    auth_type: str
    is_admin: bool


class LogoutResponse(BaseModel):
    ok: bool = True


def _build_session_response(principal: AuthPrincipal) -> SessionResponse:
    return SessionResponse(
        username=principal.username,
        auth_type=principal.auth_type,
        is_admin=principal.is_admin,
    )


@router.post("/login", response_model=SessionResponse)
def login(payload: LoginRequest, response: Response) -> SessionResponse:
    username = payload.username.strip()
    password = payload.password.strip()

    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and password are required.",
        )

    response.set_cookie(
        key=AUTH_SESSION_COOKIE_NAME,
        value=create_session_token(username),
        httponly=True,
        secure=AUTH_SESSION_SECURE_COOKIE,
        samesite=AUTH_SESSION_SAMESITE,
        max_age=AUTH_SESSION_TTL_SECONDS,
        path="/",
    )

    return _build_session_response(create_auth_principal(username))


@router.get("/session", response_model=SessionResponse)
def get_session(principal: AuthPrincipal = Depends(session_auth)) -> SessionResponse:
    return _build_session_response(principal)


@router.post("/logout", response_model=LogoutResponse)
def logout(response: Response) -> LogoutResponse:
    response.delete_cookie(
        key=AUTH_SESSION_COOKIE_NAME,
        path="/",
        secure=AUTH_SESSION_SECURE_COOKIE,
        samesite=AUTH_SESSION_SAMESITE,
    )
    return LogoutResponse()
