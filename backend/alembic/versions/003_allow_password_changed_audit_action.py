"""allow password_changed in audit action constraint

Revision ID: 003
Revises: 002
Create Date: 2026-02-12

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS chk_audit_action")
    op.execute(
        """
        ALTER TABLE audit_events
        ADD CONSTRAINT chk_audit_action CHECK (
            action IN (
                'task_created', 'task_status_changed', 'task_accepted', 'task_comment_added',
                'task_sent_for_review', 'task_approved', 'task_returned', 'task_attachment_added',
                'fact_added', 'fact_updated', 'part_created', 'part_updated', 'part_stage_changed',
                'norm_configured', 'user_login', 'user_logout', 'password_changed'
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
                'norm_configured', 'user_login', 'user_logout'
            )
        )
        """
    )
