"""Grid artifacts — serve the theoretical station parquets to the frontend.

The Grid pipeline step writes ``work/artifacts/grid/{r,s}.parquet`` with
stations in the project's projected CRS (EPSG:<epsg> from metadata). This
router reprojects to WGS84 so the MapLibre/deck.gl viewport can render
them directly as lon/lat points.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pyproj import Transformer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, get_current_user
from api.db.engine import get_db
from api.db.models import Project
from api.dojo import get_dojo_project_service

from dojo.v3.domain.pipeline import grid_artifacts_dir
from dojo.v3.services.project_service import ProjectNotFoundError, ProjectService

router = APIRouter(
    prefix="/project/{project_id}/artifacts/grid",
    tags=["project-grid-artifacts"],
)

Ptype = Literal["r", "s"]


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


class GridPoint(BaseModel):
    lon: float
    lat: float
    i_theo: int
    j_theo: int
    design_reg: int


class GridArtifactResponse(BaseModel):
    ptype: Ptype
    count: int
    bbox: list[float] | None  # [west, south, east, north] in WGS84
    points: list[GridPoint]


class RegioningFilesResponse(BaseModel):
    active_grid: str | None
    files: list[str]  # bare stems (no .gpkg extension)


@router.get("/regioning-files", response_model=RegioningFilesResponse)
async def get_regioning_files(
    project_id: int,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> RegioningFilesResponse:
    """Return the polygon files referenced by the active grid's regioning.

    De-duped by filename, preserving first-seen order across regioning
    layers and their gpkg_dict entries.
    """
    await _get_project_for_user(project_id, principal, db)
    try:
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")

    active = cfg.active_options.grid
    if not active or active not in cfg.grid:
        return RegioningFilesResponse(active_grid=active or None, files=[])

    seen: set[str] = set()
    out: list[str] = []
    for reg in cfg.grid[active].regioning or []:
        for fname in (reg.gpkg_dict or {}).values():
            if not isinstance(fname, str) or not fname:
                continue
            stem = fname.rsplit(".gpkg", 1)[0]
            if stem in seen:
                continue
            seen.add(stem)
            out.append(stem)
    return RegioningFilesResponse(active_grid=active, files=out)


@router.get("/{ptype}", response_model=GridArtifactResponse)
async def get_grid_stations(
    project_id: int,
    ptype: Ptype,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> GridArtifactResponse:
    if ptype not in ("r", "s"):
        raise HTTPException(status_code=422, detail=f"Invalid ptype: {ptype}")

    await _get_project_for_user(project_id, principal, db)
    try:
        project_dir = Path(dojo_svc.get_project_dir(project_id))
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")

    active_grid = cfg.active_options.grid or ""
    path = grid_artifacts_dir(project_dir, active_grid) / f"{ptype}.parquet"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                f"Grid parquet not found: {path.name}. Run the grid step first."
            ),
        )

    df = pd.read_parquet(path)
    if df.empty:
        return GridArtifactResponse(ptype=ptype, count=0, bbox=None, points=[])

    epsg = int(cfg.metadata.epsg) if cfg.metadata.epsg else 4326
    if epsg == 4326:
        lon = df["x"].to_numpy(dtype=np.float64)
        lat = df["y"].to_numpy(dtype=np.float64)
    else:
        transformer = Transformer.from_crs(epsg, 4326, always_xy=True)
        lon, lat = transformer.transform(
            df["x"].to_numpy(dtype=np.float64),
            df["y"].to_numpy(dtype=np.float64),
        )

    i_theo = df["i_theo"].to_numpy(dtype=np.int32)
    j_theo = df["j_theo"].to_numpy(dtype=np.int32)
    design_reg = df["design_reg"].to_numpy(dtype=np.int32)

    points = [
        GridPoint(
            lon=float(lon[i]),
            lat=float(lat[i]),
            i_theo=int(i_theo[i]),
            j_theo=int(j_theo[i]),
            design_reg=int(design_reg[i]),
        )
        for i in range(len(df))
    ]

    bbox = [
        float(lon.min()),
        float(lat.min()),
        float(lon.max()),
        float(lat.max()),
    ]
    return GridArtifactResponse(
        ptype=ptype, count=len(points), bbox=bbox, points=points
    )
