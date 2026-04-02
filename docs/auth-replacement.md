# Auth Provider Replacement

The bundled auth is a **development stub** — it accepts any credentials and issues HMAC-signed cookies. Before deploying to any shared environment, replace it with a real provider.

---

## Contract to preserve

All downstream code depends on these interfaces. The replacement must continue to satisfy them:

- **`AuthPrincipal(username, auth_type, is_admin)`** — the identity object returned after authentication.
- **Dependency functions** used in route decorators:
  - `session_auth(request) -> AuthPrincipal` — validates the session, raises 403 if invalid.
  - `session_admin_auth(principal) -> AuthPrincipal` — additionally requires `is_admin == True`.
  - `api_key_or_session_auth(request, key) -> AuthPrincipal` — accepts either mechanism.
- **Cookie-based session flow** — login sets a cookie, logout deletes it, `get_session_principal` reads it.
- **Frontend contract** — the login page POSTs to `/auth/login`, reads session via `GET /auth/session`, and logs out via `POST /auth/logout`. All three must continue to exist.

---

## Supported replacement paths

| Provider | Package | Notes |
|----------|---------|-------|
| **OAuth / OIDC** (Google, GitHub, etc.) | `authlib` + `httpx` | Redirect-based flow; replace login route with `/auth/authorize` redirect and `/auth/callback` handler |
| **Supabase Auth** | `supabase` (Python client) | Supabase issues JWTs; validate with Supabase's public key instead of HMAC |
| **Custom credentials** (email + hashed password) | `passlib[bcrypt]` | Keep the current flow but add a `users` table with hashed passwords and validate against it |

---

## Replacement sequence

1. **Install provider package** — add to `api/requirements.txt`.
2. **Add provider config** — add env vars to `api/config.py` (e.g., `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`). Update `api/.env.example` with the new keys.
3. **Replace token creation/validation** — in `api/auth.py`, replace `create_session_token` and `parse_session_token` with provider-issued tokens (JWT, Supabase token, or OAuth session). Keep `AuthPrincipal` and the three dependency functions unchanged.
4. **Replace login route** — in `api/routes/auth.py`, replace the POST `/login` endpoint:
   - For OAuth: add `/authorize` (redirect to provider) and `/callback` (exchange code for token, set cookie).
   - For Supabase: call Supabase's `sign_in_with_password`, set the returned token as cookie.
   - For custom credentials: validate against the `users` table with hashed password comparison.
5. **Update frontend login page** — in `app/(auth)/login/page.tsx`:
   - For OAuth: replace the form with a "Sign in with Google/GitHub" button that redirects to `/api/auth/authorize`.
   - For Supabase/custom: keep the form but adjust error handling for real validation errors.
6. **Set `NEXT_PUBLIC_AUTH_PROVIDER`** — any non-empty value dismisses the dev auth warning banner.
7. **Run and adapt tests** — run `cd api && pytest`. Update `api/tests/` to use the new auth flow (real credentials or test tokens).

---

## Admin detection

The stub reads admin usernames from `APP_ADMIN_USERS` env var. When replacing auth, decide how to determine admin status:
- Keep the env var approach (simplest).
- Add a `role` column to a `users` table.
- Read roles from the OAuth/OIDC provider's claims.

Update `_is_admin_username` in `api/auth.py` (or its replacement) accordingly.
