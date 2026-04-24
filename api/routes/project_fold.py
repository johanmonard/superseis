"""Fold-map endpoints — trigger computation, serve tile pyramid + meta."""

from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, get_current_user
from api.db.engine import get_db
from api.db.models import Project
from api.dojo import get_dojo_project_service
from api.seismic_fold import (
    SUPPORTED_COLORMAPS,
    fold_meta_fname,
    fold_tiles_dirname,
    write_fold_for_option,
)

from dojo.v3.services.project_service import ProjectNotFoundError, ProjectService

router = APIRouter(
    prefix="/project/{project_id}/artifacts/fold",
    tags=["project-fold-artifacts"],
)


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


class FoldParams(BaseModel):
    inline_bin: float
    crossline_bin: float
    offset_min: float
    offset_max: float
    active_lines: int | None
    active_stations: int | None
    # ``inline_bin`` / ``crossline_bin`` stay in the response (derived
    # server-side from the option's resolution + designs) so the UI can
    # surface what was actually used, but are no longer accepted in the
    # request.


class FoldMetaResponse(BaseModel):
    option_name: str
    tif: str
    tiles_dir: str
    min_zoom: int
    max_zoom: int
    # [west, south, east, north] WGS84 — axis-aligned bbox covering the
    # rotated raster's four corners.
    bounds: list[float]
    value_min: int
    value_max: int
    colormap: str
    width: int
    height: int
    tiles_written: int
    params: FoldParams
    input_fingerprint: str = ""
    cached: bool = False


class RunFoldRequest(BaseModel):
    offset_min: float = Field(default=0.0, ge=0.0)
    offset_max: float = Field(default=5000.0, gt=0.0)
    colormap: str = Field(default="viridis")


def _active_option_name(cfg) -> str:
    name = cfg.active_options.grid or ""
    if not name:
        raise HTTPException(
            status_code=400,
            detail="No active grid option — pick one before processing fold.",
        )
    return name


def _load_existing_meta(project_dir: Path, option_name: str) -> FoldMetaResponse:
    meta_path = (
        project_dir / "inputs" / "gis" / "seismic" / fold_meta_fname(option_name)
    )
    if not meta_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Fold map not generated yet — click Process fold.",
        )
    return FoldMetaResponse(**json.loads(meta_path.read_text()))


@router.post("", response_model=FoldMetaResponse)
async def run_fold(
    project_id: int,
    body: RunFoldRequest,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> FoldMetaResponse:
    if body.colormap not in SUPPORTED_COLORMAPS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported colormap — choose one of {list(SUPPORTED_COLORMAPS)}.",
        )
    if body.offset_max <= body.offset_min:
        raise HTTPException(
            status_code=422,
            detail="offset_max must be greater than offset_min.",
        )

    await _get_project_for_user(project_id, principal, db)
    try:
        project_dir = Path(dojo_svc.get_project_dir(project_id))
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")

    option_name = _active_option_name(cfg)
    epsg = int(cfg.metadata.epsg) if cfg.metadata.epsg else 4326

    try:
        meta = await asyncio.to_thread(
            write_fold_for_option,
            project_dir,
            epsg,
            cfg,
            option_name,
            offset_min=body.offset_min,
            offset_max=body.offset_max,
            colormap=body.colormap,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return FoldMetaResponse(**meta)


@router.get("/meta", response_model=FoldMetaResponse)
async def get_fold_meta(
    project_id: int,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> FoldMetaResponse:
    await _get_project_for_user(project_id, principal, db)
    try:
        project_dir = Path(dojo_svc.get_project_dir(project_id))
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")
    return _load_existing_meta(project_dir, _active_option_name(cfg))


# Tile/manifest paths are user-facing — be strict so a bad z/x/y can't
# escape the tiles_dir via ../ traversal. The dir itself is namespaced by
# the active option's slug, which we resolve server-side. Coord width
# matches the DEM route's ``^\d{1,9}$`` — world-tile indices at zoom 18
# are 6 digits, so 9 is headroom against future MAX_ZOOM bumps.
_Z_RE = re.compile(r"^\d{1,2}$")
_XY_RE = re.compile(r"^\d{1,9}$")


@router.get("/tiles/manifest")
async def get_fold_tiles_manifest(
    project_id: int,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> Response:
    await _get_project_for_user(project_id, principal, db)
    try:
        project_dir = Path(dojo_svc.get_project_dir(project_id))
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")
    option_name = _active_option_name(cfg)
    manifest_path = (
        project_dir / "inputs" / "gis" / "seismic"
        / fold_tiles_dirname(option_name) / "manifest.json"
    )
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Fold tiles not found.")
    return Response(
        content=manifest_path.read_bytes(),
        media_type="application/json",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/tiles/{z}/{x}/{y}")
async def get_fold_tile(
    project_id: int,
    z: str,
    x: str,
    y: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> Response:
    if not (_Z_RE.match(z) and _XY_RE.match(x) and _XY_RE.match(y)):
        raise HTTPException(status_code=400, detail="Bad tile coords")
    await _get_project_for_user(project_id, principal, db)
    try:
        project_dir = Path(dojo_svc.get_project_dir(project_id))
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")
    option_name = _active_option_name(cfg)
    tile_path = (
        project_dir / "inputs" / "gis" / "seismic"
        / fold_tiles_dirname(option_name) / z / x / f"{y.removesuffix('.png')}.png"
    )
    if not tile_path.exists():
        # Tile pyramid intentionally skips fully-transparent tiles to
        # keep the disk footprint small — 404 is the documented signal
        # for "no data here", not an error.
        raise HTTPException(status_code=404, detail="Tile not found.")
    return FileResponse(
        tile_path,
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )
