"""Project section endpoints — save/load JSON form data per section."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, get_current_user
from api.db.engine import get_db
from api.db.models import Project, ProjectSection

router = APIRouter(prefix="/project/{project_id}/sections", tags=["project-sections"])

VALID_SECTIONS = frozenset([
    "definition",
    "terrain",
    "osm",
    "layers",
    "maps",
    "design",
    "design_options",
    "partitioning",
    "offsetters",
    "crew",
])


def _validate_section(section: str) -> str:
    if section not in VALID_SECTIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid section '{section}'. Valid: {sorted(VALID_SECTIONS)}",
        )
    return section


async def _get_project_for_user(
    project_id: int,
    principal: AuthPrincipal,
    db: AsyncSession,
) -> Project:
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.company_id == principal.company_id,
        )
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


class SectionResponse(BaseModel):
    section: str
    data: dict[str, Any]
    updated_at: datetime | None

    model_config = {"from_attributes": True}


@router.get("", response_model=list[SectionResponse])
async def list_sections(
    project_id: int,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SectionResponse]:
    await _get_project_for_user(project_id, principal, db)
    result = await db.execute(
        select(ProjectSection)
        .where(ProjectSection.project_id == project_id)
        .order_by(ProjectSection.section)
    )
    return [SectionResponse.model_validate(s) for s in result.scalars().all()]


@router.get("/{section}", response_model=SectionResponse)
async def get_section(
    project_id: int,
    section: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SectionResponse:
    _validate_section(section)
    await _get_project_for_user(project_id, principal, db)
    result = await db.execute(
        select(ProjectSection).where(
            ProjectSection.project_id == project_id,
            ProjectSection.section == section,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return SectionResponse(section=section, data={}, updated_at=None)
    return SectionResponse.model_validate(row)


@router.put("/{section}", response_model=SectionResponse)
async def put_section(
    project_id: int,
    section: str,
    body: dict[str, Any],
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SectionResponse:
    _validate_section(section)
    await _get_project_for_user(project_id, principal, db)
    result = await db.execute(
        select(ProjectSection).where(
            ProjectSection.project_id == project_id,
            ProjectSection.section == section,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = ProjectSection(project_id=project_id, section=section, data=body)
        db.add(row)
    else:
        row.data = body
    await db.commit()
    await db.refresh(row)
    return SectionResponse.model_validate(row)
