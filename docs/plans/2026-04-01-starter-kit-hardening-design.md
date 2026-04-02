# Starter Kit Hardening - Design

**Date:** 2026-04-01
**Goal:** Address five engineering gaps in the agentic_app_template starter kit.

---

## 1. Database Layer (SQLite + SQLAlchemy async + Alembic)

### New files

```
api/
├── db/
│   ├── __init__.py
│   ├── engine.py          # async engine + session factory
│   └── models.py          # Base + sample Item model
├── alembic/
│   ├── env.py             # async-aware migration env
│   ├── script.py.mako     # migration template
│   └── versions/          # empty until first migration
├── alembic.ini            # sqlite+aiosqlite:///./app.db default
```

### Behavior

- `engine.py` reads `DATABASE_URL` from env, defaults to `sqlite+aiosqlite:///./app.db`.
- Exposes `get_db()` async dependency for FastAPI route injection.
- `models.py` defines `Base` and a sample `Item(id, name, created_at)` model — pattern demonstration, meant to be replaced.
- Alembic configured for async SQLAlchemy. Ready for `alembic revision --autogenerate` and `alembic upgrade head`.
- New deps: `sqlalchemy[asyncio]`, `aiosqlite`, `alembic`.
- `api/.env.example` gains `DATABASE_URL=sqlite+aiosqlite:///./app.db`.

---

## 2. Testing Scaffold

### Backend (pytest)

```
api/
├── tests/
│   ├── __init__.py
│   ├── conftest.py        # async test client, in-memory SQLite
│   ├── test_health.py     # GET /health -> 200
│   └── test_auth.py       # login/session/logout flow
```

- `conftest.py` creates `httpx.AsyncClient` with in-memory SQLite (no file cleanup).
- 3-4 seed tests covering health check and auth flow.
- New dep: `pytest-asyncio`.

### Frontend (Vitest)

```
agentic_app_template/
├── vitest.config.ts
├── tests/
│   ├── setup.ts
│   ├── components/
│   │   └── button.test.tsx     # render, click, variants
│   └── services/
│       └── client.test.ts      # API key injection, timeout
```

- New devDeps: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`.
- `package.json` gains `"test": "vitest run"` and `"test:watch": "vitest"`.
- Tests run explicitly, not in pre-commit hook.

---

## 3. Auth Stub Warning Banner

- New `components/ui/dev-banner.tsx` primitive.
- Renders a single-line amber banner: "Development auth stub active — replace before deployment."
- Displayed in the workspace layout when stub auth is detected.
- Disappears automatically once real auth replaces the stub.

---

## 4. Operations Reference Module Guardrails

- Add comment block at top of `operations-dashboard.tsx`, `operations-queue-surface.tsx`, `operations-sample-data.ts`:
  "REFERENCE ONLY — do not copy this file. Compose your features from components/ui/* primitives instead."
- Add to AGENTS.md Forbidden Patterns: "Copying reference module files as feature starting points."

---

## 5. Release Config Simplification

- Replace typed profile map with a plain `enabledModules` set and `isModuleEnabled()` helper.
- `filterNavigationForWorkspaceRelease()` stays, internals shrink.
- Add comment: "Expand to profile-based gating when you need staging/beta/GA distinctions."

---

## Implementation Order

1. Database layer (new files, no existing code depends on it)
2. Backend tests (depend on DB layer for conftest)
3. Auth warning banner (small UI addition)
4. Operations reference guardrails (comment changes only)
5. Release config simplification (refactor, existing tests unaffected)
6. Frontend tests (depend on vitest setup, independent of backend)
7. Update AGENTS.md, README.md, session-state.md, .env.example files

Steps 1-2 are sequential. Steps 3-6 are independent and can run in parallel. Step 7 is final.
