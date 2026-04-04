# Deployment Guide

Two deployment paths are documented below. Both assume:

- Auth stub has been replaced with a real provider (see `docs/auth-replacement.md`).
- `DATABASE_URL` points to Postgres (not SQLite).
- Secrets (`APP_SESSION_SECRET`, `APP_API_KEY`) are production-grade random values.
- CORS origins match the production frontend URL.

---

## Path 1: Docker Compose (Self-Hosted)

### Files to create

**`Dockerfile.api`** (project root):

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY agentic_app_template/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agentic_app_template/api/ .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

**`Dockerfile.web`** (project root):

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY agentic_app_template/package.json agentic_app_template/package-lock.json ./
RUN npm ci

COPY agentic_app_template/ .

ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_AUTH_PROVIDER
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_AUTH_PROVIDER=$NEXT_PUBLIC_AUTH_PROVIDER

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
```

**`docker-compose.yml`** (project root):

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-app}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-app}
      APP_SESSION_SECRET: ${APP_SESSION_SECRET}
      APP_API_KEY: ${APP_API_KEY}
      APP_CORS_ORIGINS: ${APP_CORS_ORIGINS:-http://localhost:3000}
      APP_SESSION_SECURE_COOKIE: "true"
      APP_ADMIN_USERS: ${APP_ADMIN_USERS:-admin}
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
      args:
        NEXT_PUBLIC_API_BASE_URL: ${NEXT_PUBLIC_API_BASE_URL:-http://localhost:8000}
        NEXT_PUBLIC_AUTH_PROVIDER: "production"
    ports:
      - "3000:3000"
    depends_on:
      - api

volumes:
  pgdata:
```

### Deploy sequence

1. Create a `.env` file at the project root with production values:
   ```
   POSTGRES_PASSWORD=<strong-random>
   APP_SESSION_SECRET=<strong-random>
   APP_API_KEY=<strong-random>
   APP_CORS_ORIGINS=https://your-domain.com
   APP_ADMIN_USERS=admin
   NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com
   ```
2. Add `asyncpg` to `api/requirements.txt` (Postgres async driver).
3. Build and start: `docker compose up --build -d`
4. Run migrations: `docker compose exec api alembic upgrade head`
5. Verify: `curl http://localhost:8000/health` should return `{"status": "ok"}`.

---

## Path 2: Platform Deploy (Vercel + Railway/Render)

### Frontend (Vercel)

1. Push the repo to GitHub.
2. Import the repo in Vercel. Set the root directory to `agentic_app_template/`.
3. Set environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_API_BASE_URL` = the backend URL (e.g., `https://my-app-api.up.railway.app`)
   - `NEXT_PUBLIC_AUTH_PROVIDER` = `production`
4. Deploy. Vercel auto-detects Next.js.

### Backend (Railway)

1. Create a new project in Railway. Add a **Postgres** plugin (provides `DATABASE_URL` automatically).
2. Add a service from the same GitHub repo.
3. Set the root directory to `agentic_app_template/api/`.
4. Set the start command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
5. Add environment variables:
   - `APP_SESSION_SECRET` = strong random value
   - `APP_API_KEY` = strong random value
   - `APP_CORS_ORIGINS` = the Vercel frontend URL (e.g., `https://my-app.vercel.app`)
   - `APP_SESSION_SECURE_COOKIE` = `true`
   - `APP_ADMIN_USERS` = comma-separated admin usernames
6. Add `asyncpg` to `api/requirements.txt`.
7. Deploy. Railway auto-installs from `requirements.txt`.
8. Run migrations: use Railway's shell or CLI: `railway run alembic upgrade head`

### Backend (Render — alternative)

1. Create a new **Web Service** from the GitHub repo.
2. Set root directory to `agentic_app_template/api/`.
3. Set build command: `pip install -r requirements.txt`
4. Set start command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
5. Add a **Postgres** database from Render dashboard. Copy `DATABASE_URL` to the web service env vars (replace `postgres://` prefix with `postgresql+asyncpg://`).
6. Add the same env vars as Railway (above).
7. Deploy, then run migrations via Render shell.

---

## CORS configuration per environment

The default `APP_CORS_ORIGINS` allows `http://127.0.0.1:3000` and `http://localhost:3000` for local development. You **must** restrict this for every other environment:

| Environment | `APP_CORS_ORIGINS` value |
|-------------|--------------------------|
| Local dev   | `http://127.0.0.1:3000,http://localhost:3000` (default) |
| Staging     | `https://staging.your-domain.com` |
| Production  | `https://your-domain.com` |

Rules:
- Use exact origins — never use `*` with `allow_credentials=True` (browsers will reject it).
- Never include `localhost` or `127.0.0.1` in staging or production.
- List multiple origins with commas if needed (e.g. `https://app.example.com,https://admin.example.com`).
- The preflight script (`npm run preflight`) will flag localhost origins.

---

## Cross-origin session cookies

The session cookie defaults to `SameSite=lax`, which works when frontend and backend share the same origin (same-origin deploy or `localhost` development). **If you deploy frontend and backend to different origins** (e.g. `app.vercel.app` → `api.railway.app`), the browser will silently drop the cookie on cross-origin fetch requests, breaking authentication.

To fix this for cross-origin deployments, set these backend env vars:

```
APP_SESSION_SAMESITE=none
APP_SESSION_SECURE_COOKIE=true
```

`SameSite=none` requires `Secure=true` (HTTPS only). Without both, the browser rejects the cookie entirely.

**Recommended deployment topologies:**

| Topology | `APP_SESSION_SAMESITE` | Notes |
|----------|------------------------|-------|
| Same origin (Docker Compose, reverse proxy) | `lax` (default) | Simplest and most secure |
| Cross-origin (Vercel + Railway/Render) | `none` | Must also set `Secure=true` and HTTPS |

When possible, prefer same-origin deployment (e.g. put the API behind a `/api` path on the same domain) to avoid cross-origin cookie complexity.

---

## Post-deploy verification

After either path:

1. Frontend health: `GET <frontend-url>/api/health` returns `{"status": "ok"}`.
2. Backend health: `GET <backend-url>/health` returns `{"status": "ok"}`.
3. Auth flow: login via the frontend, verify session cookie is set with `Secure` flag.
4. Session check: `GET /auth/session` returns the logged-in user.
5. Database: create and retrieve an item (or equivalent) to confirm DB connectivity.
6. CORS: open browser console on the frontend, verify no CORS errors on API calls.
