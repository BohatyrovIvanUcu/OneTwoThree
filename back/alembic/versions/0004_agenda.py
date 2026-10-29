"""Add agenda and ai_suggestion to meetings.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-29
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    json_type = sa.JSON().with_variant(JSONB(), "postgresql")
    op.add_column("meetings", sa.Column("agenda", json_type, nullable=True))
    op.add_column("meetings", sa.Column("ai_suggestion", json_type, nullable=True))


def downgrade() -> None:
    op.drop_column("meetings", "ai_suggestion")
    op.drop_column("meetings", "agenda")

