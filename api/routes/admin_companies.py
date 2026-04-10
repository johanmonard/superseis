"""Super-admin endpoints for managing companies (tenants)."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, require_admin
from api.db.engine import get_db
from api.db.models import Company

router = APIRouter(prefix="/admin/companies", tags=["admin-companies"])


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    max_users: int = Field(default=5, ge=1)


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    is_active: bool | None = None
    max_users: int | None = Field(default=None, ge=1)


class CompanyResponse(BaseModel):
    id: int
    name: str
    is_active: bool
    max_users: int
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[CompanyResponse])
async def list_companies(
    _: AuthPrincipal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[CompanyResponse]:
    result = await db.execute(select(Company).order_by(Company.created_at))
    return [CompanyResponse.model_validate(c) for c in result.scalars().all()]


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    payload: CompanyCreate,
    _: AuthPrincipal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CompanyResponse:
    company = Company(name=payload.name, is_active=True, max_users=payload.max_users)
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return CompanyResponse.model_validate(company)


@router.patch("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: int,
    payload: CompanyUpdate,
    _: AuthPrincipal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CompanyResponse:
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")

    if payload.name is not None:
        company.name = payload.name
    if payload.is_active is not None:
        company.is_active = payload.is_active
    if payload.max_users is not None:
        company.max_users = payload.max_users

    await db.commit()
    await db.refresh(company)
    return CompanyResponse.model_validate(company)
