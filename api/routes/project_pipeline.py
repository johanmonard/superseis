"""Pipeline endpoints — plan and run v3 workflow steps."""

from __future__ import annotations

import asyncio
import threading
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, get_current_user
from api.db.engine import get_db
from api.db.models import Project
from api.dojo import get_dojo_project_service
from api.routes.project_sections import (
    _heal_typed_layers,
    _heal_typed_mappers,
    _heal_typed_offsetters,
    _rebuild_typed_grid_design_def,
)
from api.seismic_gpkg import (
    ensure_seismic_dir,
    write_offset_grid_gpkg,
    write_theoretical_grid_gpkg,
)

from dojo.v3.adapters.v3_runner import V3Runner
from dojo.v3.domain.pipeline import STEP_ORDER, Step, StepStatus, steps_in_closure
from dojo.v3.services.pipeline_service import PipelineService
from dojo.v3.services.project_service import ProjectNotFoundError, ProjectService

router = APIRouter(prefix="/project/{project_id}/pipeline", tags=["project-pipeline"])

# In-memory progress tracking for running steps
_step_progress: dict[str, dict] = {}  # "project_id:step" → {fraction, message, messages[], done, result}

# Lazy singleton — created on first request
_pipeline_service: PipelineService | None = None


def _get_pipeline_service(dojo_svc: ProjectService) -> PipelineService:
    global _pipeline_service
    if _pipeline_service is None:
        _pipeline_service = PipelineService(dojo_svc, runner=V3Runner())
    return _pipeline_service


def _post_step_seismic_artifacts(
    dojo_svc: ProjectService,
    project_id: int,
    step: Step,
) -> None:
    """Mirror parquet output to ``inputs/gis/seismic/*.gpkg`` after a step.

    Kept tolerant: any failure to write the convenience .gpkg is silently
    swallowed so it can never fail the pipeline itself. The parquet is
    authoritative.
    """
    try:
        project_dir = dojo_svc.get_project_dir(project_id)
        cfg = dojo_svc.get_config(project_id)
        epsg = int(cfg.metadata.epsg) if cfg.metadata.epsg else 4326
    except (ProjectNotFoundError, ValueError, TypeError):
        return
    try:
        ensure_seismic_dir(project_dir)
        if step == Step.GRID:
            write_theoretical_grid_gpkg(project_dir, epsg)
        elif step == Step.OFFSETS:
            write_offset_grid_gpkg(project_dir, epsg)
    except Exception:
        # Deliberately silent — the Files page will simply lack this
        # convenience layer until the next successful run.
        pass


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


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class StepPlanResponse(BaseModel):
    step: str
    needs_run: bool
    reasons: list[str]


class PipelinePlanResponse(BaseModel):
    steps: list[StepPlanResponse]


class StepRunResponse(BaseModel):
    step: str
    status: str
    error: str | None = None
    messages: list[str] = []


class PipelineConfigResponse(BaseModel):
    """Returns the config sections relevant to each step."""
    step: str
    config_sections: dict[str, Any]
    active_options: dict[str, str]


class OptionSetInfo(BaseModel):
    """One option set: key + summary of its content."""
    key: str
    is_active: bool
    summary: dict[str, Any]


class ProjectOptionsResponse(BaseModel):
    """All option-based sections with their available keys and active selection."""
    active_options: dict[str, str]
    survey: list[OptionSetInfo]
    grid: list[OptionSetInfo]
    offsetters: list[OptionSetInfo]
    crew: list[OptionSetInfo]
    metadata: dict[str, Any]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

VALID_STEPS = frozenset(s.value for s in Step)


@router.get("/plan", response_model=PipelinePlanResponse)
async def get_plan(
    project_id: int,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> PipelinePlanResponse:
    """Get the execution plan: which steps need to run and why."""
    await _get_project_for_user(project_id, principal, db)
    pipeline_svc = _get_pipeline_service(dojo_svc)
    try:
        plan = pipeline_svc.plan(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")
    return PipelinePlanResponse(
        steps=[
            StepPlanResponse(step=sp.step.value, needs_run=sp.needs_run, reasons=sp.reasons)
            for sp in plan.steps
        ]
    )


@router.post("/run/{step_name}", response_model=StepRunResponse)
async def run_step(
    project_id: int,
    step_name: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> StepRunResponse:
    """Start a pipeline step (runs in background). Poll /progress/{step_name} for updates."""
    if step_name not in VALID_STEPS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid step '{step_name}'. Valid: {sorted(VALID_STEPS)}",
        )
    await _get_project_for_user(project_id, principal, db)
    pipeline_svc = _get_pipeline_service(dojo_svc)

    # Reconcile typed cfg.layers from layers_ui before running any step.
    # Legacy projects saved before the bridge existed would otherwise trip
    # the layers step into a no-op, and upstream steps benefit from an
    # up-to-date typed config too.
    try:
        cfg = dojo_svc.get_config(project_id)
        _heal_typed_layers(cfg, cfg.layers_ui or {}, dojo_svc, project_id)
        _heal_typed_mappers(cfg, cfg.maps_ui or {}, dojo_svc, project_id)
        _heal_typed_offsetters(cfg, cfg.offsetters_ui or {}, dojo_svc, project_id)
        if _rebuild_typed_grid_design_def(cfg):
            cfg.save(str(dojo_svc.get_project_dir(project_id) / "config.json"))
    except ProjectNotFoundError:
        pass

    progress_key = f"{project_id}:{step_name}"

    # If already running, return current status
    if progress_key in _step_progress and not _step_progress[progress_key]["done"]:
        p = _step_progress[progress_key]
        return StepRunResponse(
            step=step_name, status="running", error=None,
            messages=list(p["messages"]),
        )

    # Initialize progress tracking
    _step_progress[progress_key] = {
        "fraction": 0.0, "message": "Starting...",
        "messages": [], "done": False, "result": None,
    }

    def progress_cb(fraction: float, message: str) -> None:
        p = _step_progress.get(progress_key)
        if p:
            p["fraction"] = fraction
            p["message"] = message
            p["messages"].append(f"[{fraction:.0%}] {message}")

    def run_in_thread():
        try:
            step = Step(step_name)
            manifest = pipeline_svc.run_step(project_id, step, progress_cb)
            _step_progress[progress_key]["result"] = {
                "status": manifest.status.value,
                "error": manifest.error,
            }
            if manifest.status == StepStatus.COMPLETED:
                _post_step_seismic_artifacts(dojo_svc, project_id, step)
        except ProjectNotFoundError:
            _step_progress[progress_key]["result"] = {
                "status": "failed", "error": "Dojo project not found",
            }
        except Exception as e:
            _step_progress[progress_key]["result"] = {
                "status": "failed", "error": str(e),
            }
        finally:
            _step_progress[progress_key]["done"] = True

    thread = threading.Thread(target=run_in_thread, daemon=True)
    thread.start()

    return StepRunResponse(
        step=step_name, status="running", error=None, messages=["Step started"],
    )


@router.post("/run-closure/{step_name}")
async def run_step_closure(
    project_id: int,
    step_name: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> dict[str, Any]:
    """Run a step plus every dirty upstream step in topological order.

    Callers poll ``/pipeline/progress-closure/{step_name}`` for incremental
    updates. The endpoint returns 202-equivalent immediately — the actual
    work happens in a background thread so the request doesn't block.
    """
    if step_name not in VALID_STEPS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid step '{step_name}'. Valid: {sorted(VALID_STEPS)}",
        )
    await _get_project_for_user(project_id, principal, db)
    pipeline_svc = _get_pipeline_service(dojo_svc)

    # Reconcile typed config blobs from the UI sections so the first run on
    # a legacy project produces real artifacts.
    try:
        cfg = dojo_svc.get_config(project_id)
        _heal_typed_layers(cfg, cfg.layers_ui or {}, dojo_svc, project_id)
        _heal_typed_mappers(cfg, cfg.maps_ui or {}, dojo_svc, project_id)
        _heal_typed_offsetters(cfg, cfg.offsetters_ui or {}, dojo_svc, project_id)
        if _rebuild_typed_grid_design_def(cfg):
            cfg.save(str(dojo_svc.get_project_dir(project_id) / "config.json"))
    except ProjectNotFoundError:
        pass

    target_step = Step(step_name)
    progress_key = f"{project_id}:closure:{step_name}"

    # If a closure run is already in progress for this target, just return
    # its current state — idempotent for the UI polling loop.
    existing = _step_progress.get(progress_key)
    if existing and not existing["done"]:
        return _serialize_closure(existing)

    # Resolve dirty upstream + the target itself, preserving topological
    # order from STEP_ORDER.
    try:
        plan = pipeline_svc.plan(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")
    closure_set = set(steps_in_closure([target_step]))
    plan_by_step = {sp.step: sp for sp in plan.steps}
    steps_to_run: list[Step] = []
    for step in STEP_ORDER:
        if step not in closure_set:
            continue
        sp = plan_by_step.get(step)
        # Always run the target (even if clean) so the viewport reflects
        # the current config; otherwise only run dirty steps.
        if step == target_step or (sp is not None and sp.needs_run):
            steps_to_run.append(step)

    state: dict[str, Any] = {
        "target": step_name,
        "steps": [
            {
                "step": s.value,
                "status": "pending",
                "fraction": 0.0,
                "message": "",
                "messages": [],
                "error": None,
            }
            for s in steps_to_run
        ],
        "current_index": 0,
        "done": False,
        "error": None,
    }
    _step_progress[progress_key] = state

    if not steps_to_run:
        state["done"] = True
        return _serialize_closure(state)

    def run_in_thread():
        for idx, step in enumerate(steps_to_run):
            state["current_index"] = idx
            entry = state["steps"][idx]
            entry["status"] = "running"

            def cb(frac: float, msg: str, _entry=entry) -> None:
                _entry["fraction"] = frac
                _entry["message"] = msg
                _entry["messages"].append(f"[{frac:.0%}] {msg}")

            try:
                manifest = pipeline_svc.run_step(project_id, step, cb)
                if manifest.status == StepStatus.FAILED:
                    entry["status"] = "failed"
                    entry["error"] = manifest.error or "Step failed"
                    state["error"] = f"{step.value}: {entry['error']}"
                    # Skip remaining steps on failure
                    for j in range(idx + 1, len(state["steps"])):
                        state["steps"][j]["status"] = "skipped"
                    break
                entry["status"] = "completed"
                entry["fraction"] = 1.0
                _post_step_seismic_artifacts(dojo_svc, project_id, step)
            except ProjectNotFoundError:
                entry["status"] = "failed"
                entry["error"] = "Dojo project not found"
                state["error"] = entry["error"]
                break
            except Exception as exc:  # pragma: no cover — surface unexpected errors
                entry["status"] = "failed"
                entry["error"] = str(exc)
                state["error"] = f"{step.value}: {entry['error']}"
                break
        state["done"] = True

    threading.Thread(target=run_in_thread, daemon=True).start()
    return _serialize_closure(state)


@router.get("/progress-closure/{step_name}")
async def get_closure_progress(
    project_id: int,
    step_name: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Poll progress of a closure run."""
    progress_key = f"{project_id}:closure:{step_name}"
    p = _step_progress.get(progress_key)
    if p is None:
        return {
            "target": step_name,
            "steps": [],
            "current_index": 0,
            "done": False,
            "error": None,
            "running": False,
        }
    return _serialize_closure(p)


def _serialize_closure(state: dict[str, Any]) -> dict[str, Any]:
    """Copy the shared state into a response-safe dict."""
    return {
        "target": state["target"],
        "steps": [
            {
                "step": s["step"],
                "status": s["status"],
                "fraction": s["fraction"],
                "message": s["message"],
                "messages": list(s["messages"]),
                "error": s["error"],
            }
            for s in state["steps"]
        ],
        "current_index": state["current_index"],
        "done": state["done"],
        "error": state["error"],
        "running": not state["done"],
    }


@router.get("/progress/{step_name}")
async def get_step_progress(
    project_id: int,
    step_name: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Poll progress of a running step."""
    progress_key = f"{project_id}:{step_name}"
    p = _step_progress.get(progress_key)
    if p is None:
        return {"running": False, "fraction": 0, "message": "", "messages": [], "done": False, "result": None}
    return {
        "running": not p["done"],
        "fraction": p["fraction"],
        "message": p["message"],
        "messages": list(p["messages"]),
        "done": p["done"],
        "result": p["result"],
    }


@router.get("/status")
async def get_pipeline_status(
    project_id: int,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> dict[str, Any]:
    """Get status of all pipeline steps."""
    await _get_project_for_user(project_id, principal, db)
    pipeline_svc = _get_pipeline_service(dojo_svc)
    try:
        statuses = pipeline_svc.get_pipeline_status(project_id)
        return {
            step.value: {
                "status": manifest.status.value,
                "error": manifest.error,
                "fingerprint": manifest.config_fingerprint,
            }
            for step, manifest in statuses.items()
        }
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")


@router.post("/reset")
async def reset_pipeline(
    project_id: int,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> dict[str, str]:
    """Reset all pipeline manifests so every step shows as dirty."""
    await _get_project_for_user(project_id, principal, db)
    pipeline_svc = _get_pipeline_service(dojo_svc)
    try:
        pipeline_svc.reset_manifests(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")
    return {"status": "reset"}


@router.post("/reset/{step_name}")
async def reset_pipeline_step(
    project_id: int,
    step_name: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> dict[str, str]:
    """Reset a single step's manifest so that step (and its dependents) is dirty."""
    if step_name not in VALID_STEPS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid step '{step_name}'. Valid: {sorted(VALID_STEPS)}",
        )
    await _get_project_for_user(project_id, principal, db)
    pipeline_svc = _get_pipeline_service(dojo_svc)
    try:
        pipeline_svc.reset_step_manifest(project_id, Step(step_name))
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")
    return {"status": "reset", "step": step_name}


@router.get("/step-config/{step_name}", response_model=PipelineConfigResponse)
async def get_step_config(
    project_id: int,
    step_name: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> PipelineConfigResponse:
    """Get the config sections relevant to a specific step."""
    if step_name not in VALID_STEPS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid step '{step_name}'. Valid: {sorted(VALID_STEPS)}",
        )
    await _get_project_for_user(project_id, principal, db)
    try:
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")

    config_dict = cfg.model_dump()

    # Same mapping as pipeline.py _extract_relevant_config
    step_sections: dict[str, list[str]] = {
        "referentials": ["survey"],
        "gis_files": ["survey"],
        "layers": ["survey", "layers"],
        "mappers": ["layers", "mappers"],
        "grid": ["survey", "grid", "mappers"],
        "sequences": ["grid", "resources"],
        "simulations": ["grid", "resources", "crew"],
        "costs": ["resources", "financial", "costing_options"],
    }

    sections: dict[str, Any] = {}
    for section in step_sections.get(step_name, []):
        sections[section] = config_dict.get(section, {})

    active = config_dict.get("active_options", {})

    return PipelineConfigResponse(
        step=step_name,
        config_sections=sections,
        active_options=active,
    )


@router.get("/options", response_model=ProjectOptionsResponse)
async def get_project_options(
    project_id: int,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> ProjectOptionsResponse:
    """Return all option-based sections with available keys and active selection."""
    await _get_project_for_user(project_id, principal, db)
    try:
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")

    active = cfg.active_options

    def _survey_summary(key: str, opt: Any) -> dict[str, Any]:
        return {
            "acq_polygon": opt.acq_polygon,
            "pois": opt.pois,
            "extents_count": len(opt.extents),
        }

    def _grid_summary(key: str, opt: Any) -> dict[str, Any]:
        designs = {}
        for idx, d in opt.design_def.items():
            designs[str(idx)] = {
                "area": d.area,
                "rpi": d.rpi, "rli": d.rli,
                "spi": d.spi, "sli": d.sli,
            }
        return {
            "resolution": opt.resolution,
            "origin": list(opt.origin),
            "designs": designs,
            "regioning_count": len(opt.regioning),
        }

    def _offsetter_summary(key: str, opt: Any) -> dict[str, Any]:
        return {
            "s_mapper": opt.s.mapper if opt.s else "",
            "r_mapper": opt.r.mapper if opt.r else "",
        }

    def _crew_summary(key: str, opt: Any) -> dict[str, Any]:
        return {
            "departments": list(opt.structure.keys()),
            "workers": opt.workers,
        }

    return ProjectOptionsResponse(
        active_options=active.model_dump(),
        metadata={
            "project_name": cfg.metadata.project_name,
            "client": cfg.metadata.client,
            "contractor": cfg.metadata.contractor,
            "country": cfg.metadata.country,
            "region": cfg.metadata.region,
            "epsg": cfg.metadata.epsg,
            "crsName": cfg.metadata.crsName,
        },
        survey=[
            OptionSetInfo(key=k, is_active=(k == active.survey), summary=_survey_summary(k, v))
            for k, v in cfg.survey.items()
        ],
        grid=[
            OptionSetInfo(key=k, is_active=(k == active.grid), summary=_grid_summary(k, v))
            for k, v in cfg.grid.items()
        ],
        offsetters=[
            OptionSetInfo(key=k, is_active=(k == active.offsetter), summary=_offsetter_summary(k, v))
            for k, v in cfg.offsetters.items()
        ],
        crew=[
            OptionSetInfo(key=k, is_active=(k == active.crew), summary=_crew_summary(k, v))
            for k, v in cfg.crew.items()
        ],
    )


class SetActiveOptionRequest(BaseModel):
    section: str  # "survey", "grid", "offsetter", "crew"
    key: str      # option set key to activate


@router.put("/options/active")
async def set_active_option(
    project_id: int,
    body: SetActiveOptionRequest,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dojo_svc: ProjectService = Depends(get_dojo_project_service),
) -> dict[str, str]:
    """Set the active option for a given section."""
    await _get_project_for_user(project_id, principal, db)
    try:
        cfg = dojo_svc.get_config(project_id)
    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="Dojo project not found")

    valid_sections = {"survey", "grid", "offsetter", "crew", "costing"}
    if body.section not in valid_sections:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid section '{body.section}'. Valid: {sorted(valid_sections)}",
        )

    setattr(cfg.active_options, body.section, body.key)

    project_dir = dojo_svc.get_project_dir(project_id)
    cfg.save(str(project_dir / "config.json"))

    return {"section": body.section, "key": body.key}
