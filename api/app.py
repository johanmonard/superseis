import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.db.engine import async_session_factory, engine
from api.db.models import Base
from api.dojo import init_project_service
from api.middleware import RateLimitMiddleware
from api.routes.auth import router as auth_router
from api.routes.items import router as items_router


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Create tables on startup (safe no-op if they already exist)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    from api.bootstrap import bootstrap_super_admin
    async with async_session_factory() as session:
        await bootstrap_super_admin(session)

    # Initialize dojo ProjectService
    svc = init_project_service(storage_dir=os.environ.get("DOJO_STORAGE_DIR"))

    # Ensure the seismic subfolder exists under every known project's
    # inputs/gis tree. This makes the Files page's SEISMIC section
    # always available — even for projects that predate the feature.
    try:
        from api.seismic_gpkg import ensure_seismic_dir
        from pathlib import Path as _Path  # noqa: N812
        for pid in svc.list_projects():
            try:
                pdir = _Path(svc.get_project_dir(pid))
                ensure_seismic_dir(pdir)
            except Exception:
                # A single bad project shouldn't block startup.
                continue
    except Exception:
        pass

    yield

app = FastAPI(
    title="Workspace Starter API",
    description="Starter API layer for the workspace template.",
    lifespan=lifespan,
)


def _resolve_cors_origins() -> list[str]:
    """Resolve allowed CORS origins from env or fall back to local dev defaults."""
    raw_origins = os.environ.get("APP_CORS_ORIGINS", "").strip()
    if raw_origins:
        return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

    return [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_resolve_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Per-IP rate limiting. Configure via RATE_LIMIT_RPM and RATE_LIMIT_WINDOW_SECONDS env vars.
app.add_middleware(RateLimitMiddleware)


@app.get("/health")
def health():
    """Health check - no auth required."""
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(items_router)


from api.routes.admin_companies import router as admin_companies_router
from api.routes.admin_users import router as admin_users_router
from api.routes.crs import router as crs_router
from api.routes.osm_info import router as osm_info_router
from api.routes.project import router as project_router
from api.routes.project_files import router as project_files_router
from api.routes.project_layers import router as project_layers_router
from api.routes.project_osm import router as project_osm_router
from api.routes.project_fold import router as project_fold_router
from api.routes.project_grid_artifacts import router as project_grid_artifacts_router
from api.routes.project_offset_artifacts import router as project_offset_artifacts_router
from api.routes.project_pipeline import router as project_pipeline_router
from api.routes.project_rasters import router as project_rasters_router
from api.routes.project_sections import router as project_sections_router
from api.routes.project_design_analyze import router as project_design_analyze_router


# [new-module:import-router]


app.include_router(admin_companies_router)
app.include_router(admin_users_router)
app.include_router(crs_router)
app.include_router(osm_info_router)
app.include_router(project_router)
app.include_router(project_files_router)
app.include_router(project_layers_router)
app.include_router(project_osm_router)
app.include_router(project_fold_router)
app.include_router(project_grid_artifacts_router)
app.include_router(project_offset_artifacts_router)
app.include_router(project_pipeline_router)
app.include_router(project_rasters_router)
app.include_router(project_sections_router)
app.include_router(project_design_analyze_router)


# [new-module:register-router]
