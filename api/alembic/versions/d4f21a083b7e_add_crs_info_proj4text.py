"""add proj4text to crs_info

Revision ID: d4f21a083b7e
Revises: e2b817f94105
Create Date: 2026-04-23 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4f21a083b7e'
down_revision: Union[str, None] = 'e2b817f94105'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("crs_info", sa.Column("proj4text", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("crs_info", "proj4text")
