"""Ensure users.must_change_password exists and is NOT NULL.

Revision ID: 006
Revises: 005
Create Date: 2026-02-13
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    row = conn.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = :table_name
              AND column_name = :column_name
            LIMIT 1
            """
        ),
        {"table_name": table_name, "column_name": column_name},
    ).fetchone()
    return bool(row)


def upgrade() -> None:
    conn = op.get_bind()

    if not _column_exists(conn, "users", "must_change_password"):
        op.add_column(
            "users",
            sa.Column(
                "must_change_password",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        )
        return

    # Existing column: enforce NOT NULL + default false.
    conn.execute(sa.text("UPDATE users SET must_change_password = false WHERE must_change_password IS NULL"))
    op.alter_column(
        "users",
        "must_change_password",
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.text("false"),
    )


def downgrade() -> None:
    op.drop_column("users", "must_change_password")

