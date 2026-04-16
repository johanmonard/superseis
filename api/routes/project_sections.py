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

from dojo.v3.domain.config import GridOption, Margins, SurveyExtent, SurveyOption
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
    "survey",
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

    if section == "partitioning":
        return cfg.partitioning

    if section == "design":
        return cfg.design

    if section == "design_options":
        return cfg.design_options

    # Remaining UI sections — each stored in its own field
    _ui_section_map = {
        "survey": "survey_ui",
        "layers": "layers_ui",
        "maps": "maps_ui",
        "offsetters": "offsetters_ui",
        "crew": "crew_ui",
        "osm": "osm_ui",
    }
    attr = _ui_section_map.get(section)
    if attr:
        return getattr(cfg, attr, {})

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

    if section == "partitioning":
        cfg.partitioning = data
        cfg.save(str(project_dir / "config.json"))
        return

    if section == "design":
        cfg.design = data
        cfg.save(str(project_dir / "config.json"))
        return

    if section == "survey":
        # Save full UI state
        cfg.survey_ui = data
        # Bridge: populate typed cfg.survey from UI groups
        cfg.survey.clear()
        groups = data.get("groups", [])
        active_group_id = data.get("activeGroupId", "")
        active_group_name = ""
        for group in groups:
            name = group.get("name", "")
            if not name:
                continue
            if group.get("id") == active_group_id:
                active_group_name = name
            extents = {}
            for ext in group.get("extents", []):
                ext_id = ext.get("id", ext.get("name", ""))
                extents[ext_id] = SurveyExtent(
                    name=ext.get("name", ""),
                    margins=Margins(
                        top=int(float(ext.get("marginTop") or 0)),
                        bottom=int(float(ext.get("marginBottom") or 0)),
                        left=int(float(ext.get("marginLeft") or 0)),
                        right=int(float(ext.get("marginRight") or 0)),
                    ),
                    rl_angle=float(ext.get("rlAngle") or 0),
                )
            cfg.survey[name] = SurveyOption(
                acq_polygon=group.get("acquisitionPolygon", ""),
                pois=group.get("pois", []),
                extents=extents,
            )
        if active_group_name:
            cfg.active_options.survey = active_group_name
        cfg.save(str(project_dir / "config.json"))
        return

    if section == "design_options":
        cfg.design_options = data
        # Bridge: populate cfg.grid resolution + origin from design options
        options = data.get("options", [])
        active_id = data.get("activeId", "")
        active_name = ""
        for opt in options:
            name = opt.get("name", "")
            if not name:
                continue
            if opt.get("id") == active_id:
                active_name = name
            resolution = float(opt.get("resolution") or 1) or 1.0
            origin_x = float(opt.get("gridOriginX") or 0)
            origin_y = float(opt.get("gridOriginY") or 0)
            if name not in cfg.grid:
                cfg.grid[name] = GridOption()
            cfg.grid[name].resolution = resolution
            cfg.grid[name].origin = (origin_x, origin_y)
        if active_name:
            cfg.active_options.grid = active_name
        cfg.save(str(project_dir / "config.json"))
        return

    # Remaining UI sections
    _ui_section_map = {
        "layers": "layers_ui",
        "maps": "maps_ui",
        "offsetters": "offsetters_ui",
        "crew": "crew_ui",
        "osm": "osm_ui",
    }
    attr = _ui_section_map.get(section)
    if attr:
        setattr(cfg, attr, data)
        cfg.save(str(project_dir / "config.json"))
        return


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
