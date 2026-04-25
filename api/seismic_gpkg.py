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

import math
import re
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import MultiLineString, Point

from dojo.v3.domain.pipeline import grid_artifacts_dir


SEISMIC_DIR_NAME = "seismic"
# Filename stems for the three grid-derived gpkg products. The two
# station layers stay under ``grid_*`` so they sort together; the bin
# polygon mesh uses ``bins_mesh`` to read more naturally on the Files
# page (it's the bin layout, not another station list).
THEORETICAL_GRID_STEM = "grid_theoretical"
OFFSET_GRID_STEM = "grid_offset"
GRID_MESH_STEM = "bins_mesh"

# Pre-rename stems still found on disk for older projects. We match
# them in the prune path and delete them once the new-named file lands
# so legacy artifacts don't linger forever.
_LEGACY_STEM_RENAMES: dict[str, str] = {
    "theoretical_grid": THEORETICAL_GRID_STEM,
    "offset_grid": OFFSET_GRID_STEM,
    "grid_mesh": GRID_MESH_STEM,
}


def _slug(name: str) -> str:
    """Filesystem-safe slug derived from an option name.

    Collapses any run of non-alphanumeric characters to a single underscore
    and strips leading/trailing underscores so ``"Option 1"`` → ``"Option_1"``
    and ``"A/B C"`` → ``"A_B_C"``.
    """
    return re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")


def theoretical_grid_fname(option_name: str) -> str:
    return f"{THEORETICAL_GRID_STEM}__{_slug(option_name)}.gpkg"


def offset_grid_fname(option_name: str) -> str:
    return f"{OFFSET_GRID_STEM}__{_slug(option_name)}.gpkg"


def grid_mesh_fname(option_name: str) -> str:
    return f"{GRID_MESH_STEM}__{_slug(option_name)}.gpkg"


def ensure_seismic_dir(project_dir: Path) -> Path:
    """Idempotent mkdir for ``inputs/gis/seismic`` under the project root."""
    seismic = project_dir / "inputs" / "gis" / SEISMIC_DIR_NAME
    seismic.mkdir(parents=True, exist_ok=True)
    return seismic


def _drop_legacy_gpkg(seismic_dir: Path, current_stem: str, option_name: str) -> None:
    """Delete the pre-rename gpkg for ``option_name`` if one is sitting next
    to the freshly written file. Idempotent — tolerates missing files and
    transient OS errors so the writer caller is never blocked by cleanup.
    """
    slug = _slug(option_name)
    for legacy_stem, target_stem in _LEGACY_STEM_RENAMES.items():
        if target_stem != current_stem:
            continue
        legacy = seismic_dir / f"{legacy_stem}__{slug}.gpkg"
        if legacy.exists():
            try:
                legacy.unlink()
            except OSError:
                pass


def prune_option_seismic_files(project_dir: Path, keep_option_names: list[str]) -> None:
    """Delete per-option grid .gpkg files whose option is not in ``keep``.

    Called from the ``design_options`` save path so renamed or deleted
    options don't leave orphan layers lingering in the Files panel.
    """
    seismic = project_dir / "inputs" / "gis" / SEISMIC_DIR_NAME
    if not seismic.is_dir():
        return
    keep_slugs = {_slug(n) for n in keep_option_names if n}
    # Match new stems and pre-rename ones — legacy artifacts left over
    # from earlier projects must still be reachable here so renamed or
    # deleted options don't leave orphan .gpkg files behind.
    candidate_stems = (
        THEORETICAL_GRID_STEM,
        OFFSET_GRID_STEM,
        GRID_MESH_STEM,
        *_LEGACY_STEM_RENAMES,
    )
    for path in seismic.iterdir():
        if not path.is_file() or path.suffix != ".gpkg":
            continue
        stem = path.stem
        for prefix in candidate_stems:
            marker = f"{prefix}__"
            if stem.startswith(marker):
                slug = stem[len(marker):]
                if slug not in keep_slugs:
                    try:
                        path.unlink()
                    except OSError:
                        pass
                break


def _points_from_xy(x: np.ndarray, y: np.ndarray) -> list[Point]:
    # shapely vectorised constructors avoid the per-row Python overhead.
    return [Point(float(xi), float(yi)) for xi, yi in zip(x, y)]


def write_theoretical_grid_gpkg(
    project_dir: Path, epsg: int, option_name: str
) -> Path | None:
    """Combine r + s theoretical-grid parquets into one .gpkg.

    Each row keeps its (x, y) and gets an ``fclass`` column equal to
    ``"sources"`` or ``"receivers"``. The output filename is namespaced
    by ``option_name`` so distinct grid options accumulate side-by-side.
    Returns the written path, or None when the source parquets are
    missing (first run / skipped step) or the option name is empty.
    """
    if not option_name:
        return None
    grid_dir = grid_artifacts_dir(project_dir, option_name)
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
    out = seismic / theoretical_grid_fname(option_name)
    combined.to_file(out, driver="GPKG")
    _drop_legacy_gpkg(seismic, THEORETICAL_GRID_STEM, option_name)
    return out


def write_offset_grid_gpkg(
    project_dir: Path, epsg: int, option_name: str
) -> Path | None:
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
    snapped > offset > skipped > inplace. The output filename is
    namespaced by ``option_name``. Returns the written path, or None
    when parquets are missing or the option name is empty.
    """
    if not option_name:
        return None
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
    out = seismic / offset_grid_fname(option_name)
    combined.to_file(out, driver="GPKG")
    _drop_legacy_gpkg(seismic, OFFSET_GRID_STEM, option_name)
    return out


def write_grid_mesh_gpkg(
    project_dir: Path,
    epsg: int,
    option_name: str,
    min_rpi: float,
    min_spi: float,
    rl_angle_deg: float,
    station_at_cell_centre: bool = False,
) -> Path | None:
    """Write a thin-line control mesh aligned with the theoretical grid.

    Anchored on an **actual theoretical station** read from
    ``work/artifacts/grid/{r,s}.parquet`` rather than the rotated
    bounding-rect corner. That's important: ``saisai.generate_grid``
    applies a continuous optimizer shift (``res.x`` in
    ``saisai/utils/spatial.py``) that the bounding-rect anchor doesn't
    know about — anchoring on the rect corner leaves the mesh
    translated by an arbitrary sub-cell amount relative to the
    theoretical stations. Anchoring on a real station guarantees at
    least that station sits at a cell centre, with the rest of the
    min-RPI design following at integer cell addresses.

    ``station_at_cell_centre`` toggles a half-cell shift:

    - ``True`` — stations sit at **cell centres**; grid lines are
      offset by ``(min_rpi/4, min_spi/4)`` in the rotated frame and
      each station is boxed by its own cell.
    - ``False`` (default) — stations sit on grid **intersections**;
      no shift is applied and cell corners coincide with stations.

    The cell-polygon basis (ei/ej) stays the same in both modes; only
    the line offsets differ. Flip this on when the downstream consumer
    expects per-station cells (e.g. shot/receiver patch visualisation).

    Emits a **single ``MultiLineString`` feature** containing every
    vertical + horizontal grid edge over the bounding extent of all
    theoretical stations (plus 1-cell padding). Pitch =
    ``(min_rpi/2, min_spi/2)`` meters, cells rotated by ``rl_angle_deg``.

    Per-cell polygons are **not** emitted (a 20×20 km survey at 50 m
    station spacing would be ~640 000 polygons / ~400 MB and crash the
    browser). Instead the feature carries enough metadata for the
    frontend to synthesize any cell's polygon on demand:

    - ``anchor_x``, ``anchor_y`` (float64): world coords of cell (0, 0)
      centre — the station the mesh is anchored on.
    - ``ei_x``, ``ei_y`` (float64): world vector for a +1 step in the
      ``i`` (inline) direction. Length = ``min_rpi/2``.
    - ``ej_x``, ``ej_y`` (float64): world vector for a +1 step in the
      ``j`` (crossline) direction. Length = ``min_spi/2``.
    - ``i_lo``, ``i_hi``, ``j_lo``, ``j_hi`` (int32): cell-index extent.
    - ``rl_angle_deg``, ``min_rpi``, ``min_spi`` (float64): kept for
      inspection / debugging.

    Cell (I, J) centre in world coords:
        ``(anchor_x + I*ei_x + J*ej_x, anchor_y + I*ei_y + J*ej_y)``
    and cell corners are ``centre ± ei/2 ± ej/2``.

    Returns the written path, or ``None`` if any required input is missing.
    """
    if not option_name or min_rpi <= 0 or min_spi <= 0:
        return None

    # Pull station positions from the parquets the GRID step just wrote.
    # The r/s parquets share the same frame; either is fine, but we merge
    # them so the mesh extent covers both sides.
    grid_dir = grid_artifacts_dir(project_dir, option_name)
    station_xy_parts: list[np.ndarray] = []
    for ptype in ("r", "s"):
        p = grid_dir / f"{ptype}.parquet"
        if not p.exists():
            continue
        df = pd.read_parquet(p, columns=["x", "y"])
        if df.empty:
            continue
        station_xy_parts.append(df[["x", "y"]].to_numpy(dtype=np.float64))
    if not station_xy_parts:
        return None
    station_xy = np.concatenate(station_xy_parts, axis=0)

    # Anchor on the first station. Any station works — cell (0, 0) will
    # sit on whichever station we pick, and every other station of a
    # design whose RPI/SPI is a multiple of ``min_rpi``/``min_spi`` lands
    # on an integer cell centre. Using row 0 of the R parquet keeps the
    # choice deterministic across runs.
    anchor_wx, anchor_wy = float(station_xy[0, 0]), float(station_xy[0, 1])

    # Rotation: rotated frame is world rotated CW by rl_angle (R lines
    # horizontal). rot_fwd below takes world-minus-anchor → rotated.
    rl_rad = math.radians(rl_angle_deg)
    cos_r, sin_r = math.cos(rl_rad), math.sin(rl_rad)
    dx = float(min_rpi) / 2.0
    dy = float(min_spi) / 2.0

    # Compute each station's rotated-frame coords relative to the anchor,
    # then to its cell address. min/max over those gives the iteration
    # range (+1 cell of padding so boundary stations aren't on the edge).
    sx = station_xy[:, 0] - anchor_wx
    sy = station_xy[:, 1] - anchor_wy
    lx = cos_r * sx + sin_r * sy
    ly = -sin_r * sx + cos_r * sy
    cell_i = np.round(lx / dx).astype(np.int64)
    cell_j = np.round(ly / dy).astype(np.int64)
    i_lo = int(cell_i.min()) - 1
    i_hi = int(cell_i.max()) + 1
    j_lo = int(cell_j.min()) - 1
    j_hi = int(cell_j.max()) + 1

    n_i = i_hi - i_lo + 1
    n_j = j_hi - j_lo + 1
    if n_i <= 0 or n_j <= 0 or n_i > 20_000 or n_j > 20_000:
        return None

    # rot_back (CCW by rl_angle) sends rotated-frame coords → world,
    # translated back to the anchor.
    def _rot_to_world(x_rot: float, y_rot: float) -> tuple[float, float]:
        return (
            anchor_wx + cos_r * x_rot - sin_r * y_rot,
            anchor_wy + sin_r * x_rot + cos_r * y_rot,
        )

    # Cell-edge coordinates in rotated frame. When station_at_cell_centre,
    # vertical edges sit at (I*dx + dx/2) and horizontal at (J*dy + dy/2),
    # so cell (0, 0) spans [-dx/2, +dx/2] × [-dy/2, +dy/2] around the
    # anchor. Otherwise edges sit at (I*dx, J*dy) and the anchor falls on
    # a grid intersection.
    edge_shift_x = dx / 2.0 if station_at_cell_centre else 0.0
    edge_shift_y = dy / 2.0 if station_at_cell_centre else 0.0
    vx_rot = np.arange(i_lo - 1, i_hi + 1, dtype=np.float64) * dx + edge_shift_x
    hy_rot = np.arange(j_lo - 1, j_hi + 1, dtype=np.float64) * dy + edge_shift_y

    # Densify each grid line, but only every ~100 m (snapped to the
    # nearest cell intersection) rather than at every intersection.
    # This keeps the rendered polyline close enough to the curved
    # Mercator path that the stations trace, while cutting the vertex
    # count (and the client-side load time) by ~4× for 25 m cells.
    # First and last intersections are always included so each line
    # spans the full grid extent.
    VERTEX_STRIDE_M = 100.0
    stride_i = max(1, int(round(VERTEX_STRIDE_M / dx)))
    stride_j = max(1, int(round(VERTEX_STRIDE_M / dy)))

    def _strided(total: int, stride: int) -> list[int]:
        if total <= 0:
            return []
        idx = list(range(0, total, stride))
        if idx[-1] != total - 1:
            idx.append(total - 1)
        return idx

    vx_sub = _strided(len(vx_rot), stride_i)
    hy_sub = _strided(len(hy_rot), stride_j)

    segments: list[list[tuple[float, float]]] = []
    # Vertical lines: constant x_rot, vertices strided along y.
    for x_rot in vx_rot:
        line: list[tuple[float, float]] = [
            _rot_to_world(float(x_rot), float(hy_rot[k])) for k in hy_sub
        ]
        segments.append(line)
    # Horizontal lines: constant y_rot, vertices strided along x.
    for y_rot in hy_rot:
        line = [
            _rot_to_world(float(vx_rot[k]), float(y_rot)) for k in vx_sub
        ]
        segments.append(line)

    mesh_mls = MultiLineString(segments)

    # Basis vectors for cell-polygon reconstruction on the client.
    # ei = rot_back(dx, 0) - anchor; ej = rot_back(0, dy) - anchor.
    ei_x = cos_r * dx
    ei_y = sin_r * dx
    ej_x = -sin_r * dy
    ej_y = cos_r * dy

    gdf = gpd.GeoDataFrame(
        {
            "anchor_x": [anchor_wx],
            "anchor_y": [anchor_wy],
            "ei_x": [ei_x],
            "ei_y": [ei_y],
            "ej_x": [ej_x],
            "ej_y": [ej_y],
            "i_lo": [np.int32(i_lo)],
            "i_hi": [np.int32(i_hi)],
            "j_lo": [np.int32(j_lo)],
            "j_hi": [np.int32(j_hi)],
            "rl_angle_deg": [float(rl_angle_deg)],
            "min_rpi": [float(min_rpi)],
            "min_spi": [float(min_spi)],
        },
        geometry=[mesh_mls],
        crs=f"EPSG:{epsg}",
    )

    seismic = ensure_seismic_dir(project_dir)
    out = seismic / grid_mesh_fname(option_name)
    gdf.to_file(out, driver="GPKG")
    return out
