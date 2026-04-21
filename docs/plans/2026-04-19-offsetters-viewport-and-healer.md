# Offsetters — viewport + healer + grid/offset consistency

**Date:** 2026-04-19
**Status:** ready to execute

## Goal

After clicking **Show grid** on the Offsetters page, a map viewport renders the theoretical (grey) and offset (R/S-coloured) stations with arcs for moved points, driven by the active `offsetters_ui` config. Three gaps today:

1. No viewport on the Offsetters page.
2. No translator from `offsetters_ui` → `offsetters`, so the pipeline runs as a no-op — verified: `work/artifacts/offsets/{r,s}.parquet` has `offset=True` for 0 / 73 k rows.
3. `active_options.grid` drifts away from `offsetter.designOption`, so regioning produces `design_reg ∈ {0, 1}` instead of `{0, 1, 2, 3}`.

## Out of scope

- Any change to `offsetters_ui` schema or the Offsetters UI panels beyond wiring the viewport.
- Snap/sequence/simulation steps — only the **offsets** step.
- Multiple simultaneous offsetter configs — only the one pointed to by `active_options.offsetter`.

## Current state (as observed)

- `offsetters_ui` is populated (rebuilt from legacy `offsetters.py`) and shape is settled — see prior sessions.
- `cfg.offsetters` (v3 shape) is `{}`; `active_options.offsetter` is `""`.
- `active_options.grid = "Option 2"` which has `regioning=[]`.
- `api/routes/project_pipeline.py:153-164` already runs `_heal_typed_layers` and `_heal_typed_mappers` before every pipeline step. No equivalent for offsetters.
- Saisai rule registry lives at `.venv/lib/python3.12/site-packages/saisai/seismic/offsets.py`. Supported names include `i_range`, `j_range`, `i_range_at`, `j_range_at`, `radius`.
- Offsets parquet schema today: `['j','i','i_theo','j_theo','x','y','design_reg','i_offs','j_offs','offset','skipped','pseq_theo','pseq','pid']`. `x_offs`/`y_offs` are **not** written — they must be computed in the new route via `ij_to_xy`.

## Settled translation rules (from earlier plan-table session)

| UI field | v3 / saisai equivalent |
|---|---|
| `LayerRule{offset=off, skip=off}` | contributes layer zone → `zones_ok_filter.zone_theo` (side) and pool for `offset_to` (per-param priority) |
| `LayerRule{offset=on, skip=off}` | `zones_keep_filter.zone_theo` (side); also in `offset_from.zone_theo` |
| `LayerRule{offset=on, skip=on}` | in `offset_from.zone_theo` only |
| `LayerRule{offset=off, skip=on}` | invalid — UI prevents it |
| `param.region` (polygon name) | `offset_from.<regionTag> = polygon_index + 1` (1-based; 0 reserved for "outside all polygons") |
| `param.targetPriority` (flat list with `sep` entries) | `offset_to: list[tuple[int,...]]`, one tuple per group |
| `OffsetRule "Max crossline"` with `value` | `(idx, "i_range", bins(value))` |
| `OffsetRule "Shifted inline"` scalar `value` | `(idx, "j_range", bins(value))` |
| `OffsetRule "Shifted inline"` with `valueAt` | `(idx, "j_range_at", (bins(value), bins(valueAt)))` |
| `OffsetRule "Max radius"` with `value` | `(idx, "radius", bins(value))` |
| Implicit from `DesignOption.rows[region].design` | `design_idx` = 0-based position of that design name in `cfg.design.groups` |

Where `bins(v) = int(round(float(v) / bin_grid))` and `bin_grid = min(rpi, spi, rli, sli) / 2` computed **per-param** from the design resolved for that region (not globally — legacy uses different `bin_grid` per region when designs differ).

## Part A — backend healer `offsetters_ui` → `offsetters`

**Files:** `api/routes/project_sections.py` (new helper) + `api/routes/project_pipeline.py` (call site).

### A.1 New helper `_heal_typed_offsetters(cfg, offsetters_ui, dojo_svc, project_id)`

Mirror the pattern of `_heal_typed_layers` / `_heal_typed_mappers` in the same file. Returns a boolean "changed" indicator so the caller can decide whether to `cfg.save(...)`.

**Indexes resolved up-front (once per call):**
- `layer_name_to_zone: dict[str,int]` — built from `cfg.layers_ui.layers` (each entry has `name` and the integer key under which it's stored is the zone code).
- `partitioning_by_name: dict[str, {regionTag, polygons}]` — from `cfg.partitioning.groups`.
- `design_option_by_name: dict[str, DesignOption]` — from `cfg.design_options.options`.
- `design_idx_by_name: dict[str,int]` — `{g.name: i for i, g in enumerate(cfg.design.groups)}`.

### A.2 Per-config translation

```python
for c in offsetters_ui.get("configs", []):
    option = OffsetterOption(
        s = heal_side("s", c["sources"], c.get("designOption",""), indexes),
        r = heal_side("r", c["receivers"], c.get("designOption",""), indexes),
    )
    cfg.offsetters[c["name"]] = option

# active
active_id = offsetters_ui.get("activeId","")
active_name = next((c["name"] for c in offsetters_ui.get("configs",[])
                    if c["id"] == active_id), None)
if active_name is None and offsetters_ui.get("configs"):
    active_name = offsetters_ui["configs"][0]["name"]
cfg.active_options.offsetter = active_name or ""
```

### A.3 Per-side translation `heal_side(ptype, side, design_option_name, idx)`

Return `None` (not the typed object) if prerequisites missing — the v3 shape tolerates a side absence.

**Side-level fields:**
- `mapper = side["map"]`
- `snapper_max_dist = int(side.get("snapperMaxDist","0") or 0)`
- `zones_ok_filter = {"zone_theo": sorted([idx.layer_to_zone[r.layer] for r in layerRules if not r.offset and not r.skip and r.layer in idx.layer_to_zone])}`
- `zones_keep_filter = {"zone_theo": sorted([idx.layer_to_zone[r.layer] for r in layerRules if r.offset and not r.skip and r.layer in idx.layer_to_zone])}`

Where `layerRules = side.get("layerRules", [])`.

**Per param:**

```python
part = idx.partitioning_by_name.get(side["partitioning"])
if part is None: return None  # incomplete config → skip side
region_tag = part["regionTag"]        # e.g. "design_reg"
polygons = part["polygons"]           # ordered list of polygon names

design_option = idx.design_option_by_name.get(design_option_name)
if design_option is None: return None

params_out = []
for p in side.get("params", []):
    # 1-based region index
    if p["region"] not in polygons:
        log.warning("unknown region %s; skipping param", p["region"])
        continue
    region_index = polygons.index(p["region"]) + 1

    # resolve design_idx from design option's rows
    row = next((r for r in design_option["rows"] if r.get("region") == p["region"]), None)
    if row is None or row.get("design","") not in idx.design_idx_by_name:
        log.warning("design_idx unresolvable for region %s; skipping param", p["region"])
        continue
    design_idx = idx.design_idx_by_name[row["design"]]
    design_attrs = cfg.design.groups[design_idx]  # for bin_grid

    # bin_grid — metres per bin cell for this design
    try:
        vals = [int(design_attrs.rpi), int(design_attrs.spi),
                int(design_attrs.rli), int(design_attrs.sli)]
        bin_grid = max(1, min(vals) // 2)   # guard against zeros / negatives
    except Exception:
        bin_grid = 20  # legacy default

    # offset_from = (sources+keep layers under zone_theo) + region filter
    from_zones = [idx.layer_to_zone[r["layer"]] for r in layerRules
                  if r.get("offset") and r["layer"] in idx.layer_to_zone]
    from_zones = sorted(set([0] + from_zones))   # 0 = outside polygons, legacy convention
    offset_from = {"zone_theo": from_zones, region_tag: region_index}

    # offset_to = priority groups from targetPriority
    offset_to = []
    current_group = []
    for entry in p.get("targetPriority", []):
        if entry.get("kind") == "sep":
            if current_group:
                offset_to.append(tuple(current_group))
                current_group = []
        elif entry.get("kind") == "layer":
            zone = idx.layer_to_zone.get(entry.get("layer",""))
            if zone is not None:
                current_group.append(zone)
    if current_group:
        offset_to.append(tuple(current_group))
    # drop any empty tuples
    offset_to = [g for g in offset_to if g]

    # rules
    rules = []
    for prio, r in enumerate(p.get("offsetRules", [])):
        rt = r.get("ruleType","")
        v = r.get("value","")
        va = r.get("valueAt")
        if not v: continue
        v_bins = int(round(float(v) / bin_grid))
        if rt == "Max crossline":
            rules.append((prio, "i_range", v_bins))
        elif rt == "Shifted inline":
            if va is None or va == "":
                rules.append((prio, "j_range", v_bins))
            else:
                va_bins = int(round(float(va) / bin_grid))
                rules.append((prio, "j_range_at", (v_bins, va_bins)))
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
    return None   # no usable params → no offsetter side

return PointTypeOffsetter(
    mapper=side.get("map",""),
    zones_ok_filter=zones_ok_filter,
    zones_keep_filter=zones_keep_filter,
    parameters=params_out,
    snapper_max_dist=snapper_max_dist,
)
```

**Idempotence:** every call rebuilds `cfg.offsetters` from scratch — running the healer twice in a row produces identical output. The "changed?" return compares serialised before/after.

### A.4 Call site

In `project_pipeline.py`, right next to the existing healers — add in **both** `run_step` and `run_step_closure`:

```python
_heal_typed_layers(cfg, cfg.layers_ui or {}, dojo_svc, project_id)
_heal_typed_mappers(cfg, cfg.maps_ui or {}, dojo_svc, project_id)
changed |= _heal_typed_offsetters(cfg, cfg.offsetters_ui or {}, dojo_svc, project_id)
```

Ensure the existing `cfg.save(...)` at the end still fires when anything changed.

### A.5 Tests

`api/tests/test_offsetters_healer.py` (create if the dir doesn't exist — check `api/tests/` first; if absent, use the closest test location):

- **Happy path** — feed the current gassum3d `offsetters_ui` (hand-encode into the test) and assert the resulting `OffsetterOption`:
  - `s.mapper == "s_offsetter"`, `r.mapper == "r_offsetter"`.
  - `s.zones_ok_filter["zone_theo"]` has exactly 5 zones for the legacy outer config.
  - `s.parameters[0].offset_from["design_reg"] == 1`, `[1].design_reg == 2`, `[2].design_reg == 3`.
  - `s.parameters[0].rules == [(0, "j_range", 9)]` (for sli=360, bin_grid=20).
  - `s.parameters[0].design_idx == 0`, `[1] == 1`, `[2] == 2`.
- **Shifted inline with `valueAt`** — preset output → `j_range_at` tuple.
- **Unknown layer** — layer not in `layers_ui` is silently dropped from filters.
- **Missing partitioning** — side returns `None`.
- **Empty configs list** — healer no-ops, doesn't crash.

### A.6 Manual verification

```bash
api/.venv/bin/uvicorn api.app:app --reload --env-file api/.env  # restart
# trigger offsets step from UI or:
curl -X POST http://localhost:8000/project/10/pipeline/run-closure/offsets
# then inspect:
api/.venv/bin/python -c "
import pandas as pd
from pathlib import Path
p = Path('/home/johan/Documents/SEISLAB/superseis_storage/groslapin/tes1@groslapin.com/gassum_3d/work/artifacts/offsets')
for f in ['r.parquet','s.parquet']:
    df = pd.read_parquet(p/f)
    print(f, df['offset'].sum(), 'offset /', df['skipped'].sum(), 'skipped, design_reg unique=', sorted(df['design_reg'].unique()))
"
```
Success = non-zero `offset` count on at least one side, `design_reg unique` covers `{0, 1, 2, 3}`.

---

## Part B — offsets artifacts endpoint + viewport

### B.1 Backend route

**New file:** `api/routes/project_offset_artifacts.py`. Register in `api/app.py` alongside the other routers. Alternatively, add endpoints to `project_grid_artifacts.py` — either is fine; new file is cleaner given the response shape differs.

```python
class OffsetPoint(BaseModel):
    lon_theo: float
    lat_theo: float
    lon_offs: float           # equal to theo when offset=False
    lat_offs: float
    i_theo: int
    j_theo: int
    design_reg: int
    offset: bool
    skipped: bool

class OffsetArtifactResponse(BaseModel):
    ptype: Ptype
    count: int
    offset_count: int
    skipped_count: int
    bbox: list[float] | None  # union of theo + offs in WGS84
    points: list[OffsetPoint]
```

Endpoint: `GET /project/{project_id}/artifacts/offsets/{ptype}`.

Steps inside:
1. Auth + project lookup (copy from `project_grid_artifacts.py`).
2. Path: `project_dir / "work" / "artifacts" / "offsets" / f"{ptype}.parquet"`; 404 if missing.
3. `df = pd.read_parquet(path)`; early return with `bbox=None, points=[]` when empty.
4. Load referentials via `_load_referentials(project_dir)` from `dojo.v3.adapters.v3_runner` (or wherever it lives — find the helper). Get `sim_ref = ref_data["extents"][LAYERS_REFERENTIAL]`.
5. Theoretical world coords = `df["x"], df["y"]`.
6. Offset world coords: `x_offs, y_offs = ij_to_xy(df["i_offs"].values, df["j_offs"].values, sim_ref)`. For rows where `offset=False`, overwrite with `x, y` (or leave — `i_offs == i_theo` for those rows, so `ij_to_xy` should produce the theoretical coords anyway).
7. Reproject `(x, y)` and `(x_offs, y_offs)` to WGS84 via `pyproj.Transformer.from_crs(epsg, 4326, always_xy=True)`.
8. Build points list; compute bbox as union of theo + offs.

Reuse `_load_referentials` and `ij_to_xy` by importing from `dojo.v3.adapters.v3_runner`. If `_load_referentials` is private, either (a) import anyway (Python is permissive), or (b) inline its logic — it's small.

### B.2 Frontend API wrapper

**New file:** `services/api/project-offset-artifacts.ts` — mirror `project-grid-artifacts.ts`:

```ts
export interface OffsetPoint {
  lon_theo: number; lat_theo: number;
  lon_offs: number; lat_offs: number;
  i_theo: number; j_theo: number;
  design_reg: number;
  offset: boolean;
  skipped: boolean;
}

export interface OffsetArtifactResponse {
  ptype: Ptype;
  count: number;
  offset_count: number;
  skipped_count: number;
  bbox: [number, number, number, number] | null;
  points: OffsetPoint[];
}

export function fetchOffsetStations(
  projectId: number,
  ptype: Ptype,
  signal?: AbortSignal,
): Promise<OffsetArtifactResponse> {
  return requestJson(`/project/${projectId}/artifacts/offsets/${ptype}`, { signal });
}
```

### B.3 Frontend query hook

**New file:** `services/query/project-offset-artifacts.ts` — mirror `project-grid-artifacts.ts` with `useOffsetStations(projectId, ptype)` and `useInvalidateOffsetArtifacts()`. Stale-forever + retry-false. Key namespace `["offset-artifacts", projectId, "stations", ptype]`.

### B.4 Viewport component

**New file:** `components/features/project/offsets-grid-viewport.tsx`. Model after `design-grid-viewport.tsx`.

Data layers (in order, bottom to top):
1. **Region polygons** — same `visibleFiles` pattern, fetch via existing `useGridRegioning` for the active grid.
2. **Theoretical stations** — `ScatterplotLayer`, colour `[148, 163, 184, 140]` (grey), radius 3 m. Renders *every* point (R and S in two separate layers).
3. **Offset stations** — `ScatterplotLayer`, colour `R_COLOR`/`S_COLOR`, radius 5 m. Filter data to `offset=true`.
4. **Movement arcs** — `ArcLayer` from `@deck.gl/layers` between theo and offs, colour matches side, width 1, `getHeight: 0.02`. Data filtered to `offset=true`.
5. *(v2 polish, skip for now)* **Skipped markers** — small red X for `skipped=true`.

Legend:
```
[grey dot] Theoretical (n)
[R_COLOR dot] Receivers offset (k)
[S_COLOR dot] Sources offset (k)
```

`fitBounds`: union of r + s bboxes as returned by the backend.

Empty-state copy: "Click 'Show grid' to compute offsets" if 404, "No points offset yet" if data present but `offset_count == 0` on both sides.

### B.5 Page refactor

**File:** `app/(workspace)/project/offsetters/page.tsx`:

```tsx
"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ProjectOffsetters } from "@/components/features/project/project-offsetters";
import { useActiveProject } from "@/lib/use-active-project";
import { usePipelineReport } from "@/lib/use-pipeline-report";
import {
  useGridRegioning,
  useInvalidateGridArtifacts,
} from "@/services/query/project-grid-artifacts";
import { useInvalidateOffsetArtifacts } from "@/services/query/project-offset-artifacts";

const OffsetsGridViewport = dynamic(
  () => import("@/components/features/project/offsets-grid-viewport").then(
    (m) => m.OffsetsGridViewport,
  ),
  { ssr: false },
);

export default function OffsettersPage() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;
  const { state: pipelineState } = usePipelineReport();
  const invalidateGrid = useInvalidateGridArtifacts();
  const invalidateOffsets = useInvalidateOffsetArtifacts();
  const { data: regioning } = useGridRegioning(projectId);

  const prevOffsetsDone = React.useRef(false);
  React.useEffect(() => {
    const done = pipelineState.kind === "done"
      && pipelineState.target === "offsets"
      && !pipelineState.progress.error;
    if (done && !prevOffsetsDone.current && projectId) {
      invalidateOffsets.mutate(projectId);
      invalidateGrid.mutate(projectId);   // grid parquet may have changed too
    }
    prevOffsetsDone.current = done;
  }, [pipelineState, projectId, invalidateOffsets, invalidateGrid]);

  const viewport = (
    <OffsetsGridViewport
      projectId={projectId}
      regionPolygons={regioning?.files ?? []}
    />
  );

  return (
    <ProjectSettingsPage title="Offsetters" viewport={viewport}>
      <ProjectOffsetters />
    </ProjectSettingsPage>
  );
}
```

### B.6 Tests

**Backend:** integration test for the new route using a fixture parquet (hand-built with ~5 rows mixing offset=True/False, skipped=True/False). Assert:
- Count, offset_count, skipped_count match.
- For `offset=True` rows, `lon_offs != lon_theo` (after reprojection).
- For `offset=False` rows, `lon_offs == lon_theo` exactly.
- BBox is the union.

**Frontend:** skip unless test infra exists for viewport components.

---

## Part C — grid/offset option consistency

### C.1 Healer cascade

Inside `_heal_typed_offsetters`, after resolving the active config, if `active_config.designOption` is non-empty and exists in `cfg.grid`:

```python
if cfg.active_options.grid != active_config_designOption:
    cfg.active_options.grid = active_config_designOption
    changed = True
```

Document this behaviour with a comment: "Offsets depend on the theoretical grid having the right regioning. The offsetter's DesignOption and the active grid option share names by UI contract — sync them so a mismatched `active_options.grid` doesn't silently produce a regioning-free grid."

### C.2 UI guards

In `components/features/project/project-offsetters.tsx`, before the **Show grid** button's `disabled` condition, compute:

```ts
const canShowGrid = Boolean(
  projectId && !offsetsRunning &&
  active?.designOption &&
  active.sources.map && active.sources.partitioning && active.sources.params.length &&
  active.receivers.map && active.receivers.partitioning && active.receivers.params.length,
);

const disabledReason =
  !projectId ? null :
  offsetsRunning ? null :
  !active?.designOption ? "Pick a Design Option first" :
  !active.sources.map || !active.receivers.map ? "Configure Map on both sides" :
  !active.sources.partitioning || !active.receivers.partitioning ? "Set Partitioning on both sides" :
  !active.sources.params.length || !active.receivers.params.length ? "Configure at least one region parameter on both sides" :
  null;
```

Wire into the button: `disabled={!canShowGrid}` + `title={disabledReason ?? undefined}`.

### C.3 No extra API

`active_options` is already saved by `cfg.save()` after the healer runs.

---

## File map

**New:**
- `api/routes/project_offset_artifacts.py`
- `services/api/project-offset-artifacts.ts`
- `services/query/project-offset-artifacts.ts`
- `components/features/project/offsets-grid-viewport.tsx`
- `api/tests/test_offsetters_healer.py` (or wherever tests live — verify first)

**Modified:**
- `api/routes/project_sections.py` — add `_heal_typed_offsetters` helper + export it.
- `api/routes/project_pipeline.py` — call the new healer in both pipeline entry points.
- `api/app.py` — register new router if you made one.
- `app/(workspace)/project/offsetters/page.tsx` — client component, viewport wiring, invalidation.
- `components/features/project/project-offsetters.tsx` — disable **Show grid** when prereqs missing.

## Order of execution

1. A.1–A.4: healer + wiring (no user-visible change yet).
2. A.5: tests.
3. A.6: manual verify with `curl` + parquet inspection. Confirm `offset>0` and `design_reg` covers {0,1,2,3}.
4. B.1 + B.6 backend test: new route.
5. B.2–B.5: frontend wiring.
6. C.1 + C.2: option sync + UI guards.
7. End-to-end manual: open gassum3d → Offsetters → Show grid → see offset stations + arcs.

## Risks / unknowns to resolve as you go

- **Rule units.** UI stores metres; saisai takes bin units. Per-param `bin_grid = min(rpi,spi,rli,sli)/2` using the param's resolved design. Verify on the gassum3d fixture: the healer should produce `j_range=9` for sli=360 (since `360/2/20 = 9`).
- **`design_idx` consistency** with `cfg.active_grid().design_def`. The v3 `GridOption.design_def: Dict[int, DesignDef]` uses the same 0-based indexing as `cfg.design.groups`. Assume they match by convention; flag any mismatch as a warning.
- **Separator-only / empty target priority groups** — filter empties; don't emit empty `offset_to` tuples.
- **Grid step invalidation** after `active_options.grid` changes — the pipeline's fingerprinting should handle it; if not, force a re-run by bumping the grid manifest. Test this during A.6.
- **`_load_referentials` location** — find the actual import path in v3_runner before using it in the new route.
- **`LAYERS_REFERENTIAL`** — also check where this constant lives; might need `from dojo.v3.adapters.v3_runner import LAYERS_REFERENTIAL` or similar.

## Estimate

Part A: ~250 LOC + tests. Part B: ~150 LOC backend + ~250 LOC frontend. Part C: ~50 LOC. Total ~700 LOC plus fixture setup. One focused session.
