"""add osm_fclass_info cache table

Revision ID: c4a12b71f803
Revises: 8ac9f073a310
Create Date: 2026-04-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4a12b71f803'
down_revision: Union[str, None] = '8ac9f073a310'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "osm_fclass_info",
        sa.Column("theme", sa.String(64), primary_key=True),
        sa.Column("fclass", sa.String(128), primary_key=True),
        sa.Column("osm_key", sa.String(64), nullable=False),
        sa.Column("osm_value", sa.String(128), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("wiki_url", sa.String(500), nullable=False),
        sa.Column("image_url", sa.String(1000), nullable=True),
        sa.Column("usage_count", sa.Integer, nullable=True),
        sa.Column("on_node", sa.Boolean, nullable=False, server_default=sa.text("0")),
        sa.Column("on_way", sa.Boolean, nullable=False, server_default=sa.text("0")),
        sa.Column("on_area", sa.Boolean, nullable=False, server_default=sa.text("0")),
        sa.Column("on_relation", sa.Boolean, nullable=False, server_default=sa.text("0")),
        sa.Column(
            "fetched_at",
            sa.DateTime,
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("osm_fclass_info")
