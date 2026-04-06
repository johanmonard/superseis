# B2B Multi-Tenant Auth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the dev auth stub with real email/password authentication, add Company and User database models, and implement tenant isolation so each company's data is separated.

**Architecture:** Company and User tables with a foreign key relationship. All existing and future data tables get a `company_id` column for tenant isolation. Auth uses bcrypt password hashing + the existing HMAC session tokens. A single `get_current_user()` FastAPI dependency abstracts auth so it can later be swapped for an external provider (Clerk, WorkOS). Super-admin endpoints let the app owner manage companies and users. Company-admin endpoints let clients manage their own users.

**Tech Stack:** FastAPI, SQLAlchemy async, bcrypt (via passlib), Alembic migrations, pytest + httpx for tests. Frontend: React, TanStack Query, existing session hook pattern.

---

## Task 1: Add bcrypt dependency

**Files:**
- Modify: `api/requirements.txt`

**Step 1: Add passlib with bcrypt backend**

Add these lines to `api/requirements.txt`:

```
passlib[bcrypt]>=1.7,<2.0
```

**Step 2: Install and verify**

Run: `cd api && pip install -r requirements.txt`
Expected: passlib and bcrypt install without errors

**Step 3: Commit**

```bash
git add api/requirements.txt
git commit -m "feat(auth): add passlib[bcrypt] dependency for password hashing"
```

---

## Task 2: Add Company and User database models

**Files:**
- Modify: `api/db/models.py`
- Test: `api/tests/test_models.py`

**Step 1: Write the failing test**

Create `api/tests/test_models.py`:

```python
import pytest
from sqlalchemy import select

from api.db.models import Company, User


@pytest.mark.asyncio
async def test_create_company(db_session):
    company = Company(name="Acme Corp", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()

    result = await db_session.execute(select(Company))
    saved = result.scalar_one()
    assert saved.name == "Acme Corp"
    assert saved.is_active is True
    assert saved.max_users == 10
    assert saved.created_at is not None


@pytest.mark.asyncio
async def test_create_user_with_company(db_session):
    company = Company(name="Acme Corp", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()

    user = User(
        email="alice@acme.com",
        password_hash="fakehash",
        company_id=company.id,
        role="member",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    result = await db_session.execute(select(User))
    saved = result.scalar_one()
    assert saved.email == "alice@acme.com"
    assert saved.company_id == company.id
    assert saved.role == "member"
    assert saved.company.name == "Acme Corp"


@pytest.mark.asyncio
async def test_company_has_users_relationship(db_session):
    company = Company(name="Acme Corp", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()

    user1 = User(email="a@acme.com", password_hash="h", company_id=company.id, role="admin", is_active=True)
    user2 = User(email="b@acme.com", password_hash="h", company_id=company.id, role="member", is_active=True)
    db_session.add_all([user1, user2])
    await db_session.commit()

    await db_session.refresh(company, ["users"])
    assert len(company.users) == 2
```

Note: The `db_session` fixture must be added to `conftest.py` (see step below).

**Step 2: Add `db_session` fixture to conftest.py**

Add to `api/tests/conftest.py` after the existing `client` fixture:

```python
@pytest_asyncio.fixture
async def db_session():
    """Yield a raw async session for model-level tests."""
    async with test_session_factory() as session:
        yield session
```

**Step 3: Run test to verify it fails**

Run: `cd api && python -m pytest tests/test_models.py -v`
Expected: FAIL — `Company` and `User` not found in `api.db.models`

**Step 4: Write the Company and User models**

Replace the content of `api/db/models.py` with:

```python
"""
Domain models — Company (tenant) and User for multi-tenant B2B auth.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


class Company(Base):
    """A tenant / client organisation."""

    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    max_users: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    users: Mapped[list["User"]] = relationship("User", back_populates="company", lazy="selectin")

    def __repr__(self) -> str:
        return f"<Company id={self.id} name={self.name!r}>"


class User(Base):
    """A user belonging to a company. Roles: super_admin, owner, admin, member, viewer."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="member")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    provider_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    company: Mapped["Company"] = relationship("Company", back_populates="users", lazy="selectin")

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r} role={self.role!r}>"


# Keep the Item model until existing references are cleaned up
class Item(Base):
    """Disposable sample model. Replace with your domain entity."""

    __tablename__ = "items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
```

**Step 5: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_models.py -v`
Expected: 3 tests PASS

**Step 6: Run full test suite to check nothing broke**

Run: `cd api && python -m pytest -v`
Expected: All existing tests still pass

**Step 7: Commit**

```bash
git add api/db/models.py api/tests/test_models.py api/tests/conftest.py
git commit -m "feat(auth): add Company and User database models with tenant relationship"
```

---

## Task 3: Add password hashing utility

**Files:**
- Create: `api/security.py`
- Test: `api/tests/test_security.py`

**Step 1: Write the failing test**

Create `api/tests/test_security.py`:

```python
from api.security import hash_password, verify_password


def test_hash_and_verify():
    plain = "my-secret-password"
    hashed = hash_password(plain)
    assert hashed != plain
    assert verify_password(plain, hashed) is True


def test_wrong_password_fails():
    hashed = hash_password("correct-password")
    assert verify_password("wrong-password", hashed) is False
```

**Step 2: Run test to verify it fails**

Run: `cd api && python -m pytest tests/test_security.py -v`
Expected: FAIL — `api.security` not found

**Step 3: Write the implementation**

Create `api/security.py`:

```python
"""Password hashing — thin wrapper so the backend can be swapped later."""

from passlib.context import CryptContext

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)
```

**Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_security.py -v`
Expected: 2 tests PASS

**Step 5: Commit**

```bash
git add api/security.py api/tests/test_security.py
git commit -m "feat(auth): add bcrypt password hashing utility"
```

---

## Task 4: Replace auth stub with real user-based authentication

This is the core change. We replace the dev stub that accepts any credentials with real database-backed login.

**Files:**
- Modify: `api/auth.py` (rewrite)
- Modify: `api/routes/auth.py` (rewrite login to check DB)
- Modify: `api/config.py` (add super-admin bootstrap config)
- Test: `api/tests/test_auth.py` (rewrite)

**Step 1: Write the failing tests**

Replace `api/tests/test_auth.py` with:

```python
import pytest

from api.security import hash_password


@pytest.mark.asyncio
async def test_login_with_valid_credentials(client, seed_user):
    """Login with a real user from the database."""
    resp = await client.post("/auth/login", json={"username": "alice@acme.com", "password": "test1234"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "alice@acme.com"
    assert data["role"] == "member"
    assert data["company_name"] == "Acme Corp"
    assert "app_session" in resp.cookies


@pytest.mark.asyncio
async def test_login_with_wrong_password(client, seed_user):
    resp = await client.post("/auth/login", json={"username": "alice@acme.com", "password": "wrong"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_login_with_nonexistent_user(client):
    resp = await client.post("/auth/login", json={"username": "nobody@acme.com", "password": "test1234"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_login_inactive_user_rejected(client, seed_inactive_user):
    resp = await client.post("/auth/login", json={"username": "inactive@acme.com", "password": "test1234"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_login_inactive_company_rejected(client, seed_user_inactive_company):
    resp = await client.post("/auth/login", json={"username": "bob@dead.com", "password": "test1234"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_session_returns_user_info(client, seed_user):
    login_resp = await client.post("/auth/login", json={"username": "alice@acme.com", "password": "test1234"})
    cookies = login_resp.cookies

    resp = await client.get("/auth/session", cookies=cookies)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "alice@acme.com"
    assert data["company_name"] == "Acme Corp"


@pytest.mark.asyncio
async def test_session_without_cookie_returns_403(client):
    resp = await client.get("/auth/session")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_logout_clears_cookie(client, seed_user):
    login_resp = await client.post("/auth/login", json={"username": "alice@acme.com", "password": "test1234"})
    cookies = login_resp.cookies

    resp = await client.post("/auth/logout", cookies=cookies)
    assert resp.status_code == 200
```

**Step 2: Add seed fixtures to conftest.py**

Add to `api/tests/conftest.py`:

```python
from api.db.models import Company, User
from api.security import hash_password


@pytest_asyncio.fixture
async def seed_user(db_session):
    """Create a company + active user for auth tests."""
    company = Company(name="Acme Corp", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()

    user = User(
        email="alice@acme.com",
        password_hash=hash_password("test1234"),
        company_id=company.id,
        role="member",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def seed_inactive_user(db_session):
    """Create an inactive user."""
    company = Company(name="Acme Corp", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()

    user = User(
        email="inactive@acme.com",
        password_hash=hash_password("test1234"),
        company_id=company.id,
        role="member",
        is_active=False,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def seed_user_inactive_company(db_session):
    """Create a user whose company is deactivated."""
    company = Company(name="Dead Corp", is_active=False, max_users=10)
    db_session.add(company)
    await db_session.commit()

    user = User(
        email="bob@dead.com",
        password_hash=hash_password("test1234"),
        company_id=company.id,
        role="member",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    return user
```

**Step 3: Run tests to confirm they fail**

Run: `cd api && python -m pytest tests/test_auth.py -v`
Expected: FAIL — old auth routes return different response shapes

**Step 4: Update `api/config.py` — add super-admin config**

Add this section after the AUTH_ADMIN_USERS line in `api/config.py`:

```python
# ---------------------------------------------------------------------------
# Super admin bootstrap
# ---------------------------------------------------------------------------
# The super-admin is the app owner (you). This email gets auto-created
# on first startup if no users exist. Set a strong password in production.
SUPER_ADMIN_EMAIL = os.environ.get("APP_SUPER_ADMIN_EMAIL", "admin@superseis.com")
SUPER_ADMIN_PASSWORD = os.environ.get("APP_SUPER_ADMIN_PASSWORD", "admin")
```

**Step 5: Rewrite `api/auth.py`**

Replace `api/auth.py` entirely with:

```python
"""
Authentication — session token creation/parsing + FastAPI dependencies.

The `get_current_user` dependency is the SINGLE abstraction every route uses.
When migrating to an external provider, only this module changes.
"""

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import (
    API_KEY,
    AUTH_SESSION_COOKIE_NAME,
    AUTH_SESSION_SECRET,
    AUTH_SESSION_TTL_SECONDS,
)
from api.db.engine import get_db
from api.db.models import User

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


# ---------------------------------------------------------------------------
# Dataclass returned by auth dependencies
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class AuthPrincipal:
    user_id: int
    email: str
    company_id: int
    company_name: str
    role: str          # super_admin | owner | admin | member | viewer
    auth_type: str     # "session" | "api_key"
    is_admin: bool     # True for super_admin role


# ---------------------------------------------------------------------------
# Session token helpers (unchanged from stub — already HMAC-SHA256)
# ---------------------------------------------------------------------------
def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("utf-8"))


def _sign_payload(encoded_payload: str) -> str:
    digest = hmac.new(
        AUTH_SESSION_SECRET.encode("utf-8"),
        encoded_payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return _b64url_encode(digest)


def create_session_token(user_id: int) -> str:
    """Create a signed session token containing the user ID."""
    issued_at = int(time.time())
    payload = {
        "sub": user_id,
        "iat": issued_at,
        "exp": issued_at + AUTH_SESSION_TTL_SECONDS,
    }
    encoded_payload = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _sign_payload(encoded_payload)
    return f"{encoded_payload}.{signature}"


def parse_session_token(token: str) -> int | None:
    """Parse and verify a session token. Returns user_id or None."""
    if "." not in token:
        return None

    encoded_payload, signature = token.split(".", maxsplit=1)
    expected_signature = _sign_payload(encoded_payload)
    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        payload_bytes = _b64url_decode(encoded_payload)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None

    expires_at = int(payload.get("exp", 0))
    if expires_at <= int(time.time()):
        return None

    user_id = payload.get("sub")
    if not isinstance(user_id, int):
        return None

    return user_id


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------
async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthPrincipal:
    """THE single auth dependency. Every protected route uses this.

    When migrating to an external auth provider, only this function changes.
    """
    token = request.cookies.get(AUTH_SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authenticated")

    user_id = parse_session_token(token)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired session")

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not found or inactive")

    if not user.company.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company is inactive")

    return AuthPrincipal(
        user_id=user.id,
        email=user.email,
        company_id=user.company_id,
        company_name=user.company.name,
        role=user.role,
        auth_type="session",
        is_admin=user.role == "super_admin",
    )


async def require_admin(
    principal: AuthPrincipal = Depends(get_current_user),
) -> AuthPrincipal:
    """Require super_admin role."""
    if not principal.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return principal


async def require_company_admin(
    principal: AuthPrincipal = Depends(get_current_user),
) -> AuthPrincipal:
    """Require owner or admin role within the company."""
    if principal.role not in ("super_admin", "owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company admin privileges required")
    return principal


async def api_key_auth(key: str | None = Depends(_api_key_header)):
    """Validates the X-API-Key header (for machine-to-machine calls)."""
    if key != API_KEY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or missing API key")
```

**Step 6: Rewrite `api/routes/auth.py`**

Replace `api/routes/auth.py` entirely with:

```python
"""Auth routes — login, session, logout."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, create_session_token, get_current_user
from api.config import (
    AUTH_SESSION_COOKIE_NAME,
    AUTH_SESSION_SAMESITE,
    AUTH_SESSION_SECURE_COOKIE,
    AUTH_SESSION_TTL_SECONDS,
)
from api.db.engine import get_db
from api.db.models import User
from api.security import verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=255, description="User email address")
    password: str = Field(min_length=1, max_length=120)


class SessionResponse(BaseModel):
    user_id: int
    email: str
    company_id: int
    company_name: str
    role: str
    auth_type: str
    is_admin: bool


class LogoutResponse(BaseModel):
    ok: bool = True


def _build_session_response(principal: AuthPrincipal) -> SessionResponse:
    return SessionResponse(
        user_id=principal.user_id,
        email=principal.email,
        company_id=principal.company_id,
        company_name=principal.company_name,
        role=principal.role,
        auth_type=principal.auth_type,
        is_admin=principal.is_admin,
    )


def _set_session_cookie(response: Response, user_id: int) -> None:
    response.set_cookie(
        key=AUTH_SESSION_COOKIE_NAME,
        value=create_session_token(user_id),
        httponly=True,
        secure=AUTH_SESSION_SECURE_COOKIE,
        samesite=AUTH_SESSION_SAMESITE,
        max_age=AUTH_SESSION_TTL_SECONDS,
        path="/",
    )


@router.post("/login", response_model=SessionResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    result = await db.execute(select(User).where(User.email == payload.username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    if not user.company.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company is inactive")

    _set_session_cookie(response, user.id)

    return _build_session_response(AuthPrincipal(
        user_id=user.id,
        email=user.email,
        company_id=user.company_id,
        company_name=user.company.name,
        role=user.role,
        auth_type="session",
        is_admin=user.role == "super_admin",
    ))


@router.get("/session", response_model=SessionResponse)
async def get_session(principal: AuthPrincipal = Depends(get_current_user)) -> SessionResponse:
    return _build_session_response(principal)


@router.post("/logout", response_model=LogoutResponse)
def logout(response: Response) -> LogoutResponse:
    response.delete_cookie(
        key=AUTH_SESSION_COOKIE_NAME,
        path="/",
        secure=AUTH_SESSION_SECURE_COOKIE,
        samesite=AUTH_SESSION_SAMESITE,
    )
    return LogoutResponse()
```

**Step 7: Run auth tests**

Run: `cd api && python -m pytest tests/test_auth.py -v`
Expected: All tests PASS

**Step 8: Run full test suite**

Run: `cd api && python -m pytest -v`
Expected: All tests pass (some old tests may need updating — fix any that break due to the new auth response shape)

**Step 9: Commit**

```bash
git add api/auth.py api/routes/auth.py api/config.py api/tests/test_auth.py api/tests/conftest.py
git commit -m "feat(auth): replace dev stub with real email/password database auth"
```

---

## Task 5: Add super-admin bootstrap on startup

When the app starts and the database has zero users, auto-create the super-admin user so you can log in and start managing companies.

**Files:**
- Create: `api/bootstrap.py`
- Modify: `api/app.py` (call bootstrap in lifespan)
- Test: `api/tests/test_bootstrap.py`

**Step 1: Write the failing test**

Create `api/tests/test_bootstrap.py`:

```python
import pytest
from sqlalchemy import select

from api.bootstrap import bootstrap_super_admin
from api.db.models import Company, User


@pytest.mark.asyncio
async def test_bootstrap_creates_super_admin_when_no_users(db_session):
    await bootstrap_super_admin(db_session)

    result = await db_session.execute(select(User))
    user = result.scalar_one()
    assert user.email == "admin@superseis.com"
    assert user.role == "super_admin"
    assert user.company.name == "SuperSeis"


@pytest.mark.asyncio
async def test_bootstrap_skips_when_users_exist(db_session):
    company = Company(name="Existing", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()

    user = User(email="existing@test.com", password_hash="x", company_id=company.id, role="member", is_active=True)
    db_session.add(user)
    await db_session.commit()

    await bootstrap_super_admin(db_session)

    result = await db_session.execute(select(User))
    users = result.scalars().all()
    assert len(users) == 1
    assert users[0].email == "existing@test.com"
```

**Step 2: Run test to verify it fails**

Run: `cd api && python -m pytest tests/test_bootstrap.py -v`
Expected: FAIL — `api.bootstrap` not found

**Step 3: Write the implementation**

Create `api/bootstrap.py`:

```python
"""First-run bootstrap — creates the super-admin when the database is empty."""

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD
from api.db.models import Company, User
from api.security import hash_password


async def bootstrap_super_admin(db: AsyncSession) -> None:
    """Create the super-admin user and company if no users exist yet."""
    result = await db.execute(select(func.count()).select_from(User))
    count = result.scalar_one()
    if count > 0:
        return

    company = Company(name="SuperSeis", is_active=True, max_users=100)
    db.add(company)
    await db.flush()

    admin = User(
        email=SUPER_ADMIN_EMAIL,
        password_hash=hash_password(SUPER_ADMIN_PASSWORD),
        company_id=company.id,
        role="super_admin",
        is_active=True,
    )
    db.add(admin)
    await db.commit()
```

**Step 4: Wire bootstrap into app startup**

In `api/app.py`, inside the `lifespan` context manager, after `create_all`, add:

```python
from api.bootstrap import bootstrap_super_admin
from api.db.engine import async_session_factory

# Inside lifespan, after create_all:
async with async_session_factory() as session:
    await bootstrap_super_admin(session)
```

**Step 5: Run tests**

Run: `cd api && python -m pytest tests/test_bootstrap.py -v`
Expected: 2 tests PASS

**Step 6: Commit**

```bash
git add api/bootstrap.py api/app.py api/tests/test_bootstrap.py
git commit -m "feat(auth): bootstrap super-admin user on first startup"
```

---

## Task 6: Super-admin endpoints — manage companies

**Files:**
- Create: `api/routes/admin_companies.py`
- Modify: `api/app.py` (register router)
- Test: `api/tests/test_admin_companies.py`

**Step 1: Write the failing tests**

Create `api/tests/test_admin_companies.py`:

```python
import pytest
from api.security import hash_password
from api.db.models import Company, User


async def _login_as_super_admin(client, db_session):
    """Helper: create super-admin and return auth cookies."""
    company = Company(name="SuperSeis", is_active=True, max_users=100)
    db_session.add(company)
    await db_session.commit()
    user = User(
        email="admin@superseis.com",
        password_hash=hash_password("admin"),
        company_id=company.id,
        role="super_admin",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    resp = await client.post("/auth/login", json={"username": "admin@superseis.com", "password": "admin"})
    return resp.cookies


@pytest.mark.asyncio
async def test_create_company(client, db_session):
    cookies = await _login_as_super_admin(client, db_session)
    resp = await client.post(
        "/admin/companies",
        json={"name": "Acme Corp", "max_users": 10},
        cookies=cookies,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Acme Corp"
    assert data["is_active"] is True
    assert data["max_users"] == 10


@pytest.mark.asyncio
async def test_list_companies(client, db_session):
    cookies = await _login_as_super_admin(client, db_session)
    await client.post("/admin/companies", json={"name": "Acme"}, cookies=cookies)
    await client.post("/admin/companies", json={"name": "Beta"}, cookies=cookies)

    resp = await client.get("/admin/companies", cookies=cookies)
    assert resp.status_code == 200
    # SuperSeis + Acme + Beta = 3
    assert len(resp.json()) == 3


@pytest.mark.asyncio
async def test_deactivate_company(client, db_session):
    cookies = await _login_as_super_admin(client, db_session)
    create_resp = await client.post("/admin/companies", json={"name": "Acme"}, cookies=cookies)
    company_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/admin/companies/{company_id}",
        json={"is_active": False},
        cookies=cookies,
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_non_admin_cannot_access(client, db_session):
    cookies = await _login_as_super_admin(client, db_session)
    # Create a company + regular user
    create_resp = await client.post("/admin/companies", json={"name": "Acme"}, cookies=cookies)
    company_id = create_resp.json()["id"]

    user = User(
        email="regular@acme.com",
        password_hash=hash_password("test"),
        company_id=company_id,
        role="member",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    login_resp = await client.post("/auth/login", json={"username": "regular@acme.com", "password": "test"})
    regular_cookies = login_resp.cookies

    resp = await client.get("/admin/companies", cookies=regular_cookies)
    assert resp.status_code == 403
```

**Step 2: Run test to verify it fails**

Run: `cd api && python -m pytest tests/test_admin_companies.py -v`
Expected: FAIL

**Step 3: Write the implementation**

Create `api/routes/admin_companies.py`:

```python
"""Super-admin endpoints for managing companies (tenants)."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, require_admin
from api.db.engine import get_db
from api.db.models import Company

router = APIRouter(prefix="/admin/companies", tags=["admin-companies"])


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    max_users: int = Field(default=5, ge=1)


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    is_active: bool | None = None
    max_users: int | None = Field(default=None, ge=1)


class CompanyResponse(BaseModel):
    id: int
    name: str
    is_active: bool
    max_users: int
    created_at: str

    model_config = {"from_attributes": True}


@router.get("", response_model=list[CompanyResponse])
async def list_companies(
    _: AuthPrincipal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[CompanyResponse]:
    result = await db.execute(select(Company).order_by(Company.created_at))
    return [CompanyResponse.model_validate(c) for c in result.scalars().all()]


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    payload: CompanyCreate,
    _: AuthPrincipal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CompanyResponse:
    company = Company(name=payload.name, is_active=True, max_users=payload.max_users)
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return CompanyResponse.model_validate(company)


@router.patch("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: int,
    payload: CompanyUpdate,
    _: AuthPrincipal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CompanyResponse:
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")

    if payload.name is not None:
        company.name = payload.name
    if payload.is_active is not None:
        company.is_active = payload.is_active
    if payload.max_users is not None:
        company.max_users = payload.max_users

    await db.commit()
    await db.refresh(company)
    return CompanyResponse.model_validate(company)
```

**Step 4: Register router in `api/app.py`**

Add after the existing router imports:

```python
from api.routes.admin_companies import router as admin_companies_router
# ...
app.include_router(admin_companies_router)
```

**Step 5: Run tests**

Run: `cd api && python -m pytest tests/test_admin_companies.py -v`
Expected: 4 tests PASS

**Step 6: Commit**

```bash
git add api/routes/admin_companies.py api/app.py api/tests/test_admin_companies.py
git commit -m "feat(admin): add super-admin endpoints for company management"
```

---

## Task 7: Super-admin endpoints — manage users

**Files:**
- Create: `api/routes/admin_users.py`
- Modify: `api/app.py` (register router)
- Test: `api/tests/test_admin_users.py`

**Step 1: Write the failing tests**

Create `api/tests/test_admin_users.py`:

```python
import pytest
from api.security import hash_password
from api.db.models import Company, User


async def _login_as_super_admin(client, db_session):
    company = Company(name="SuperSeis", is_active=True, max_users=100)
    db_session.add(company)
    await db_session.commit()
    user = User(
        email="admin@superseis.com",
        password_hash=hash_password("admin"),
        company_id=company.id,
        role="super_admin",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    resp = await client.post("/auth/login", json={"username": "admin@superseis.com", "password": "admin"})
    return resp.cookies, company.id


@pytest.mark.asyncio
async def test_create_user_for_company(client, db_session):
    cookies, _ = await _login_as_super_admin(client, db_session)
    # Create a target company
    company_resp = await client.post("/admin/companies", json={"name": "Acme"}, cookies=cookies)
    company_id = company_resp.json()["id"]

    resp = await client.post(
        "/admin/users",
        json={"email": "alice@acme.com", "password": "secret123", "company_id": company_id, "role": "member"},
        cookies=cookies,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "alice@acme.com"
    assert data["company_id"] == company_id
    assert data["role"] == "member"


@pytest.mark.asyncio
async def test_list_users(client, db_session):
    cookies, _ = await _login_as_super_admin(client, db_session)

    resp = await client.get("/admin/users", cookies=cookies)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1  # At least super-admin


@pytest.mark.asyncio
async def test_deactivate_user(client, db_session):
    cookies, _ = await _login_as_super_admin(client, db_session)
    company_resp = await client.post("/admin/companies", json={"name": "Acme"}, cookies=cookies)
    company_id = company_resp.json()["id"]

    create_resp = await client.post(
        "/admin/users",
        json={"email": "alice@acme.com", "password": "secret", "company_id": company_id, "role": "member"},
        cookies=cookies,
    )
    user_id = create_resp.json()["id"]

    resp = await client.patch(f"/admin/users/{user_id}", json={"is_active": False}, cookies=cookies)
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_max_users_enforced(client, db_session):
    cookies, _ = await _login_as_super_admin(client, db_session)
    company_resp = await client.post("/admin/companies", json={"name": "Tiny", "max_users": 1}, cookies=cookies)
    company_id = company_resp.json()["id"]

    # First user — ok
    resp1 = await client.post(
        "/admin/users",
        json={"email": "a@tiny.com", "password": "s", "company_id": company_id, "role": "member"},
        cookies=cookies,
    )
    assert resp1.status_code == 201

    # Second user — should be rejected
    resp2 = await client.post(
        "/admin/users",
        json={"email": "b@tiny.com", "password": "s", "company_id": company_id, "role": "member"},
        cookies=cookies,
    )
    assert resp2.status_code == 409
```

**Step 2: Run test to verify it fails**

Run: `cd api && python -m pytest tests/test_admin_users.py -v`
Expected: FAIL

**Step 3: Write the implementation**

Create `api/routes/admin_users.py`:

```python
"""Super-admin endpoints for managing users across companies."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, require_admin
from api.db.engine import get_db
from api.db.models import Company, User
from api.security import hash_password

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


class UserCreate(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=120)
    company_id: int
    role: str = Field(default="member", pattern="^(owner|admin|member|viewer)$")


class UserUpdate(BaseModel):
    is_active: bool | None = None
    role: str | None = Field(default=None, pattern="^(owner|admin|member|viewer)$")


class UserResponse(BaseModel):
    id: int
    email: str
    company_id: int
    role: str
    is_active: bool
    created_at: str

    model_config = {"from_attributes": True}


@router.get("", response_model=list[UserResponse])
async def list_users(
    _: AuthPrincipal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[UserResponse]:
    result = await db.execute(select(User).order_by(User.created_at))
    return [UserResponse.model_validate(u) for u in result.scalars().all()]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    _: AuthPrincipal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    # Check company exists
    company_result = await db.execute(select(Company).where(Company.id == payload.company_id))
    company = company_result.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")

    # Check max_users limit
    count_result = await db.execute(
        select(func.count()).select_from(User).where(
            User.company_id == payload.company_id, User.is_active == True  # noqa: E712
        )
    )
    current_count = count_result.scalar_one()
    if current_count >= company.max_users:
        raise HTTPException(status_code=409, detail="Company has reached its maximum number of users")

    # Check email uniqueness
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        company_id=payload.company_id,
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    _: AuthPrincipal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.role is not None:
        user.role = payload.role

    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)
```

**Step 4: Register router in `api/app.py`**

```python
from api.routes.admin_users import router as admin_users_router
# ...
app.include_router(admin_users_router)
```

**Step 5: Run tests**

Run: `cd api && python -m pytest tests/test_admin_users.py -v`
Expected: 4 tests PASS

**Step 6: Commit**

```bash
git add api/routes/admin_users.py api/app.py api/tests/test_admin_users.py
git commit -m "feat(admin): add super-admin endpoints for user management"
```

---

## Task 8: Add tenant isolation dependency

Every data route must automatically filter by the current user's `company_id`. This task creates the reusable dependency.

**Files:**
- Create: `api/tenant.py`
- Test: `api/tests/test_tenant.py`

**Step 1: Write the failing test**

Create `api/tests/test_tenant.py`:

```python
import pytest
from api.db.models import Company, User
from api.security import hash_password


@pytest.mark.asyncio
async def test_project_scoped_to_company(client, db_session):
    """Users from company A cannot see company B's projects."""
    # Create two companies
    company_a = Company(name="A Corp", is_active=True, max_users=10)
    company_b = Company(name="B Corp", is_active=True, max_users=10)
    db_session.add_all([company_a, company_b])
    await db_session.commit()

    user_a = User(email="a@a.com", password_hash=hash_password("pw"), company_id=company_a.id, role="member", is_active=True)
    user_b = User(email="b@b.com", password_hash=hash_password("pw"), company_id=company_b.id, role="member", is_active=True)
    db_session.add_all([user_a, user_b])
    await db_session.commit()

    # Login as user A, create a project
    login_a = await client.post("/auth/login", json={"username": "a@a.com", "password": "pw"})
    cookies_a = login_a.cookies
    await client.post("/project", json={"name": "A's Project"}, cookies=cookies_a)

    # Login as user B, list projects — should see none
    login_b = await client.post("/auth/login", json={"username": "b@b.com", "password": "pw"})
    cookies_b = login_b.cookies
    resp = await client.get("/project", cookies=cookies_b)
    assert resp.status_code == 200
    assert len(resp.json()) == 0
```

**Step 2: Run test to verify it fails**

Run: `cd api && python -m pytest tests/test_tenant.py -v`
Expected: FAIL — Project route doesn't require auth or filter by company

**Step 3: Write the tenant module**

Create `api/tenant.py`:

```python
"""Tenant isolation — provides company_id scoping for queries."""

from fastapi import Depends

from api.auth import AuthPrincipal, get_current_user


async def get_company_id(
    principal: AuthPrincipal = Depends(get_current_user),
) -> int:
    """Dependency that returns the current user's company_id.

    Use in routes: company_id: int = Depends(get_company_id)
    Then add .where(Model.company_id == company_id) to all queries.
    """
    return principal.company_id
```

**Step 4: Add `company_id` to the Project model**

In `api/db/models.py` (or wherever Project is defined), add:

```python
company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False)
```

Note: The Project model currently lives in `api/routes/project.py`. Move it to `api/db/models.py` first.

**Step 5: Update project routes to use tenant isolation**

Update `api/routes/project.py` to:
- Depend on `get_current_user` for all endpoints
- Depend on `get_company_id` for filtering
- Set `company_id` on creation
- Filter all queries by `company_id`

```python
from api.auth import get_current_user, AuthPrincipal
from api.tenant import get_company_id

@router.get("", ...)
async def list_projects(
    company_id: int = Depends(get_company_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.company_id == company_id))
    ...

@router.post("", ...)
async def create_project(
    payload: ...,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = Project(name=payload.name, company_id=principal.company_id)
    ...
```

**Step 6: Run the tenant test**

Run: `cd api && python -m pytest tests/test_tenant.py -v`
Expected: PASS

**Step 7: Run full test suite**

Run: `cd api && python -m pytest -v`
Expected: All pass (fix any project tests that break due to new auth requirement)

**Step 8: Commit**

```bash
git add api/tenant.py api/db/models.py api/routes/project.py api/tests/test_tenant.py
git commit -m "feat(tenant): add company_id isolation to project routes"
```

---

## Task 9: Update frontend types and auth flow

**Files:**
- Modify: `services/api/auth.ts` (update session type)
- Modify: `lib/use-auth-session.ts` (no changes needed if type updates)
- Modify: `app/(workspace)/layout.tsx` (update admin check)
- Modify: `components/features/auth/login-surface.tsx` (email field label)

**Step 1: Update `AuthSession` interface**

In `services/api/auth.ts`, replace the `AuthSession` interface:

```typescript
export interface AuthSession {
  user_id: number;
  email: string;
  company_id: number;
  company_name: string;
  role: string;
  auth_type: string;
  is_admin: boolean;
}
```

**Step 2: Update workspace layout admin check**

In `app/(workspace)/layout.tsx`, the existing `session.is_admin` checks still work since the backend still returns `is_admin`.

**Step 3: Update login form label**

In `components/features/auth/login-surface.tsx`, update the username field label from "Username" to "Email" (cosmetic).

**Step 4: Verify the frontend compiles**

Run: `npm run build` (or `npx next build`)
Expected: Build succeeds

**Step 5: Commit**

```bash
git add services/api/auth.ts components/features/auth/login-surface.tsx
git commit -m "feat(auth): update frontend session type for multi-tenant auth"
```

---

## Task 10: Create Alembic migration

**Files:**
- Create: `api/alembic/versions/001_add_company_and_user.py` (auto-generated)

**Step 1: Generate migration**

Run: `cd api && alembic revision --autogenerate -m "add company and user tables"`
Expected: A migration file is created in `api/alembic/versions/`

**Step 2: Review the generated migration**

Read the file and verify it creates `companies` and `users` tables with correct columns and foreign keys.

**Step 3: Apply migration**

Run: `cd api && alembic upgrade head`
Expected: Tables created successfully

**Step 4: Commit**

```bash
git add api/alembic/versions/
git commit -m "feat(db): add migration for company and user tables"
```

---

## Summary of what each role can do after implementation

| Action | Super-admin (you) | Company owner/admin | Company member/viewer |
|--------|-------------------|--------------------|-----------------------|
| Create company | Yes | No | No |
| Activate/deactivate company | Yes | No | No |
| Create users in any company | Yes | No | No |
| Manage users in own company | Yes | Yes | No |
| Access own company's data | Yes | Yes | Yes (viewer: read-only) |
| See other companies' data | Yes (via admin endpoints) | No | No |
