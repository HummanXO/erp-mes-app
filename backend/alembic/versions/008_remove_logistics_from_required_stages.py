"""remove deprecated logistics stage from parts.required_stages

Revision ID: 008
Revises: 007
Create Date: 2026-02-16
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Remove all occurrences of "logistics" while preserving order of the remaining stages.
    op.execute(
        """
        UPDATE parts
        SET required_stages = COALESCE(
            (
                SELECT jsonb_agg(stage)
                FROM jsonb_array_elements_text(parts.required_stages) AS stage
                WHERE stage <> 'logistics'
            ),
            '[]'::jsonb
        )
        WHERE required_stages ? 'logistics'
        """
    )


def downgrade() -> None:
    # Irreversible cleanup: we intentionally do not re-introduce deprecated logistics stages.
    pass
