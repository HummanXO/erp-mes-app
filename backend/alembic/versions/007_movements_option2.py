"""extend logistics_entries for movement journal (option 2)

Revision ID: 007
Revises: 006a_baseline_createall
Create Date: 2026-02-16
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "007"
down_revision = "006a_baseline_createall"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Movement/transfer fields on top of existing logistics_entries table.
    op.add_column("logistics_entries", sa.Column("from_location", sa.String(length=255), nullable=True))
    op.add_column("logistics_entries", sa.Column("from_holder", sa.String(length=255), nullable=True))
    op.add_column("logistics_entries", sa.Column("to_location", sa.String(length=255), nullable=True))
    op.add_column("logistics_entries", sa.Column("to_holder", sa.String(length=255), nullable=True))
    op.add_column("logistics_entries", sa.Column("carrier", sa.String(length=100), nullable=True))
    op.add_column("logistics_entries", sa.Column("planned_eta", sa.DateTime(timezone=True), nullable=True))
    op.add_column("logistics_entries", sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("logistics_entries", sa.Column("received_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("logistics_entries", sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("logistics_entries", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("logistics_entries", sa.Column("qty_sent", sa.Integer(), nullable=True))
    op.add_column("logistics_entries", sa.Column("qty_received", sa.Integer(), nullable=True))
    op.add_column("logistics_entries", sa.Column("stage_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("logistics_entries", sa.Column("last_tracking_status", sa.String(length=255), nullable=True))
    op.add_column("logistics_entries", sa.Column("tracking_last_checked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("logistics_entries", sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    op.create_foreign_key(
        "fk_logistics_entries_stage_id",
        "logistics_entries",
        "part_stage_statuses",
        ["stage_id"],
        ["id"],
    )

    # Existing installations may already have status/tracking indexes from create_all().
    op.execute("CREATE INDEX IF NOT EXISTS ix_logistics_entries_status ON logistics_entries (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_logistics_entries_tracking_number ON logistics_entries (tracking_number)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_logistics_entries_stage_id ON logistics_entries (stage_id)")

    # Extend status CHECK with movement statuses while keeping legacy values.
    op.execute("ALTER TABLE logistics_entries DROP CONSTRAINT IF EXISTS chk_logistics_status")
    op.execute(
        """
        ALTER TABLE logistics_entries
        ADD CONSTRAINT chk_logistics_status CHECK (
            status IN (
                'pending', 'in_transit', 'received', 'completed',
                'sent', 'returned', 'cancelled'
            )
        )
        """
    )

    # Allow movement audit actions.
    op.execute("ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS chk_audit_action")
    op.execute(
        """
        ALTER TABLE audit_events
        ADD CONSTRAINT chk_audit_action CHECK (
            action IN (
                'task_created', 'task_status_changed', 'task_accepted', 'task_comment_added',
                'task_sent_for_review', 'task_approved', 'task_returned', 'task_attachment_added',
                'fact_added', 'fact_updated', 'part_created', 'part_updated', 'part_stage_changed',
                'norm_configured', 'user_login', 'user_logout', 'password_changed',
                'movement_created', 'movement_status_changed',
                'LOGIN_FAILED', 'LOGIN_RATE_LIMITED',
                'USER_CREATED_WITH_TEMP_PASSWORD', 'PASSWORD_RESET_BY_ADMIN'
            )
        )
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS chk_audit_action")
    op.execute(
        """
        ALTER TABLE audit_events
        ADD CONSTRAINT chk_audit_action CHECK (
            action IN (
                'task_created', 'task_status_changed', 'task_accepted', 'task_comment_added',
                'task_sent_for_review', 'task_approved', 'task_returned', 'task_attachment_added',
                'fact_added', 'fact_updated', 'part_created', 'part_updated', 'part_stage_changed',
                'norm_configured', 'user_login', 'user_logout', 'password_changed',
                'LOGIN_FAILED', 'LOGIN_RATE_LIMITED',
                'USER_CREATED_WITH_TEMP_PASSWORD', 'PASSWORD_RESET_BY_ADMIN'
            )
        )
        """
    )

    op.execute("ALTER TABLE logistics_entries DROP CONSTRAINT IF EXISTS chk_logistics_status")
    op.execute(
        """
        ALTER TABLE logistics_entries
        ADD CONSTRAINT chk_logistics_status CHECK (
            status IN ('pending', 'in_transit', 'received', 'completed')
        )
        """
    )

    op.execute("DROP INDEX IF EXISTS ix_logistics_entries_stage_id")
    op.drop_constraint("fk_logistics_entries_stage_id", "logistics_entries", type_="foreignkey")

    op.drop_column("logistics_entries", "raw_payload")
    op.drop_column("logistics_entries", "tracking_last_checked_at")
    op.drop_column("logistics_entries", "last_tracking_status")
    op.drop_column("logistics_entries", "stage_id")
    op.drop_column("logistics_entries", "qty_received")
    op.drop_column("logistics_entries", "qty_sent")
    op.drop_column("logistics_entries", "cancelled_at")
    op.drop_column("logistics_entries", "returned_at")
    op.drop_column("logistics_entries", "received_at")
    op.drop_column("logistics_entries", "sent_at")
    op.drop_column("logistics_entries", "planned_eta")
    op.drop_column("logistics_entries", "carrier")
    op.drop_column("logistics_entries", "to_holder")
    op.drop_column("logistics_entries", "to_location")
    op.drop_column("logistics_entries", "from_holder")
    op.drop_column("logistics_entries", "from_location")
