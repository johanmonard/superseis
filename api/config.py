import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------
API_STORAGE_DIR = Path(__file__).resolve().parent / "storage"
AUTH_STORAGE_DIR = API_STORAGE_DIR / "auth"

# ---------------------------------------------------------------------------
# API key
# ---------------------------------------------------------------------------
# Set via environment variable in production.
# The fallback default is for local development only — override before exposing.
API_KEY = os.environ.get("APP_API_KEY", "dev-key-change-in-production")


def _read_bool_env(name: str, default: bool) -> bool:
    raw_value = os.environ.get(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _read_int_env(name: str, default: int) -> int:
    raw_value = os.environ.get(name)
    if raw_value is None:
        return default
    try:
        return int(raw_value)
    except ValueError:
        return default


def _read_csv_env(name: str, default: str = "") -> list[str]:
    raw_value = os.environ.get(name, default)
    return [entry.strip() for entry in raw_value.split(",") if entry.strip()]


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
AUTH_SESSION_COOKIE_NAME = os.environ.get("APP_SESSION_COOKIE_NAME", "app_session")
AUTH_SESSION_SECRET = os.environ.get("APP_SESSION_SECRET", "change-this-in-production")
AUTH_SESSION_TTL_SECONDS = _read_int_env("APP_SESSION_TTL_SECONDS", 8 * 60 * 60)
AUTH_SESSION_SECURE_COOKIE = _read_bool_env("APP_SESSION_SECURE_COOKIE", False)
# "lax" is the safe default for same-origin deploys. Set to "none" (requires
# Secure=true) when frontend and backend live on different origins.
AUTH_SESSION_SAMESITE: str = os.environ.get("APP_SESSION_SAMESITE", "lax")
AUTH_ADMIN_USERS = [
    entry.lower()
    for entry in _read_csv_env("APP_ADMIN_USERS", "admin")
]

# ---------------------------------------------------------------------------
# Super admin bootstrap
# ---------------------------------------------------------------------------
SUPER_ADMIN_EMAIL = os.environ.get("APP_SUPER_ADMIN_EMAIL", "admin@superseis.com")
SUPER_ADMIN_PASSWORD = os.environ.get("APP_SUPER_ADMIN_PASSWORD", "admin")
