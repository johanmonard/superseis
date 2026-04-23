"""CRS lookup — app-wide cache of EPSG definitions resolved via pyproj.

First request for a given EPSG code runs pyproj to extract the name, type,
units, bounding box, datum, ellipsoid, prime meridian, and (for projected
CRS) the projection method + parameters; the result is persisted in the
``crs_info`` table. Every subsequent request is served from the DB.

The route is public (CRS definitions aren't user- or project-specific).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.engine import get_db
from api.db.models import CrsInfo

router = APIRouter(prefix="/crs", tags=["crs"])


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------


class ProjectionParam(BaseModel):
    name: str
    value: float | str | None = None
    unit: str | None = None


class CrsInfoResponse(BaseModel):
    epsg: int
    name: str
    type_name: str
    unit: str
    is_projected: bool
    is_deprecated: bool
    area_name: Optional[str] = None
    area_west: Optional[float] = None
    area_south: Optional[float] = None
    area_east: Optional[float] = None
    area_north: Optional[float] = None
    datum_name: Optional[str] = None
    datum_type: Optional[str] = None
    ellipsoid_name: Optional[str] = None
    ellipsoid_a: Optional[float] = None
    ellipsoid_b: Optional[float] = None
    ellipsoid_inv_flat: Optional[float] = None
    prime_meridian_name: Optional[str] = None
    prime_meridian_lon: Optional[float] = None
    projection_method: Optional[str] = None
    projection_params: Optional[list[ProjectionParam]] = None
    proj4text: Optional[str] = None
    fetched_at: datetime
    cached: bool

    model_config = {"from_attributes": True}


def _row_to_response(row: CrsInfo, *, cached: bool) -> CrsInfoResponse:
    params = None
    if row.projection_params:
        params = [ProjectionParam(**p) for p in row.projection_params]
    return CrsInfoResponse(
        epsg=row.epsg,
        name=row.name,
        type_name=row.type_name,
        unit=row.unit,
        is_projected=row.is_projected,
        is_deprecated=row.is_deprecated,
        area_name=row.area_name,
        area_west=row.area_west,
        area_south=row.area_south,
        area_east=row.area_east,
        area_north=row.area_north,
        datum_name=row.datum_name,
        datum_type=row.datum_type,
        ellipsoid_name=row.ellipsoid_name,
        ellipsoid_a=row.ellipsoid_a,
        ellipsoid_b=row.ellipsoid_b,
        ellipsoid_inv_flat=row.ellipsoid_inv_flat,
        prime_meridian_name=row.prime_meridian_name,
        prime_meridian_lon=row.prime_meridian_lon,
        projection_method=row.projection_method,
        projection_params=params,
        proj4text=row.proj4text,
        fetched_at=row.fetched_at,
        cached=cached,
    )


# ---------------------------------------------------------------------------
# pyproj resolver
# ---------------------------------------------------------------------------


def _resolve_with_pyproj(epsg: int) -> dict[str, Any]:
    """Extract all the fields we cache for a given EPSG code.

    Raises CRSError (from pyproj) if the code isn't known.
    """
    from pyproj import CRS

    crs = CRS.from_epsg(epsg)

    # --- type ---
    if crs.is_compound:
        type_name = "compound"
    elif crs.is_projected:
        type_name = "projected"
    elif crs.is_geographic:
        type_name = "geographic"
    elif crs.is_vertical:
        type_name = "vertical"
    elif crs.is_engineering:
        type_name = "engineering"
    else:
        type_name = "other"

    # --- unit (inspect first horizontal axis) ---
    unit = ""
    try:
        axes = crs.axis_info or []
        if axes:
            unit = (axes[0].unit_name or "").lower()
    except Exception:
        pass

    # --- area of use ---
    area_name = None
    area_west = area_south = area_east = area_north = None
    if crs.area_of_use is not None:
        area_name = crs.area_of_use.name
        area_west = crs.area_of_use.west
        area_south = crs.area_of_use.south
        area_east = crs.area_of_use.east
        area_north = crs.area_of_use.north

    # --- datum ---
    datum_name = None
    datum_type = None
    try:
        datum = crs.datum
        if datum is not None:
            datum_name = datum.name
            datum_type = getattr(datum, "type_name", None)
    except Exception:
        pass

    # --- ellipsoid (look up through geodetic_crs for projected cases) ---
    ell_name = ell_a = ell_b = ell_invf = None
    try:
        ell = crs.ellipsoid
        if ell is None and crs.geodetic_crs is not None:
            ell = crs.geodetic_crs.ellipsoid
        if ell is not None:
            ell_name = ell.name
            ell_a = float(ell.semi_major_metre) if ell.semi_major_metre else None
            ell_b = float(ell.semi_minor_metre) if ell.semi_minor_metre else None
            ell_invf = float(ell.inverse_flattening) if ell.inverse_flattening else None
    except Exception:
        pass

    # --- prime meridian ---
    pm_name = pm_lon = None
    try:
        pm = crs.prime_meridian
        if pm is None and crs.geodetic_crs is not None:
            pm = crs.geodetic_crs.prime_meridian
        if pm is not None:
            pm_name = pm.name
            pm_lon = float(pm.longitude) if pm.longitude is not None else None
    except Exception:
        pass

    # --- projection method + parameters (projected CRS only) ---
    proj_method = None
    proj_params: Optional[list[dict]] = None
    try:
        op = crs.coordinate_operation
        if op is not None:
            proj_method = op.method_name
            params = []
            for p in op.params or []:
                value: Any = None
                try:
                    value = float(p.value)
                except (TypeError, ValueError):
                    value = p.value
                params.append(
                    {
                        "name": p.name,
                        "value": value,
                        "unit": p.unit_name,
                    }
                )
            proj_params = params or None
    except Exception:
        pass

    # --- proj4 string (PROJ "+proj=…" form) ---
    proj4text = None
    try:
        proj4text = crs.to_proj4()
    except Exception:
        pass

    return {
        "name": crs.name,
        "type_name": type_name,
        "unit": unit or "unknown",
        "is_projected": bool(crs.is_projected),
        "is_deprecated": bool(getattr(crs, "is_deprecated", False)),
        "area_name": area_name,
        "area_west": area_west,
        "area_south": area_south,
        "area_east": area_east,
        "area_north": area_north,
        "datum_name": datum_name,
        "datum_type": datum_type,
        "ellipsoid_name": ell_name,
        "ellipsoid_a": ell_a,
        "ellipsoid_b": ell_b,
        "ellipsoid_inv_flat": ell_invf,
        "prime_meridian_name": pm_name,
        "prime_meridian_lon": pm_lon,
        "projection_method": proj_method,
        "projection_params": proj_params,
        "proj4text": proj4text,
    }


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.get("/{epsg}", response_model=CrsInfoResponse)
async def get_crs_info(
    epsg: int,
    db: AsyncSession = Depends(get_db),
) -> CrsInfoResponse:
    if epsg <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="EPSG code must be a positive integer",
        )

    existing = await db.get(CrsInfo, epsg)
    if existing is not None:
        # Back-fill proj4text for rows cached before this column existed
        # so the client gets a usable PROJ string without needing a cache
        # wipe or a data migration.
        if existing.proj4text is None:
            try:
                from pyproj import CRS

                existing.proj4text = CRS.from_epsg(epsg).to_proj4()
                await db.commit()
                await db.refresh(existing)
            except Exception:
                await db.rollback()
        return _row_to_response(existing, cached=True)

    try:
        resolved = _resolve_with_pyproj(epsg)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown EPSG code {epsg}: {exc}",
        )

    row = CrsInfo(
        epsg=epsg,
        fetched_at=datetime.now(timezone.utc),
        **resolved,
    )
    db.add(row)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        existing = await db.get(CrsInfo, epsg)
        if existing is not None:
            return _row_to_response(existing, cached=True)
        raise
    await db.refresh(row)
    return _row_to_response(row, cached=False)
