"""Add token_version/password_changed_at to users and extend audit actions.

Revision ID: 004
Revises: 003
Create Date: 2026-02-12
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # User security columns
    op.add_column(
        "users",
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )

    # Extend audit action constraint for onboarding/auth hardening events
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
                'norm_configured', 'user_login', 'user_logout', 'password_changed'
            )
        )
        """
    )

    op.drop_column("users", "token_version")
    op.drop_column("users", "password_changed_at")

