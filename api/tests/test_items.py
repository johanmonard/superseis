import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_items_empty(client: AsyncClient):
    response = await client.get("/items")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_item(client: AsyncClient):
    response = await client.post("/items", json={"name": "Test item"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test item"
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_create_and_list_items(client: AsyncClient):
    await client.post("/items", json={"name": "First"})
    await client.post("/items", json={"name": "Second"})

    response = await client.get("/items")
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 2
    # Most recent first
    assert items[0]["name"] == "Second"
    assert items[1]["name"] == "First"


@pytest.mark.asyncio
async def test_delete_item(client: AsyncClient):
    create_response = await client.post("/items", json={"name": "To delete"})
    item_id = create_response.json()["id"]

    delete_response = await client.delete(f"/items/{item_id}")
    assert delete_response.status_code == 204

    list_response = await client.get("/items")
    assert list_response.json() == []


@pytest.mark.asyncio
async def test_delete_nonexistent_item(client: AsyncClient):
    response = await client.delete("/items/999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_item_empty_name_rejected(client: AsyncClient):
    response = await client.post("/items", json={"name": ""})
    assert response.status_code == 422
