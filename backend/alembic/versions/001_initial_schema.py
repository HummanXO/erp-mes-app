"""initial schema

Revision ID: 001
Revises: 
Create Date: 2026-02-06

"""
from alembic import op
import sqlalchemy as sa

revision = '001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Tables are created by Base.metadata.create_all() in seed/setup scripts
    # This migration just marks the schema as initialized
    pass

def downgrade() -> None:
    # No downgrade - tables managed by SQLAlchemy models
    pass
