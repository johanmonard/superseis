"""
Sample model — replace with your domain models.

This file exists to demonstrate the SQLAlchemy async pattern.
Delete the Item model once you have your own.
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for all ORM models. Import this in your domain modules."""

    pass


class Item(Base):
    """Disposable sample model. Replace with your domain entity."""

    __tablename__ = "items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<Item id={self.id} name={self.name!r}>"
