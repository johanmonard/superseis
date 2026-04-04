# Environment Variable Management

This guide explains how to manage environment variables across local development, staging, and production without leaking secrets.

---

## Golden rule

**Never commit `.env` files or secrets to git.** The `.gitignore` already excludes `.env*` files. If you accidentally commit a secret, rotate it immediately — git history is permanent.

---

## How it works

The template ships two `.env.example` files that document every variable the app reads. These are safe to commit because they contain only placeholder values.

| File | Purpose | Copy to |
|------|---------|---------|
| `.env.example` | Frontend variables | `.env.local` |
| `api/.env.example` | Backend variables | `api/.env` |

On first setup, run the setup script which copies both files and generates random backend secrets:

```bash
npm run setup
```

Or copy manually:

```bash
cp .env.example .env.local
cp api/.env.example api/.env
```

---

## Environment tiers

### Local development

Use the defaults from `.env.example`. The auth stub works without real secrets, and SQLite requires no database server.

| Variable | Suggested value |
|----------|----------------|
| `APP_API_KEY` | `dev-key-change-me` (default) |
| `APP_SESSION_SECRET` | `replace-this-before-sharing-the-app` (default) |
| `DATABASE_URL` | `sqlite+aiosqlite:///./app.db` (default) |
| `NEXT_PUBLIC_AUTH_PROVIDER` | *(leave unset — shows dev banner)* |

### Staging / shared environment

Replace the auth stub and use real secrets. SQLite is still acceptable for low-traffic staging, but Postgres is preferred.

| Variable | How to generate |
|----------|----------------|
| `APP_API_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `APP_SESSION_SECRET` | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `NEXT_PUBLIC_AUTH_PROVIDER` | Your provider name (e.g. `oauth`, `supabase`) |
| `APP_SESSION_SECURE_COOKIE` | `true` if serving over HTTPS |
| `APP_CORS_ORIGINS` | Your staging frontend URL |

### Production

Everything from staging, plus:

| Variable | Requirement |
|----------|-------------|
| `DATABASE_URL` | Must point to Postgres (`postgresql+asyncpg://...`) |
| `APP_SESSION_SECURE_COOKIE` | Must be `true` |
| `APP_CORS_ORIGINS` | Must be the exact production frontend URL — no wildcards |
| `NEXT_PUBLIC_AUTH_PROVIDER` | Must be set (build will fail otherwise) |

Use your platform's secret management (Vercel env vars, Railway variables, Docker secrets, AWS SSM, etc.) rather than `.env` files in production.

---

## Generating strong secrets

```bash
# Python (works everywhere)
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# OpenSSL
openssl rand -base64 32
```

Use a different secret for each variable and each environment. Never reuse a development secret in production.

---

## Common mistakes to avoid

1. **Committing `.env.local` or `api/.env`** — these are gitignored, but double-check with `git status` before committing.
2. **Hardcoding secrets in source code** — always read from `process.env` (frontend) or `os.environ` (backend).
3. **Using the same secret across environments** — if staging is compromised, production should not be affected.
4. **Forgetting `APP_CORS_ORIGINS` in production** — the API will reject all frontend requests.
5. **Leaving `APP_SESSION_SECURE_COOKIE=false` over HTTPS** — the cookie won't be sent by the browser on secure connections, breaking auth silently.

---

## Preflight check

Run `npm run preflight` before deploying to verify that critical variables are set and production-unsafe defaults are not in use. See the script output for specific warnings.
