"""Project section endpoints — read/write slices of config.json.

Each section maps to a subset of the dojo ProjectConfig. The config.json
in the project tree is the single source of truth.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, get_current_user
from api.db.engine import get_db
from api.db.models import Project
from api.dojo import get_dojo_project_service

from dojo.v3.domain.config import DesignDef, GridOption, LayerDef, Margins, SurveyExtent, SurveyOption
from dojo.v3.services.project_service import ProjectNotFoundError, ProjectService

router = APIRouter(prefix="/project/{project_id}/sections", tags=["project-sections"])

# Fields exposed to the frontend for the definition section.
# Internal fields (project_id, root_path, company, user_name, project_name)
# are excluded — the frontend doesn't edit them.
_DEFINITION_FIELDS = (
    "client", "contractor", "country", "region",
    "epsg", "second", "crsName", "overlapGrid", "overlapStrip", "notes",
)

VALID_SECTIONS = frozenset([
    "definition",
    "survey",
    "osm",
    "layers",
    "maps",
    "design",
    "design_options",
    "partitioning",
    "offsetters",
    "crew",
    "gis_styles",
])


def _validate_section(section: str) -> str:
    if section not in VALID_SECTIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid section '{section}'. Valid: {sorted(VALID_SECTIONS)}",
        )
    return section


async def _get_project_for_user(
    project_id: int,
    principal: AuthPrincipal,
    db: AsyncSession,
) -> Project:
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.company_id == principal.company_id,
        )
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


class SectionResponse(BaseModel):
    section: str
    data: dict[str, Any]
    updated_at: datetime | None


# ---------------------------------------------------------------------------
# Section ↔ config.json mapping
# ---------------------------------------------------------------------------

def _migrate_rl_angle_to_azimuth(data: Any) -> Any:
    """Rename legacy ``rlAngle`` → ``rlAzimuth`` in-place.

    Stored values were always azimuth (the field was just misnamed), so the
    rename is lossless. Applied on read for survey and osm UI payloads so
    the frontend sees the canonical key regardless of when the project was
    last saved.
    """
    if not isinstance(data, dict):
        return data
    if "rlAngle" in data and "rlAzimuth" not in data:
        data["rlAzimuth"] = data.pop("rlAngle")
    for v in data.values():
        if isinstance(v, dict):
            _migrate_rl_angle_to_azimuth(v)
        elif isinstance(v, list):
            for item in v:
                _migrate_rl_angle_to_azimuth(item)
    return data


def _read_section(section: str, dojo_svc: ProjectService, project_id: int) -> dict[str, Any]:
    """Extract a section slice from the dojo ProjectConfig."""
    try:
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        return {}

    if section == "definition":
        meta = cfg.metadata
        return {field: getattr(meta, field, "") for field in _DEFINITION_FIELDS}

    if section == "gis_styles":
        return cfg.gis_styles

    if section == "partitioning":
        return cfg.partitioning

    if section == "design":
        return cfg.design

    if section == "design_options":
        # Self-heal: rebuild typed cfg.grid[*].design_def so legacy configs
        # get reconciled on first read without the user touching the UI.
        if _rebuild_typed_grid_design_def(cfg):
            try:
                project_dir = dojo_svc.get_project_dir(project_id)
                cfg.save(str(project_dir / "config.json"))
            except ProjectNotFoundError:
                pass
        return cfg.design_options

    # Remaining UI sections — each stored in its own field
    _ui_section_map = {
        "survey": "survey_ui",
        "layers": "layers_ui",
        "maps": "maps_ui",
        "offsetters": "offsetters_ui",
        "crew": "crew_ui",
        "osm": "osm_ui",
    }
    attr = _ui_section_map.get(section)
    if attr:
        data = getattr(cfg, attr, {})
        if section in ("survey", "osm"):
            _migrate_rl_angle_to_azimuth(data)
        if section == "survey":
            _heal_survey_rl_angle(cfg, data, dojo_svc, project_id)
        if section == "layers":
            _heal_typed_layers(cfg, data, dojo_svc, project_id)
        if section == "maps":
            _heal_typed_mappers(cfg, data, dojo_svc, project_id)
        return data

    return {}


def _rebuild_typed_layers(cfg: Any, ui_data: dict[str, Any]) -> bool:
    """Populate ``cfg.layers`` (Dict[int, LayerDef]) from the UI payload.

    Returns True if cfg.layers changed. Used by both the PUT bridge and the
    GET self-heal — legacy projects saved before this bridge existed have
    an empty typed map even though layers_ui is populated, which would make
    the Layers pipeline step a no-op.
    """
    ui_layers = ui_data.get("layers") or []
    new: dict[int, LayerDef] = {}
    for ul in ui_layers:
        try:
            code = int(ul.get("code"))
        except (TypeError, ValueError):
            continue
        src = ul.get("from") or "gis_layers"
        if src not in ("polygons", "gis_layers"):
            src = "gis_layers"
        stems = [s for s in (ul.get("sourceFiles") or []) if isinstance(s, str)]
        fnames = [f"{s}.gpkg" for s in stems]
        try:
            buf = int(float(ul.get("buffer") or 0))
        except (TypeError, ValueError):
            buf = 0
        new[code] = LayerDef(
            name=ul.get("name") or f"layer_{code}",
            source=src,
            fname=fnames if len(fnames) != 1 else fnames[0],
            src_field=ul.get("sourceField") or "fclass",
            src_select=[v for v in (ul.get("sourceValues") or []) if isinstance(v, str)],
            buffer=buf,
            color=ul.get("color") or "#000000",
        )
    prev = {k: v.model_dump() for k, v in (cfg.layers or {}).items()}
    nxt = {k: v.model_dump() for k, v in new.items()}
    if prev == nxt:
        return False
    cfg.layers.clear()
    cfg.layers.update(new)
    return True


def _heal_typed_layers(
    cfg: Any,
    ui: dict[str, Any],
    dojo_svc: ProjectService,
    project_id: int,
) -> None:
    """Rebuild cfg.layers from layers_ui if it's empty or out of sync."""
    if not ui or not (ui.get("layers") or []):
        return
    if _rebuild_typed_layers(cfg, ui):
        project_dir = dojo_svc.get_project_dir(project_id)
        cfg.save(str(project_dir / "config.json"))


def _rebuild_typed_mappers(cfg: Any, ui_data: dict[str, Any]) -> bool:
    """Populate ``cfg.mappers`` (Dict[str, List[int]]) from the maps UI.

    Each map in the UI carries an ordered list of layer *names*. The runner
    works off layer *codes*, so we resolve names via cfg.layers_ui and drop
    any that no longer exist (silent — the UI shows the authoritative list).

    Returns True if cfg.mappers changed.
    """
    name_to_code: dict[str, int] = {}
    for ul in (cfg.layers_ui or {}).get("layers") or []:
        name = ul.get("name")
        try:
            code = int(ul.get("code"))
        except (TypeError, ValueError):
            continue
        if isinstance(name, str) and name.strip():
            name_to_code[name.strip()] = code

    new: dict[str, list[int]] = {}
    for m in (ui_data or {}).get("maps") or []:
        map_name = m.get("name")
        if not isinstance(map_name, str) or not map_name.strip():
            continue
        codes: list[int] = []
        for entry in m.get("layers") or []:
            if not isinstance(entry, str):
                continue
            code = name_to_code.get(entry.strip())
            if code is not None:
                codes.append(code)
        if codes:
            new[map_name.strip()] = codes

    prev = dict(cfg.mappers or {})
    if prev == new:
        return False
    cfg.mappers.clear()
    cfg.mappers.update(new)
    return True


def _rebuild_typed_grid_design_def(cfg: Any) -> bool:
    """Populate ``cfg.grid[option].design_def`` from design_options + design.

    Each design-option row references a design attribute group by name.
    The grid runner consumes ``cfg.grid[active].design_def: Dict[int, DesignDef]``
    and iterates it to call ``saisai.generate_grid``. If the UI never
    wrote typed design defs, that dict is empty and the runner produces
    zero stations. This rebuild runs every time design or design_options
    is saved so the typed blob tracks the UI state.

    Returns True if anything changed.
    """
    design_groups = {}
    for g in (cfg.design or {}).get("groups") or []:
        name = g.get("name")
        if isinstance(name, str) and name.strip():
            design_groups[name.strip()] = g

    def _int(val: Any) -> int:
        try:
            return int(float(val or 0))
        except (TypeError, ValueError):
            return 0

    changed = False
    for opt in (cfg.design_options or {}).get("options") or []:
        option_name = opt.get("name")
        if not isinstance(option_name, str) or not option_name.strip():
            continue
        option_name = option_name.strip()
        if option_name not in cfg.grid:
            cfg.grid[option_name] = GridOption()

        new_def: dict[int, DesignDef] = {}
        for idx, row in enumerate(opt.get("rows") or []):
            design_name = (row.get("design") or "").strip()
            g = design_groups.get(design_name)
            if not g:
                continue
            # row["region"] is the polygon stem/filename the user picked
            # from the active partitioning group; promote to a .gpkg name
            # so the runner's multi-design clipping (delete_inner /
            # extract_inner against cfg.grid[*].design_def[*].area) can
            # actually find the file.
            region_raw = (row.get("region") or "").strip()
            if region_raw:
                area = region_raw if region_raw.endswith(".gpkg") else f"{region_raw}.gpkg"
            else:
                area = ""
            new_def[idx] = DesignDef(
                area=area,
                shift_r=_int(row.get("rpShiftX")),
                shift_s=_int(row.get("spShiftX")),
                rpi=_int(g.get("rpi")),
                rli=_int(g.get("rli")),
                spi=_int(g.get("spi")),
                sli=_int(g.get("sli")),
                active_rl=_int(g.get("activeRl")),
                active_rp=_int(g.get("activeRp")),
                sp_per_salvo=_int(g.get("spSalvo")) or 1,
                roll=_int(g.get("roll")) or 1,
            )

        prev = {k: v.model_dump() for k, v in cfg.grid[option_name].design_def.items()}
        nxt = {k: v.model_dump() for k, v in new_def.items()}
        if prev != nxt:
            cfg.grid[option_name].design_def = new_def
            changed = True

    return changed


def _heal_typed_mappers(
    cfg: Any,
    ui: dict[str, Any],
    dojo_svc: ProjectService,
    project_id: int,
) -> None:
    """Rebuild cfg.mappers from maps_ui if it's empty or out of sync."""
    if not ui or not (ui.get("maps") or []):
        return
    if _rebuild_typed_mappers(cfg, ui):
        project_dir = dojo_svc.get_project_dir(project_id)
        cfg.save(str(project_dir / "config.json"))


def _heal_survey_rl_angle(
    cfg: Any,
    ui: dict[str, Any],
    dojo_svc: ProjectService,
    project_id: int,
) -> None:
    """Rebuild cfg.survey[*].rl_angle from the UI's rlAzimuth if it diverges.

    Projects saved before the azimuth→angle conversion landed still carry
    rl_angle = rlAzimuth (off by 90°) in the typed dojo survey map. Any
    consumer reading cfg.survey (e.g. demo/workflow, batch jobs) would see
    the wrong value until the user saved the Survey page again. This
    one-shot reconciliation fixes that on the first GET.
    """
    groups = ui.get("groups") or []
    changed = False
    for group in groups:
        name = group.get("name") or ""
        if not name or name not in cfg.survey:
            continue
        sim = group.get("simulation") or {}
        rl_azimuth = float(sim.get("rlAzimuth") or 0)
        expected = rl_azimuth - 90.0
        extent = cfg.survey[name].extents.get("simulation") if cfg.survey[name].extents else None
        if extent is None:
            continue
        if abs(extent.rl_angle - expected) > 1e-6:
            extent.rl_angle = expected
            changed = True
    if changed:
        project_dir = dojo_svc.get_project_dir(project_id)
        cfg.save(str(project_dir / "config.json"))


def _write_section(section: str, data: dict[str, Any], dojo_svc: ProjectService, project_id: int) -> None:
    """Merge a section slice back into the dojo ProjectConfig and persist."""
    try:
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        return

    project_dir = dojo_svc.get_project_dir(project_id)

    if section == "definition":
        for field in _DEFINITION_FIELDS:
            if field in data:
                setattr(cfg.metadata, field, data[field])
        cfg.save(str(project_dir / "config.json"))
        return

    if section == "gis_styles":
        cfg.gis_styles = data
        cfg.save(str(project_dir / "config.json"))
        return

    if section == "partitioning":
        cfg.partitioning = data
        # Partitioning holds the polygon lists that design_options rows
        # pick from — a rename there needs to invalidate the typed
        # design_def entries that reference those polygons.
        _rebuild_typed_grid_design_def(cfg)
        cfg.save(str(project_dir / "config.json"))
        return

    if section == "design":
        cfg.design = data
        # Design attribute changes propagate into every grid option via the
        # same bridge the design_options writer uses — keep them in sync.
        _rebuild_typed_grid_design_def(cfg)
        cfg.save(str(project_dir / "config.json"))
        return

    if section == "survey":
        # Normalize legacy rlAngle key before persisting so config.json only
        # carries the canonical rlAzimuth going forward.
        _migrate_rl_angle_to_azimuth(data)
        cfg.survey_ui = data
        # Bridge: populate typed cfg.survey from UI groups.
        # The UI collects RL azimuth (compass convention); dojo expects
        # rl_angle = rl_azimuth - 90 (math convention, CCW from +X).
        cfg.survey.clear()
        groups = data.get("groups", [])
        active_group_id = data.get("activeGroupId", "")
        active_group_name = ""
        for group in groups:
            name = group.get("name", "")
            if not name:
                continue
            if group.get("id") == active_group_id:
                active_group_name = name
            sim = group.get("simulation") or {}
            rl_azimuth = float(
                sim.get("rlAzimuth") if sim.get("rlAzimuth") is not None else sim.get("rlAngle") or 0
            )
            simulation_extent = SurveyExtent(
                name="Simulation",
                margins=Margins(
                    top=int(float(sim.get("marginTop") or 0)),
                    bottom=int(float(sim.get("marginBottom") or 0)),
                    left=int(float(sim.get("marginLeft") or 0)),
                    right=int(float(sim.get("marginRight") or 0)),
                ),
                rl_angle=rl_azimuth - 90.0,
            )
            cfg.survey[name] = SurveyOption(
                acq_polygon=group.get("acquisitionPolygon", ""),
                pois=group.get("pois", []),
                extents={"simulation": simulation_extent},
            )
        if active_group_name:
            cfg.active_options.survey = active_group_name
        cfg.save(str(project_dir / "config.json"))
        return

    if section == "layers":
        cfg.layers_ui = data
        _rebuild_typed_layers(cfg, data)
        # Typed mappers depend on layer name→code lookup; rebuild too so
        # renaming a layer re-resolves downstream.
        _rebuild_typed_mappers(cfg, cfg.maps_ui or {})
        cfg.save(str(project_dir / "config.json"))
        return

    if section == "maps":
        cfg.maps_ui = data
        _rebuild_typed_mappers(cfg, data)
        cfg.save(str(project_dir / "config.json"))
        return

    if section == "design_options":
        cfg.design_options = data
        # Bridge: populate cfg.grid resolution + origin from design options
        options = data.get("options", [])
        active_id = data.get("activeId", "")
        active_name = ""
        for opt in options:
            name = opt.get("name", "")
            if not name:
                continue
            if opt.get("id") == active_id:
                active_name = name
            resolution = float(opt.get("resolution") or 1) or 1.0
            origin_x = float(opt.get("gridOriginX") or 0)
            origin_y = float(opt.get("gridOriginY") or 0)
            if name not in cfg.grid:
                cfg.grid[name] = GridOption()
            cfg.grid[name].resolution = resolution
            cfg.grid[name].origin = (origin_x, origin_y)
        if active_name:
            cfg.active_options.grid = active_name
        # Build cfg.grid[*].design_def from the rows' referenced design names
        # using the current design-attribute groups — without it, the grid
        # runner's design_def loop is empty and produces 0 stations.
        _rebuild_typed_grid_design_def(cfg)
        cfg.save(str(project_dir / "config.json"))
        return

    # Remaining UI sections
    _ui_section_map = {
        "offsetters": "offsetters_ui",
        "crew": "crew_ui",
        "osm": "osm_ui",
    }
    attr = _ui_section_map.get(section)
    if attr:
        if section == "osm":
            _migrate_rl_angle_to_azimuth(data)
        setattr(cfg, attr, data)
        cfg.save(str(project_dir / "config.json"))
        return


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/{section}", response_model=SectionResponse)
async def get_section(
    project_id: int,
    section: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> SectionResponse:
    _validate_section(section)
    await _get_project_for_user(project_id, principal, db)
    data = _read_section(section, dojo_svc, project_id)
    return SectionResponse(section=section, data=data, updated_at=None)


@router.put("/{section}", response_model=SectionResponse)
async def put_section(
    project_id: int,
    section: str,
    body: dict[str, Any],
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> SectionResponse:
    _validate_section(section)
    await _get_project_for_user(project_id, principal, db)
    _write_section(section, body, dojo_svc, project_id)
    data = _read_section(section, dojo_svc, project_id)
    return SectionResponse(
        section=section,
        data=data,
        updated_at=datetime.now(timezone.utc),
    )
