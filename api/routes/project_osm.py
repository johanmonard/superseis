"""OSM download and clip endpoints.

Step 1 — Download OSM shapefiles for the terrain extent into depots/osm/.
Step 2 — Clip selected layers to inputs/gis/gis_layers/ as .gpkg files.

Both endpoints stream progress via SSE (text/event-stream).  Each line is a
JSON object with ``{"progress", "total", "message"}``.  The final line also
contains the result fields (``layers`` for download, ``files`` for clip).
"""

import asyncio
import json
import time
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, get_current_user
from api.db.engine import get_db
from api.db.models import Project
from api.dojo import get_dojo_project_service

from dojo.v3.services.project_service import ProjectNotFoundError, ProjectService

router = APIRouter(prefix="/project/{project_id}/osm", tags=["project-osm"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


def _resolve_terrain(
    dojo_svc: ProjectService,
    project_id: int,
    terrain_option: str,
    extent_name: str,
):
    """Resolve terrain option + extent into a terrain polygon and CRS.

    Returns (terrain_poly, crs_xy, project_dir).
    """
    import numpy as np
    from dojo.v3.domain.geo import load_polygon
    from dojo.v3.domain.referentials import compute_referential

    try:
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found in dojo")

    project_dir = dojo_svc.get_project_dir(project_id)

    # --- survey_ui lookup ---
    survey_ui = cfg.survey_ui
    groups = survey_ui.get("groups", [])

    group = next((g for g in groups if g.get("name") == terrain_option), None)
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Terrain option '{terrain_option}' not found",
        )

    extent = next((e for e in group.get("extents", []) if e.get("name") == extent_name), None)
    if extent is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Extent '{extent_name}' not found in '{terrain_option}'",
        )

    # --- acquisition polygon ---
    acq_poly_name = group.get("acquisitionPolygon", "")
    if not acq_poly_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No acquisition polygon selected for this terrain option",
        )

    epsg = cfg.metadata.epsg
    if not epsg:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No EPSG code set in project definition",
        )
    crs_xy = int(epsg)

    poly_path = project_dir / "inputs" / "gis" / "polygons" / f"{acq_poly_name}.gpkg"
    if not poly_path.exists():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Polygon file not found: {acq_poly_name}.gpkg",
        )

    polygon = load_polygon(poly_path, crs_out=crs_xy)

    # --- compute referential (we only need terrain_poly) ---
    margins = {
        "left": int(float(extent.get("marginLeft") or 0)),
        "right": int(float(extent.get("marginRight") or 0)),
        "top": int(float(extent.get("marginTop") or 0)),
        "bottom": int(float(extent.get("marginBottom") or 0)),
    }
    rl_angle = float(extent.get("rlAngle") or 0)
    resolution = float(extent.get("resolution") or 1) or 1.0

    terrain_poly, _crs_wkt, _affine = compute_referential(
        crs_xy=crs_xy,
        polygon=polygon,
        margins=margins,
        origin=(0, 0),
        rl_angle=rl_angle,
        resolution=resolution,
    )

    return terrain_poly, crs_xy, project_dir


def _sse_line(data: dict) -> str:
    """Format a single SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


def _dir_size_mb(path: Path) -> float:
    """Total size of all files under *path* in megabytes."""
    total = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    return round(total / (1024 * 1024), 1)


# ---------------------------------------------------------------------------
# Download (SSE)
# ---------------------------------------------------------------------------

class DownloadRequest(BaseModel):
    surveyOption: str
    extentName: str
    skipIfExists: bool = True


@router.post("/download")
async def download_osm(
    project_id: int,
    body: DownloadRequest,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
):
    await _get_project_for_user(project_id, principal, db)

    terrain_poly, crs_xy, project_dir = _resolve_terrain(
        dojo_svc, project_id, body.surveyOption, body.extentName,
    )

    osm_dir = project_dir / "depots" / "osm"
    osm_dir.mkdir(parents=True, exist_ok=True)

    # Skip if files already present
    existing_shp = list(osm_dir.rglob("*.shp"))
    if body.skipIfExists and existing_shp:
        layers = sorted({p.stem for p in existing_shp})
        size_mb = _dir_size_mb(osm_dir)

        async def _skip_stream() -> AsyncGenerator[str, None]:
            yield _sse_line({
                "progress": 1, "total": 1,
                "message": f"OSM data available ({size_mb} MB)",
                "done": True, "ok": True, "layers": layers, "sizeMb": size_mb,
            })

        return StreamingResponse(_skip_stream(), media_type="text/event-stream")

    # Stream real progress from the download thread (throttled to ~5 Hz)
    queue: asyncio.Queue[dict | None] = asyncio.Queue()
    _last_emit = 0.0

    def _on_progress(downloaded: int, total: int) -> None:
        nonlocal _last_emit
        now = time.monotonic()
        if now - _last_emit < 0.2:
            return
        _last_emit = now
        queue.put_nowait({"progress": downloaded, "total": total,
                          "message": f"Downloading... {downloaded}/{total} bytes"})

    async def _stream() -> AsyncGenerator[str, None]:
        from dojo.v3.domain.gis_files import download_osm_files

        error: Exception | None = None

        def _run() -> None:
            nonlocal error
            try:
                download_osm_files(terrain_poly, crs_xy, osm_dir, _on_progress)
            except Exception as exc:
                error = exc
            finally:
                queue.put_nowait(None)  # sentinel

        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, _run)

        while True:
            evt = await queue.get()
            if evt is None:
                break
            yield _sse_line(evt)

        if error:
            yield _sse_line({"done": True, "ok": False,
                             "message": str(error), "layers": []})
            return

        layers = sorted({p.stem for p in osm_dir.rglob("*.shp")})
        size_mb = _dir_size_mb(osm_dir)
        yield _sse_line({
            "progress": 1, "total": 1,
            "message": f"OSM data downloaded successfully ({size_mb} MB)",
            "done": True, "ok": True, "layers": layers, "sizeMb": size_mb,
        })

    return StreamingResponse(_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Clip (SSE)
# ---------------------------------------------------------------------------

class ClipRequest(BaseModel):
    surveyOption: str
    extentName: str
    layers: list[str]


@router.post("/clip")
async def clip_osm(
    project_id: int,
    body: ClipRequest,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
):
    await _get_project_for_user(project_id, principal, db)

    if not body.layers:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No layers selected",
        )

    terrain_poly, crs_xy, project_dir = _resolve_terrain(
        dojo_svc, project_id, body.surveyOption, body.extentName,
    )

    osm_dir = project_dir / "depots" / "osm"
    temp_dir = project_dir / "temp"
    gis_layers_dir = project_dir / "inputs" / "gis" / "gis_layers"

    if not osm_dir.exists() or not any(osm_dir.rglob("*.shp")):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No OSM files found in depots/osm. Download first.",
        )

    queue: asyncio.Queue[dict | None] = asyncio.Queue()

    def _on_progress(current: int, total: int, layer_name: str) -> None:
        queue.put_nowait({
            "progress": current, "total": total,
            "message": f"Clipping {layer_name} ({current}/{total})",
        })

    async def _stream() -> AsyncGenerator[str, None]:
        from dojo.v3.domain.gis_files import crop_osm_files

        error: Exception | None = None

        def _run() -> None:
            nonlocal error
            try:
                crop_osm_files(
                    terrain_poly, crs_xy, osm_dir, temp_dir,
                    gis_layers_dir, set(body.layers), _on_progress,
                )
            except Exception as exc:
                error = exc
            finally:
                queue.put_nowait(None)

        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, _run)

        while True:
            evt = await queue.get()
            if evt is None:
                break
            yield _sse_line(evt)

        if error:
            yield _sse_line({"done": True, "ok": False,
                             "message": str(error), "files": []})
            return

        files = (
            sorted(f.name for f in gis_layers_dir.glob("*.gpkg"))
            if gis_layers_dir.exists()
            else []
        )
        yield _sse_line({
            "progress": 1, "total": 1,
            "message": f"Clipped {len(files)} layer(s) to gis_layers",
            "done": True, "ok": True, "files": files,
        })

    return StreamingResponse(_stream(), media_type="text/event-stream")
