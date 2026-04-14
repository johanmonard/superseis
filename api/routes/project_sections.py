"""Project section endpoints — read/write slices of config.json.

Each section maps to a subset of the dojo ProjectConfig. The config.json
in the project tree is the single source of truth.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, get_current_user
from api.db.engine import get_db
from api.db.models import Project
from api.dojo import get_dojo_project_service

from dojo.v3.services.project_service import ProjectNotFoundError, ProjectService

router = APIRouter(prefix="/project/{project_id}/sections", tags=["project-sections"])

# Fields exposed to the frontend for the definition section.
# Internal fields (project_id, root_path, company, user_name, project_name)
# are excluded — the frontend doesn't edit them.
_DEFINITION_FIELDS = (
    "client", "contractor", "country", "region",
    "epsg", "second", "crsName", "overlapGrid", "overlapStrip", "notes",
)

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
    "gis_styles",
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


# ---------------------------------------------------------------------------
# Section ↔ config.json mapping
# ---------------------------------------------------------------------------

def _read_section(section: str, dojo_svc: ProjectService, project_id: int) -> dict[str, Any]:
    """Extract a section slice from the dojo ProjectConfig."""
    try:
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        return {}

    if section == "definition":
        meta = cfg.metadata
        return {field: getattr(meta, field, "") for field in _DEFINITION_FIELDS}

    if section == "gis_styles":
        return cfg.gis_styles

    # Other sections: pass through as-is from config dict for now
    # (will be reshaped as each section is migrated)
    config_dict = cfg.model_dump()
    section_map = {
        "terrain": "survey",
        "design": "grid",
        "design_options": "grid",
        "partitioning": "grid",
        "layers": "layers",
        "maps": "mappers",
        "offsetters": "offsetters",
        "crew": "crew",
        "osm": None,
    }
    config_key = section_map.get(section)
    if config_key and config_key in config_dict:
        return config_dict[config_key]
    return {}


def _write_section(section: str, data: dict[str, Any], dojo_svc: ProjectService, project_id: int) -> None:
    """Merge a section slice back into the dojo ProjectConfig and persist."""
    try:
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        return

    project_dir = dojo_svc.get_project_dir(project_id)

    if section == "definition":
        for field in _DEFINITION_FIELDS:
            if field in data:
                setattr(cfg.metadata, field, data[field])
        cfg.save(str(project_dir / "config.json"))
        return

    if section == "gis_styles":
        cfg.gis_styles = data
        cfg.save(str(project_dir / "config.json"))
        return

    # Other sections: not yet reshaped — store raw for now
    # (will be implemented as each section is migrated)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/{section}", response_model=SectionResponse)
async def get_section(
    project_id: int,
    section: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> SectionResponse:
    _validate_section(section)
    await _get_project_for_user(project_id, principal, db)
    data = _read_section(section, dojo_svc, project_id)
    return SectionResponse(section=section, data=data, updated_at=None)


@router.put("/{section}", response_model=SectionResponse)
async def put_section(
    project_id: int,
    section: str,
    body: dict[str, Any],
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> SectionResponse:
    _validate_section(section)
    await _get_project_for_user(project_id, principal, db)
    _write_section(section, body, dojo_svc, project_id)
    data = _read_section(section, dojo_svc, project_id)
    return SectionResponse(
        section=section,
        data=data,
        updated_at=datetime.now(timezone.utc),
    )
