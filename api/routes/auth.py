"""Auth routes — login, session, logout."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, create_session_token, get_current_user
from api.config import (
    AUTH_SESSION_COOKIE_NAME,
    AUTH_SESSION_SAMESITE,
    AUTH_SESSION_SECURE_COOKIE,
    AUTH_SESSION_TTL_SECONDS,
)
from api.db.engine import get_db
from api.db.models import User
from api.security import verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=255, description="User email address")
    password: str = Field(min_length=1, max_length=120)


class SessionResponse(BaseModel):
    user_id: int
    email: str
    company_id: int
    company_name: str
    role: str
    auth_type: str
    is_admin: bool


class LogoutResponse(BaseModel):
    ok: bool = True


def _build_session_response(principal: AuthPrincipal) -> SessionResponse:
    return SessionResponse(
        user_id=principal.user_id,
        email=principal.email,
        company_id=principal.company_id,
        company_name=principal.company_name,
        role=principal.role,
        auth_type=principal.auth_type,
        is_admin=principal.is_admin,
    )


def _set_session_cookie(response: Response, user_id: int) -> None:
    response.set_cookie(
        key=AUTH_SESSION_COOKIE_NAME,
        value=create_session_token(user_id),
        httponly=True,
        secure=AUTH_SESSION_SECURE_COOKIE,
        samesite=AUTH_SESSION_SAMESITE,
        max_age=AUTH_SESSION_TTL_SECONDS,
        path="/",
    )


@router.post("/login", response_model=SessionResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    result = await db.execute(select(User).where(User.email == payload.username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    if not user.company.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company is inactive")

    _set_session_cookie(response, user.id)

    return _build_session_response(AuthPrincipal(
        user_id=user.id,
        email=user.email,
        company_id=user.company_id,
        company_name=user.company.name,
        role=user.role,
        auth_type="session",
        is_admin=user.role == "super_admin",
    ))


@router.get("/session", response_model=SessionResponse)
async def get_session(principal: AuthPrincipal = Depends(get_current_user)) -> SessionResponse:
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
