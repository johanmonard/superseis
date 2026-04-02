"""
Lightweight request-rate limiter for the starter API.

Uses an in-memory sliding-window counter keyed by client IP.
This is sufficient for single-process deployments (uvicorn without workers).
For multi-process or distributed setups, swap to a Redis-backed solution
such as `slowapi` (pip install slowapi) or `fastapi-limiter` with Redis.

Usage in app.py:
    from api.middleware import RateLimitMiddleware
    app.add_middleware(RateLimitMiddleware)
"""

import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


def _read_int_env(name: str, default: int) -> int:
    import os

    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Per-IP sliding-window rate limiter.

    Configure via environment variables:
        RATE_LIMIT_RPM  — max requests per window (default: 120)
        RATE_LIMIT_WINDOW_SECONDS — window size in seconds (default: 60)
    """

    def __init__(self, app, max_requests: int | None = None, window_seconds: int | None = None):
        super().__init__(app)
        self.max_requests = max_requests or _read_int_env("RATE_LIMIT_RPM", 120)
        self.window_seconds = window_seconds or _read_int_env("RATE_LIMIT_WINDOW_SECONDS", 60)
        self._hits: dict[str, list[float]] = defaultdict(list)

    def _client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next):
        ip = self._client_ip(request)
        now = time.monotonic()
        window_start = now - self.window_seconds

        # Prune expired entries
        hits = self._hits[ip]
        self._hits[ip] = [t for t in hits if t > window_start]
        hits = self._hits[ip]

        if len(hits) >= self.max_requests:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
                headers={"Retry-After": str(self.window_seconds)},
            )

        hits.append(now)
        return await call_next(request)
