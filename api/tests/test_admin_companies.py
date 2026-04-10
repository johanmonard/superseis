import pytest
import pytest_asyncio
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
    assert len(resp.json()) == 3  # SuperSeis + Acme + Beta


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
