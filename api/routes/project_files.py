"""Project GIS file management — upload, list, delete, raw binary serving.

Uploaded files (.gpkg, .kml, .zip with shapefiles) are converted to .gpkg
and stored in the project tree under inputs/gis/{category}/.

Raw binary endpoints serve GPKG/TIF files directly for client-side parsing
(sql.js) and allow PUT for saving user edits back to disk.

DEM tile endpoints serve terrain-rgb PNG pyramids for MapLibre terrain
rendering, with transparent fallback to AWS Terrarium tiles.
"""

import json
import re
import shutil
import tempfile
import zipfile
from pathlib import Path

import geopandas as gpd
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, get_current_user
from api.db.engine import get_db
from api.db.models import Project
from api.dojo import get_dojo_project_service

from dojo.v3.services.project_service import ProjectNotFoundError, ProjectService

router = APIRouter(prefix="/project/{project_id}/files", tags=["project-files"])

VALID_CATEGORIES = frozenset(["polygons", "poi", "layers", "user_edits", "dem"])
UPLOAD_CATEGORIES = frozenset(["polygons", "poi", "layers"])
ALLOWED_EXTENSIONS = frozenset([".gpkg", ".kml", ".zip"])
_SAFE_NAME_RE = re.compile(r"^[a-zA-Z0-9._-]+$")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_category(category: str) -> str:
    if category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid category '{category}'. Valid: {sorted(VALID_CATEGORIES)}",
        )
    return category


_CATEGORY_DIR_MAP = {
    "polygons": "polygons",
    "poi": "poi",
    "layers": "gis_layers",
    "user_edits": "user_edits",
    "dem": "dem",
}


def _gis_dir(dojo_svc: ProjectService, project_id: int, category: str) -> Path:
    try:
        project_dir = dojo_svc.get_project_dir(project_id)
    except (ProjectNotFoundError, ValueError) as e:
        raise HTTPException(status_code=404, detail=str(e))
    dirname = _CATEGORY_DIR_MAP.get(category, category)
    return project_dir / "inputs" / "gis" / dirname


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


def _safe_file_path(base_dir: Path, filename: str) -> Path:
    """Resolve a filename inside base_dir, blocking path traversal."""
    file_path = base_dir / filename
    try:
        file_path.resolve().relative_to(base_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=404, detail="File not found")
    return file_path


def _convert_to_gpkg(source_path: Path, dest_path: Path) -> None:
    """Read any supported geo format and write as .gpkg."""
    gdf = gpd.read_file(source_path)
    if gdf.empty:
        raise ValueError(f"File contains no features: {source_path.name}")
    gdf.to_file(dest_path, driver="GPKG")


def _convert_zip_to_gpkg(zip_path: Path, dest_path: Path) -> None:
    """Extract a zip, find the .shp inside, convert to .gpkg."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(tmp_dir)
        shp_files = list(tmp_dir.rglob("*.shp"))
        if not shp_files:
            raise ValueError("No .shp file found inside the zip archive")
        # Use the first .shp found
        _convert_to_gpkg(shp_files[0], dest_path)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class FileListResponse(BaseModel):
    polygons: list[str]
    poi: list[str]
    layers: list[str]
    user_edits: list[str]
    dem: list[str]


# ---------------------------------------------------------------------------
# Routes — listing
# ---------------------------------------------------------------------------

@router.get("", response_model=FileListResponse)
async def list_all_files(
    project_id: int,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> FileListResponse:
    """List all GIS files across all categories."""
    await _get_project_for_user(project_id, principal, db)
    result: dict[str, list[str]] = {}
    for cat in ("polygons", "poi", "layers", "user_edits"):
        gis_path = _gis_dir(dojo_svc, project_id, cat)
        if gis_path.exists():
            result[cat] = sorted(
                f.name for f in gis_path.iterdir()
                if f.is_file() and f.suffix == ".gpkg"
            )
        else:
            result[cat] = []
    # DEM lists .tif files
    dem_path = _gis_dir(dojo_svc, project_id, "dem")
    if dem_path.exists():
        result["dem"] = sorted(
            f.name for f in dem_path.iterdir()
            if f.is_file() and f.suffix == ".tif"
        )
    else:
        result["dem"] = []
    return FileListResponse(**result)


# ---------------------------------------------------------------------------
# Routes — upload (polygons, poi, layers only)
# ---------------------------------------------------------------------------

@router.post("/{category}", status_code=status.HTTP_201_CREATED)
async def upload_file(
    project_id: int,
    category: str,
    file: UploadFile,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> dict:
    """Upload a GIS file (.gpkg, .kml, or .zip with shapefile). Converted to .gpkg."""
    if category not in UPLOAD_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Upload not allowed for category '{category}'.",
        )
    await _get_project_for_user(project_id, principal, db)

    # Validate extension
    original_name = file.filename or "upload"
    ext = Path(original_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported file type '{ext}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )

    dest_dir = _gis_dir(dojo_svc, project_id, category)
    dest_dir.mkdir(parents=True, exist_ok=True)

    # Output filename: always .gpkg, using the original stem
    stem = Path(original_name).stem
    dest_path = dest_dir / f"{stem}.gpkg"

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp) / original_name
        # Write uploaded content to temp file
        content = await file.read()
        tmp_path.write_bytes(content)

        try:
            if ext == ".gpkg":
                shutil.copy2(tmp_path, dest_path)
            elif ext == ".kml":
                _convert_to_gpkg(tmp_path, dest_path)
            elif ext == ".zip":
                _convert_zip_to_gpkg(tmp_path, dest_path)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Failed to convert file: {e}",
            )

    return {"filename": dest_path.name, "category": category}


# ---------------------------------------------------------------------------
# Routes — delete
# ---------------------------------------------------------------------------

@router.delete("/{category}/{filename}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    project_id: int,
    category: str,
    filename: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> None:
    """Delete a GIS file from a category folder."""
    _validate_category(category)
    await _get_project_for_user(project_id, principal, db)

    dest_dir = _gis_dir(dojo_svc, project_id, category)
    file_path = _safe_file_path(dest_dir, filename)

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    file_path.unlink()


# ---------------------------------------------------------------------------
# Routes — GeoJSON
# ---------------------------------------------------------------------------

@router.get("/{category}/{filename}/geojson")
async def get_geojson(
    project_id: int,
    category: str,
    filename: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> dict:
    """Read a .gpkg file and return it as GeoJSON."""
    _validate_category(category)
    await _get_project_for_user(project_id, principal, db)

    dest_dir = _gis_dir(dojo_svc, project_id, category)
    file_path = _safe_file_path(dest_dir, filename)

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        gdf = gpd.read_file(file_path)
        # Ensure WGS84 for web display
        if gdf.crs and gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs(epsg=4326)
        return gdf.__geo_interface__
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to read file: {e}",
        )


# ---------------------------------------------------------------------------
# Routes — raw binary GET / PUT (for sql.js client-side parsing & saving)
# ---------------------------------------------------------------------------

@router.get("/{category}/{filename}/raw")
async def get_raw_file(
    project_id: int,
    category: str,
    filename: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> Response:
    """Serve a GIS file as raw binary (GPKG or TIF)."""
    _validate_category(category)
    await _get_project_for_user(project_id, principal, db)

    dest_dir = _gis_dir(dojo_svc, project_id, category)
    file_path = _safe_file_path(dest_dir, filename)

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return Response(
        content=file_path.read_bytes(),
        media_type="application/octet-stream",
    )


@router.put("/{category}/{filename}")
async def put_raw_file(
    project_id: int,
    category: str,
    filename: str,
    request: Request,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> dict:
    """Save raw binary data (GPKG) to a category folder."""
    _validate_category(category)
    await _get_project_for_user(project_id, principal, db)

    dest_dir = _gis_dir(dojo_svc, project_id, category)
    dest_dir.mkdir(parents=True, exist_ok=True)
    file_path = _safe_file_path(dest_dir, filename)

    body = await request.body()
    file_path.write_bytes(body)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Routes — DEM tile serving
# ---------------------------------------------------------------------------

@router.get("/dem-tiles/{name}/manifest")
async def get_dem_manifest(
    project_id: int,
    name: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> Response:
    """Return the manifest.json for a DEM tile pyramid."""
    if not _SAFE_NAME_RE.match(name) or ".." in name:
        raise HTTPException(status_code=400, detail="Bad name")
    await _get_project_for_user(project_id, principal, db)

    dem_dir = _gis_dir(dojo_svc, project_id, "dem")
    manifest_path = dem_dir / f"{name}_tiles" / "manifest.json"
    if not manifest_path.is_file():
        raise HTTPException(status_code=404, detail="Not found")

    return Response(
        content=manifest_path.read_bytes(),
        media_type="application/json",
    )


@router.get("/dem-tiles/{name}/{z}/{x}/{y}")
async def get_dem_tile(
    project_id: int,
    name: str,
    z: str,
    x: str,
    y: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> Response:
    """Serve a single terrain-rgb PNG tile, falling back to AWS Terrarium."""
    if (
        not _SAFE_NAME_RE.match(name)
        or not re.match(r"^\d{1,2}$", z)
        or not re.match(r"^\d{1,9}$", x)
        or not re.match(r"^\d{1,9}$", y)
    ):
        raise HTTPException(status_code=400, detail="Bad request")
    await _get_project_for_user(project_id, principal, db)

    dem_dir = _gis_dir(dojo_svc, project_id, "dem")
    tile_path = dem_dir / f"{name}_tiles" / z / x / f"{y}.png"

    if tile_path.is_file():
        return Response(
            content=tile_path.read_bytes(),
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    # Fall back to AWS Terrarium
    import httpx
    aws_url = f"https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"
    async with httpx.AsyncClient() as client:
        aws_res = await client.get(aws_url)
    if aws_res.status_code != 200:
        raise HTTPException(status_code=404, detail="Tile not found")

    return Response(
        content=aws_res.content,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )
