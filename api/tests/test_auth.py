import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_login_sets_session_cookie(client: AsyncClient):
    response = await client.post("/auth/login", json={"username": "tester", "password": "pass"})
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "tester"
    assert data["auth_type"] == "session"
    assert "app_session" in response.cookies


@pytest.mark.asyncio
async def test_session_returns_user_after_login(client: AsyncClient):
    await client.post("/auth/login", json={"username": "tester", "password": "pass"})

    response = await client.get("/auth/session")
    assert response.status_code == 200
    assert response.json()["username"] == "tester"


@pytest.mark.asyncio
async def test_session_returns_403_without_cookie(client: AsyncClient):
    response = await client.get("/auth/session")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_logout_clears_session(client: AsyncClient):
    await client.post("/auth/login", json={"username": "tester", "password": "pass"})

    response = await client.post("/auth/logout")
    assert response.status_code == 200
    assert response.json()["ok"] is True
