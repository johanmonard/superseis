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
                               params used, per-design descriptors

Multi-design handling: the grid option carries a set of designs (each
with its own RPI/SPI/spread), and each design is associated with a
partition region polygon via the ``design_options`` row. The fold is
computed once per design — all receivers, sources filtered to the
design's polygon, design-native bin sizes. The partials are upsampled
to a common GCD-bin output grid by integer factors and summed.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import shutil
from dataclasses import dataclass
from functools import reduce
from pathlib import Path
from typing import Any, Literal


FoldSource = Literal["grid", "offsets"]

import io

import geopandas as gpd
import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
import rasterio
from PIL import Image
from matplotlib import colormaps
from pyproj import Transformer
from rasterio.transform import Affine
from rasterio.warp import Resampling, calculate_default_transform, reproject

from api.seismic_fold_tiles import write_fold_tile_pyramid
from dojo.v3.domain.pipeline import grid_artifacts_dir
from seismic.fold import FoldModel
from seismic.grid import BinGrid
from seismic.sps import PointTable, SpreadSpec, geometry_from_point_tables
from seismic.sps.tables import PROVENANCE_SCHEMA


# Filename stems per fold source. Kept distinct so grid-based and
# offsets-based fold products coexist on disk per option.
_FOLD_STEM: dict[FoldSource, str] = {
    "grid": "fold",
    "offsets": "fold_offsets",
}

# Colormaps exposed to the UI. Keep this tight — each entry doubles as a
# frontend dropdown option.
SUPPORTED_COLORMAPS = ("viridis", "plasma", "inferno", "magma", "turbo", "seismic")


def _slug(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")


def _offset_token(offset_min: float, offset_max: float) -> str:
    """Format an offset range as a filename-safe token (e.g. ``0-5000``).

    Uses ``%g`` so whole-number meters render without a trailing ``.0``;
    fractional ranges keep their decimal so two distinct ranges never
    collide on disk.
    """
    return f"{offset_min:g}-{offset_max:g}"


def fold_tif_fname(
    option_name: str,
    source: FoldSource = "grid",
    offset_min: float | None = None,
    offset_max: float | None = None,
) -> str:
    """GeoTIFF filename for a rendered fold.

    Range-stamped (``fold__<slug>__<omin>-<omax>.tif``) when an offset
    range is supplied — multiple ranges coexist as historical
    inventory. Without a range falls back to the legacy unstamped form,
    used by older artifacts still on disk.
    """
    base = f"{_FOLD_STEM[source]}__{_slug(option_name)}"
    if offset_min is None or offset_max is None:
        return f"{base}.tif"
    return f"{base}__{_offset_token(offset_min, offset_max)}.tif"


def fold_tiles_dirname(
    option_name: str,
    source: FoldSource = "grid",
    offset_min: float | None = None,
    offset_max: float | None = None,
) -> str:
    """Tile-pyramid directory for a rendered fold.

    Range-stamping the directory means every fold render keeps its own
    PNG pyramid alongside the matching .tif and .meta.json — the Files
    page can serve any historical range as a live overlay instead of
    only the most recent. Without a range the legacy unstamped form is
    returned for older callers.
    """
    base = f"{_FOLD_STEM[source]}__{_slug(option_name)}"
    if offset_min is None or offset_max is None:
        return f"{base}_tiles"
    return f"{base}__{_offset_token(offset_min, offset_max)}_tiles"


def fold_meta_fname(
    option_name: str,
    source: FoldSource = "grid",
    offset_min: float | None = None,
    offset_max: float | None = None,
) -> str:
    """Sidecar JSON filename for a rendered fold.

    Range-stamped to match :func:`fold_tiles_dirname` /
    :func:`fold_tif_fname` so the meta tracks its own tile pyramid and
    GeoTIFF.
    """
    base = f"{_FOLD_STEM[source]}__{_slug(option_name)}"
    if offset_min is None or offset_max is None:
        return f"{base}.meta.json"
    return f"{base}__{_offset_token(offset_min, offset_max)}.meta.json"


def latest_fold_meta_path(
    project_dir: Path,
    option_name: str,
    source: FoldSource = "grid",
) -> Path | None:
    """Locate the most recently written fold meta for ``(option, source)``.

    Used by the meta GET endpoint when no offset range is specified so
    callers (the grid + offsets viewports) keep their original "show
    whatever was last rendered" behaviour. Returns the legacy unstamped
    file if it exists and no range-stamped sibling has overtaken it,
    otherwise the freshest range-stamped one. Returns ``None`` when no
    meta exists for this ``(option, source)`` pair.
    """
    seismic_dir = Path(project_dir) / "inputs" / "gis" / "seismic"
    if not seismic_dir.is_dir():
        return None
    stem = _FOLD_STEM[source]
    slug = _slug(option_name)
    prefix = f"{stem}__{slug}"
    candidates: list[Path] = []
    for entry in seismic_dir.iterdir():
        if not entry.is_file():
            continue
        if not entry.name.endswith(".meta.json"):
            continue
        # Same boundary check as ``purge_fold_artifacts`` — never match
        # ``optAB`` when looking for ``optA``.
        if not entry.name.startswith(prefix):
            continue
        tail = entry.name[len(prefix):]
        if tail and not tail.startswith(("__", ".")):
            continue
        candidates.append(entry)
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def purge_fold_artifacts(
    project_dir: Path,
    option_name: str,
    source: FoldSource | None = None,
) -> list[str]:
    """Delete every fold artifact tied to ``option_name``.

    Called when a grid option's upstream data is regenerated — the saved
    fold rasters become stale, so we wipe them so the user explicitly
    re-renders the ones they still want. Returns the list of deleted
    artifact names for logging/telemetry.

    ``source=None`` purges both grid- and offsets-source variants;
    ``source="offsets"`` purges only the offsets variant (used when the
    offsets step reruns but the grid step is still clean).
    """
    seismic_dir = Path(project_dir) / "inputs" / "gis" / "seismic"
    if not seismic_dir.is_dir():
        return []
    sources: tuple[FoldSource, ...]
    if source is None:
        sources = ("grid", "offsets")
    else:
        sources = (source,)
    slug = _slug(option_name)
    deleted: list[str] = []
    for src in sources:
        stem = _FOLD_STEM[src]
        prefix = f"{stem}__{slug}"
        for entry in seismic_dir.iterdir():
            if not entry.name.startswith(prefix):
                continue
            tail = entry.name[len(prefix):]
            # Only purge artifacts that strictly belong to this slug —
            # ``fold__optA`` must not match ``fold__optAB`` etc. The
            # boundary is "" (legacy unstamped), "__..." (range-stamped),
            # ".tif"/".meta.json", or "_tiles".
            if tail and not tail.startswith(("__", ".", "_")):
                continue
            try:
                if entry.is_dir():
                    shutil.rmtree(entry)
                else:
                    entry.unlink()
                deleted.append(entry.name)
            except OSError:
                pass
    return deleted


def _source_parquet_dir(
    project_dir: Path, option_name: str, source: FoldSource
) -> Path:
    """Where to read ``r.parquet``/``s.parquet`` from for each source.

    Grid fold reads the per-option theoretical grid parquets; offsets
    fold reads the (shared) ``work/artifacts/offsets`` parquets — those
    get overwritten on each offsets run, so the cache fingerprint is
    what keeps option-specific products apart at fold time.
    """
    if source == "offsets":
        return project_dir / "work" / "artifacts" / "offsets"
    return grid_artifacts_dir(project_dir, option_name)


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


def _point_table_from_parquet(
    path: Path, kind: str, source: FoldSource = "grid"
) -> PointTable:
    """Project a parquet onto the SPS core schema as a PointTable.

    Matches the wiring validated in ``share/test.py`` (in-memory columns
    ``i_theo`` / ``j_theo`` are the transposed of parquet ``i`` / ``j``,
    so ``line=j_theo`` here equals ``line=i`` there, and so on):

    * Receivers (``R``): ``line = j`` axis, ``point = i`` axis
    * Sources   (``S``): ``line = i`` axis, ``point = j`` axis

    For both sources the ``line`` / ``point`` indices come from the
    theoretical columns — SpreadSpec's "N active receiver lines" only
    makes sense on the as-designed grid, not on the jittered post-offset
    numbering. For ``source="offsets"`` the geographic ``(easting,
    northing)`` switches to the offset coordinates so midpoints reflect
    the actual acquired positions; for ``source="grid"`` they stay on
    the theoretical ones.
    """
    raw = pq.read_table(path)
    i_col, j_col = raw.column("i_theo"), raw.column("j_theo")
    if source == "offsets":
        x_col, y_col = raw.column("x_offs"), raw.column("y_offs")
    else:
        x_col, y_col = raw.column("x"), raw.column("y")
    if kind == "R":
        line_col, point_col = j_col, i_col
    elif kind == "S":
        line_col, point_col = i_col, j_col
    else:
        raise ValueError(f"kind must be 'R' or 'S', got {kind!r}")
    table = pa.table({
        "line": line_col.cast(pa.float64()),
        "point": point_col.cast(pa.float64()),
        "easting": x_col.cast(pa.float64()),
        "northing": y_col.cast(pa.float64()),
    })
    return PointTable(
        kind=kind,
        table=table,
        provenance=_synthetic_provenance(kind, table.num_rows),
    )


def _theoretical_origin(r_parquet: Path, s_parquet: Path) -> tuple[float, float]:
    """Common BinGrid origin anchored on theoretical station indices.

    Used by both grid-based and offsets-based fold so the offsets raster
    lines up with the theoretical grid when overlaid. ``inline_origin``
    and ``crossline_origin`` are expressed in the same line/point frame
    the PointTable uses (R: line=j, point=i; S: line=i, point=j), which
    means:

    * ``inline_origin = min(i_theo across R, i_theo across S)``
    * ``crossline_origin = min(j_theo across R, j_theo across S)``
    """
    r_cols = pq.read_table(r_parquet, columns=["i_theo", "j_theo"])
    s_cols = pq.read_table(s_parquet, columns=["i_theo", "j_theo"])
    inline_min = min(
        float(pc.min(r_cols.column("i_theo")).as_py()),
        float(pc.min(s_cols.column("i_theo")).as_py()),
    )
    crossline_min = min(
        float(pc.min(r_cols.column("j_theo")).as_py()),
        float(pc.min(s_cols.column("j_theo")).as_py()),
    )
    return inline_min, crossline_min


@dataclass(frozen=True)
class _DesignSpec:
    """One grid design's inputs needed by the fold builder."""

    key: int
    rpi: int
    spi: int
    active_rl: int
    active_rp: int
    polygon_stem: str  # partition region polygon stem; "" = no filter


def _resolve_design_specs(cfg: Any, option_name: str) -> list[_DesignSpec]:
    """Walk cfg to produce ordered design specs + their region polygons.

    The grid option's ``design_def`` is keyed by integer design index
    (0, 1, 2...) which matches the position of the corresponding
    ``design_options.options[<option_name>].rows`` entry. Each row's
    ``region`` names the partition polygon to filter sources through.
    """
    grid_opt = (cfg.grid or {}).get(option_name)
    if grid_opt is None or not grid_opt.design_def:
        raise ValueError(
            f"No design_def for option {option_name!r} — cannot derive fold inputs."
        )
    opts = (cfg.design_options or {}).get("options") or []
    design_opt = next(
        (o for o in opts if (o.get("name") or "").strip() == option_name),
        None,
    )
    rows = (design_opt.get("rows") if design_opt else None) or []

    specs: list[_DesignSpec] = []
    for idx in sorted(grid_opt.design_def.keys()):
        d = grid_opt.design_def[idx]
        row = rows[idx] if idx < len(rows) else {}
        specs.append(_DesignSpec(
            key=int(idx),
            rpi=int(d.rpi or 0),
            spi=int(d.spi or 0),
            active_rl=int(d.active_rl or 0),
            active_rp=int(d.active_rp or 0),
            polygon_stem=(row.get("region") or "").strip() if isinstance(row, dict) else "",
        ))
    return specs


def _polygon_path(project_dir: Path, stem: str) -> Path:
    return project_dir / "inputs" / "gis" / "polygons" / f"{stem}.gpkg"


def _filter_points_in_polygon(
    table: PointTable,
    project_dir: Path,
    polygon_stem: str,
    epsg: int,
) -> PointTable:
    """Return a PointTable with rows inside ``<polygon_stem>.gpkg`` kept.

    Empty ``polygon_stem`` or missing polygon file → the table is returned
    unchanged. The partition columns aren't on the grid parquet at fold
    time (sequences step writes them later), so containment is computed
    on the fly from (easting, northing).
    """
    if not polygon_stem:
        return table
    poly_path = _polygon_path(project_dir, polygon_stem)
    if not poly_path.exists():
        return table

    poly_gdf = gpd.read_file(poly_path).to_crs(f"EPSG:{epsg}")
    union_geom = poly_gdf.geometry.union_all()

    xs = table.table.column("easting").to_numpy()
    ys = table.table.column("northing").to_numpy()
    points = gpd.GeoSeries(
        gpd.points_from_xy(xs, ys),
        crs=f"EPSG:{epsg}",
    )
    mask = points.within(union_geom).to_numpy()

    filtered = table.table.filter(pa.array(mask))
    return PointTable(
        kind=table.kind,
        table=filtered,
        provenance=_synthetic_provenance(table.kind, filtered.num_rows),
    )


def _polygon_stats(project_dir: Path, stems: list[str]) -> dict[str, dict[str, int]]:
    """File size + mtime per polygon stem, for fingerprinting."""
    out: dict[str, dict[str, int]] = {}
    for stem in stems:
        if not stem or stem in out:
            continue
        p = _polygon_path(project_dir, stem)
        if p.exists():
            s = p.stat()
            out[stem] = {"size": s.st_size, "mtime_ns": s.st_mtime_ns}
    return out


def _compute_affine(
    receivers: PointTable,
    sources: PointTable,
    bin_grid: BinGrid,
) -> Affine:
    """rasterio Affine that puts the GCD-bin output grid in the project CRS.

    The affine depends only on the survey rotation, bin size and origin —
    not on midpoint counts — so we use the full R+S with an unconstrained
    spread to build a throwaway FoldModel just for ``fit_transform``.

    The seismic.grid affine returned by ``affine_for_binning`` evaluates
    at the **upper-left corner** of bin (i_min_idx, j_min_idx) — the
    binning array's [0, 0] cell. ``BinGrid`` defaults to ``rounding='trunc'``
    plus ``origin = min(line/point)``, so all bin indices are non-negative
    and integer line/point coordinates land on bin LEFT edges. That's
    already the convention rasterio expects (``Affine`` at (col=0, row=0)
    = upper-left corner of pixel (0, 0)), so we pass it through verbatim.
    A historical version of this helper subtracted half a pixel to "go
    from centre to corner" — that was a misread of seismic's convention
    and shifted the fold raster half a bin up-left of the grid mesh.
    """
    spread_all = SpreadSpec(active_lines=None, active_stations=None, mode="relative")
    geometry = geometry_from_point_tables(receivers, sources, spread=spread_all)
    model = FoldModel(geometry)
    binning = model.build_binning(bin_grid)
    sps_affine, _rms = model.fit_transform(bin_grid, binning)

    # rasterio.Affine layout: (x, y) = (a*col + b*row + c, d*col + e*row + f).
    # seismic.grid.AffineTransform2D layout: (E, N) = (a*j + c*i + e, b*j + d*i + f).
    # Map j → col, i → row: rasterio (a, b, c) = seismic (a, c, e); rasterio (d, e, f) = seismic (b, d, f).
    return Affine(
        sps_affine.a, sps_affine.c, sps_affine.e,
        sps_affine.b, sps_affine.d, sps_affine.f,
    )


def _compute_affine_theo_with_data_shift(
    receivers_theo: PointTable,
    sources_theo: PointTable,
    receivers_data: PointTable,
    sources_data: PointTable,
    bin_grid: BinGrid,
) -> Affine:
    """Affine fitted to theoretical positions, shifted to the data's extent.

    For an offsets-source fold the source parquet's ``x_offs/y_offs`` are
    jittered, so fitting the affine to them places the raster off the
    theoretical station lattice the grid mesh draws. We split the two
    concerns:

    - **Coefficients** (rotation, scale, origin in continuous BinGrid
      space) come from a fit over the theoretical positions — the
      theoretical R/S are exact integer-station-spaced points, so the
      fit gives a clean theoretical mapping.
    - **Shift** ``(i_min_idx, j_min_idx)`` comes from a separate
      ``build_binning`` pass over the actual source data — that's the
      bin index of the array's first cell, and the rasterio (col=0,
      row=0) corner must land at *its* world position rather than at
      the theoretical extent's first bin.

    Returns the rasterio Affine, ready to embed in the GeoTIFF.
    """
    spread_all = SpreadSpec(active_lines=None, active_stations=None, mode="relative")

    geom_theo = geometry_from_point_tables(receivers_theo, sources_theo, spread=spread_all)
    model_theo = FoldModel(geom_theo)
    binning_theo = model_theo.build_binning(bin_grid)
    sps_theo, _rms = model_theo.fit_transform(bin_grid, binning_theo)

    # Same binning over the actual source data → its own (i_min, j_min).
    geom_data = geometry_from_point_tables(receivers_data, sources_data, spread=spread_all)
    model_data = FoldModel(geom_data)
    binning_data = model_data.build_binning(bin_grid)

    # ``affine_for_binning`` shifted ``sps_theo`` by the THEORETICAL
    # (i_min, j_min). Undo that shift to recover ``e0, f0`` (world at
    # i_val=j_val=0), then re-shift with the DATA's (i_min, j_min).
    a, b, c, d = sps_theo.a, sps_theo.b, sps_theo.c, sps_theo.d
    e0 = sps_theo.e - a * binning_theo.j_min_idx - c * binning_theo.i_min_idx
    f0 = sps_theo.f - b * binning_theo.j_min_idx - d * binning_theo.i_min_idx
    e_data = e0 + a * binning_data.j_min_idx + c * binning_data.i_min_idx
    f_data = f0 + b * binning_data.j_min_idx + d * binning_data.i_min_idx

    return Affine(a, c, e_data, b, d, f_data)


def _wgs84_corners(
    transform: Affine, width: int, height: int, src_epsg: int
) -> list[tuple[float, float]]:
    """Project the four pixel corners to WGS84 (lng, lat) in TL/TR/BR/BL order.

    The fold raster carries the survey's RL rotation in its rasterio affine,
    so the four pixel corners trace a rotated rectangle in the project CRS.
    The Files page renders the fold as an ``image`` source / ``BitmapLayer``
    placed at these four corners in MapLibre / deck.gl, which preserves the
    rotation through the display projection — matching the grid mesh.
    """
    px_corners = [(0.0, 0.0), (width, 0.0), (width, height), (0.0, height)]
    if src_epsg == 4326:
        return [(transform * pc) for pc in px_corners]
    tr = Transformer.from_crs(src_epsg, 4326, always_xy=True)
    out: list[tuple[float, float]] = []
    for col, row in px_corners:
        x, y = transform * (col, row)
        lng, lat = tr.transform(x, y)
        out.append((float(lng), float(lat)))
    return out


# N×N chunks per fold raster. Each chunk is anchored at its own four
# UTM-projected WGS84 corners on the Files page; the mid-chunk linear
# interpolation error scales with the chunk's edge length squared, so
# doubling the grid quarters the error. At 16×16 a 25 km × 30 km
# survey has ~1.5 km × 1.9 km chunks → ~6.5 cm peak error — well below
# any visible misalignment.
FOLD_CHUNK_GRID = 16

def _colorize_rgba(
    fold: np.ndarray, *, colormap: str, vmin: float, vmax: float
) -> np.ndarray:
    """Apply the named matplotlib colormap to a fold array, returning an
    RGBA uint8 array. Empty bins (fold <= 0) become fully transparent
    so the overlay blends cleanly over the basemap."""
    cmap = colormaps[colormap if colormap in colormaps else "viridis"]
    scale = float(vmax) - float(vmin)
    if scale <= 0:
        scale = 1.0
    norm = (fold.astype(np.float64) - float(vmin)) / scale
    norm = np.clip(norm, 0.0, 1.0)
    rgba = (cmap(norm) * 255).astype(np.uint8)
    rgba[fold <= 0, 3] = 0
    return rgba


def _chunk_slices(total: int, n_chunks: int) -> list[tuple[int, int]]:
    """Split ``[0, total)`` into ``n_chunks`` slices of as-equal size as
    possible. The last chunk absorbs any remainder so coverage is exact."""
    base = total // n_chunks
    remainder = total - base * n_chunks
    out: list[tuple[int, int]] = []
    cursor = 0
    for i in range(n_chunks):
        size = base + (1 if i < remainder else 0)
        out.append((cursor, cursor + size))
        cursor += size
    return out


def fold_chunk_layout(tif_path: Path) -> list[dict[str, Any]]:
    """Plan the per-chunk subdivision of a fold raster.

    Each entry has the chunk's id (``"r_c"``), its pixel slice in the
    source raster, and the four WGS84 corners (TL/TR/BR/BL) of the
    chunk's UTM extent. The Files page renders each chunk as its own
    MapLibre ``image`` source anchored at those four corners — so the
    survey's UTM grid orientation is preserved per-chunk, and the
    linear-interpolation error between any pair of adjacent chunk
    corners stays sub-pixel even on a multi-tens-of-km survey.

    With ``FOLD_CHUNK_GRID = 8``, a 25 km × 30 km survey gets ~3 km × 4 km
    chunks → max mid-chunk projection error ~0.26 m on the ground.
    """
    with rasterio.open(tif_path) as ds:
        if ds.crs is None or ds.crs.to_epsg() is None:
            raise ValueError(
                f"Fold GeoTIFF has no EPSG-assignable CRS: {tif_path}"
            )
        src_transform = ds.transform
        src_w, src_h = ds.width, ds.height
        src_epsg = int(ds.crs.to_epsg())

    to_wgs = (
        None if src_epsg == 4326
        else Transformer.from_crs(src_epsg, 4326, always_xy=True)
    )

    def utm_to_wgs(x: float, y: float) -> tuple[float, float]:
        if to_wgs is None:
            return (float(x), float(y))
        lng, lat = to_wgs.transform(x, y)
        return (float(lng), float(lat))

    col_slices = _chunk_slices(src_w, FOLD_CHUNK_GRID)
    row_slices = _chunk_slices(src_h, FOLD_CHUNK_GRID)
    chunks: list[dict[str, Any]] = []
    for ri, (r0, r1) in enumerate(row_slices):
        for ci, (c0, c1) in enumerate(col_slices):
            tl = src_transform * (c0, r0)
            tr = src_transform * (c1, r0)
            br = src_transform * (c1, r1)
            bl = src_transform * (c0, r1)
            chunks.append({
                "chunk_id": f"{ri}_{ci}",
                "row_start": int(r0),
                "row_end": int(r1),
                "col_start": int(c0),
                "col_end": int(c1),
                "corners_wgs84": [
                    list(utm_to_wgs(*tl)),
                    list(utm_to_wgs(*tr)),
                    list(utm_to_wgs(*br)),
                    list(utm_to_wgs(*bl)),
                ],
            })
    return chunks


def render_fold_chunk_png(
    tif_path: Path,
    *,
    chunk_id: str,
    colormap: str,
    vmin: float,
    vmax: float,
) -> bytes:
    """Crop the source fold raster to one chunk and return the colourised
    PNG bytes (at native source resolution — no warping). The frontend
    then anchors this image at the chunk's four WGS84 corners; that
    keeps cells UTM-aligned in the rendered map regardless of latitude
    or extent.
    """
    if "_" not in chunk_id:
        raise ValueError(f"Bad chunk id: {chunk_id!r}")
    try:
        ri_str, ci_str = chunk_id.split("_", 1)
        ri = int(ri_str)
        ci = int(ci_str)
    except ValueError as exc:
        raise ValueError(f"Bad chunk id: {chunk_id!r}") from exc
    if not (0 <= ri < FOLD_CHUNK_GRID and 0 <= ci < FOLD_CHUNK_GRID):
        raise ValueError(
            f"Chunk id out of range (expected 0..{FOLD_CHUNK_GRID - 1}): {chunk_id!r}"
        )

    with rasterio.open(tif_path) as ds:
        src_w, src_h = ds.width, ds.height
        col_slices = _chunk_slices(src_w, FOLD_CHUNK_GRID)
        row_slices = _chunk_slices(src_h, FOLD_CHUNK_GRID)
        c0, c1 = col_slices[ci]
        r0, r1 = row_slices[ri]
        from rasterio.windows import Window
        window = Window(col_off=c0, row_off=r0, width=c1 - c0, height=r1 - r0)
        chunk = ds.read(1, window=window)

    rgba = _colorize_rgba(chunk, colormap=colormap, vmin=vmin, vmax=vmax)
    img = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _fold_value_range(fold: np.ndarray) -> tuple[int, int]:
    """Min/max across non-zero bins — colormap domain for the pyramid."""
    data = fold[fold > 0]
    if data.size == 0:
        return 0, 1
    vmin = int(data.min())
    vmax = int(data.max())
    return vmin, max(vmax, vmin + 1)


def _data_fingerprint(
    r_parquet: Path,
    s_parquet: Path,
    project_dir: Path,
    *,
    option_name: str,
    offset_min: float,
    offset_max: float,
    resolution: float,
    gcd_rpi: int,
    gcd_spi: int,
    design_specs: list[_DesignSpec],
    source: FoldSource,
) -> str:
    """Hash of everything the fold array (= bin counts) depends on.

    Excludes ``colormap`` — swapping the ramp is purely a re-tile, so a
    changed colormap matches this fingerprint and only the PNG pyramid
    needs to be regenerated.
    """
    r_stat = r_parquet.stat()
    s_stat = s_parquet.stat()
    polygon_stats = _polygon_stats(
        project_dir, [spec.polygon_stem for spec in design_specs]
    )
    payload = {
        "source": source,
        "option_name": option_name,
        "offset_min": offset_min,
        "offset_max": offset_max,
        "resolution": resolution,
        "gcd_rpi": gcd_rpi,
        "gcd_spi": gcd_spi,
        "designs": [
            {
                "key": s.key,
                "rpi": s.rpi,
                "spi": s.spi,
                "active_rl": s.active_rl,
                "active_rp": s.active_rp,
                "polygon_stem": s.polygon_stem,
            }
            for s in design_specs
        ],
        "r_parquet": {"size": r_stat.st_size, "mtime_ns": r_stat.st_mtime_ns},
        "s_parquet": {"size": s_stat.st_size, "mtime_ns": s_stat.st_mtime_ns},
        "polygons": polygon_stats,
        "writer": _TIF_WRITER_VERSION,
    }
    serialized = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()[:16]


# Bump when the tile renderer changes its output (sampling mode,
# colormap encoding, etc.) — invalidates ``render_fingerprint`` so
# already-rendered fold tile pyramids are regenerated on the next
# Process fold click. The .tif itself stays valid; only the recolor
# fast path runs.
#
# History:
#   v2-nearest: switched the source pyramid sampler to nearest-neighbour
#               so bin edges paint as crisp blocks.
#   v3-floor-sample: dropped the half-pixel sampling shift —
#                    ``np.round(col)`` was reading from the source bin
#                    one to the right/below of the one the world point
#                    actually fell in, offsetting the painted raster
#                    by half a bin from the mesh.
#   v4-oversampled: bumped the tile pyramid's max_zoom up one notch so
#                   tile pixels are ~1/4 the source pixel area. With
#                   the old ``round(z)`` choice the tile pixel was
#                   slightly bigger than the source (especially at
#                   high latitudes where the Mercator scale factor
#                   stretches it), so the user saw the
#                   Mercator-axis-aligned tile grid instead of the
#                   source's rotated UTM grid (no grid-convergence
#                   tilt + 21 m vs 20 m cell-size mismatch).
_TILE_RENDERER_VERSION = "v4-oversampled"

# Bump when the GeoTIFF writer changes its output bytes (affine,
# nodata, dtype, etc.) — invalidates ``data_fingerprint`` so cached
# .tifs are rewritten on the next Process fold click rather than
# silently reused with stale georeferencing.
#
# History:
#   v2-corner-affine: dropped the half-pixel shift in ``_compute_affine``
#                     that was nudging the .tif and its tile pyramid
#                     half a bin up-left of the grid mesh.
#   v3-theo-affine: anchor the affine on the theoretical (grid)
#                   parquets even for offsets-source fold, so the
#                   raster sits on the same station lattice as the
#                   grid mesh regardless of receiver/source jitter.
_TIF_WRITER_VERSION = "v6-chunked-16x16"


def _render_fingerprint(data_fp: str, colormap: str) -> str:
    """Hash of the full (data + render) inputs — matches the on-disk tiles."""
    payload = {
        "data": data_fp,
        "colormap": colormap,
        "renderer": _TILE_RENDERER_VERSION,
    }
    serialized = json.dumps(payload, sort_keys=True)
    return hashlib.sha256(serialized.encode()).hexdigest()[:16]


def _compute_partial(
    receivers_full: PointTable,
    sources_filtered: PointTable,
    spec: _DesignSpec,
    resolution: float,
    inline_origin: float,
    crossline_origin: float,
    offset_min: float,
    offset_max: float,
) -> np.ndarray:
    """Fold array for one design at its own (RPI/2res, SPI/2res) bin."""
    inline_bin_d = spec.rpi / (2.0 * resolution)
    crossline_bin_d = spec.spi / (2.0 * resolution)
    spread_d = SpreadSpec(
        active_lines=spec.active_rl or None,
        active_stations=spec.active_rp or None,
        mode="relative",
    )
    geometry = geometry_from_point_tables(
        receivers_full, sources_filtered, spread=spread_d
    )
    model = FoldModel(geometry)
    bin_grid_d = BinGrid(
        inline_bin=inline_bin_d,
        crossline_bin=crossline_bin_d,
        inline_origin=inline_origin,
        crossline_origin=crossline_origin,
    )
    binning = model.build_binning(bin_grid_d)
    return model.compute_fold(
        binning, offset_min=offset_min, offset_max=offset_max, trim=False
    )


def write_fold_for_option(
    project_dir: Path | str,
    epsg: int,
    cfg: Any,
    option_name: str,
    *,
    offset_min: float,
    offset_max: float,
    colormap: str,
    source: FoldSource = "grid",
) -> dict[str, Any]:
    """Multi-design fold pipeline: partials → stack → GeoTIFF + tiles + meta.

    When ``source="grid"`` the fold is built from the theoretical
    stations at ``work/artifacts/grid/<slug>/{r,s}.parquet``. When
    ``source="offsets"`` the fold is built from the post-offset stations
    at ``work/artifacts/offsets/{r,s}.parquet`` — the common BinGrid
    origin is still anchored on the theoretical coordinates so the
    offsets fold overlays cleanly on top of the theoretical one.

    Skipped when ``inputs/gis/seismic/<stem>__<slug>.meta.json`` already
    records the same input fingerprint and the TIF + tile pyramid are
    both present on disk — the existing meta is returned as-is.
    """
    project_dir = Path(project_dir)
    parquet_dir = _source_parquet_dir(project_dir, option_name, source)
    r_parquet = parquet_dir / "r.parquet"
    s_parquet = parquet_dir / "s.parquet"
    if not r_parquet.exists() or not s_parquet.exists():
        upstream = "Process grid" if source == "grid" else "Process offsets"
        raise FileNotFoundError(
            f"r.parquet / s.parquet not found under {parquet_dir} — run {upstream} first."
        )

    grid_opt = (cfg.grid or {}).get(option_name)
    if grid_opt is None:
        raise ValueError(f"Unknown grid option {option_name!r}")
    resolution = float(grid_opt.resolution or 0.0)
    if resolution <= 0:
        raise ValueError(
            f"Option {option_name!r} has no resolution — pick one before processing fold."
        )

    design_specs = _resolve_design_specs(cfg, option_name)
    rpis = [s.rpi for s in design_specs if s.rpi > 0]
    spis = [s.spi for s in design_specs if s.spi > 0]
    if not rpis or not spis:
        raise ValueError(
            f"Option {option_name!r} designs missing RPI/SPI — cannot derive bin sizes."
        )
    gcd_rpi = reduce(math.gcd, rpis)
    gcd_spi = reduce(math.gcd, spis)

    # Two-level fingerprint: `data_fp` covers the fold array (bin
    # counts), `render_fp` extends it with the colormap. Matching data_fp
    # but not render_fp means "just re-tile, the TIF is still valid" —
    # switching colormaps skips the heavy compute entirely.
    data_fp = _data_fingerprint(
        r_parquet, s_parquet, project_dir,
        option_name=option_name,
        offset_min=offset_min,
        offset_max=offset_max,
        resolution=resolution,
        gcd_rpi=gcd_rpi,
        gcd_spi=gcd_spi,
        design_specs=design_specs,
        source=source,
    )
    render_fp = _render_fingerprint(data_fp, colormap)

    seismic_dir = project_dir / "inputs" / "gis" / "seismic"
    # All three artifacts — tif, tiles dir, meta — embed the offset
    # range so each render is independently viewable. The Files page's
    # radio picker drives the viewport off this triple, and historical
    # ranges remain on disk until the grid step regenerates the option.
    tif_path = seismic_dir / fold_tif_fname(
        option_name, source, offset_min, offset_max
    )
    tiles_dir = seismic_dir / fold_tiles_dirname(
        option_name, source, offset_min, offset_max
    )
    meta_path = seismic_dir / fold_meta_fname(
        option_name, source, offset_min, offset_max
    )

    existing = None
    if meta_path.exists():
        try:
            existing = json.loads(meta_path.read_text())
        except (json.JSONDecodeError, OSError):
            existing = None

    # Full cache hit — everything matches, just return existing meta.
    if (
        existing
        and existing.get("render_fingerprint") == render_fp
        and tif_path.exists()
        and tiles_dir.is_dir()
    ):
        existing["cached"] = True
        return existing

    # Recolor fast path — data is unchanged, only the colormap moved.
    # Read the saved GeoTIFF, rebuild the tile pyramid with the new
    # ramp, and patch the meta in place.
    if (
        existing
        and existing.get("data_fingerprint") == data_fp
        and tif_path.exists()
    ):
        with rasterio.open(tif_path) as src:
            fold = src.read(1)
            src_transform = src.transform
            src_epsg = int(src.crs.to_epsg()) if src.crs else epsg
        vmin, vmax = _fold_value_range(fold)
        pyramid = write_fold_tile_pyramid(
            tif_path, tiles_dir, colormap=colormap, vmin=vmin, vmax=vmax
        )
        # Backfill placement metadata on legacy metas that were written
        # before the image-overlay endpoint existed.
        corners = _wgs84_corners(
            src_transform, fold.shape[1], fold.shape[0], src_epsg
        )
        chunks_layout = fold_chunk_layout(tif_path)
        existing.update({
            "colormap": colormap,
            "value_min": int(vmin),
            "value_max": int(vmax),
            "min_zoom": int(pyramid["minZoom"]),
            "max_zoom": int(pyramid["maxZoom"]),
            "bounds": [float(v) for v in pyramid["bounds"]],
            "corners_wgs84": [[float(lng), float(lat)] for lng, lat in corners],
            "image_chunks": chunks_layout,
            "tiles_written": int(pyramid["tilesWritten"]),
            "render_fingerprint": render_fp,
            "cached": False,
        })
        meta_path.write_text(json.dumps(existing, indent=2))
        return existing

    # Load full R + S once — reused across all per-design partials and
    # for the reference model that produces the final affine.
    receivers_full = _point_table_from_parquet(r_parquet, "R", source)
    sources_full = _point_table_from_parquet(s_parquet, "S", source)

    # Spatial placement is ALWAYS anchored on the theoretical (grid)
    # parquets — both the BinGrid origin and the affine fit. Without
    # this, an offsets-source fold fits its raster to the jittered
    # ``x_offs/y_offs`` positions, which drifts off the theoretical
    # station lattice the grid mesh sits on. The fold COUNTS still come
    # from ``receivers_full / sources_full`` below (which carry the
    # source-specific positions), so the visual is unchanged — only the
    # raster's georeferencing is corrected.
    grid_dir = grid_artifacts_dir(project_dir, option_name)
    r_theo_parquet = grid_dir / "r.parquet"
    s_theo_parquet = grid_dir / "s.parquet"
    if not r_theo_parquet.exists() or not s_theo_parquet.exists():
        raise FileNotFoundError(
            f"Theoretical grid parquets missing under {grid_dir} — run Process grid first."
        )
    receivers_theo = _point_table_from_parquet(r_theo_parquet, "R", source="grid")
    sources_theo = _point_table_from_parquet(s_theo_parquet, "S", source="grid")
    inline_origin, crossline_origin = _theoretical_origin(
        r_theo_parquet, s_theo_parquet
    )

    # Common (output) grid bins = GCD bins in station units.
    out_inline_bin = gcd_rpi / (2.0 * resolution)
    out_crossline_bin = gcd_spi / (2.0 * resolution)

    # Per-design partials, upsampled to the GCD grid by integer repeat.
    partials: list[tuple[np.ndarray, _DesignSpec]] = []
    for spec in design_specs:
        if spec.rpi <= 0 or spec.spi <= 0:
            continue
        sources_d = _filter_points_in_polygon(
            sources_full, project_dir, spec.polygon_stem, epsg
        )
        if sources_d.table.num_rows == 0:
            continue
        partial = _compute_partial(
            receivers_full,
            sources_d,
            spec,
            resolution,
            inline_origin,
            crossline_origin,
            offset_min,
            offset_max,
        )
        crossline_factor = spec.spi // gcd_spi  # row repeat
        inline_factor = spec.rpi // gcd_rpi     # col repeat
        upsampled = np.repeat(partial, crossline_factor, axis=0)
        upsampled = np.repeat(upsampled, inline_factor, axis=1)
        partials.append((upsampled.astype(np.int32, copy=False), spec))

    if not partials:
        raise ValueError(
            "No design contributed sources to the fold — check the "
            "partition polygons and design regions."
        )

    # Stack: zero-pad to the union bounding box, then sum.
    max_h = max(arr.shape[0] for arr, _ in partials)
    max_w = max(arr.shape[1] for arr, _ in partials)
    fold = np.zeros((max_h, max_w), dtype=np.int32)
    for arr, _ in partials:
        fold[: arr.shape[0], : arr.shape[1]] += arr

    # Affine at the GCD bin — derived via a throwaway reference model.
    out_bin_grid = BinGrid(
        inline_bin=out_inline_bin,
        crossline_bin=out_crossline_bin,
        inline_origin=inline_origin,
        crossline_origin=crossline_origin,
    )
    # Fit the affine COEFFICIENTS to the theoretical R/S so the raster's
    # rotation, scale and origin sit on the theoretical station lattice
    # (= same lattice the grid mesh uses). Then re-shift using the
    # actual source data's spread-all binning so output (col=0, row=0)
    # corresponds to whichever bin the fold array's [0, 0] cell holds —
    # otherwise grid-vs-offsets fold rasters drift apart by the
    # difference in their data extents.
    rio_transform = _compute_affine_theo_with_data_shift(
        receivers_theo, sources_theo,
        receivers_full, sources_full,
        out_bin_grid,
    )

    tif_path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        tif_path,
        "w",
        driver="GTiff",
        height=fold.shape[0],
        width=fold.shape[1],
        count=1,
        dtype=fold.dtype,
        crs=f"EPSG:{epsg}",
        transform=rio_transform,
        nodata=0,
        compress="deflate",
    ) as dst:
        dst.write(fold, 1)

    vmin, vmax = _fold_value_range(fold)
    pyramid = write_fold_tile_pyramid(
        tif_path, tiles_dir, colormap=colormap, vmin=vmin, vmax=vmax
    )
    # Four WGS84 corners of the rotated raster (TL/TR/BR/BL pixel order).
    # Useful for outlining the survey extent on a map.
    corners = _wgs84_corners(rio_transform, fold.shape[1], fold.shape[0], epsg)
    # ``FOLD_CHUNK_GRID``×``FOLD_CHUNK_GRID`` chunk layout. The Files page
    # renders one MapLibre image source per chunk anchored at the
    # chunk's four UTM-projected corners — so cells stay UTM-aligned
    # (matching the grid mesh) regardless of latitude or extent. With
    # an 8×8 grid the linear-interpolation error inside any chunk
    # stays sub-meter on a 25 km × 30 km survey.
    chunks_layout = fold_chunk_layout(tif_path)

    meta = {
        "option_name": option_name,
        "source": source,
        "tif": tif_path.name,
        "tiles_dir": tiles_dir.name,
        "min_zoom": int(pyramid["minZoom"]),
        "max_zoom": int(pyramid["maxZoom"]),
        "bounds": [float(v) for v in pyramid["bounds"]],
        "corners_wgs84": [[float(lng), float(lat)] for lng, lat in corners],
        "image_chunks": chunks_layout,
        "value_min": int(vmin),
        "value_max": int(vmax),
        "colormap": colormap,
        "width": int(fold.shape[1]),
        "height": int(fold.shape[0]),
        "tiles_written": int(pyramid["tilesWritten"]),
        "params": {
            "inline_bin": out_inline_bin,
            "crossline_bin": out_crossline_bin,
            "offset_min": offset_min,
            "offset_max": offset_max,
            # Legacy single-design fields are undefined once multiple
            # designs contribute — the per-design list carries the real
            # values.
            "active_lines": None,
            "active_stations": None,
        },
        "designs": [
            {
                "key": spec.key,
                "rpi": spec.rpi,
                "spi": spec.spi,
                "active_rl": spec.active_rl,
                "active_rp": spec.active_rp,
                "polygon_stem": spec.polygon_stem,
                "inline_bin": spec.rpi / (2.0 * resolution),
                "crossline_bin": spec.spi / (2.0 * resolution),
                "inline_upsample": spec.rpi // gcd_rpi,
                "crossline_upsample": spec.spi // gcd_spi,
            }
            for _, spec in partials
        ],
        "gcd_rpi": gcd_rpi,
        "gcd_spi": gcd_spi,
        "data_fingerprint": data_fp,
        "render_fingerprint": render_fp,
        "cached": False,
    }
    meta_path.write_text(json.dumps(meta, indent=2))
    return meta
