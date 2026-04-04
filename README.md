# Workspace App Template

A starter template for building a professional workspace app with the DataHub4 UI system and agent rules already in place.

## Stack

- Frontend: Next.js 16, React 19, Tailwind CSS 4, TanStack React Query, TypeScript
- Backend: FastAPI starter with cookie-session and API-key auth helpers
- Database: SQLAlchemy async + SQLite (default), Alembic migrations
- Design system: semantic tokens, light/dark theme persistence, compact-first density tiers
- Testing: Vitest (frontend), pytest + pytest-asyncio (backend)
- Repo workflow: Husky pre-commit checks for lint and build (build includes type-checking)

## First-Time Setup

Follow these steps in order when starting a new app from this template.

### 1. Install and set up environment

```bash
npm install
npm run setup                        # copies .env files + generates backend secrets
```

This creates `.env.local` (frontend) and `api/.env` (backend) from the example files. Backend secrets are auto-generated. Review and adjust if needed.

### 2. Run the frontend

```bash
npm run dev                          # opens http://localhost:3000
```

### 3. Run the backend

```bash
cd api
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload             # opens http://localhost:8000
```

Tables are created automatically on startup. The backend will run with development defaults — set the values listed in `api/.env.example` before sharing or deploying.

### 4. Log in and explore

Open `http://localhost:3000` and log in with any username and password (the auth stub accepts all non-empty credentials). Browse the Demo pages to see reference implementations at different feature stages.

### 5. Rename the app

- Change `"name"` in `package.json` from `"my-app"` to your app name.
- Update `config/app.config.ts` to change the app name, initials, and workspace tagline in one place.

### 6. Decide what to keep

To remove the bundled Demo and Admin reference surfaces:

```bash
npm run setup -- --trim-reference     # removes Demo, Admin, and Items sample
```

Or keep them for reference (`--keep-reference` is the default). You can also run the trim later or remove individual modules with `npm run remove-module <name>`.

### 7. Create your first module

```bash
npm run new-module <module-name>     # e.g. npm run new-module work-orders
```

This scaffolds the full stack: page, feature component, API service, query hook, **backend route with model and CRUD stubs**, and wires everything into navigation, release config, page identities, and `api/app.py` automatically. A TypeScript check runs after scaffolding to verify the result is clean.

Pass `--frontend-only` to skip backend generation.

To undo: `npm run remove-module <module-name>`.

Start at Stage 1 (see `AGENTS.md > Feature Stages`).

### 8. Replace the auth stub

The dev auth banner is visible while `NEXT_PUBLIC_AUTH_PROVIDER` is unset. Replace `api/auth.py` and `api/routes/auth.py` with a real auth provider (OAuth, OIDC, etc.) before any shared or production deployment.

> **Build guard:** Production builds (`NODE_ENV=production`) will fail if `NEXT_PUBLIC_AUTH_PROVIDER` is not set. This prevents accidentally deploying the auth stub.

### 9. Run the preflight check

Before deploying, run the preflight script to catch common mistakes:

```bash
npm run preflight
```

This checks for default secrets, SQLite in production, missing auth provider, localhost CORS origins, and other deployment blockers. See `docs/environment-guide.md` for detailed environment management across tiers.

## Running Tests

```bash
# Frontend
npm test

# Backend (from api/)
cd api
pytest
```

## Environment Variables

Frontend (`.env.local`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Usually | Base URL for the FastAPI backend |
| `NEXT_PUBLIC_API_KEY` | Optional | Only needed for frontend calls that use API-key auth |
| `NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS` | Optional | Client request timeout override |
| `NEXT_PUBLIC_AUTH_PROVIDER` | Optional | Set to disable dev auth warning banner |

Backend (`api/.env.example` is the reference contract)

| Variable | Required | Purpose |
|----------|----------|---------|
| `APP_API_KEY` | Yes outside local dev | API key accepted by protected backend routes |
| `APP_SESSION_SECRET` | Yes outside local dev | HMAC signing secret for the session cookie |
| `APP_ADMIN_USERS` | Optional | Comma-separated usernames treated as admins |
| `APP_CORS_ORIGINS` | Optional | Comma-separated allowed frontend origins |
| `APP_SESSION_COOKIE_NAME` | Optional | Cookie name override |
| `APP_SESSION_TTL_SECONDS` | Optional | Session lifetime in seconds |
| `APP_SESSION_SECURE_COOKIE` | Optional | Set to `true` when serving over HTTPS |
| `APP_SESSION_SAMESITE` | Optional | Cookie SameSite policy (`lax` default; set `none` for cross-origin deploys) |
| `DATABASE_URL` | Optional | SQLAlchemy async URL (default: `sqlite+aiosqlite:///./app.db`) |
| `RATE_LIMIT_RPM` | Optional | Max requests per IP per window (default: 120) |
| `RATE_LIMIT_WINDOW_SECONDS` | Optional | Rate limit window in seconds (default: 60) |

## What Ships In The Template

- Full-width workspace shell with collapsible sidebar and config-driven navigation
- Theme persistence for light/dark mode and density attributes on `<html>`
- Canonical UI primitives, including popover, tooltip, checkbox, switch, tabs, slider, and textarea
- Cookie-backed auth/session starter flow for local development only (dev banner warns when active)
- SQLite database with SQLAlchemy async ORM and Alembic migration scaffold
- Backend and frontend test scaffolds with seed tests
- Bundled `Demo` module with Dashboard (Stage 2), Tasks (Stage 3), Items (full-stack CRUD), and Primitives showcase
- ErrorBoundary in workspace layout to catch runtime crashes gracefully
- Per-IP rate limiting middleware on the backend (configurable via env vars)
- Production preflight checker (`npm run preflight`) for deployment readiness
- Environment management guide (`docs/environment-guide.md`)
- Build-time guard that blocks production builds with the auth stub still active
- Seeded agent guidance, UI-system documentation, design memory baseline, and session-state snapshot

## Architecture

```text
components/ui/*          -> Canonical primitives
components/layout/*      -> Workspace shell infrastructure (sidebar nav, page header)
components/features/*    -> Domain UI built from primitives
components/providers/*   -> Query client and runtime config bootstrapping
app/(workspace)/*        -> Authenticated workspace routes
app/(auth)/*             -> Auth surfaces
config/app.config.ts     -> App identity and starter branding
config/*                 -> Navigation, release gating, page identities
services/api/*           -> Typed API client base
services/config/*        -> Runtime configuration resolution
services/query/*         -> QueryClient defaults
styles/*                 -> Primitive tokens + semantic globals
docs/*                   -> Agent rules, UI system, design memory, session snapshot
api/*                    -> FastAPI backend starter
api/db/*                 -> SQLAlchemy async engine, models, session factory
api/alembic/*            -> Alembic migration environment
api/tests/*              -> Backend test suite (pytest)
tests/*                  -> Frontend test suite (Vitest)
```

## Adding A Module

```bash
npm run new-module <module-name>            # full-stack (frontend + backend)
npm run new-module <module-name> --frontend-only   # frontend only
```

This generates everything and wires config automatically. Then:

1. Review the generated navigation entry, icon, and page subtitle.
2. Customise the model columns in `api/routes/<name>.py` (unless `--frontend-only`).
3. Generate a migration: `npm run db:migrate "add <table> table"`
4. Apply it: `npm run db:upgrade`

Start at Stage 1 unless a later stage is explicitly required.

## Removing A Module

```bash
npm run remove-module <module-name>
```

Removes generated files and cleans up config entries. Review the diff before committing.

## Troubleshooting

**`npm run dev` fails with module not found**
Run `npm install` first. If errors persist, delete `node_modules` and `.next`, then `npm install` again.

**Backend `uvicorn` fails to start**
Check that you activated the virtual environment and installed dependencies (`pip install -r requirements.txt`). Verify that Python 3.10+ is being used.

**Login page shows but nothing happens on submit**
The frontend needs the backend running. Ensure `NEXT_PUBLIC_API_BASE_URL` in `.env.local` points to the running backend (default: `http://127.0.0.1:8000`).

**CORS errors in the browser console**
Set `APP_CORS_ORIGINS` in `api/.env` to include your frontend origin (e.g. `http://localhost:3000`).

**Pre-commit hook blocks a commit**
The hook runs lint and build (build includes type-checking). Read the error output, fix the issue, then commit again. Never use `--no-verify` to skip.

**`alembic revision --autogenerate` generates an empty migration**
Make sure your new model file imports `Base` from `api.db.models` and that the model class is imported somewhere Alembic can discover it (e.g. in `api/db/models.py` or imported in `api/alembic/env.py`).

**Database is locked (SQLite)**
SQLite allows only one writer at a time. If you see locking errors during development, restart the backend. For production workloads, switch `DATABASE_URL` to PostgreSQL.

## Working Rules

- Use semantic tokens only. Do not style pages with raw Tailwind colors.
- Extend primitives before inventing feature-local styling.
- Update starter identity in `config/app.config.ts` instead of editing layout components.
- Keep pages orchestration-only; styling authority belongs to `components/ui/*`.
- Keep exported template snapshots source-only. Do not ship `.next/`, `node_modules/`, `.pyc`, or local build caches.
- Read `AGENTS.md` and `docs/ui-system.md` before making system-level UI changes.
