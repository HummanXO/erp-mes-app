"""add part.cooperation_due_date for coop ETA independent from logistics

Revision ID: 009
Revises: 008
Create Date: 2026-02-16
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE parts ADD COLUMN IF NOT EXISTS cooperation_due_date DATE")


def downgrade() -> None:
    op.execute("ALTER TABLE parts DROP COLUMN IF EXISTS cooperation_due_date")
