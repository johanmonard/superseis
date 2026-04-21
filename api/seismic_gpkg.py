"""Write seismic grid artifacts as .gpkg files.

The pipeline's theoretical-grid and offsets steps produce parquets in
``work/artifacts/{grid,offsets}``. This module mirrors that output into
``inputs/gis/seismic/*.gpkg`` so the user-facing Files page can list and
visualise the stations alongside their other GIS layers.

Called from ``api/routes/project_pipeline.py`` after a successful step.
Any error is swallowed and logged by the caller — the pipeline itself
remains authoritative; these are convenience derivatives.
"""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point


SEISMIC_DIR_NAME = "seismic"
THEORETICAL_GRID_FNAME = "theoretical_grid.gpkg"
OFFSET_GRID_FNAME = "offset_grid.gpkg"


def ensure_seismic_dir(project_dir: Path) -> Path:
    """Idempotent mkdir for ``inputs/gis/seismic`` under the project root."""
    seismic = project_dir / "inputs" / "gis" / SEISMIC_DIR_NAME
    seismic.mkdir(parents=True, exist_ok=True)
    return seismic


def _points_from_xy(x: np.ndarray, y: np.ndarray) -> list[Point]:
    # shapely vectorised constructors avoid the per-row Python overhead.
    return [Point(float(xi), float(yi)) for xi, yi in zip(x, y)]


def write_theoretical_grid_gpkg(project_dir: Path, epsg: int) -> Path | None:
    """Combine r + s theoretical-grid parquets into one .gpkg.

    Each row keeps its (x, y) and gets an ``fclass`` column equal to
    ``"sources"`` or ``"receivers"``. Returns the written path, or None
    when the source parquets are missing (first run / skipped step).
    """
    grid_dir = project_dir / "work" / "artifacts" / "grid"
    parts: list[gpd.GeoDataFrame] = []
    for ptype, fclass in (("r", "receivers"), ("s", "sources")):
        path = grid_dir / f"{ptype}.parquet"
        if not path.exists():
            continue
        df = pd.read_parquet(path, columns=["i_theo", "j_theo", "x", "y"])
        if df.empty:
            continue
        gdf = gpd.GeoDataFrame(
            {
                "fclass": fclass,
                "i_theo": df["i_theo"].astype("int32"),
                "j_theo": df["j_theo"].astype("int32"),
            },
            geometry=_points_from_xy(df["x"].to_numpy(), df["y"].to_numpy()),
            crs=f"EPSG:{epsg}",
        )
        parts.append(gdf)

    if not parts:
        return None

    combined = gpd.GeoDataFrame(
        pd.concat(parts, ignore_index=True),
        crs=f"EPSG:{epsg}",
    )
    seismic = ensure_seismic_dir(project_dir)
    out = seismic / THEORETICAL_GRID_FNAME
    combined.to_file(out, driver="GPKG")
    return out


def write_offset_grid_gpkg(project_dir: Path, epsg: int) -> Path | None:
    """Combine r + s offsets parquets into one .gpkg with per-row fclass.

    fclass values: ``{sources,receivers}_{inplace,offset,snapped,skipped}``.
    Geometry picks the representative position for each category:

    - ``snapped``  → (x_offs_snap, y_offs_snap) — the GIS feature the
      snapper pulled the offset station onto.
    - ``offset``   → (x_offs, y_offs) — the raw multioffset landing.
    - ``skipped``  → (x, y) — the theoretical coords; the point stays
      in place because the offsetter gave up on it.
    - ``inplace``  → (x, y) — no offset was needed.

    Categorisation priority (so the fclass labels partition the set):
    snapped > offset > skipped > inplace. Returns the written path, or
    None when parquets are missing.
    """
    offs_dir = project_dir / "work" / "artifacts" / "offsets"
    parts: list[gpd.GeoDataFrame] = []

    for ptype, prefix in (("r", "receivers"), ("s", "sources")):
        path = offs_dir / f"{ptype}.parquet"
        if not path.exists():
            continue
        df = pd.read_parquet(path)
        if df.empty:
            continue

        has_snap_cols = "x_offs_snap" in df.columns and "y_offs_snap" in df.columns
        x_snap = (
            df["x_offs_snap"].to_numpy(dtype=np.float64)
            if has_snap_cols
            else np.full(len(df), np.nan)
        )
        y_snap = (
            df["y_offs_snap"].to_numpy(dtype=np.float64)
            if has_snap_cols
            else np.full(len(df), np.nan)
        )
        snap_mask = np.isfinite(x_snap) & np.isfinite(y_snap)

        offset = df["offset"].to_numpy(dtype=bool)
        skipped = df["skipped"].to_numpy(dtype=bool)

        # Representative geometry per row: start from theo, then pick the
        # category-specific position on top. Priority (high→low): snapped,
        # offset, skipped, inplace.
        x_theo = df["x"].to_numpy(dtype=np.float64)
        y_theo = df["y"].to_numpy(dtype=np.float64)
        x_offs_arr = df["x_offs"].to_numpy(dtype=np.float64)
        y_offs_arr = df["y_offs"].to_numpy(dtype=np.float64)

        gx = np.where(offset, x_offs_arr, x_theo).copy()
        gy = np.where(offset, y_offs_arr, y_theo).copy()
        if has_snap_cols:
            gx = np.where(snap_mask, x_snap, gx)
            gy = np.where(snap_mask, y_snap, gy)

        fclass = np.empty(len(df), dtype=object)
        fclass[:] = f"{prefix}_inplace"
        fclass[skipped] = f"{prefix}_skipped"
        fclass[offset & ~snap_mask] = f"{prefix}_offset"
        fclass[offset & snap_mask] = f"{prefix}_snapped"

        gdf = gpd.GeoDataFrame(
            {
                "fclass": fclass,
                "i_theo": df["i_theo"].astype("int32"),
                "j_theo": df["j_theo"].astype("int32"),
                "design_reg": df["design_reg"].astype("int32"),
            },
            geometry=_points_from_xy(gx, gy),
            crs=f"EPSG:{epsg}",
        )
        parts.append(gdf)

    if not parts:
        return None

    combined = gpd.GeoDataFrame(
        pd.concat(parts, ignore_index=True),
        crs=f"EPSG:{epsg}",
    )
    seismic = ensure_seismic_dir(project_dir)
    out = seismic / OFFSET_GRID_FNAME
    combined.to_file(out, driver="GPKG")
    return out
