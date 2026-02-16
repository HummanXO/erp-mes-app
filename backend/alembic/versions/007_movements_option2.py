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
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS from_location VARCHAR(255)")
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS from_holder VARCHAR(255)")
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS to_location VARCHAR(255)")
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS to_holder VARCHAR(255)")
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS carrier VARCHAR(100)")
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS planned_eta TIMESTAMPTZ")
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ")
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ")
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ")
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ")
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS qty_sent INTEGER")
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS qty_received INTEGER")
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS stage_id UUID")
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS last_tracking_status VARCHAR(255)")
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS tracking_last_checked_at TIMESTAMPTZ")
    op.execute("ALTER TABLE logistics_entries ADD COLUMN IF NOT EXISTS raw_payload JSONB")

    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'fk_logistics_entries_stage_id'
          ) THEN
            ALTER TABLE logistics_entries
              ADD CONSTRAINT fk_logistics_entries_stage_id
              FOREIGN KEY (stage_id) REFERENCES part_stage_statuses (id);
          END IF;
        END $$;
        """
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
