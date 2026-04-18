"""Port of app/api/gis/dem/route.ts — fetch AWS Terrain Tiles, mosaic into a
GeoTIFF, and slice into a MapLibre-compatible terrain-rgb PNG pyramid, all
inside a project's ``inputs/gis/dem/`` folder.

Kept in its own module so the FastAPI route stays thin.
"""

from __future__ import annotations

import asyncio
import io
import json
import math
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple

import httpx
import numpy as np
import rasterio
from PIL import Image
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

TILE_HOST = "https://elevation-tiles-prod.s3.amazonaws.com/geotiff"
TILE_SIZE = 512
WORLD_HALF = 20037508.342789244
MAX_PIXELS = 4_000_000  # ~16 MB Float32 mosaic cap
MAX_ZOOM = 14
PYRAMID_TILE_PX = 256
PYRAMID_MAX_TILES = 600
HTTP_TIMEOUT = httpx.Timeout(20.0, connect=6.0)


# ---------------------------------------------------------------------------
# Mercator / tile helpers
# ---------------------------------------------------------------------------


def _lnglat_to_merc(lng: float, lat: float) -> Tuple[float, float]:
    x = (lng * WORLD_HALF) / 180.0
    clamped = max(-85.05112878, min(85.05112878, lat))
    y = math.log(math.tan(math.pi / 4 + (clamped * math.pi) / 360.0)) * (
        WORLD_HALF / math.pi
    )
    return x, y


def _merc_to_lnglat(x: float, y: float) -> Tuple[float, float]:
    lng = (x / WORLD_HALF) * 180.0
    lat = math.atan(math.exp((y / WORLD_HALF) * math.pi)) * 360.0 / math.pi - 90.0
    return lng, lat


def _tile_range(z: int, west: float, south: float, east: float, north: float):
    x_min, y_min = _lnglat_to_merc(west, south)
    x_max, y_max = _lnglat_to_merc(east, north)
    px = (2 * WORLD_HALF) / (TILE_SIZE * 2**z)
    tile_px = TILE_SIZE * px
    return {
        "px": px,
        "tx_min": int(math.floor((x_min + WORLD_HALF) / tile_px)),
        "tx_max": int(math.floor((x_max + WORLD_HALF) / tile_px)),
        "ty_min": int(math.floor((WORLD_HALF - y_max) / tile_px)),
        "ty_max": int(math.floor((WORLD_HALF - y_min) / tile_px)),
    }


def _pick_zoom(
    west: float, south: float, east: float, north: float, max_zoom: int
):
    for z in range(max_zoom, -1, -1):
        r = _tile_range(z, west, south, east, north)
        w = (r["tx_max"] - r["tx_min"] + 1) * TILE_SIZE
        h = (r["ty_max"] - r["ty_min"] + 1) * TILE_SIZE
        if w * h <= MAX_PIXELS:
            return {"zoom": z, **r}
    return {"zoom": 0, **_tile_range(0, west, south, east, north)}


# ---------------------------------------------------------------------------
# Tile fetch + mosaic
# ---------------------------------------------------------------------------


async def _fetch_one_tile(
    client: httpx.AsyncClient, zoom: int, tx: int, ty: int
) -> Optional[np.ndarray]:
    url = f"{TILE_HOST}/{zoom}/{tx}/{ty}.tif"
    try:
        res = await client.get(url)
    except httpx.HTTPError:
        return None
    if res.status_code != 200:
        return None
    try:
        with MemoryFile(res.content) as memfile:
            with memfile.open() as src:
                band = src.read(1)
        return np.asarray(band, dtype=np.float32)
    except Exception:
        return None


async def _build_mosaic(
    zoom: int, tx_min: int, tx_max: int, ty_min: int, ty_max: int
) -> Tuple[np.ndarray, int, int]:
    cols = tx_max - tx_min + 1
    rows = ty_max - ty_min + 1
    width = cols * TILE_SIZE
    height = rows * TILE_SIZE
    # NaN marks "no tile fetched here" so downstream code can distinguish
    # missing data from legitimate sea-level 0s. rasterio writes NaN through
    # to the GeoTIFF alongside a ``nodata=NaN`` tag.
    mosaic = np.full((height, width), np.nan, dtype=np.float32)

    tiles_max = 2**zoom
    fetched = 0
    missing = 0

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        # Fetch concurrently but with a bounded pool to be polite.
        sem = asyncio.Semaphore(16)
        jobs: list[tuple[int, int, asyncio.Task[Optional[np.ndarray]]]] = []
        for cy in range(rows):
            for cx in range(cols):
                tx = ((tx_min + cx) % tiles_max + tiles_max) % tiles_max
                ty = ty_min + cy
                if ty < 0 or ty >= tiles_max:
                    missing += 1
                    continue

                async def _go(tx=tx, ty=ty):
                    async with sem:
                        return await _fetch_one_tile(client, zoom, tx, ty)

                jobs.append((cx, cy, asyncio.create_task(_go())))

        for cx, cy, task in jobs:
            tile = await task
            if tile is None:
                missing += 1
                continue
            th, tw = tile.shape
            off_x = cx * TILE_SIZE
            off_y = cy * TILE_SIZE
            copy_w = min(tw, width - off_x)
            copy_h = min(th, height - off_y)
            mosaic[off_y : off_y + copy_h, off_x : off_x + copy_w] = tile[
                :copy_h, :copy_w
            ]
            fetched += 1

    return mosaic, fetched, missing


# ---------------------------------------------------------------------------
# GeoTIFF writer
# ---------------------------------------------------------------------------


def _write_geotiff(
    path: Path,
    mosaic: np.ndarray,
    left: float,
    top: float,
    pixel_size: float,
) -> None:
    height, width = mosaic.shape
    transform = from_origin(left, top, pixel_size, pixel_size)
    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype=mosaic.dtype,
        crs="EPSG:3857",
        transform=transform,
        compress="deflate",
        predictor=2,
        nodata=float("nan"),
    ) as dst:
        dst.write(mosaic, 1)


# ---------------------------------------------------------------------------
# Pyramid writer (terrain-rgb / Mapzen "terrarium")
# ---------------------------------------------------------------------------


@dataclass
class _Mosaic:
    data: np.ndarray  # (H, W) float32
    origin_x: float
    origin_y: float
    pixel_size: float

    @property
    def width(self) -> int:
        return self.data.shape[1]

    @property
    def height(self) -> int:
        return self.data.shape[0]


def _pyramid_max_zoom(pixel_size: float) -> int:
    z = math.log2(WORLD_HALF / (128 * pixel_size))
    return max(0, min(18, round(z)))


def _tile_range_for_zoom(
    z: int,
    left_3857: float,
    bottom_3857: float,
    right_3857: float,
    top_3857: float,
):
    tile_size = (2 * WORLD_HALF) / 2**z
    return {
        "tx_min": int(math.floor((left_3857 + WORLD_HALF) / tile_size)),
        "tx_max": int(math.floor((right_3857 + WORLD_HALF - 1e-9) / tile_size)),
        "ty_min": int(math.floor((WORLD_HALF - top_3857) / tile_size)),
        "ty_max": int(
            math.floor((WORLD_HALF - bottom_3857 - 1e-9) / tile_size)
        ),
    }


def _encode_terrarium(elev: np.ndarray) -> np.ndarray:
    """Mapzen Terrarium RGB encoding at 1/256 m precision."""
    v = elev + 32768.0
    r = np.clip(np.floor(v / 256.0), 0, 255).astype(np.uint8)
    g = np.clip(np.floor(v) % 256.0, 0, 255).astype(np.uint8)
    frac = np.clip((v - np.floor(v)) * 256.0, 0, 255)
    b = np.clip(np.floor(frac), 0, 255).astype(np.uint8)
    a = np.full_like(r, 255, dtype=np.uint8)
    return np.stack([r, g, b, a], axis=-1)


def _sample_bilinear(m: _Mosaic, col: np.ndarray, row: np.ndarray) -> np.ndarray:
    c0 = np.clip(np.floor(col).astype(np.int64), 0, m.width - 1)
    r0 = np.clip(np.floor(row).astype(np.int64), 0, m.height - 1)
    c1 = np.clip(c0 + 1, 0, m.width - 1)
    r1 = np.clip(r0 + 1, 0, m.height - 1)
    fc = np.clip(col - c0, 0, 1)
    fr = np.clip(row - r0, 0, 1)
    v00 = m.data[r0, c0]
    v10 = m.data[r0, c1]
    v01 = m.data[r1, c0]
    v11 = m.data[r1, c1]
    return (
        v00 * (1 - fc) * (1 - fr)
        + v10 * fc * (1 - fr)
        + v01 * (1 - fc) * fr
        + v11 * fc * fr
    )


def _write_pyramid(m: _Mosaic, out_dir: Path) -> dict:
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    left = m.origin_x
    top = m.origin_y
    right = m.origin_x + m.width * m.pixel_size
    bottom = m.origin_y - m.height * m.pixel_size

    # Choose max zoom from source resolution; back off until total tiles ≤
    # PYRAMID_MAX_TILES so coarse-but-wide DEMs don't explode the count.
    max_zoom = _pyramid_max_zoom(m.pixel_size)
    min_zoom = max(0, max_zoom - 3)
    plan: list[dict] = []
    while True:
        plan = []
        total = 0
        for z in range(min_zoom, max_zoom + 1):
            r = _tile_range_for_zoom(z, left, bottom, right, top)
            total += max(0, r["tx_max"] - r["tx_min"] + 1) * max(
                0, r["ty_max"] - r["ty_min"] + 1
            )
            plan.append({"z": z, **r})
        if total <= PYRAMID_MAX_TILES or max_zoom == 0:
            break
        max_zoom -= 1
        min_zoom = max(0, max_zoom - 3)

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
                    tb_right <= left
                    or tb_left >= right
                    or tb_top <= bottom
                    or tb_bottom >= top
                ):
                    continue

                # Build per-pixel sample coords for this tile (vectorised).
                px_grid, py_grid = np.meshgrid(
                    np.arange(PYRAMID_TILE_PX),
                    np.arange(PYRAMID_TILE_PX),
                    indexing="xy",
                )
                world_x = tb_left + (px_grid + 0.5) * step_world
                world_y = tb_top - (py_grid + 0.5) * step_world
                src_col = (world_x - m.origin_x) / m.pixel_size - 0.5
                src_row = (m.origin_y - world_y) / m.pixel_size - 0.5
                elev = _sample_bilinear(m, src_col, src_row)
                rgba = _encode_terrarium(elev)

                tile_dir = out_dir / str(z) / str(tx)
                tile_dir.mkdir(parents=True, exist_ok=True)
                Image.fromarray(rgba, mode="RGBA").save(tile_dir / f"{ty}.png")
                tiles_written += 1

    west, south = _merc_to_lnglat(left, bottom)
    east, north = _merc_to_lnglat(right, top)
    manifest = {
        "minZoom": min_zoom,
        "maxZoom": max_zoom,
        "bounds": [west, south, east, north],
        "encoding": "terrarium",
        "tilesWritten": tiles_written,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest))
    return manifest


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


@dataclass
class DemDownloadResult:
    file: str
    zoom: int
    width: int
    height: int
    tiles: int
    fetched: int
    missing: int
    pyramid: dict


async def download_dem(
    dem_dir: Path,
    filename: str,
    bbox: Tuple[float, float, float, float],
    max_zoom: int,
) -> DemDownloadResult:
    """Download + mosaic DEM tiles for ``bbox`` and write a .tif + pyramid
    into ``dem_dir``. Raises ValueError on bad input, RuntimeError on empty
    mosaic (no upstream tiles available).
    """
    west, south, east, north = bbox
    if not (west < east and south < north):
        raise ValueError("Degenerate bbox")

    if not filename:
        raise ValueError("Missing filename")

    # Filename hygiene — the frontend already sanitises, but we re-apply
    # defensively so path-traversal and binary chars don't slip through.
    safe = "".join(
        c if c.isalnum() or c in "._-" else "_" for c in filename
    )[:80]
    if not safe.lower().endswith(".tif"):
        safe = f"{safe}.tif"

    zoom_info = _pick_zoom(west, south, east, north, min(max_zoom, MAX_ZOOM))
    zoom = zoom_info["zoom"]
    tx_min = zoom_info["tx_min"]
    tx_max = zoom_info["tx_max"]
    ty_min = zoom_info["ty_min"]
    ty_max = zoom_info["ty_max"]
    px = zoom_info["px"]
    cols = tx_max - tx_min + 1
    rows = ty_max - ty_min + 1

    mosaic, fetched, missing = await _build_mosaic(
        zoom, tx_min, tx_max, ty_min, ty_max
    )
    if fetched == 0:
        raise RuntimeError("No DEM tiles available for this area")

    left = tx_min * TILE_SIZE * px - WORLD_HALF
    top = WORLD_HALF - ty_min * TILE_SIZE * px

    dem_dir.mkdir(parents=True, exist_ok=True)
    tif_path = dem_dir / safe

    # Heavy CPU ops off the event loop so the server stays responsive.
    await asyncio.get_event_loop().run_in_executor(
        None, _write_geotiff, tif_path, mosaic, left, top, px
    )

    base_name = safe[:-4]  # drop .tif
    tiles_dir = dem_dir / f"{base_name}_tiles"
    # Pyramid feeds MapLibre's setTerrain — NaN would break bilinear sampling
    # and hillshade. Treat missing cells as sea level there; the raw GeoTIFF
    # still carries NaN so the color-ramp pass can ignore them.
    pyramid_input = np.nan_to_num(mosaic, nan=0.0)
    manifest = await asyncio.get_event_loop().run_in_executor(
        None,
        _write_pyramid,
        _Mosaic(data=pyramid_input, origin_x=left, origin_y=top, pixel_size=px),
        tiles_dir,
    )

    return DemDownloadResult(
        file=safe,
        zoom=zoom,
        width=mosaic.shape[1],
        height=mosaic.shape[0],
        tiles=cols * rows,
        fetched=fetched,
        missing=missing,
        pyramid=manifest,
    )
