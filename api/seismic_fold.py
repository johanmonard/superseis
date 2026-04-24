"""Compute a fold map from the theoretical grid parquets and write raster outputs.

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

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
import rasterio
from rasterio.transform import Affine

from api.seismic_fold_tiles import write_fold_tile_pyramid
from dojo.v3.domain.pipeline import grid_artifacts_dir
from seismic.fold import FoldModel
from seismic.grid import BinGrid
from seismic.sps import PointTable, SpreadSpec, geometry_from_point_tables
from seismic.sps.tables import PROVENANCE_SCHEMA


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


def _synthetic_provenance(kind: str, n: int) -> pa.Table:
    """Row-matched provenance stub for parquet-origin PointTables.

    The native validator reached via ``geometry_from_point_tables`` pulls
    ``record_number`` from ``PointTable.provenance`` and insists the array
    length match the point table. A parquet has no SPS byte-offsets, so
    fill with 1..n sentinels and null raw records.
    """
    return pa.table(
        {
            "record_kind": pa.array([kind] * n, type=pa.utf8()),
            "record_number": pa.array(range(1, n + 1), type=pa.int64()),
            "byte_offset": pa.array([0] * n, type=pa.int64()),
            "raw_record": pa.array([None] * n, type=pa.utf8()),
        },
        schema=PROVENANCE_SCHEMA,
    )


def _point_table_from_parquet(path: Path, kind: str) -> PointTable:
    """Project a grid parquet onto the SPS core schema as a PointTable.

    Matches the wiring validated in ``share/test.py`` (in-memory columns
    ``i_theo`` / ``j_theo`` are the transposed of parquet ``i`` / ``j``,
    so ``line=j_theo`` here equals ``line=i`` there, and so on):

    * Receivers (``R``): ``line = j_theo``, ``point = i_theo``
    * Sources   (``S``): ``line = i_theo``, ``point = j_theo``
    """
    raw = pq.read_table(path)
    if kind == "R":
        line_col, point_col = raw.column("j_theo"), raw.column("i_theo")
    elif kind == "S":
        line_col, point_col = raw.column("i_theo"), raw.column("j_theo")
    else:
        raise ValueError(f"kind must be 'R' or 'S', got {kind!r}")
    table = pa.table({
        "line": line_col.cast(pa.float64()),
        "point": point_col.cast(pa.float64()),
        "easting": raw.column("x").cast(pa.float64()),
        "northing": raw.column("y").cast(pa.float64()),
    })
    return PointTable(
        kind=kind,
        table=table,
        provenance=_synthetic_provenance(kind, table.num_rows),
    )


def _bin_grid_origin(receivers: PointTable, sources: PointTable) -> tuple[float, float]:
    """(inline_origin, crossline_origin) in the shared line/point numbering.

    BinGrid anchors at bin (0, 0) = the smallest (receiver.point, receiver.line)
    / (source.line, source.point) tuple — axes that coincide per kind thanks to
    the orthogonal wiring in ``_point_table_from_parquet``. Taking the min
    across both kinds keeps the grid anchored at the survey's true corner even
    when sources extend beyond the receiver patch.
    """
    inline_min = min(
        float(pc.min(receivers.table.column("point")).as_py()),
        float(pc.min(sources.table.column("line")).as_py()),
    )
    crossline_min = min(
        float(pc.min(receivers.table.column("line")).as_py()),
        float(pc.min(sources.table.column("point")).as_py()),
    )
    return inline_min, crossline_min


def _auto_bin_sizes(cfg: Any, option_name: str) -> tuple[float, float]:
    """Inline/crossline bin sizes in station units, derived from designs.

    Per the contract documented in ``share/test.py``:

        inline_bin     = RPI / resolution / 2    (min across designs)
        crossline_bin  = SPI / resolution / 2    (min across designs)
    """
    grid_opt = (cfg.grid or {}).get(option_name)
    if grid_opt is None or not grid_opt.design_def:
        raise ValueError(
            f"No design_def for option {option_name!r} — cannot derive bin sizes."
        )
    resolution = float(grid_opt.resolution or 0.0)
    if resolution <= 0:
        raise ValueError(
            f"Option {option_name!r} has no resolution — pick one before processing fold."
        )
    rpis = [float(d.rpi) for d in grid_opt.design_def.values() if float(d.rpi or 0) > 0]
    spis = [float(d.spi) for d in grid_opt.design_def.values() if float(d.spi or 0) > 0]
    if not rpis or not spis:
        raise ValueError(
            f"Option {option_name!r} designs missing RPI/SPI — cannot derive bin sizes."
        )
    inline_bin = min(rpi / resolution / 2 for rpi in rpis)
    crossline_bin = min(spi / resolution / 2 for spi in spis)
    return inline_bin, crossline_bin


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


def _inputs_fingerprint(
    r_parquet: Path,
    s_parquet: Path,
    *,
    option_name: str,
    offset_min: float,
    offset_max: float,
    colormap: str,
    inline_bin: float,
    crossline_bin: float,
    active_lines: int,
    active_stations: int,
) -> str:
    """Short hash over the inputs that drive this option's fold output.

    Combines the grid parquets' filesystem stats (size + mtime) with all
    derived compute parameters — any change flips the hash and triggers
    a re-run; otherwise the cached GeoTIFF + tile pyramid are reused.
    """
    r_stat = r_parquet.stat()
    s_stat = s_parquet.stat()
    payload = {
        "option_name": option_name,
        "offset_min": offset_min,
        "offset_max": offset_max,
        "colormap": colormap,
        "inline_bin": inline_bin,
        "crossline_bin": crossline_bin,
        "active_lines": active_lines,
        "active_stations": active_stations,
        "r_parquet": {"size": r_stat.st_size, "mtime_ns": r_stat.st_mtime_ns},
        "s_parquet": {"size": s_stat.st_size, "mtime_ns": s_stat.st_mtime_ns},
    }
    serialized = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()[:16]


def write_fold_for_option(
    project_dir: Path | str,
    epsg: int,
    cfg: Any,
    option_name: str,
    *,
    offset_min: float,
    offset_max: float,
    colormap: str,
) -> dict[str, Any]:
    """Full fold pipeline: parquets → FoldModel → GeoTIFF + tile pyramid + meta.

    Skipped when ``inputs/gis/seismic/fold__<slug>.meta.json`` already
    records the same input fingerprint and the TIF + tile pyramid are
    both present on disk — the existing meta is returned as-is.
    """
    project_dir = Path(project_dir)
    grid_dir = grid_artifacts_dir(project_dir, option_name)
    r_parquet = grid_dir / "r.parquet"
    s_parquet = grid_dir / "s.parquet"
    if not r_parquet.exists() or not s_parquet.exists():
        raise FileNotFoundError(
            "r.parquet / s.parquet not found — run Process grid first."
        )

    # Compute the inputs fingerprint up-front from cfg + parquet stats so
    # we can short-circuit the heavy work when nothing relevant changed.
    active_lines, active_stations = _first_design_active(cfg, option_name)
    inline_bin, crossline_bin = _auto_bin_sizes(cfg, option_name)
    current_fp = _inputs_fingerprint(
        r_parquet,
        s_parquet,
        option_name=option_name,
        offset_min=offset_min,
        offset_max=offset_max,
        colormap=colormap,
        inline_bin=inline_bin,
        crossline_bin=crossline_bin,
        active_lines=active_lines,
        active_stations=active_stations,
    )

    seismic_dir = project_dir / "inputs" / "gis" / "seismic"
    tif_path = seismic_dir / fold_tif_fname(option_name)
    tiles_dir = seismic_dir / fold_tiles_dirname(option_name)
    meta_path = seismic_dir / fold_meta_fname(option_name)

    if meta_path.exists() and tif_path.exists() and tiles_dir.is_dir():
        try:
            existing = json.loads(meta_path.read_text())
        except (json.JSONDecodeError, OSError):
            existing = None
        if existing and existing.get("input_fingerprint") == current_fp:
            existing.setdefault("cached", True)
            return existing

    receivers = _point_table_from_parquet(r_parquet, "R")
    sources = _point_table_from_parquet(s_parquet, "S")

    spread = SpreadSpec(
        active_lines=active_lines or None,
        active_stations=active_stations or None,
        mode="relative",
    )
    geometry = geometry_from_point_tables(receivers, sources, spread=spread)
    model = FoldModel(geometry)

    inline_origin, crossline_origin = _bin_grid_origin(receivers, sources)
    bin_grid = BinGrid(
        inline_bin=inline_bin,
        crossline_bin=crossline_bin,
        inline_origin=inline_origin,
        crossline_origin=crossline_origin,
    )

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
        "input_fingerprint": current_fp,
        "cached": False,
    }
    meta_path.write_text(json.dumps(meta, indent=2))
    return meta
