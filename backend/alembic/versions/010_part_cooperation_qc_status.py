"""add cooperation incoming QC status fields on parts

Revision ID: 010
Revises: 009
Create Date: 2026-02-16
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE parts ADD COLUMN IF NOT EXISTS cooperation_qc_status VARCHAR(20)")
    op.execute("ALTER TABLE parts ADD COLUMN IF NOT EXISTS cooperation_qc_checked_at TIMESTAMPTZ")
    op.execute("ALTER TABLE parts ADD COLUMN IF NOT EXISTS cooperation_qc_comment TEXT")
    op.execute("CREATE INDEX IF NOT EXISTS ix_parts_cooperation_qc_status ON parts (cooperation_qc_status)")

    op.execute(
        """
        UPDATE parts
        SET cooperation_qc_status = 'pending'
        WHERE is_cooperation = TRUE AND cooperation_qc_status IS NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_parts_cooperation_qc_status")
    op.execute("ALTER TABLE parts DROP COLUMN IF EXISTS cooperation_qc_comment")
    op.execute("ALTER TABLE parts DROP COLUMN IF EXISTS cooperation_qc_checked_at")
    op.execute("ALTER TABLE parts DROP COLUMN IF EXISTS cooperation_qc_status")
