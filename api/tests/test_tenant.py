import pytest
from api.db.models import Company, User
from api.security import hash_password


@pytest.mark.asyncio
async def test_project_scoped_to_company(client, db_session):
    """Users from company A cannot see company B's projects."""
    company_a = Company(name="A Corp", is_active=True, max_users=10)
    company_b = Company(name="B Corp", is_active=True, max_users=10)
    db_session.add_all([company_a, company_b])
    await db_session.commit()

    user_a = User(email="a@a.com", password_hash=hash_password("pw"), company_id=company_a.id, role="member", is_active=True)
    user_b = User(email="b@b.com", password_hash=hash_password("pw"), company_id=company_b.id, role="member", is_active=True)
    db_session.add_all([user_a, user_b])
    await db_session.commit()

    login_a = await client.post("/auth/login", json={"username": "a@a.com", "password": "pw"})
    cookies_a = login_a.cookies
    await client.post("/project", json={"name": "A's Project"}, cookies=cookies_a)

    login_b = await client.post("/auth/login", json={"username": "b@b.com", "password": "pw"})
    cookies_b = login_b.cookies
    resp = await client.get("/project", cookies=cookies_b)
    assert resp.status_code == 200
    assert len(resp.json()) == 0


@pytest.mark.asyncio
async def test_project_visible_to_same_company(client, db_session):
    """Users from the same company can see each other's projects."""
    company = Company(name="Same Corp", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()

    user_a = User(email="a@same.com", password_hash=hash_password("pw"), company_id=company.id, role="member", is_active=True)
    user_b = User(email="b@same.com", password_hash=hash_password("pw"), company_id=company.id, role="member", is_active=True)
    db_session.add_all([user_a, user_b])
    await db_session.commit()

    login_a = await client.post("/auth/login", json={"username": "a@same.com", "password": "pw"})
    cookies_a = login_a.cookies
    await client.post("/project", json={"name": "Shared Project"}, cookies=cookies_a)

    login_b = await client.post("/auth/login", json={"username": "b@same.com", "password": "pw"})
    cookies_b = login_b.cookies
    resp = await client.get("/project", cookies=cookies_b)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["name"] == "Shared Project"


@pytest.mark.asyncio
async def test_unauthenticated_project_access_rejected(client):
    """Unauthenticated users cannot access projects."""
    resp = await client.get("/project")
    assert resp.status_code == 403
