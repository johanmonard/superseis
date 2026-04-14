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
    init_project_service(storage_dir=os.environ.get("DOJO_STORAGE_DIR"))

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
from api.routes.project import router as project_router
from api.routes.project_files import router as project_files_router
from api.routes.project_sections import router as project_sections_router


# [new-module:import-router]


app.include_router(admin_companies_router)
app.include_router(admin_users_router)
app.include_router(project_router)
app.include_router(project_files_router)
app.include_router(project_sections_router)


# [new-module:register-router]
