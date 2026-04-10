import pytest
import pytest_asyncio

from api.db.models import Company, User
from api.security import hash_password


@pytest_asyncio.fixture
async def _seed_company(db_session):
    company = Company(name="Acme Corp", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()
    return company


@pytest_asyncio.fixture
async def seed_user(db_session, _seed_company):
    user = User(
        email="alice@acme.com",
        password_hash=hash_password("test1234"),
        company_id=_seed_company.id,
        role="member",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def seed_inactive_user(db_session, _seed_company):
    user = User(
        email="inactive@acme.com",
        password_hash=hash_password("test1234"),
        company_id=_seed_company.id,
        role="member",
        is_active=False,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def seed_user_inactive_company(db_session):
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


@pytest.mark.asyncio
async def test_login_with_valid_credentials(client, seed_user):
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
