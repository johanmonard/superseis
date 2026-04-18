"""OSM download and clip endpoints.

Step 1 — Download OSM shapefiles for the polygon extent into depots/osm/.
Step 2 — Clip selected layers to inputs/gis/gis_layers/ as .gpkg files.

Both endpoints stream progress via SSE (text/event-stream).  Each line is a
JSON object with ``{"progress", "total", "message"}``.  The final line also
contains the result fields (``layers`` for download, ``files`` for clip).

The polygon is read from a GPKG file in inputs/gis/polygons/ (typically
``osm_clipping_boundaries.gpkg``).  After download, the actual bounding box
used is saved as ``osm_dataset_extent.gpkg`` in the same directory.
"""

import asyncio
import json
import sqlite3
import time
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, get_current_user
from api.db.engine import get_db
from api.db.models import Project
from api.dojo import get_dojo_project_service
from api.routes.osm_info import _load_or_fetch, _normalize_theme

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


def _load_polygon(
    dojo_svc: ProjectService,
    project_id: int,
    polygon_file: str,
):
    """Load a polygon GPKG and return (terrain_poly, crs_xy, project_dir).

    The polygon is read from inputs/gis/polygons/{polygon_file}, reprojected
    to the project EPSG, and returned as a numpy (N,2) array.
    """
    import numpy as np
    from dojo.v3.domain.geo import load_polygon

    try:
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found in dojo")

    project_dir = dojo_svc.get_project_dir(project_id)

    epsg = cfg.metadata.epsg
    if not epsg:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No EPSG code set in project definition",
        )
    crs_xy = int(epsg)

    poly_path = project_dir / "inputs" / "gis" / "polygons" / polygon_file
    if not poly_path.exists():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Polygon file not found: {polygon_file}",
        )

    polygon = load_polygon(poly_path, crs_out=crs_xy)
    return polygon, crs_xy, project_dir


def _save_dataset_extent(
    terrain_poly,
    crs_xy: int,
    project_dir: Path,
) -> None:
    """Query Geofabrik to find the actual extent of downloaded OSM regions
    and save it as osm_dataset_extent.gpkg."""
    from dojo.v3.domain.gis_files import get_osm_dataset_extent

    extent_gdf = get_osm_dataset_extent(terrain_poly, crs_xy)
    if extent_gdf is None:
        return
    out_path = project_dir / "inputs" / "gis" / "polygons" / "osm_dataset_extent.gpkg"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    extent_gdf.to_file(out_path, driver="GPKG")


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
    polygonFile: str
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

    terrain_poly, crs_xy, project_dir = _load_polygon(
        dojo_svc, project_id, body.polygonFile,
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
                # Save the dataset extent after successful download
                _save_dataset_extent(terrain_poly, crs_xy, project_dir)
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
    polygonFile: str
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

    terrain_poly, crs_xy, project_dir = _load_polygon(
        dojo_svc, project_id, body.polygonFile,
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


# ---------------------------------------------------------------------------
# Prefetch fclass info for clipped layers
# ---------------------------------------------------------------------------


class PrefetchFclassRequest(BaseModel):
    # Optional — defaults to every .gpkg in inputs/gis/gis_layers/.
    files: list[str] | None = None


class PrefetchFclassResponse(BaseModel):
    resolved: int
    skipped: int
    files: int


def _read_fclass_values(gpkg_path: Path) -> list[str]:
    """Return distinct ``fclass`` values in the first layer table of a .gpkg.

    Geofabrik gpkg files store features in a table named after the layer
    (e.g. ``gis_osm_landuse_a_free_1``) with an ``fclass`` column. We read
    it directly via sqlite3 — no geopandas dependency needed just for this.
    """
    if not gpkg_path.exists():
        return []
    try:
        conn = sqlite3.connect(f"file:{gpkg_path}?mode=ro", uri=True)
    except sqlite3.Error:
        return []
    try:
        cur = conn.execute(
            "SELECT table_name FROM gpkg_contents "
            "WHERE data_type='features' LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            return []
        table = row[0]
        cols = {r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')}
        if "fclass" not in cols:
            return []
        cur = conn.execute(
            f'SELECT DISTINCT fclass FROM "{table}" '
            "WHERE fclass IS NOT NULL AND fclass <> ''"
        )
        return [str(r[0]) for r in cur.fetchall()]
    except sqlite3.Error:
        return []
    finally:
        conn.close()


@router.post("/prefetch-fclass-info", response_model=PrefetchFclassResponse)
async def prefetch_fclass_info(
    project_id: int,
    body: PrefetchFclassRequest,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> PrefetchFclassResponse:
    """Scan clipped .gpkg files and populate the OSM fclass info cache.

    Called by the frontend immediately after a successful clip, so every
    (theme, fclass) pair the user might hover in the legend is already
    resolved by the time they interact with the layer.
    """
    await _get_project_for_user(project_id, principal, db)

    try:
        dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found in dojo")
    project_dir = dojo_svc.get_project_dir(project_id)

    gis_layers_dir = project_dir / "inputs" / "gis" / "gis_layers"
    if not gis_layers_dir.exists():
        return PrefetchFclassResponse(resolved=0, skipped=0, files=0)

    if body.files:
        targets = [gis_layers_dir / name for name in body.files
                   if name.endswith(".gpkg")]
    else:
        targets = sorted(gis_layers_dir.glob("*.gpkg"))

    resolved = 0
    skipped = 0
    for path in targets:
        theme = _normalize_theme(path.stem)
        if not theme:
            skipped += 1
            continue
        values = await asyncio.get_event_loop().run_in_executor(
            None, _read_fclass_values, path,
        )
        for fclass in values:
            try:
                await _load_or_fetch(db, theme, fclass)
                resolved += 1
            except HTTPException:
                skipped += 1
            except Exception:
                skipped += 1

    return PrefetchFclassResponse(
        resolved=resolved, skipped=skipped, files=len(targets),
    )
