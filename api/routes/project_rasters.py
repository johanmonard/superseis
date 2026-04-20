"""Pipeline raster artifacts — list and fetch layer/mapper .npz arrays.

Serves the 2D arrays produced by the LAYERS and MAPPERS pipeline steps so
the frontend demo/raster page can render them pixel-accurate. Arrays are
returned as raw little-endian int16 bytes; shape and dtype travel in
response headers so a single ``arrayBuffer()`` on the client is enough to
reconstruct the grid.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, get_current_user
from api.db.engine import get_db
from api.db.models import Project
from api.dojo import get_dojo_project_service

from dojo.v3.services.project_service import ProjectNotFoundError, ProjectService

router = APIRouter(prefix="/project/{project_id}/rasters", tags=["project-rasters"])

RasterKind = Literal["layers", "mappers"]


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


class RasterItem(BaseModel):
    kind: RasterKind
    key: str  # "1" for layer zone 1, "my_map" for mapper name
    name: str  # human label
    file: str  # filename under the artifact dir
    shape: list[int]
    referential: str


class RasterListResponse(BaseModel):
    layers: list[RasterItem]
    mappers: list[RasterItem]


def _read_manifest(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None


@router.get("", response_model=RasterListResponse)
async def list_rasters(
    project_id: int,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> RasterListResponse:
    await _get_project_for_user(project_id, principal, db)
    try:
        project_dir = Path(dojo_svc.get_project_dir(project_id))
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")

    layers: list[RasterItem] = []
    layers_manifest = _read_manifest(project_dir / "work" / "artifacts" / "layers" / "layers.json")
    if layers_manifest:
        ref = layers_manifest.get("referential") or "simulation"
        for zone_key, meta in (layers_manifest.get("layers") or {}).items():
            layers.append(RasterItem(
                kind="layers",
                key=str(zone_key),
                name=str(meta.get("name") or f"layer {zone_key}"),
                file=str(meta.get("file") or f"{zone_key}_{ref}.npz"),
                shape=list(meta.get("shape") or []),
                referential=ref,
            ))

    mappers: list[RasterItem] = []
    mappers_manifest = _read_manifest(project_dir / "work" / "artifacts" / "mappers" / "mappers.json")
    if mappers_manifest:
        ref = mappers_manifest.get("referential") or "simulation"
        for map_name, meta in (mappers_manifest.get("mappers") or {}).items():
            mappers.append(RasterItem(
                kind="mappers",
                key=str(map_name),
                name=str(map_name),
                file=str(meta.get("file") or f"{map_name}_{ref}.npz"),
                shape=list(meta.get("shape") or []),
                referential=ref,
            ))

    return RasterListResponse(layers=layers, mappers=mappers)


@router.get("/{kind}/{name}")
async def get_raster(
    project_id: int,
    kind: RasterKind,
    name: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> Response:
    """Return the raster as raw little-endian bytes.

    Shape and dtype are exposed in ``X-Raster-Shape`` / ``X-Raster-Dtype``
    so the client can reconstruct the array with a single ``arrayBuffer()``.
    """
    await _get_project_for_user(project_id, principal, db)
    try:
        project_dir = Path(dojo_svc.get_project_dir(project_id))
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")

    if kind not in ("layers", "mappers"):
        raise HTTPException(status_code=422, detail=f"Invalid kind: {kind}")

    artifacts_dir = project_dir / "work" / "artifacts" / kind
    manifest = _read_manifest(artifacts_dir / f"{kind}.json") or {}
    ref = manifest.get("referential") or "simulation"
    # Fetch exact filename from the manifest when available (keeps naming
    # authoritative); fall back to the conventional pattern otherwise.
    fname: str | None = None
    if kind == "layers":
        meta = (manifest.get("layers") or {}).get(name)
        fname = meta.get("file") if isinstance(meta, dict) else None
    else:
        meta = (manifest.get("mappers") or {}).get(name)
        fname = meta.get("file") if isinstance(meta, dict) else None
    if not fname:
        fname = f"{name}_{ref}.npz"

    path = artifacts_dir / fname
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Raster not found: {fname}")

    try:
        with np.load(path) as bundle:
            arr = bundle["arr_0"]
    except (OSError, KeyError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load {fname}: {exc}")

    # Ensure little-endian for stable client-side interpretation.
    if arr.dtype.byteorder == ">":
        arr = arr.astype(arr.dtype.newbyteorder("<"))
    contiguous = np.ascontiguousarray(arr)

    headers = {
        "X-Raster-Shape": ",".join(str(s) for s in contiguous.shape),
        "X-Raster-Dtype": str(contiguous.dtype),
        "X-Raster-Min": str(int(contiguous.min()) if contiguous.size else 0),
        "X-Raster-Max": str(int(contiguous.max()) if contiguous.size else 0),
        "Cache-Control": "no-cache",
        "Access-Control-Expose-Headers": "X-Raster-Shape, X-Raster-Dtype, X-Raster-Min, X-Raster-Max",
    }
    return Response(
        content=contiguous.tobytes(order="C"),
        media_type="application/octet-stream",
        headers=headers,
    )
