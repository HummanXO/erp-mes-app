"""add specification and access grant tables

Revision ID: 002
Revises: 001
Create Date: 2026-02-11

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "specifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("number", sa.String(length=120), nullable=False),
        sa.Column("customer", sa.String(length=255), nullable=True),
        sa.Column("deadline", sa.Date(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("published_to_operators", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.CheckConstraint("status IN ('draft', 'active', 'closed')", name="chk_specification_status"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", "number", name="uq_specification_org_number"),
    )
    op.create_index("ix_specifications_org_id", "specifications", ["org_id"], unique=False)
    op.create_index("ix_specifications_number", "specifications", ["number"], unique=False)
    op.create_index("ix_specifications_deadline", "specifications", ["deadline"], unique=False)
    op.create_index("ix_specifications_status", "specifications", ["status"], unique=False)
    op.create_index("ix_specifications_created_by", "specifications", ["created_by"], unique=False)

    op.create_table(
        "spec_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("specification_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("line_no", sa.Integer(), nullable=False),
        sa.Column("item_type", sa.String(length=20), nullable=False),
        sa.Column("part_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("qty_required", sa.Integer(), nullable=False),
        sa.Column("qty_done", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("uom", sa.String(length=20), nullable=False, server_default="шт"),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.CheckConstraint("qty_required > 0", name="chk_spec_item_qty_required_positive"),
        sa.CheckConstraint("qty_done >= 0", name="chk_spec_item_qty_done_non_negative"),
        sa.CheckConstraint("item_type IN ('make', 'coop')", name="chk_spec_item_type"),
        sa.CheckConstraint("status IN ('open', 'partial', 'fulfilled', 'blocked', 'canceled')", name="chk_spec_item_status"),
        sa.ForeignKeyConstraint(["part_id"], ["parts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["specification_id"], ["specifications.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("specification_id", "line_no", name="uq_spec_item_line_no"),
    )
    op.create_index("ix_spec_items_specification_id", "spec_items", ["specification_id"], unique=False)
    op.create_index("ix_spec_items_item_type", "spec_items", ["item_type"], unique=False)
    op.create_index("ix_spec_items_part_id", "spec_items", ["part_id"], unique=False)
    op.create_index("ix_spec_items_status", "spec_items", ["status"], unique=False)

    op.create_table(
        "access_grants",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_type", sa.String(length=30), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("permission", sa.String(length=20), nullable=False, server_default="view"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.CheckConstraint("entity_type IN ('specification', 'work_order', 'part')", name="chk_access_grant_entity_type"),
        sa.CheckConstraint("permission IN ('view', 'report', 'manage')", name="chk_access_grant_permission"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entity_type", "entity_id", "user_id", name="uq_access_grant_scope"),
    )
    op.create_index("ix_access_grants_org_id", "access_grants", ["org_id"], unique=False)
    op.create_index("ix_access_grants_entity_type", "access_grants", ["entity_type"], unique=False)
    op.create_index("ix_access_grants_entity_id", "access_grants", ["entity_id"], unique=False)
    op.create_index("ix_access_grants_user_id", "access_grants", ["user_id"], unique=False)
    op.create_index("idx_access_grants_entity_scope", "access_grants", ["entity_type", "entity_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_access_grants_entity_scope", table_name="access_grants")
    op.drop_index("ix_access_grants_user_id", table_name="access_grants")
    op.drop_index("ix_access_grants_entity_id", table_name="access_grants")
    op.drop_index("ix_access_grants_entity_type", table_name="access_grants")
    op.drop_index("ix_access_grants_org_id", table_name="access_grants")
    op.drop_table("access_grants")

    op.drop_index("ix_spec_items_status", table_name="spec_items")
    op.drop_index("ix_spec_items_part_id", table_name="spec_items")
    op.drop_index("ix_spec_items_item_type", table_name="spec_items")
    op.drop_index("ix_spec_items_specification_id", table_name="spec_items")
    op.drop_table("spec_items")

    op.drop_index("ix_specifications_created_by", table_name="specifications")
    op.drop_index("ix_specifications_status", table_name="specifications")
    op.drop_index("ix_specifications_deadline", table_name="specifications")
    op.drop_index("ix_specifications_number", table_name="specifications")
    op.drop_index("ix_specifications_org_id", table_name="specifications")
    op.drop_table("specifications")
