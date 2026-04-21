"""Offset artifacts — serve theoretical + offset station pairs to the frontend.

The Offsets pipeline step writes ``work/artifacts/offsets/{r,s}.parquet``
with theoretical coords (x, y) and offset ij coords (i_offs, j_offs). This
router computes offset world coords via ``ij_to_xy`` (parquet doesn't
carry them today), reprojects to WGS84, and returns both sets so the
Offsetters viewport can render theoretical stations, offset stations, and
movement arcs from one payload.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pyproj import Transformer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, get_current_user
from api.db.engine import get_db
from api.db.models import Project
from api.dojo import get_dojo_project_service

from dojo.v3.adapters.v3_runner import LAYERS_REFERENTIAL, _load_referentials
from dojo.v3.domain.grid import ij_to_xy
from dojo.v3.services.project_service import ProjectNotFoundError, ProjectService

router = APIRouter(
    prefix="/project/{project_id}/artifacts/offsets",
    tags=["project-offset-artifacts"],
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


class OffsetPoint(BaseModel):
    lon_theo: float
    lat_theo: float
    lon_offs: float  # equal to theo when offset=False
    lat_offs: float
    # Snapped coords: set when the offset point landed close enough to a
    # GIS feature to be pulled onto it. Null when no snap happened — the
    # frontend falls back to ``lon_offs/lat_offs`` in that case.
    lon_offs_snap: float | None
    lat_offs_snap: float | None
    i_theo: int
    j_theo: int
    design_reg: int
    offset: bool
    skipped: bool


class OffsetArtifactResponse(BaseModel):
    ptype: Ptype
    count: int
    offset_count: int
    skipped_count: int
    snapped_count: int
    bbox: list[float] | None  # union of theo + offs in WGS84
    points: list[OffsetPoint]


@router.get("/{ptype}", response_model=OffsetArtifactResponse)
async def get_offset_stations(
    project_id: int,
    ptype: Ptype,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> OffsetArtifactResponse:
    if ptype not in ("r", "s"):
        raise HTTPException(status_code=422, detail=f"Invalid ptype: {ptype}")

    await _get_project_for_user(project_id, principal, db)
    try:
        project_dir = Path(dojo_svc.get_project_dir(project_id))
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")

    path = project_dir / "work" / "artifacts" / "offsets" / f"{ptype}.parquet"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                f"Offsets parquet not found: {path.name}. Run the offsets step first."
            ),
        )

    df = pd.read_parquet(path)
    if df.empty:
        return OffsetArtifactResponse(
            ptype=ptype,
            count=0,
            offset_count=0,
            skipped_count=0,
            snapped_count=0,
            bbox=None,
            points=[],
        )

    # Offset world coords aren't persisted — compute from ij via the
    # simulation referential (same affine used downstream for snapping).
    ref_data = _load_referentials(project_dir)
    sim_ref = ref_data["extents"][LAYERS_REFERENTIAL]
    x_offs_world, y_offs_world = ij_to_xy(
        df["i_offs"].to_numpy(),
        df["j_offs"].to_numpy(),
        sim_ref,
    )

    x_theo = df["x"].to_numpy(dtype=np.float64)
    y_theo = df["y"].to_numpy(dtype=np.float64)
    x_offs_world = np.asarray(x_offs_world, dtype=np.float64)
    y_offs_world = np.asarray(y_offs_world, dtype=np.float64)

    # Snap columns land here from Stage 6 of _run_offsets. NaN means the
    # offset point wasn't close enough to any GIS feature to snap; the
    # frontend handles the null fallback.
    has_snap_cols = "x_offs_snap" in df.columns and "y_offs_snap" in df.columns
    if has_snap_cols:
        x_snap = df["x_offs_snap"].to_numpy(dtype=np.float64)
        y_snap = df["y_offs_snap"].to_numpy(dtype=np.float64)
    else:
        x_snap = np.full(len(df), np.nan, dtype=np.float64)
        y_snap = np.full(len(df), np.nan, dtype=np.float64)
    snap_mask = np.isfinite(x_snap) & np.isfinite(y_snap)

    epsg = int(cfg.metadata.epsg) if cfg.metadata.epsg else 4326
    if epsg == 4326:
        lon_theo, lat_theo = x_theo, y_theo
        lon_offs, lat_offs = x_offs_world, y_offs_world
        lon_snap, lat_snap = x_snap, y_snap
    else:
        transformer = Transformer.from_crs(epsg, 4326, always_xy=True)
        lon_theo, lat_theo = transformer.transform(x_theo, y_theo)
        lon_offs, lat_offs = transformer.transform(x_offs_world, y_offs_world)
        # Transformer tolerates NaN — it returns inf/NaN in that case, so
        # we still rely on snap_mask below to decide which rows to emit.
        lon_snap, lat_snap = transformer.transform(x_snap, y_snap)

    i_theo = df["i_theo"].to_numpy(dtype=np.int32)
    j_theo = df["j_theo"].to_numpy(dtype=np.int32)
    design_reg = df["design_reg"].to_numpy(dtype=np.int32)
    offset = df["offset"].to_numpy(dtype=bool)
    skipped = df["skipped"].to_numpy(dtype=bool)

    points = [
        OffsetPoint(
            lon_theo=float(lon_theo[i]),
            lat_theo=float(lat_theo[i]),
            lon_offs=float(lon_offs[i]) if offset[i] else float(lon_theo[i]),
            lat_offs=float(lat_offs[i]) if offset[i] else float(lat_theo[i]),
            lon_offs_snap=float(lon_snap[i]) if snap_mask[i] else None,
            lat_offs_snap=float(lat_snap[i]) if snap_mask[i] else None,
            i_theo=int(i_theo[i]),
            j_theo=int(j_theo[i]),
            design_reg=int(design_reg[i]),
            offset=bool(offset[i]),
            skipped=bool(skipped[i]),
        )
        for i in range(len(df))
    ]

    # Union of theo + offs bboxes — fitBounds must accommodate both sets.
    west = float(min(lon_theo.min(), lon_offs.min()))
    east = float(max(lon_theo.max(), lon_offs.max()))
    south = float(min(lat_theo.min(), lat_offs.min()))
    north = float(max(lat_theo.max(), lat_offs.max()))

    return OffsetArtifactResponse(
        ptype=ptype,
        count=len(points),
        offset_count=int(offset.sum()),
        skipped_count=int(skipped.sum()),
        snapped_count=int(snap_mask.sum()),
        bbox=[west, south, east, north],
        points=points,
    )
