"""
Domain models — Company (tenant) and User for multi-tenant B2B auth.
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
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


class Project(Base):
    """Project domain model, scoped to a company (tenant)."""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<Project id={self.id} name={self.name!r}>"



class Item(Base):
    """Disposable sample model. Replace with your domain entity."""

    __tablename__ = "items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class CrsInfo(Base):
    """App-wide cache of CRS definitions resolved via pyproj.

    Keyed by EPSG code. Populated lazily by the /crs/{epsg} route on first
    lookup; subsequent requests hit the local DB.
    """

    __tablename__ = "crs_info"

    epsg: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type_name: Mapped[str] = mapped_column(String(64), nullable=False)
    unit: Mapped[str] = mapped_column(String(64), nullable=False)
    is_projected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deprecated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    area_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    area_west: Mapped[float | None] = mapped_column(Float, nullable=True)
    area_south: Mapped[float | None] = mapped_column(Float, nullable=True)
    area_east: Mapped[float | None] = mapped_column(Float, nullable=True)
    area_north: Mapped[float | None] = mapped_column(Float, nullable=True)
    datum_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    datum_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    ellipsoid_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    ellipsoid_a: Mapped[float | None] = mapped_column(Float, nullable=True)
    ellipsoid_b: Mapped[float | None] = mapped_column(Float, nullable=True)
    ellipsoid_inv_flat: Mapped[float | None] = mapped_column(Float, nullable=True)
    prime_meridian_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prime_meridian_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    projection_method: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # JSON array of {name, value, unit} objects.
    projection_params: Mapped[list | None] = mapped_column(JSON, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class OsmFclassInfo(Base):
    """App-wide cache of OSM wiki definitions for Geofabrik fclass values.

    Populated lazily by the /osm/fclass-info route, which resolves a
    (theme, fclass) pair to its OSM tag and fetches the definition, image,
    and usage count from taginfo.openstreetmap.org. Shared across all
    users — the first hover populates the row, every subsequent request
    hits the local DB.
    """

    __tablename__ = "osm_fclass_info"

    theme: Mapped[str] = mapped_column(String(64), primary_key=True)
    fclass: Mapped[str] = mapped_column(String(128), primary_key=True)
    osm_key: Mapped[str] = mapped_column(String(64), nullable=False)
    osm_value: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    wiki_url: Mapped[str] = mapped_column(String(500), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    usage_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    on_node: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    on_way: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    on_area: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    on_relation: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
