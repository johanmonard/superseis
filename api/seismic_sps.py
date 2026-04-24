"""Write SPS ``R``/``S`` point files alongside the grid parquets.

After the GRID pipeline step produces ``work/artifacts/grid/{r,s}.parquet``,
this module projects those tables onto the ``seismic.sps`` core schema and
emits ``theoretical.r01`` / ``theoretical.s01`` in the same folder.
"""

from __future__ import annotations

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from seismic.sps import PointTable, write_point_file


def _build_point_table(parquet_path: Path, kind: str) -> PointTable:
    """Project a grid parquet onto the SPS core schema.

    Receiver and source lines run orthogonally, so the ``line``/``point``
    SPS axes map to different theoretical-grid indices per kind:

    * Receivers (``R``): ``line = j_theo``, ``point = i_theo``
    * Sources   (``S``): ``line = i_theo``, ``point = j_theo``

    This keeps BinGrid's default wiring consistent — receiver_inline
    ('point') and source_inline ('line') then both resolve to i_theo,
    so inline and crossline axes mean the same thing physically for
    both kinds.
    """
    if kind not in {"R", "S"}:
        raise ValueError(f"kind must be 'R' or 'S', got {kind!r}")
    loaded = pq.read_table(parquet_path)
    if kind == "R":
        line_col = loaded.column("j_theo")
        point_col = loaded.column("i_theo")
    else:  # "S"
        line_col = loaded.column("i_theo")
        point_col = loaded.column("j_theo")
    sps_table = pa.table(
        {
            "line": line_col.cast(pa.float64()),
            "point": point_col.cast(pa.float64()),
            "easting": loaded.column("x").cast(pa.float64()),
            "northing": loaded.column("y").cast(pa.float64()),
        }
    )
    return PointTable(kind=kind, table=sps_table)


def write_theoretical_sps_files(project_dir: Path | str, option_name: str) -> None:
    """Emit ``theoretical.r01`` and ``theoretical.s01`` next to the parquets.

    No-op if either parquet is missing. Mirrors the tolerant contract of
    the surrounding gpkg writers: callers wrap this in a broad except so
    SPS emission can never fail the pipeline.
    """
    from dojo.v3.domain.pipeline import grid_artifacts_dir

    grid_dir = grid_artifacts_dir(Path(project_dir), option_name)
    pairs = (("r.parquet", "R", "theoretical.r01"),
             ("s.parquet", "S", "theoretical.s01"))
    for parquet_name, kind, out_name in pairs:
        src = grid_dir / parquet_name
        if not src.exists():
            continue
        points = _build_point_table(src, kind)
        write_point_file(points, grid_dir / out_name)
