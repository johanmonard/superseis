"""Fold-map endpoints — trigger computation, serve tile pyramid + meta.

Two parallel router instances are exported:

* :data:`router` — grid-based fold, mounted at ``/artifacts/fold``. The
  raster is built from theoretical stations (``work/artifacts/grid``).
* :data:`router_offsets` — offsets-based fold, mounted at
  ``/artifacts/offsets-fold``. The raster is built from the post-offset
  stations (``work/artifacts/offsets``) using theoretical coordinates
  only to anchor the BinGrid origin, so the offsets product overlays
  cleanly on top of the theoretical one.

Both routers share the same response shape and handler logic; only the
fold ``source`` differs.
"""

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
    FoldSource,
    fold_meta_fname,
    fold_tif_fname,
    fold_tiles_dirname,
    latest_fold_meta_path,
    render_fold_chunk_png,
    write_fold_for_option,
)

from dojo.v3.services.project_service import ProjectNotFoundError, ProjectService


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
    """Grid-level params used to produce the fold raster.

    ``inline_bin`` / ``crossline_bin`` are the **output** grid bins (the
    GCD of each design's RPI/SPI divided by 2×resolution). Per-design
    values live in ``FoldMetaResponse.designs``. Legacy single-design
    ``active_lines`` / ``active_stations`` are null whenever more than
    one design contributed.
    """

    inline_bin: float
    crossline_bin: float
    offset_min: float
    offset_max: float
    active_lines: int | None
    active_stations: int | None


class FoldDesign(BaseModel):
    key: int
    rpi: int
    spi: int
    active_rl: int
    active_rp: int
    polygon_stem: str
    inline_bin: float
    crossline_bin: float
    inline_upsample: int
    crossline_upsample: int


class FoldImageChunk(BaseModel):
    """One subdivision of a fold raster, anchored at four UTM corners.

    The Files page registers one MapLibre ``image`` source per chunk
    using ``corners_wgs84`` as the four-point quad. PNG bytes for each
    chunk are fetched on demand from the ``/raster/chunk/{chunk_id}``
    endpoint.
    """
    chunk_id: str
    row_start: int
    row_end: int
    col_start: int
    col_end: int
    # Four [lng, lat] corners in pixel order TL/TR/BR/BL.
    corners_wgs84: list[list[float]]


class FoldMetaResponse(BaseModel):
    option_name: str
    source: FoldSource = "grid"
    tif: str
    tiles_dir: str
    min_zoom: int
    max_zoom: int
    # [west, south, east, north] WGS84 — axis-aligned bbox covering the
    # rotated raster's four corners.
    bounds: list[float]
    # Four WGS84 [lng, lat] corners of the (rotated) source raster, in
    # pixel-corner order (TL, TR, BR, BL). Useful for outlining the
    # survey extent on the map.
    corners_wgs84: list[list[float]] = []
    # 8×8 chunk layout: each entry is a small sub-raster anchored at
    # four UTM-projected corners. The Files page renders one MapLibre
    # image source per chunk so the survey's UTM grid orientation is
    # preserved per-chunk, with sub-meter mid-chunk linear-interpolation
    # error even on multi-tens-of-km surveys.
    image_chunks: list[FoldImageChunk] = []
    value_min: int
    value_max: int
    colormap: str
    width: int
    height: int
    tiles_written: int
    params: FoldParams
    designs: list[FoldDesign] = []
    gcd_rpi: int = 0
    gcd_spi: int = 0
    # Split fingerprint: ``data_fingerprint`` covers the fold array (bin
    # counts) so a colormap-only change reuses the cached GeoTIFF and
    # just re-tiles. ``render_fingerprint`` = data + colormap; equal to
    # the old ``input_fingerprint`` for meta-level cache hits.
    data_fingerprint: str = ""
    render_fingerprint: str = ""
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


def _load_existing_meta(
    project_dir: Path,
    option_name: str,
    source: FoldSource,
    offset_min: float | None = None,
    offset_max: float | None = None,
) -> FoldMetaResponse:
    """Locate the meta JSON for a rendered fold.

    With both ``offset_min`` and ``offset_max`` supplied, looks up the
    range-stamped meta only — the Files page picker uses this to load a
    specific historical render. Without them, falls back to the most
    recent meta for the ``(option, source)`` pair so the grid + offsets
    viewports keep showing whatever was last rendered.
    """
    seismic_dir = project_dir / "inputs" / "gis" / "seismic"
    if offset_min is not None and offset_max is not None:
        meta_path: Path | None = seismic_dir / fold_meta_fname(
            option_name, source, offset_min, offset_max
        )
        if meta_path is not None and not meta_path.exists():
            meta_path = None
    else:
        meta_path = latest_fold_meta_path(project_dir, option_name, source)
    if meta_path is None or not meta_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Fold map not generated yet — click Process fold.",
        )
    return FoldMetaResponse(**json.loads(meta_path.read_text()))


def _validated_offset_range(
    offset_min: float | None, offset_max: float | None
) -> tuple[float, float] | None:
    """Validate an optional ``(omin, omax)`` query pair.

    Either both are present or both omitted; with both present the max
    must exceed the min. Returns the normalised tuple or ``None`` when
    no range was supplied. Raises 422 on a malformed pair.
    """
    if offset_min is None and offset_max is None:
        return None
    if offset_min is None or offset_max is None:
        raise HTTPException(
            status_code=422,
            detail="omin and omax must both be supplied or both omitted.",
        )
    if offset_max <= offset_min:
        raise HTTPException(
            status_code=422,
            detail="omax must be greater than omin.",
        )
    return float(offset_min), float(offset_max)


# Tile/manifest paths are user-facing — be strict so a bad z/x/y can't
# escape the tiles_dir via ../ traversal. The dir itself is namespaced by
# the active option's slug + source, which we resolve server-side. Coord
# width matches the DEM route's ``^\d{1,9}$`` — world-tile indices at
# zoom 18 are 6 digits, so 9 is headroom against future MAX_ZOOM bumps.
_Z_RE = re.compile(r"^\d{1,2}$")
_XY_RE = re.compile(r"^\d{1,9}$")


def _build_router(source: FoldSource, *, prefix: str, tag: str) -> APIRouter:
    """Register the same set of handlers bound to one fold ``source``."""
    router = APIRouter(
        prefix=f"/project/{{project_id}}/artifacts/{prefix}",
        tags=[tag],
    )

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
                source=source,
            )
        except FileNotFoundError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))

        return FoldMetaResponse(**meta)

    @router.get("/meta", response_model=FoldMetaResponse)
    async def get_fold_meta(
        project_id: int,
        omin: float | None = None,
        omax: float | None = None,
        option: str | None = None,
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
        # ``option`` lets the Files page pick a fold for a non-active
        # grid option — for the active-option flow (grid + offsets
        # viewports), the omitted form falls through to the canonical
        # active option.
        option_name = option or _active_option_name(cfg)
        rng = _validated_offset_range(omin, omax)
        return _load_existing_meta(
            project_dir,
            option_name,
            source,
            *(rng if rng is not None else (None, None)),
        )

    @router.get("/raster/chunk/{chunk_id}")
    async def get_fold_raster_chunk(
        project_id: int,
        chunk_id: str,
        omin: float | None = None,
        omax: float | None = None,
        option: str | None = None,
        principal: AuthPrincipal = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
        dojo_svc: ProjectService = Depends(get_dojo_project_service),
    ) -> Response:
        """Colourised PNG of one chunk of the fold raster.

        The Files page subdivides each fold into an 8×8 grid of small
        UTM-axis-aligned chunks; each chunk is rendered as its own
        MapLibre ``image`` source anchored at four UTM-projected
        corners. That keeps cells UTM-aligned in the rendered map
        (matching the grid mesh) regardless of latitude or extent —
        the linear-interpolation error inside any one chunk stays
        sub-meter on a 25 km × 30 km survey.
        """
        await _get_project_for_user(project_id, principal, db)
        try:
            project_dir = Path(dojo_svc.get_project_dir(project_id))
            cfg = dojo_svc.get_config(project_id)
        except ProjectNotFoundError:
            raise HTTPException(status_code=404, detail="Dojo project not found")
        option_name = option or _active_option_name(cfg)
        rng = _validated_offset_range(omin, omax)
        meta = _load_existing_meta(
            project_dir,
            option_name,
            source,
            *(rng if rng is not None else (None, None)),
        )
        tif_path = project_dir / "inputs" / "gis" / "seismic" / meta.tif
        if not tif_path.exists():
            raise HTTPException(status_code=404, detail="Fold GeoTIFF not found.")
        try:
            png_bytes = render_fold_chunk_png(
                tif_path,
                chunk_id=chunk_id,
                colormap=meta.colormap,
                vmin=float(meta.value_min),
                vmax=float(meta.value_max),
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={"Cache-Control": "no-store"},
        )

    @router.get("/tiles/manifest")
    async def get_fold_tiles_manifest(
        project_id: int,
        omin: float | None = None,
        omax: float | None = None,
        option: str | None = None,
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
        option_name = option or _active_option_name(cfg)
        rng = _validated_offset_range(omin, omax)
        seismic_dir = project_dir / "inputs" / "gis" / "seismic"
        if rng is not None:
            tiles_dir = seismic_dir / fold_tiles_dirname(
                option_name, source, *rng
            )
        else:
            # Latest-render fallback resolves through the meta path so
            # both endpoints agree on which pyramid is "current".
            meta_path = latest_fold_meta_path(project_dir, option_name, source)
            if meta_path is None:
                raise HTTPException(status_code=404, detail="Fold tiles not found.")
            meta = json.loads(meta_path.read_text())
            tiles_dir = seismic_dir / meta["tiles_dir"]
        manifest_path = tiles_dir / "manifest.json"
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
        omin: float | None = None,
        omax: float | None = None,
        option: str | None = None,
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
        option_name = option or _active_option_name(cfg)
        rng = _validated_offset_range(omin, omax)
        seismic_dir = project_dir / "inputs" / "gis" / "seismic"
        if rng is not None:
            tiles_dir = seismic_dir / fold_tiles_dirname(
                option_name, source, *rng
            )
        else:
            meta_path = latest_fold_meta_path(project_dir, option_name, source)
            if meta_path is None:
                raise HTTPException(status_code=404, detail="Tile not found.")
            meta = json.loads(meta_path.read_text())
            tiles_dir = seismic_dir / meta["tiles_dir"]
        tile_path = tiles_dir / z / x / f"{y.removesuffix('.png')}.png"
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

    return router


router = _build_router("grid", prefix="fold", tag="project-fold-artifacts")
router_offsets = _build_router(
    "offsets", prefix="offsets-fold", tag="project-offsets-fold-artifacts"
)
