"""Design analysis endpoint — spread metrics + offset histogram + rose.

Given design-group parameters (RPI, RLI, SPI, SLI, active lines/stations,
SP/salvo), build an ActiveSpread via `seismic.design.template` and run
`analyze_spread` plus the histogram and polar-rose reporting helpers. The
response is a plain JSON payload the frontend renders as a summary panel
and two SVG charts.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, get_current_user
from api.db.engine import get_db
from api.routes.project_sections import _get_project_for_user

from seismic.design import analyze_spread, template
from seismic.design.reporting import (
    build_offset_histogram_report,
    build_offset_rose_report,
)
from seismic.design.specs import _integer_ratio
from seismic.design.targets import compute_receiver_aspect_ratio

router = APIRouter(prefix="/project/{project_id}/design", tags=["project-design"])


class DesignAnalyzeRequest(BaseModel):
    rpi: float = Field(..., gt=0, description="Receiver point interval (m)")
    rli: float = Field(..., gt=0, description="Receiver line interval (m)")
    spi: float = Field(..., gt=0, description="Source point interval (m)")
    sli: float = Field(..., gt=0, description="Source line interval (m)")
    active_rl: int = Field(..., ge=1, description="Number of live receiver lines")
    active_rp: int = Field(..., ge=1, description="Number of live receivers per line")
    sp_salvo: int = Field(1, ge=1, description="Source points per salvo (SP/salvo)")
    hist_bins: int = Field(24, ge=4, le=128)
    rose_nr: int = Field(10, ge=3, le=32)
    rose_ntheta: int = Field(36, ge=8, le=180)


class Offsets(BaseModel):
    minimum: float
    maximum: float
    maximum_inline: float
    maximum_crossline: float
    largest_minimum: float
    smallest_maximum: float


class Fold(BaseModel):
    peak: int
    nominal: float
    inline_nominal: float
    crossline_nominal: float


class Taper(BaseModel):
    inline_distance: float
    crossline_distance: float


class Layout(BaseModel):
    receiver_count: int
    source_count: int
    live_channel_count: int
    trace_count: int
    bin_size: tuple[float, float]
    patch_size: tuple[float, float]
    salvo_size: tuple[float, float]
    moveup: tuple[float, float]
    receiver_aspect_ratio: float


class HistogramData(BaseModel):
    offset_edges: list[float]
    offset_centers: list[float]
    counts: list[int]


class RoseData(BaseModel):
    theta_edges: list[float]
    radius_edges: list[float]
    counts: list[list[int]]
    r_max: float


class DesignAnalyzeResponse(BaseModel):
    layout: Layout
    fold: Fold
    offsets: Offsets
    taper: Taper
    histogram: HistogramData
    rose: RoseData


def _derive_source_segments(
    *,
    rpi: float,
    rli: float,
    spi: float,
    sli: float,
    sp_salvo: int,
) -> int:
    """Invert ConventionalSpec's salvo formula to recover ``source_segments``.

    The UI stores ``sp_salvo`` (source points per salvo); the seismic design
    library takes ``source_segments`` (integer count of rli-segments per
    source line). Per ConventionalSpec:

        source_lines_per_salvo    = 1 if sli >= rpi else rpi/sli
        source_points_per_segment = rli / spi
        sp_salvo                  = source_lines_per_salvo
                                  * source_points_per_segment
                                  * source_segments

    Each ratio must be a positive integer; any non-integer result is raised
    as ``ValueError`` with a user-facing message naming the offending
    parameters and suggesting valid SP/salvo values.
    """
    if sli >= rpi:
        source_lines_per_salvo = 1
    else:
        try:
            source_lines_per_salvo = _integer_ratio(rpi / sli, name="_")
        except ValueError:
            raise ValueError(
                f"RPI ({rpi:g}) must be an integer multiple of SLI ({sli:g}) "
                f"when SLI < RPI (got ratio {rpi / sli:.3f})."
            )
    try:
        source_points_per_segment = _integer_ratio(rli / spi, name="_")
    except ValueError:
        raise ValueError(
            f"RLI ({rli:g}) must be an integer multiple of SPI ({spi:g}) "
            f"(got ratio {rli / spi:.3f})."
        )

    denom = source_lines_per_salvo * source_points_per_segment
    try:
        return _integer_ratio(sp_salvo / denom, name="_")
    except ValueError:
        # Suggest the three nearest valid SP/salvo values around the input.
        k = max(1, round(sp_salvo / denom))
        suggestions = sorted({denom * max(1, k - 1), denom * k, denom * (k + 1)})
        reason = (
            f"source_lines_per_salvo ({source_lines_per_salvo}) × "
            f"RLI/SPI ({source_points_per_segment})"
        )
        raise ValueError(
            f"SP/salvo ({sp_salvo}) must be a positive multiple of {denom} "
            f"(= {reason}). Try {', '.join(str(s) for s in suggestions)}."
        )


@router.post("/analyze", response_model=DesignAnalyzeResponse)
async def analyze_design(
    project_id: int,
    payload: DesignAnalyzeRequest,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DesignAnalyzeResponse:
    # Validate project ownership; the computation itself is stateless.
    await _get_project_for_user(project_id, principal, db)

    try:
        source_segments = _derive_source_segments(
            rpi=payload.rpi,
            rli=payload.rli,
            spi=payload.spi,
            sli=payload.sli,
            sp_salvo=payload.sp_salvo,
        )
    except ValueError as exc:
        # User-facing message already formatted by _derive_source_segments.
        raise HTTPException(status_code=422, detail=str(exc))

    try:
        spread = template(
            rpi=payload.rpi,
            rli=payload.rli,
            spi=payload.spi,
            sli=payload.sli,
            live_lines=payload.active_rl,
            live_stations=payload.active_rp,
            source_segments=source_segments,
        )
        analysis = analyze_spread(spread)
        hist = build_offset_histogram_report(analysis, bins=payload.hist_bins)
        rose = build_offset_rose_report(
            analysis,
            nr=payload.rose_nr,
            ntheta=payload.rose_ntheta,
            zero_centered=True,
        )
    except (ValueError, ArithmeticError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid design parameters: {exc}")

    return DesignAnalyzeResponse(
        layout=Layout(
            receiver_count=analysis.receiver_count,
            source_count=analysis.source_count,
            live_channel_count=analysis.live_channel_count,
            trace_count=analysis.trace_count,
            bin_size=(float(analysis.bin_size[0]), float(analysis.bin_size[1])),
            patch_size=(float(analysis.patch_size[0]), float(analysis.patch_size[1])),
            salvo_size=(float(analysis.salvo_size[0]), float(analysis.salvo_size[1])),
            moveup=(float(analysis.moveup[0]), float(analysis.moveup[1])),
            receiver_aspect_ratio=float(compute_receiver_aspect_ratio(spread)),
        ),
        fold=Fold(
            peak=int(analysis.fold.peak),
            nominal=float(analysis.fold.nominal),
            inline_nominal=float(analysis.fold.inline_nominal),
            crossline_nominal=float(analysis.fold.crossline_nominal),
        ),
        offsets=Offsets(
            minimum=float(analysis.offsets.minimum),
            maximum=float(analysis.offsets.maximum),
            maximum_inline=float(analysis.offsets.maximum_inline),
            maximum_crossline=float(analysis.offsets.maximum_crossline),
            largest_minimum=float(analysis.offsets.largest_minimum),
            smallest_maximum=float(analysis.offsets.smallest_maximum),
        ),
        taper=Taper(
            inline_distance=float(analysis.taper.inline_distance),
            crossline_distance=float(analysis.taper.crossline_distance),
        ),
        histogram=HistogramData(
            offset_edges=[float(x) for x in hist.offset_edges],
            offset_centers=[float(x) for x in hist.offset_centers],
            counts=[int(x) for x in hist.counts],
        ),
        rose=RoseData(
            theta_edges=[float(x) for x in rose.theta_edges],
            radius_edges=[float(x) for x in rose.radius_edges],
            counts=[[int(x) for x in row] for row in rose.counts],
            r_max=float(rose.r_max),
        ),
    )
