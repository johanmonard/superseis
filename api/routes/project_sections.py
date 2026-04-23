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
from api.seismic_gpkg import prune_option_seismic_files

from dojo.v3.domain.config import (
    DesignDef,
    GridOption,
    LayerDef,
    Margins,
    OffsetRule,
    OffsetterOption,
    PointTypeOffsetter,
    SurveyExtent,
    SurveyOption,
)
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


def _rebuild_typed_offsetters(cfg: Any, ui_data: dict[str, Any]) -> bool:
    """Populate ``cfg.offsetters`` + active selection from ``offsetters_ui``.

    The offsetters step consumes typed OffsetterOption / PointTypeOffsetter
    objects. Projects saved before this bridge existed carry only the UI
    blob, so the step runs as a no-op. Every call rebuilds from scratch —
    running the healer twice in a row produces identical output.

    Offsets depend on the theoretical grid having the right regioning. The
    offsetter's DesignOption and the active grid option share names by UI
    contract — sync them so a mismatched active_options.grid doesn't
    silently produce a regioning-free grid.

    Returns True if either cfg.offsetters or cfg.active_options.offsetter
    or cfg.active_options.grid changed.
    """
    configs = (ui_data or {}).get("configs") or []

    # --- Indexes resolved up-front ---------------------------------------
    layer_name_to_zone: dict[str, int] = {}
    for ul in (cfg.layers_ui or {}).get("layers") or []:
        name = ul.get("name")
        try:
            code = int(ul.get("code"))
        except (TypeError, ValueError):
            continue
        if isinstance(name, str) and name.strip():
            layer_name_to_zone[name.strip()] = code

    partitioning_by_name: dict[str, dict[str, Any]] = {}
    for g in (cfg.partitioning or {}).get("groups") or []:
        name = g.get("name")
        if isinstance(name, str) and name.strip():
            partitioning_by_name[name.strip()] = {
                "regionTag": g.get("regionTag") or "",
                "polygons": [p for p in (g.get("polygons") or []) if isinstance(p, str)],
            }

    design_option_by_name: dict[str, dict[str, Any]] = {}
    for opt in (cfg.design_options or {}).get("options") or []:
        name = opt.get("name")
        if isinstance(name, str) and name.strip():
            design_option_by_name[name.strip()] = opt

    design_idx_by_name: dict[str, int] = {}
    design_groups_list: list[dict[str, Any]] = list((cfg.design or {}).get("groups") or [])
    for i, g in enumerate(design_groups_list):
        n = g.get("name")
        if isinstance(n, str) and n.strip():
            design_idx_by_name[n.strip()] = i

    # --- Per-side translation -------------------------------------------
    # Saisai rule axes follow the simulation referential: j-axis is aligned
    # along receiver lines (compute_referential uses ``azimuth_j=-rl_angle``),
    # so the crossline axis depends on which station type is moving:
    #   - Sources move across *source* lines → crossline = j-axis
    #   - Receivers move across *receiver* lines → crossline = i-axis
    # "Shifted inline" is the orthogonal axis with a fixed crossline shift.
    def _rule_axes(ptype: str) -> tuple[str, str]:
        if ptype == "s":
            return "j_range", "i_range_at"   # crossline, inline-at
        return "i_range", "j_range_at"

    def _heal_side(ptype: str, side: dict[str, Any], design_option_name: str) -> PointTypeOffsetter | None:
        cross_rule, inline_rule = _rule_axes(ptype)
        part = partitioning_by_name.get((side.get("partitioning") or "").strip())
        if part is None:
            return None
        region_tag = part["regionTag"]
        polygons = part["polygons"]

        design_option = design_option_by_name.get((design_option_name or "").strip())
        if design_option is None:
            return None

        layer_rules = side.get("layerRules") or []

        zones_ok = sorted({
            layer_name_to_zone[r["layer"]]
            for r in layer_rules
            if not r.get("offset") and not r.get("skip") and r.get("layer") in layer_name_to_zone
        })
        zones_keep = sorted({
            layer_name_to_zone[r["layer"]]
            for r in layer_rules
            if r.get("offset") and not r.get("skip") and r.get("layer") in layer_name_to_zone
        })
        # Base offset_from zone set (same across params).
        base_from_zones = sorted({0} | {
            layer_name_to_zone[r["layer"]]
            for r in layer_rules
            if r.get("offset") and r.get("layer") in layer_name_to_zone
        })

        # The grid runner writes ``design_reg`` as the 0-based key of
        # ``grid_opt.design_def``, which in turn is the enumerate index of
        # ``design_option.rows``. Match that same position so the offsets
        # step's ``filter_df_from_dict`` actually finds rows.
        rows = design_option.get("rows") or []

        params_out: list[OffsetRule] = []
        for p in side.get("params") or []:
            region_name = (p.get("region") or "").strip()
            if region_name not in polygons:
                continue

            row_idx = next(
                (
                    i for i, r in enumerate(rows)
                    if (r.get("region") or "").strip() == region_name
                ),
                -1,
            )
            if row_idx < 0:
                continue
            region_index = row_idx

            row = rows[row_idx]
            design_name = (row.get("design") or "").strip()
            if design_name not in design_idx_by_name:
                continue
            design_idx = design_idx_by_name[design_name]
            # Per-param bin_grid from the resolved design's own intervals.
            # Legacy uses different bin_grids per region when designs
            # differ; a single global value would round-trip incorrectly.
            design_attrs = design_groups_list[design_idx]
            try:
                vals = [
                    int(float(design_attrs.get("rpi") or 0)),
                    int(float(design_attrs.get("spi") or 0)),
                    int(float(design_attrs.get("rli") or 0)),
                    int(float(design_attrs.get("sli") or 0)),
                ]
                bin_grid = max(1, min(v for v in vals if v > 0) // 2) if any(v > 0 for v in vals) else 20
            except (TypeError, ValueError):
                bin_grid = 20

            offset_from: dict[str, Any] = {"zone_theo": base_from_zones}
            if region_tag:
                offset_from[region_tag] = region_index

            # offset_to = priority groups from targetPriority
            offset_to: list[tuple[int, ...]] = []
            current_group: list[int] = []
            for entry in p.get("targetPriority") or []:
                kind = entry.get("kind")
                if kind == "sep":
                    if current_group:
                        offset_to.append(tuple(current_group))
                        current_group = []
                elif kind == "layer":
                    zone = layer_name_to_zone.get((entry.get("layer") or "").strip())
                    if zone is not None:
                        current_group.append(zone)
            if current_group:
                offset_to.append(tuple(current_group))
            offset_to = [g for g in offset_to if g]

            rules: list[tuple[int, str, Any]] = []
            for prio, r in enumerate(p.get("offsetRules") or []):
                rt = (r.get("ruleType") or "").strip()
                v_raw = r.get("value")
                if v_raw is None or v_raw == "":
                    continue
                try:
                    v_bins = int(round(float(v_raw) / bin_grid))
                except (TypeError, ValueError):
                    continue
                if rt == "Max crossline":
                    rules.append((prio, cross_rule, v_bins))
                elif rt == "Shifted inline":
                    va_raw = r.get("valueAt")
                    if va_raw is None or va_raw == "":
                        # No crossline shift — fall back to pure inline
                        # sweep. Inline axis is the complement of the
                        # crossline axis: i for sources, j for receivers.
                        inline_bare = "i_range" if ptype == "s" else "j_range"
                        rules.append((prio, inline_bare, v_bins))
                    else:
                        try:
                            va_bins = int(round(float(va_raw) / bin_grid))
                        except (TypeError, ValueError):
                            continue
                        rules.append((prio, inline_rule, (v_bins, va_bins)))
                elif rt == "Max radius":
                    rules.append((prio, "radius", v_bins))
                # unknown rule types silently dropped

            params_out.append(OffsetRule(
                offset_from=offset_from,
                offset_to=offset_to,
                rules=rules,
                design_idx=design_idx,
            ))

        if not params_out:
            return None

        try:
            snapper_max_dist = int(float(side.get("snapperMaxDist") or 0))
        except (TypeError, ValueError):
            snapper_max_dist = 0

        return PointTypeOffsetter(
            mapper=(side.get("map") or "").strip(),
            zones_ok_filter={"zone_theo": zones_ok},
            zones_keep_filter={"zone_theo": zones_keep},
            parameters=params_out,
            snapper_max_dist=snapper_max_dist,
        )

    # --- Rebuild cfg.offsetters -----------------------------------------
    new_offsetters: dict[str, OffsetterOption] = {}
    for c in configs:
        name = (c.get("name") or "").strip()
        if not name:
            continue
        design_option_name = (c.get("designOption") or "").strip()
        option = OffsetterOption(
            s=_heal_side("s", c.get("sources") or {}, design_option_name),
            r=_heal_side("r", c.get("receivers") or {}, design_option_name),
        )
        new_offsetters[name] = option

    prev = {k: v.model_dump() for k, v in (cfg.offsetters or {}).items()}
    nxt = {k: v.model_dump() for k, v in new_offsetters.items()}
    changed = False
    if prev != nxt:
        cfg.offsetters.clear()
        cfg.offsetters.update(new_offsetters)
        changed = True

    # --- Active offsetter selection -------------------------------------
    active_id = (ui_data or {}).get("activeId") or ""
    active_name = ""
    for c in configs:
        if c.get("id") == active_id:
            active_name = (c.get("name") or "").strip()
            break
    if not active_name and configs:
        active_name = (configs[0].get("name") or "").strip()
    if cfg.active_options.offsetter != active_name:
        cfg.active_options.offsetter = active_name
        changed = True

    # --- Cascade: sync active grid with active offsetter's designOption --
    # Offsets depend on the theoretical grid carrying the regioning the
    # offsetter expects. Same names by UI contract — resync so a stale
    # active_options.grid doesn't silently produce a regioning-free grid.
    if active_name:
        active_cfg = next((c for c in configs if (c.get("name") or "").strip() == active_name), None)
        if active_cfg is not None:
            design_option_name = (active_cfg.get("designOption") or "").strip()
            if design_option_name and design_option_name in (cfg.grid or {}):
                if cfg.active_options.grid != design_option_name:
                    cfg.active_options.grid = design_option_name
                    changed = True

    return changed


def _heal_typed_offsetters(
    cfg: Any,
    ui: dict[str, Any],
    dojo_svc: ProjectService,
    project_id: int,
) -> bool:
    """Rebuild cfg.offsetters from offsetters_ui if it's out of sync.

    Returns True if anything changed (so callers can batch saves).
    """
    if not ui or not (ui.get("configs") or []):
        return False
    if _rebuild_typed_offsetters(cfg, ui):
        project_dir = dojo_svc.get_project_dir(project_id)
        cfg.save(str(project_dir / "config.json"))
        return True
    return False


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
            rl_azimuth = float(sim.get("rlAzimuth") or 0)
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
        option_names: list[str] = []
        for opt in options:
            name = opt.get("name", "")
            if not name:
                continue
            option_names.append(name)
            if opt.get("id") == active_id:
                active_name = name
            resolution = float(opt.get("resolution") or 1) or 1.0
            origin_x = float(opt.get("gridOriginX") or 0)
            origin_y = float(opt.get("gridOriginY") or 0)
            if name not in cfg.grid:
                cfg.grid[name] = GridOption()
            cfg.grid[name].resolution = resolution
            cfg.grid[name].origin = (origin_x, origin_y)
            cfg.grid[name].survey_key = str(opt.get("surveyKey") or "")
        if active_name:
            cfg.active_options.grid = active_name
        # Build cfg.grid[*].design_def from the rows' referenced design names
        # using the current design-attribute groups — without it, the grid
        # runner's design_def loop is empty and produces 0 stations.
        _rebuild_typed_grid_design_def(cfg)
        cfg.save(str(project_dir / "config.json"))
        # Drop per-option seismic gpkgs whose option was renamed or deleted
        # so the Files panel doesn't keep showing stale layers.
        prune_option_seismic_files(project_dir, option_names)
        return

    # Remaining UI sections
    _ui_section_map = {
        "offsetters": "offsetters_ui",
        "crew": "crew_ui",
        "osm": "osm_ui",
    }
    attr = _ui_section_map.get(section)
    if attr:
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
