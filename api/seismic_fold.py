"""Compute a fold map from the theoretical SPS files and write raster outputs.

Runs on demand via the ``POST /project/{id}/artifacts/fold`` endpoint.
Produces under ``inputs/gis/seismic/`` (namespaced by the active grid
option slug):

* ``fold__{slug}.tif``       — georeferenced GeoTIFF (authoritative,
                               written in the project CRS with the
                               survey's rotated affine)
* ``fold__{slug}_tiles/``    — Web-Mercator PNG tile pyramid generated
                               from the GeoTIFF, colour-ramped, with
                               transparent empty bins
* ``fold__{slug}.meta.json`` — zoom range, WGS84 bbox, value range,
                               params used

The tile pyramid replaces the old single-PNG + 4-corner overlay. A
standard ``{z}/{x}/{y}`` endpoint serves the tiles, which means:

* The frontend renders through a standard raster/TileLayer pipeline
  instead of hand-placing a rotated quad.
* Pixel density is adaptive — distant zooms pull coarse tiles, close
  zooms pull the native-resolution ones, capped at a total budget so
  large surveys stay servable.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import numpy as np
import pyarrow.compute as pc
import rasterio
from rasterio.transform import Affine

from api.seismic_fold_tiles import write_fold_tile_pyramid
from seismic.fold import FoldModel
from seismic.grid import BinGrid
from seismic.sps import SpreadSpec, read_point_table


FOLD_STEM = "fold"

# Colormaps exposed to the UI. Keep this tight — each entry doubles as a
# frontend dropdown option.
SUPPORTED_COLORMAPS = ("viridis", "plasma", "inferno", "magma", "turbo", "seismic")


def _slug(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")


def fold_tif_fname(option_name: str) -> str:
    return f"{FOLD_STEM}__{_slug(option_name)}.tif"


def fold_tiles_dirname(option_name: str) -> str:
    return f"{FOLD_STEM}__{_slug(option_name)}_tiles"


def fold_meta_fname(option_name: str) -> str:
    return f"{FOLD_STEM}__{_slug(option_name)}.meta.json"


def _sps_origin(path: Path, kind: str) -> tuple[float, float]:
    """Return (min_line, min_point) from an SPS point file.

    BinGrid's ``inline_origin``/``crossline_origin`` are expressed in the
    SPS line/point numbering (same units as ``inline_bin`` / ``crossline_bin``),
    so we anchor the binning at the station with the smallest line and
    point numbers — one half-bin below (shift is applied by BinGrid).
    """
    pt = read_point_table(path, kind)
    line = pt.table.column("line")
    point = pt.table.column("point")
    return float(pc.min(line).as_py()), float(pc.min(point).as_py())


def _first_design_active(cfg: Any, option_name: str) -> tuple[int, int]:
    """Pull ``active_rl`` / ``active_rp`` from the first design of the option.

    Falls back to (0, 0) which means "unconstrained" for SpreadSpec — the
    fold will use every receiver-source pairing. Raises nothing: the
    caller treats missing config as an error separately.
    """
    grid_opt = (cfg.grid or {}).get(option_name)
    if grid_opt is None or not grid_opt.design_def:
        return 0, 0
    first_idx = sorted(grid_opt.design_def.keys())[0]
    dd = grid_opt.design_def[first_idx]
    return int(dd.active_rl or 0), int(dd.active_rp or 0)


def _compute_fold_geotiff(
    model: FoldModel,
    bin_grid: BinGrid,
    out_path: Path,
    *,
    crs: str,
    offset_min: float,
    offset_max: float,
) -> tuple[np.ndarray, Affine]:
    """Write the GeoTIFF and return (fold array, rasterio transform)."""
    binning = model.build_binning(bin_grid)
    fold = model.compute_fold(
        binning, offset_min=offset_min, offset_max=offset_max, trim=False
    )
    sps_affine, _rms = model.fit_transform(bin_grid, binning)

    # seismic.grid.AffineTransform2D evaluates at bin centres (i=row, j=col):
    #   (E, N) = (a*j + c*i + e, b*j + d*i + f)
    # rasterio.Affine evaluates at the upper-left corner of each pixel:
    #   (x, y) = (a*col + b*row + c, d*col + e*row + f)
    # Half-pixel shift bridges centre → corner.
    a, b = sps_affine.a, sps_affine.b
    c, d = sps_affine.c, sps_affine.d
    e, f = sps_affine.e, sps_affine.f
    rio_transform = Affine(
        a, c, e - 0.5 * (a + c),
        b, d, f - 0.5 * (b + d),
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        out_path,
        "w",
        driver="GTiff",
        height=fold.shape[0],
        width=fold.shape[1],
        count=1,
        dtype=fold.dtype,
        crs=crs,
        transform=rio_transform,
        nodata=0,
        compress="deflate",
    ) as dst:
        dst.write(fold, 1)
    return fold, rio_transform


def _fold_value_range(fold: np.ndarray) -> tuple[int, int]:
    """Min/max across non-zero bins — colormap domain for the pyramid."""
    data = fold[fold > 0]
    if data.size == 0:
        return 0, 1
    vmin = int(data.min())
    vmax = int(data.max())
    return vmin, max(vmax, vmin + 1)


def write_fold_for_option(
    project_dir: Path | str,
    epsg: int,
    cfg: Any,
    option_name: str,
    *,
    inline_bin: float,
    crossline_bin: float,
    offset_min: float,
    offset_max: float,
    colormap: str,
) -> dict[str, Any]:
    """Full fold pipeline: SPS → FoldModel → GeoTIFF + tile pyramid + meta."""
    project_dir = Path(project_dir)
    grid_dir = project_dir / "work" / "artifacts" / "grid"
    r_sps = grid_dir / "theoretical.r01"
    s_sps = grid_dir / "theoretical.s01"
    if not r_sps.exists() or not s_sps.exists():
        raise FileNotFoundError(
            "theoretical.r01 / theoretical.s01 not found — run Process grid first."
        )

    active_lines, active_stations = _first_design_active(cfg, option_name)
    spread = SpreadSpec(
        active_lines=active_lines or None,
        active_stations=active_stations or None,
        mode="relative",
    )
    model = FoldModel.from_spread(
        receiver_path=r_sps, source_path=s_sps, spread=spread
    )

    r_line0, r_point0 = _sps_origin(r_sps, "R")
    bin_grid = BinGrid(
        inline_bin=inline_bin,
        crossline_bin=crossline_bin,
        inline_origin=r_point0,
        crossline_origin=r_line0,
    )

    seismic_dir = project_dir / "inputs" / "gis" / "seismic"
    tif_path = seismic_dir / fold_tif_fname(option_name)
    tiles_dir = seismic_dir / fold_tiles_dirname(option_name)
    meta_path = seismic_dir / fold_meta_fname(option_name)

    fold, _rio_transform = _compute_fold_geotiff(
        model,
        bin_grid,
        tif_path,
        crs=f"EPSG:{epsg}",
        offset_min=offset_min,
        offset_max=offset_max,
    )
    vmin, vmax = _fold_value_range(fold)

    pyramid = write_fold_tile_pyramid(
        tif_path, tiles_dir, colormap=colormap, vmin=vmin, vmax=vmax
    )

    meta = {
        "option_name": option_name,
        "tif": tif_path.name,
        "tiles_dir": tiles_dir.name,
        "min_zoom": int(pyramid["minZoom"]),
        "max_zoom": int(pyramid["maxZoom"]),
        "bounds": [float(v) for v in pyramid["bounds"]],
        "value_min": int(vmin),
        "value_max": int(vmax),
        "colormap": colormap,
        "width": int(fold.shape[1]),
        "height": int(fold.shape[0]),
        "tiles_written": int(pyramid["tilesWritten"]),
        "params": {
            "inline_bin": inline_bin,
            "crossline_bin": crossline_bin,
            "offset_min": offset_min,
            "offset_max": offset_max,
            "active_lines": active_lines or None,
            "active_stations": active_stations or None,
        },
    }
    meta_path.write_text(json.dumps(meta, indent=2))
    return meta
