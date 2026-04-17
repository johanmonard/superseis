"""Layer analysis endpoint.

Given a project's acquisition polygon (from the Survey page) and a set of
GIS layers in ``inputs/gis/gis_layers/``, compute per-class statistics
(area / length / count) for features falling inside the polygon.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, get_current_user
from api.db.engine import get_db
from api.db.models import Project
from api.dojo import get_dojo_project_service

from dojo.v3.services.project_service import ProjectNotFoundError, ProjectService

router = APIRouter(prefix="/project/{project_id}/layers", tags=["project-layers"])


class AnalyzeRequest(BaseModel):
    polygon_file: Optional[str] = None  # None → fall back to Survey acq_polygon
    layers: Optional[list[str]] = None  # None → analyze every .gpkg in gis_layers
    source_field: str = "fclass"


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


@router.post("/analyze")
async def analyze_layers(
    project_id: int,
    body: AnalyzeRequest,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
):
    await _get_project_for_user(project_id, principal, db)

    try:
        result = dojo_svc.analyze_layers(
            project_id,
            polygon_file=body.polygon_file,
            layer_filenames=body.layers,
            source_field=body.source_field,
        )
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found in dojo")
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc),
        )

    return result.model_dump()
