import pytest
from api.security import hash_password
from api.db.models import Company, User


async def _login_as_super_admin(client, db_session):
    """Helper: create super-admin and return auth cookies + company id."""
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
    assert len(resp.json()) >= 1


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

    resp1 = await client.post(
        "/admin/users",
        json={"email": "a@tiny.com", "password": "s", "company_id": company_id, "role": "member"},
        cookies=cookies,
    )
    assert resp1.status_code == 201

    resp2 = await client.post(
        "/admin/users",
        json={"email": "b@tiny.com", "password": "s", "company_id": company_id, "role": "member"},
        cookies=cookies,
    )
    assert resp2.status_code == 409
