"""Slice a fold GeoTIFF into a Web-Mercator PNG tile pyramid.

Unlike the DEM pyramid generator (which assumes an axis-aligned source in
EPSG:3857), the fold GeoTIFF is written in the project's CRS and may
carry the survey's RL rotation. That means we can't just crop-and-resample
in source-pixel space — each output tile pixel has to be round-tripped:
    Web-Mercator sample point → source CRS → inverse source affine → (col, row)
then bilinearly interpolated from the fold array.

Output lives next to the other seismic rasters at
``inputs/gis/seismic/fold__{slug}_tiles/{z}/{x}/{y}.png`` with a
``manifest.json`` for bounds + zoom range.
"""

from __future__ import annotations

import json
import math
import shutil
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from PIL import Image
from matplotlib import colormaps
from pyproj import Transformer


WORLD_HALF = 20037508.342789244
PYRAMID_TILE_PX = 256
PYRAMID_MAX_TILES = 600


# ---------------------------------------------------------------------------
# Mercator helpers (duplicates the DEM module's — kept local so the two
# pyramid generators stay independent).
# ---------------------------------------------------------------------------


def _merc_to_lnglat(x: float, y: float) -> tuple[float, float]:
    lng = (x / WORLD_HALF) * 180.0
    lat = (
        math.atan(math.exp((y / WORLD_HALF) * math.pi)) * 360.0 / math.pi
        - 90.0
    )
    return lng, lat


def _lnglat_to_merc(lng: float, lat: float) -> tuple[float, float]:
    x = (lng * WORLD_HALF) / 180.0
    clamped = max(-85.05112878, min(85.05112878, lat))
    y = math.log(math.tan(math.pi / 4 + (clamped * math.pi) / 360.0)) * (
        WORLD_HALF / math.pi
    )
    return x, y


def _tile_range_for_zoom(
    z: int, left_3857: float, bottom_3857: float, right_3857: float, top_3857: float
) -> dict[str, int]:
    tile_size = (2 * WORLD_HALF) / 2**z
    return {
        "tx_min": int(math.floor((left_3857 + WORLD_HALF) / tile_size)),
        "tx_max": int(math.floor((right_3857 + WORLD_HALF - 1e-9) / tile_size)),
        "ty_min": int(math.floor((WORLD_HALF - top_3857) / tile_size)),
        "ty_max": int(
            math.floor((WORLD_HALF - bottom_3857 - 1e-9) / tile_size)
        ),
    }


def _pick_max_zoom(source_pixel_merc: float) -> int:
    """Zoom whose native pixel matches the source pixel in Web-Mercator.

    ``source_pixel_merc`` is the linear footprint of one source-TIF pixel
    evaluated near the raster centre, in metres. We solve
        world_half / (128 · px_merc) = 2^z
    for z and clamp to sensible bounds.
    """
    if source_pixel_merc <= 0:
        return 18
    z = math.log2(WORLD_HALF / (128 * source_pixel_merc))
    return max(0, min(18, round(z)))


# ---------------------------------------------------------------------------
# Source sampling
# ---------------------------------------------------------------------------


def _bilinear_sample(
    src: np.ndarray, col: np.ndarray, row: np.ndarray
) -> np.ndarray:
    """Vectorised bilinear sample that zeros out-of-range coords.

    Fold values are integer counts; returning 0 for out-of-range makes the
    colormap step treat those pixels as transparent (same rule as empty
    bins inside the raster).

    At low zooms the merc→source reprojection of pixels near the antimeridian
    or poles can produce NaN/inf; a raw ``astype(np.int64)`` on those would
    wrap to ``INT64_MIN`` and crash the lookup. Filter them first.
    """
    h, w = src.shape
    finite = np.isfinite(col) & np.isfinite(row)
    col_safe = np.where(finite, col, 0.0)
    row_safe = np.where(finite, row, 0.0)
    inside = (
        finite
        & (col_safe >= 0) & (col_safe <= w - 1)
        & (row_safe >= 0) & (row_safe <= h - 1)
    )
    c0 = np.clip(np.floor(col_safe), 0, w - 1).astype(np.int64)
    r0 = np.clip(np.floor(row_safe), 0, h - 1).astype(np.int64)
    c1 = np.clip(c0 + 1, 0, w - 1)
    r1 = np.clip(r0 + 1, 0, h - 1)
    fc = np.clip(col_safe - c0, 0, 1)
    fr = np.clip(row_safe - r0, 0, 1)
    v00 = src[r0, c0]
    v10 = src[r0, c1]
    v01 = src[r1, c0]
    v11 = src[r1, c1]
    sampled = (
        v00 * (1 - fc) * (1 - fr)
        + v10 * fc * (1 - fr)
        + v01 * (1 - fc) * fr
        + v11 * fc * fr
    )
    return np.where(inside, sampled, 0.0)


# ---------------------------------------------------------------------------
# Pyramid writer
# ---------------------------------------------------------------------------


def _corner_bounds_wgs84(
    src_transform: rasterio.Affine, width: int, height: int, src_epsg: int
) -> tuple[float, float, float, float]:
    """Axis-aligned WGS84 bbox covering the (rotated) raster's four corners."""
    px_corners = [(0, 0), (width, 0), (width, height), (0, height)]
    xs: list[float] = []
    ys: list[float] = []
    tr = (
        None
        if src_epsg == 4326
        else Transformer.from_crs(src_epsg, 4326, always_xy=True)
    )
    for col, row in px_corners:
        x, y = src_transform * (col, row)
        if tr is not None:
            x, y = tr.transform(x, y)
        xs.append(x)
        ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def _source_pixel_size_merc(
    src_transform: rasterio.Affine, width: int, height: int, src_epsg: int
) -> float:
    """Approximate per-pixel footprint in Web-Mercator metres.

    Evaluates the affine at the raster centre plus one pixel in each
    direction, reprojects both to 3857, and takes the mean of the two
    segment lengths. A rough but CRS-agnostic way to pick a sane max-zoom
    without building a full reprojection.
    """
    cx, cy = width / 2.0, height / 2.0
    p_c = src_transform * (cx, cy)
    p_cx = src_transform * (cx + 1.0, cy)
    p_cy = src_transform * (cx, cy + 1.0)
    if src_epsg == 3857:
        xs_merc = [p_c, p_cx, p_cy]
    else:
        tr = Transformer.from_crs(src_epsg, 3857, always_xy=True)
        xs_merc = [tr.transform(*p) for p in (p_c, p_cx, p_cy)]
    dx = math.hypot(xs_merc[1][0] - xs_merc[0][0], xs_merc[1][1] - xs_merc[0][1])
    dy = math.hypot(xs_merc[2][0] - xs_merc[0][0], xs_merc[2][1] - xs_merc[0][1])
    return 0.5 * (dx + dy)


def write_fold_tile_pyramid(
    tif_path: Path,
    tiles_dir: Path,
    *,
    colormap: str,
    vmin: float,
    vmax: float,
) -> dict[str, Any]:
    """Generate the PNG pyramid + manifest for an existing fold GeoTIFF.

    ``vmin``/``vmax`` come from the meta computed during the single-TIF
    write so the colour scale stays consistent with what the frontend
    displays in the legend. A fold bin of 0 stays transparent in every
    tile (empty bins must not look like "low but present" fold).
    """
    with rasterio.open(tif_path) as ds:
        fold = ds.read(1).astype(np.float64)
        src_transform = ds.transform
        width, height = ds.width, ds.height
        src_crs = ds.crs
        if src_crs is None or src_crs.to_epsg() is None:
            raise ValueError(
                f"Fold GeoTIFF has no EPSG-assignable CRS: {tif_path}"
            )
        src_epsg = int(src_crs.to_epsg())

    src_inv = ~src_transform

    west, south, east, north = _corner_bounds_wgs84(
        src_transform, width, height, src_epsg
    )
    left_m, bottom_m = _lnglat_to_merc(west, south)
    right_m, top_m = _lnglat_to_merc(east, north)

    source_px_merc = _source_pixel_size_merc(
        src_transform, width, height, src_epsg
    )
    max_zoom = _pick_max_zoom(source_px_merc)
    # Ramp all the way down to zoom 0 so zoomed-out views (continent /
    # world scale) still pick up a tile. Low-zoom tiles are cheap — at
    # z=0 the whole fold collapses into one 256-px tile — and fully
    # transparent ones get skipped below, so the disk footprint is
    # dominated by the top zooms. Back max_zoom off first if the
    # theoretical tile count exceeds the cap.
    min_zoom = 0

    while True:
        plan: list[dict[str, int]] = []
        total = 0
        for z in range(min_zoom, max_zoom + 1):
            r = _tile_range_for_zoom(z, left_m, bottom_m, right_m, top_m)
            total += max(0, r["tx_max"] - r["tx_min"] + 1) * max(
                0, r["ty_max"] - r["ty_min"] + 1
            )
            plan.append({"z": z, **r})
        if total <= PYRAMID_MAX_TILES or max_zoom == 0:
            break
        max_zoom -= 1

    if tiles_dir.exists():
        shutil.rmtree(tiles_dir)
    tiles_dir.mkdir(parents=True, exist_ok=True)

    cmap = colormaps[colormap if colormap in colormaps else "viridis"]
    # Guard against vmin == vmax degenerate case — the PNG ramp would
    # otherwise divide by zero. +1 produces a flat colour for a one-valued
    # raster, acceptable for the rare all-same-fold survey.
    scale = float(vmax) - float(vmin)
    if scale <= 0:
        scale = 1.0

    merc_to_src = (
        None
        if src_epsg == 3857
        else Transformer.from_crs(3857, src_epsg, always_xy=True)
    )

    tiles_written = 0
    for entry in plan:
        z = entry["z"]
        tile_size_3857 = (2 * WORLD_HALF) / 2**z
        step_world = tile_size_3857 / PYRAMID_TILE_PX
        for tx in range(entry["tx_min"], entry["tx_max"] + 1):
            for ty in range(entry["ty_min"], entry["ty_max"] + 1):
                tb_left = tx * tile_size_3857 - WORLD_HALF
                tb_right = (tx + 1) * tile_size_3857 - WORLD_HALF
                tb_top = WORLD_HALF - ty * tile_size_3857
                tb_bottom = WORLD_HALF - (ty + 1) * tile_size_3857
                if (
                    tb_right <= left_m
                    or tb_left >= right_m
                    or tb_top <= bottom_m
                    or tb_bottom >= top_m
                ):
                    continue

                # Per-pixel sample coords in Web-Mercator centred on the
                # tile's pixel grid (256×256).
                px_grid, py_grid = np.meshgrid(
                    np.arange(PYRAMID_TILE_PX),
                    np.arange(PYRAMID_TILE_PX),
                    indexing="xy",
                )
                world_x = tb_left + (px_grid + 0.5) * step_world
                world_y = tb_top - (py_grid + 0.5) * step_world

                if merc_to_src is None:
                    src_x, src_y = world_x, world_y
                else:
                    src_x, src_y = merc_to_src.transform(world_x, world_y)

                # Apply the source affine's inverse to get (col, row).
                # rasterio.Affine.__invert__ gives a matrix whose product
                # with (x, y, 1) is (col, row); multiply the (2x3) via
                # numpy directly to stay vectorised.
                a, b, c = src_inv.a, src_inv.b, src_inv.c
                d, e, f = src_inv.d, src_inv.e, src_inv.f
                src_col = a * src_x + b * src_y + c
                src_row = d * src_x + e * src_y + f

                sampled = _bilinear_sample(fold, src_col, src_row)

                norm = (sampled - float(vmin)) / scale
                norm = np.clip(norm, 0.0, 1.0)
                rgba = (cmap(norm) * 255).astype(np.uint8)
                rgba[sampled <= 0, 3] = 0

                if rgba[..., 3].max() == 0:
                    # Fully transparent tile — skip the write. The
                    # manifest still claims coverage here, but the
                    # frontend's tile fetcher treats a 404 as "no data"
                    # and renders nothing, so the legend stays honest.
                    continue

                tile_dir = tiles_dir / str(z) / str(tx)
                tile_dir.mkdir(parents=True, exist_ok=True)
                Image.fromarray(rgba, mode="RGBA").save(tile_dir / f"{ty}.png")
                tiles_written += 1

    manifest = {
        "minZoom": min_zoom,
        "maxZoom": max_zoom,
        "bounds": [west, south, east, north],
        "tilesWritten": tiles_written,
        "colormap": colormap,
        "valueMin": float(vmin),
        "valueMax": float(vmax),
    }
    (tiles_dir / "manifest.json").write_text(json.dumps(manifest))
    return manifest
