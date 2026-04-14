#!/usr/bin/env python3
"""Add an 'elevation' column to a parquet file by sampling AWS Terrarium tiles.

Usage: python3 add-elevation.py <parquet_file> [--zoom 12]

Sends JSON progress lines to stdout:
  {"stage":"...", "progress": 0.0-1.0, "message":"..."}
  {"stage":"done", "file":"...", "unique_points":N, "tiles_fetched":N}
"""

import sys
import json
import math
import os
from io import BytesIO
from collections import defaultdict

import pyarrow.parquet as pq
import pyarrow as pa
import requests
from PIL import Image

TILE_URL = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"
TILE_CACHE_DIR = None  # set below based on parquet path


def progress(stage: str, pct: float, message: str = ""):
    print(json.dumps({"stage": stage, "progress": round(pct, 4), "message": message}), flush=True)


def lng_lat_to_tile(lng: float, lat: float, zoom: int) -> tuple[int, int]:
    n = 2 ** zoom
    x = int((lng + 180) / 360 * n)
    lat_rad = math.radians(lat)
    y = int((1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * n)
    x = max(0, min(n - 1, x))
    y = max(0, min(n - 1, y))
    return x, y


def lng_lat_to_pixel(lng: float, lat: float, zoom: int, tx: int, ty: int) -> tuple[int, int]:
    n = 2 ** zoom
    px = ((lng + 180) / 360 * n - tx) * 256
    lat_rad = math.radians(lat)
    py = ((1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * n - ty) * 256
    px = max(0, min(255, int(px)))
    py = max(0, min(255, int(py)))
    return px, py


def decode_terrarium(r: int, g: int, b: int) -> float:
    return (r * 256.0 + g + b / 256.0) - 32768.0


def fetch_tile(z: int, x: int, y: int) -> Image.Image | None:
    # Check disk cache first
    if TILE_CACHE_DIR:
        cache_path = os.path.join(TILE_CACHE_DIR, f"{z}_{x}_{y}.png")
        if os.path.exists(cache_path):
            return Image.open(cache_path).convert("RGB")

    url = TILE_URL.format(z=z, x=x, y=y)
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code != 200:
            return None
        img = Image.open(BytesIO(resp.content)).convert("RGB")
        # Cache to disk
        if TILE_CACHE_DIR:
            os.makedirs(TILE_CACHE_DIR, exist_ok=True)
            img.save(cache_path)
        return img
    except Exception:
        return None


def main():
    if len(sys.argv) < 2:
        print("Usage: add-elevation.py <parquet_file> [--zoom N]", file=sys.stderr)
        sys.exit(1)

    parquet_path = sys.argv[1]
    zoom = 12
    if "--zoom" in sys.argv:
        idx = sys.argv.index("--zoom")
        zoom = int(sys.argv[idx + 1])

    global TILE_CACHE_DIR
    TILE_CACHE_DIR = os.path.join(os.path.dirname(parquet_path), ".tile_cache")

    progress("reading", 0, "Reading parquet file...")
    table = pq.read_table(parquet_path)

    if "elevation" in table.column_names:
        progress("done", 1, "Elevation column already exists")
        print(json.dumps({"stage": "done", "file": parquet_path, "unique_points": 0, "tiles_fetched": 0}), flush=True)
        sys.exit(0)

    lon_col = table.column("lon").to_pylist()
    lat_col = table.column("lat").to_pylist()
    num_rows = len(lon_col)
    progress("reading", 1, f"Read {num_rows:,} rows")

    # Build unique points and map to tiles
    progress("indexing", 0, "Indexing unique positions...")
    # Round to ~1m precision to deduplicate nearby points
    point_map: dict[tuple[float, float], float] = {}
    tile_points: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)

    for i in range(num_rows):
        lng, lat = round(lon_col[i], 5), round(lat_col[i], 5)
        key = (lng, lat)
        if key not in point_map:
            point_map[key] = 0.0
            tx, ty = lng_lat_to_tile(lng, lat, zoom)
            tile_points[(tx, ty)].append(key)
        if i % 500000 == 0 and i > 0:
            progress("indexing", i / num_rows, f"Indexed {i:,} / {num_rows:,} rows")

    unique_count = len(point_map)
    tile_count = len(tile_points)
    progress("indexing", 1, f"{unique_count:,} unique positions across {tile_count:,} tiles")

    # Fetch tiles and sample elevations
    progress("sampling", 0, f"Fetching {tile_count:,} terrain tiles (zoom {zoom})...")
    tiles_fetched = 0
    tiles_done = 0

    for (tx, ty), points in tile_points.items():
        img = fetch_tile(zoom, tx, ty)
        if img:
            pixels = img.load()
            tiles_fetched += 1
            for (lng, lat) in points:
                px, py = lng_lat_to_pixel(lng, lat, zoom, tx, ty)
                r, g, b = pixels[px, py]
                point_map[(lng, lat)] = decode_terrarium(r, g, b)
        else:
            # Leave elevation at 0 for failed tiles
            pass

        tiles_done += 1
        if tiles_done % 10 == 0 or tiles_done == tile_count:
            progress("sampling", tiles_done / tile_count,
                     f"Tiles: {tiles_done:,} / {tile_count:,} ({tiles_fetched:,} fetched)")

    # Build elevation column
    progress("writing", 0, "Building elevation column...")
    elevations = [0.0] * num_rows
    for i in range(num_rows):
        key = (round(lon_col[i], 5), round(lat_col[i], 5))
        elevations[i] = point_map.get(key, 0.0)
        if i % 500000 == 0 and i > 0:
            progress("writing", i / num_rows * 0.5, f"Mapped {i:,} / {num_rows:,} rows")

    progress("writing", 0.5, "Writing parquet file...")
    elev_array = pa.array(elevations, type=pa.float64())
    table = table.append_column("elevation", elev_array)
    pq.write_table(table, parquet_path)

    progress("writing", 1, "Done")
    print(json.dumps({
        "stage": "done",
        "file": parquet_path,
        "unique_points": unique_count,
        "tiles_fetched": tiles_fetched,
    }), flush=True)


if __name__ == "__main__":
    main()
