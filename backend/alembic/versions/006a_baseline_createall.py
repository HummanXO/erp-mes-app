"""baseline marker for databases historically created via Base.metadata.create_all()

Revision ID: 006a_baseline_createall
Revises: 006
Create Date: 2026-02-16
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "006a_baseline_createall"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No DDL: this revision is an explicit baseline marker for create_all-era databases.
    pass


def downgrade() -> None:
    pass
