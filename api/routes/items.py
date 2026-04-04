"""
REFERENCE ONLY — this route demonstrates the full-stack pattern:
FastAPI route → SQLAlchemy async → Pydantic response.

Replace with your own domain routes. Delete this file when no longer needed.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.engine import get_db
from api.db.models import Item

router = APIRouter(prefix="/items", tags=["items"])


class ItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class ItemResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ItemResponse])
async def list_items(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Item).order_by(Item.created_at.desc(), Item.id.desc()))
    return result.scalars().all()


@router.post("", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(payload: ItemCreate, db: AsyncSession = Depends(get_db)):
    item = Item(name=payload.name.strip())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Item).where(Item.id == item_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    await db.delete(item)
    await db.commit()
