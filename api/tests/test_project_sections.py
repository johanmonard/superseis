import pytest
from api.db.models import Company, Project, User
from api.security import hash_password


async def _setup_user_with_project(db_session):
    company = Company(name="Test Co", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()
    user = User(email="dev@test.com", password_hash=hash_password("pw"), company_id=company.id, role="member", is_active=True)
    db_session.add(user)
    await db_session.commit()
    project = Project(name="Seismic Survey", company_id=company.id)
    db_session.add(project)
    await db_session.commit()
    return user, project


async def _login(client, email="dev@test.com", password="pw"):
    resp = await client.post("/auth/login", json={"username": email, "password": password})
    return resp.cookies


@pytest.mark.asyncio
async def test_get_empty_section(client, db_session):
    _, project = await _setup_user_with_project(db_session)
    cookies = await _login(client)
    resp = await client.get(f"/project/{project.id}/sections/definition", cookies=cookies)
    assert resp.status_code == 200
    assert resp.json()["data"] == {}
    assert resp.json()["updated_at"] is None


@pytest.mark.asyncio
async def test_put_and_get_section(client, db_session):
    _, project = await _setup_user_with_project(db_session)
    cookies = await _login(client)
    payload = {"client": "Acme", "country": "France", "epsg": "32631"}
    resp = await client.put(f"/project/{project.id}/sections/definition", json=payload, cookies=cookies)
    assert resp.status_code == 200
    assert resp.json()["data"]["client"] == "Acme"
    assert resp.json()["updated_at"] is not None
    resp2 = await client.get(f"/project/{project.id}/sections/definition", cookies=cookies)
    assert resp2.json()["data"]["client"] == "Acme"


@pytest.mark.asyncio
async def test_put_overwrites_existing(client, db_session):
    _, project = await _setup_user_with_project(db_session)
    cookies = await _login(client)
    await client.put(f"/project/{project.id}/sections/terrain", json={"groups": [{"name": "A"}]}, cookies=cookies)
    await client.put(f"/project/{project.id}/sections/terrain", json={"groups": [{"name": "B"}]}, cookies=cookies)
    resp = await client.get(f"/project/{project.id}/sections/terrain", cookies=cookies)
    assert resp.json()["data"]["groups"][0]["name"] == "B"


@pytest.mark.asyncio
async def test_cannot_access_other_company_project(client, db_session):
    company_a = Company(name="A Corp", is_active=True, max_users=10)
    company_b = Company(name="B Corp", is_active=True, max_users=10)
    db_session.add_all([company_a, company_b])
    await db_session.commit()
    user_b = User(email="b@b.com", password_hash=hash_password("pw"), company_id=company_b.id, role="member", is_active=True)
    db_session.add(user_b)
    await db_session.commit()
    project_a = Project(name="A's Project", company_id=company_a.id)
    db_session.add(project_a)
    await db_session.commit()
    cookies_b = await _login(client, "b@b.com", "pw")
    resp = await client.get(f"/project/{project_a.id}/sections/definition", cookies=cookies_b)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_all_sections(client, db_session):
    _, project = await _setup_user_with_project(db_session)
    cookies = await _login(client)
    await client.put(f"/project/{project.id}/sections/definition", json={"client": "X"}, cookies=cookies)
    await client.put(f"/project/{project.id}/sections/terrain", json={"groups": []}, cookies=cookies)
    resp = await client.get(f"/project/{project.id}/sections", cookies=cookies)
    assert resp.status_code == 200
    sections = {s["section"] for s in resp.json()}
    assert "definition" in sections
    assert "terrain" in sections


@pytest.mark.asyncio
async def test_invalid_section_name_rejected(client, db_session):
    _, project = await _setup_user_with_project(db_session)
    cookies = await _login(client)
    resp = await client.put(f"/project/{project.id}/sections/not_a_real_section", json={"foo": "bar"}, cookies=cookies)
    assert resp.status_code == 422
