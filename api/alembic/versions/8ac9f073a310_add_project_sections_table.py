"""add project_sections table

Revision ID: 8ac9f073a310
Revises: 8c075b8bf56e
Create Date: 2026-04-06 17:42:43.828146
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ac9f073a310'
down_revision: Union[str, None] = '8c075b8bf56e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_sections",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "project_id",
            sa.Integer,
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("section", sa.String(100), nullable=False),
        sa.Column("data", sa.JSON, nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime,
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("project_id", "section", name="uq_project_section"),
    )


def downgrade() -> None:
    op.drop_table("project_sections")
