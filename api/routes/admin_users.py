"""Super-admin endpoints for managing users across companies."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, require_admin
from api.db.engine import get_db
from api.db.models import Company, User
from api.security import hash_password

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


class UserCreate(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=120)
    company_id: int
    role: str = Field(default="member", pattern="^(owner|admin|member|viewer)$")


class UserUpdate(BaseModel):
    is_active: bool | None = None
    role: str | None = Field(default=None, pattern="^(owner|admin|member|viewer)$")


class UserResponse(BaseModel):
    id: int
    email: str
    company_id: int
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[UserResponse])
async def list_users(
    _: AuthPrincipal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[UserResponse]:
    result = await db.execute(select(User).order_by(User.created_at))
    return [UserResponse.model_validate(u) for u in result.scalars().all()]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    _: AuthPrincipal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    company_result = await db.execute(select(Company).where(Company.id == payload.company_id))
    company = company_result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")

    count_result = await db.execute(
        select(func.count()).select_from(User).where(
            User.company_id == payload.company_id, User.is_active == True  # noqa: E712
        )
    )
    current_count = count_result.scalar_one()
    if current_count >= company.max_users:
        raise HTTPException(status_code=409, detail="Company has reached its maximum number of users")

    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        company_id=payload.company_id,
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    _: AuthPrincipal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.role is not None:
        user.role = payload.role

    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)
