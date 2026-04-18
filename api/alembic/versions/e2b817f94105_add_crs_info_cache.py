"""add crs_info cache table

Revision ID: e2b817f94105
Revises: c4a12b71f803
Create Date: 2026-04-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2b817f94105'
down_revision: Union[str, None] = 'c4a12b71f803'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "crs_info",
        sa.Column("epsg", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type_name", sa.String(64), nullable=False),
        sa.Column("unit", sa.String(64), nullable=False),
        sa.Column("is_projected", sa.Boolean, nullable=False, server_default=sa.text("0")),
        sa.Column("is_deprecated", sa.Boolean, nullable=False, server_default=sa.text("0")),
        sa.Column("area_name", sa.Text, nullable=True),
        sa.Column("area_west", sa.Float, nullable=True),
        sa.Column("area_south", sa.Float, nullable=True),
        sa.Column("area_east", sa.Float, nullable=True),
        sa.Column("area_north", sa.Float, nullable=True),
        sa.Column("datum_name", sa.String(255), nullable=True),
        sa.Column("datum_type", sa.String(128), nullable=True),
        sa.Column("ellipsoid_name", sa.String(128), nullable=True),
        sa.Column("ellipsoid_a", sa.Float, nullable=True),
        sa.Column("ellipsoid_b", sa.Float, nullable=True),
        sa.Column("ellipsoid_inv_flat", sa.Float, nullable=True),
        sa.Column("prime_meridian_name", sa.String(64), nullable=True),
        sa.Column("prime_meridian_lon", sa.Float, nullable=True),
        sa.Column("projection_method", sa.String(128), nullable=True),
        sa.Column("projection_params", sa.JSON, nullable=True),
        sa.Column(
            "fetched_at",
            sa.DateTime,
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("crs_info")
