"""SQLAlchemy models - FULL VERSION with all fixes for A/B/C/D requirements."""
from sqlalchemy import (
    Boolean, Column, String, Integer, Date, DateTime, Text, 
    ForeignKey, CheckConstraint, Index, UniqueConstraint, ARRAY
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from datetime import datetime
from .database import Base


class Organization(Base):
    """Organization model (multi-tenant support)."""
    __tablename__ = "organizations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    users = relationship("User", back_populates="organization")
    machines = relationship("Machine", back_populates="organization")
    parts = relationship("Part", back_populates="organization")


class User(Base):
    """User model."""
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    # When the password was last changed (user-initiated change or admin reset).
    password_changed_at = Column(DateTime(timezone=True), nullable=True)
    # Monotonically increasing version used to revoke previously issued tokens.
    token_version = Column(Integer, nullable=False, default=0)
    name = Column(String(255), nullable=False)
    initials = Column(String(50), nullable=False)
    role = Column(String(50), nullable=False, index=True)
    telegram_chat_id = Column(String(50), nullable=True)  # Can be NULL if unlinked/blocked
    email = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=False, nullable=False)  # Force password change on first login
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        CheckConstraint(
            role.in_(['admin', 'director', 'chief_engineer', 'shop_head', 'supply', 'master', 'operator']),
            name='chk_user_role'
        ),
    )
    
    # Relationships
    organization = relationship("Organization", back_populates="users")
    created_tasks = relationship("Task", foreign_keys="Task.creator_id", back_populates="creator")
    accepted_tasks = relationship("Task", foreign_keys="Task.accepted_by_id", back_populates="accepted_by")


class RefreshSession(Base):
    """Refresh session for refresh-token rotation (server-side replay protection)."""

    __tablename__ = "refresh_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # JWT ID (jti) stored server-side to detect refresh token replay.
    jti = Column(String(64), nullable=False, unique=True, index=True)
    issued_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True, index=True)
    replaced_by_jti = Column(String(64), nullable=True)
    created_ip = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    user = relationship("User")


class TelegramLinkToken(Base):
    """Telegram link token for /start <token> flow."""
    __tablename__ = "telegram_link_tokens"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User")
    
    __table_args__ = (
        Index('idx_telegram_tokens_valid', 'token', 'expires_at', postgresql_where=(used_at == None)),
    )


class Machine(Base):
    """Machine/equipment model."""
    __tablename__ = "machines"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(100), nullable=True)
    department = Column(String(50), nullable=False, index=True)
    rate_per_shift = Column(Integer, default=400)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        CheckConstraint(
            department.in_(['machining', 'fitting', 'galvanic', 'heat_treatment', 'grinding', 'qc', 'logistics']),
            name='chk_machine_department'
        ),
    )
    
    # Relationships
    organization = relationship("Organization", back_populates="machines")
    parts = relationship("Part", back_populates="machine")


class Part(Base):
    """Part/product model."""
    __tablename__ = "parts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), index=True)
    code = Column(String(100), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    qty_plan = Column(Integer, nullable=False)
    qty_done = Column(Integer, default=0)
    priority = Column(String(20), default='medium')
    deadline = Column(Date, nullable=False, index=True)
    status = Column(String(20), default='not_started', index=True)
    drawing_url = Column(Text, nullable=True)
    is_cooperation = Column(Boolean, default=False, index=True)
    cooperation_partner = Column(String(255), nullable=True)
    machine_id = Column(UUID(as_uuid=True), ForeignKey("machines.id"), index=True, nullable=True)
    customer = Column(String(255), nullable=True)
    required_stages = Column(JSONB, nullable=False, default=[])
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        CheckConstraint(qty_plan > 0, name='chk_part_qty_plan_positive'),
        CheckConstraint(qty_done >= 0, name='chk_part_qty_done_non_negative'),
        CheckConstraint(
            priority.in_(['high', 'medium', 'low']),
            name='chk_part_priority'
        ),
        CheckConstraint(
            status.in_(['not_started', 'in_progress', 'done']),
            name='chk_part_status'
        ),
        UniqueConstraint('org_id', 'code', name='uq_part_org_code'),
    )
    
    # Relationships
    organization = relationship("Organization", back_populates="parts")
    machine = relationship("Machine", back_populates="parts")
    stage_statuses = relationship("PartStageStatus", back_populates="part", cascade="all, delete-orphan")
    stage_facts = relationship("StageFact", back_populates="part")
    tasks = relationship("Task", back_populates="part")
    spec_items = relationship("SpecItem", back_populates="part")


class Specification(Base):
    """Production specification model."""
    __tablename__ = "specifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), index=True, nullable=False)
    number = Column(String(120), nullable=False, index=True)
    customer = Column(String(255), nullable=True)
    deadline = Column(Date, nullable=True, index=True)
    note = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="draft", index=True)
    published_to_operators = Column(Boolean, default=False, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint(
            status.in_(["draft", "active", "closed"]),
            name="chk_specification_status",
        ),
        UniqueConstraint("org_id", "number", name="uq_specification_org_number"),
    )

    items = relationship("SpecItem", back_populates="specification", cascade="all, delete-orphan")


class SpecItem(Base):
    """Specification item model."""
    __tablename__ = "spec_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    specification_id = Column(
        UUID(as_uuid=True),
        ForeignKey("specifications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    line_no = Column(Integer, nullable=False)
    item_type = Column(String(20), nullable=False, index=True)
    part_id = Column(
        UUID(as_uuid=True),
        ForeignKey("parts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    description = Column(Text, nullable=False)
    qty_required = Column(Integer, nullable=False)
    qty_done = Column(Integer, nullable=False, default=0)
    uom = Column(String(20), nullable=False, default="шт")
    comment = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="open", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint(qty_required > 0, name="chk_spec_item_qty_required_positive"),
        CheckConstraint(qty_done >= 0, name="chk_spec_item_qty_done_non_negative"),
        CheckConstraint(
            item_type.in_(["make", "coop"]),
            name="chk_spec_item_type",
        ),
        CheckConstraint(
            status.in_(["open", "partial", "fulfilled", "blocked", "canceled"]),
            name="chk_spec_item_status",
        ),
        UniqueConstraint("specification_id", "line_no", name="uq_spec_item_line_no"),
    )

    specification = relationship("Specification", back_populates="items")
    part = relationship("Part", back_populates="spec_items")


class AccessGrant(Base):
    """Per-entity access grants for operators."""
    __tablename__ = "access_grants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), index=True, nullable=False)
    entity_type = Column(String(30), nullable=False, index=True)
    entity_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    permission = Column(String(20), nullable=False, default="view")
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            entity_type.in_(["specification", "work_order", "part"]),
            name="chk_access_grant_entity_type",
        ),
        CheckConstraint(
            permission.in_(["view", "report", "manage"]),
            name="chk_access_grant_permission",
        ),
        UniqueConstraint("entity_type", "entity_id", "user_id", name="uq_access_grant_scope"),
        Index("idx_access_grants_entity_scope", "entity_type", "entity_id"),
    )


class PartStageStatus(Base):
    """Part stage status model."""
    __tablename__ = "part_stage_statuses"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    part_id = Column(UUID(as_uuid=True), ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    stage = Column(String(50), nullable=False)
    status = Column(String(20), default='pending', index=True)
    operator_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        CheckConstraint(
            stage.in_(['machining', 'fitting', 'galvanic', 'heat_treatment', 'grinding', 'qc', 'logistics']),
            name='chk_stage_status_stage'
        ),
        CheckConstraint(
            status.in_(['pending', 'in_progress', 'done', 'skipped']),
            name='chk_stage_status_status'
        ),
        UniqueConstraint('part_id', 'stage', name='uq_part_stage'),
    )
    
    # Relationships
    part = relationship("Part", back_populates="stage_statuses")


class StageFact(Base):
    """Stage fact model (production record)."""
    __tablename__ = "stage_facts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), index=True)
    part_id = Column(UUID(as_uuid=True), ForeignKey("parts.id"), nullable=False, index=True)
    stage = Column(String(50), nullable=False, index=True)
    machine_id = Column(UUID(as_uuid=True), ForeignKey("machines.id"), nullable=True, index=True)
    operator_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    date = Column(Date, nullable=False, index=True)
    shift_type = Column(String(10), nullable=False)
    qty_good = Column(Integer, nullable=False)
    qty_scrap = Column(Integer, default=0)
    qty_expected = Column(Integer, nullable=True)
    comment = Column(Text, nullable=True)
    deviation_reason = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    __table_args__ = (
        CheckConstraint(
            stage.in_(['machining', 'fitting', 'galvanic', 'heat_treatment', 'grinding', 'qc', 'logistics']),
            name='chk_stage_fact_stage'
        ),
        CheckConstraint(
            shift_type.in_(['day', 'night', 'none']),
            name='chk_stage_fact_shift_type'
        ),
        CheckConstraint(qty_good >= 0, name='chk_stage_fact_qty_good'),
        CheckConstraint(qty_scrap >= 0, name='chk_stage_fact_qty_scrap'),
        CheckConstraint(
            deviation_reason.in_(['setup', 'quality', 'material', 'tooling', 'operator', 'machine', 'external', 'logistics']) | (deviation_reason == None),
            name='chk_stage_fact_deviation_reason'
        ),
        # For machining: shift must be day/night, operator required
        CheckConstraint(
            "(stage = 'machining' AND shift_type IN ('day', 'night')) OR (stage != 'machining' AND shift_type = 'none')",
            name='chk_shift_type_for_stage'
        ),
        CheckConstraint(
            "stage != 'machining' OR operator_id IS NOT NULL",
            name='chk_operator_for_machining'
        ),
        Index('idx_stage_facts_date_shift', 'date', 'shift_type'),
        # Unique constraint for machining only
        Index(
            'idx_stage_facts_unique_machining',
            'part_id', 'stage', 'date', 'shift_type',
            unique=True,
            postgresql_where=(stage == 'machining')
        ),
    )
    
    # Relationships
    part = relationship("Part", back_populates="stage_facts")
    attachments = relationship("StageFactAttachment", back_populates="stage_fact", cascade="all, delete-orphan")


class StageFactAttachment(Base):
    """Stage fact attachment model."""
    __tablename__ = "stage_fact_attachments"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    stage_fact_id = Column(UUID(as_uuid=True), ForeignKey("stage_facts.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    url = Column(Text, nullable=False)
    type = Column(String(20), nullable=False)
    size = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (
        CheckConstraint(
            type.in_(['image', 'file']),
            name='chk_stage_fact_attachment_type'
        ),
    )
    
    # Relationships
    stage_fact = relationship("StageFact", back_populates="attachments")


class MachineNorm(Base):
    """Machine norm model."""
    __tablename__ = "machine_norms"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    machine_id = Column(UUID(as_uuid=True), ForeignKey("machines.id"), nullable=False)
    part_id = Column(UUID(as_uuid=True), ForeignKey("parts.id"), nullable=False)
    stage = Column(String(50), nullable=False)
    qty_per_shift = Column(Integer, nullable=False)
    is_configured = Column(Boolean, default=False)
    configured_at = Column(DateTime(timezone=True), nullable=True)
    configured_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        CheckConstraint(qty_per_shift > 0, name='chk_machine_norm_qty_positive'),
        UniqueConstraint('machine_id', 'part_id', 'stage', name='uq_machine_norm'),
        Index('idx_machine_norms_machine_part', 'machine_id', 'part_id'),
    )


class Task(Base):
    """Task model."""
    __tablename__ = "tasks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), index=True)
    part_id = Column(UUID(as_uuid=True), ForeignKey("parts.id"), nullable=True, index=True)
    machine_id = Column(UUID(as_uuid=True), ForeignKey("machines.id"), nullable=True)
    stage = Column(String(50), nullable=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    assignee_type = Column(String(20), nullable=False)
    assignee_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    assignee_role = Column(String(50), nullable=True)
    accepted_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), default='open', index=True)
    is_blocker = Column(Boolean, default=False)
    due_date = Column(Date, nullable=False, index=True)
    category = Column(String(50), default='general')
    review_comment = Column(Text, nullable=True)
    reviewed_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        CheckConstraint(
            stage.in_(['machining', 'fitting', 'galvanic', 'heat_treatment', 'grinding', 'qc', 'logistics']) | (stage == None),
            name='chk_task_stage'
        ),
        CheckConstraint(
            assignee_type.in_(['user', 'role', 'all']),
            name='chk_task_assignee_type'
        ),
        CheckConstraint(
            status.in_(['open', 'accepted', 'in_progress', 'review', 'done']),
            name='chk_task_status'
        ),
        CheckConstraint(
            category.in_(['tooling', 'quality', 'machine', 'material', 'logistics', 'general']),
            name='chk_task_category'
        ),
        CheckConstraint(
            "assignee_type != 'user' OR assignee_id IS NOT NULL",
            name='chk_assignee_user'
        ),
        CheckConstraint(
            "assignee_type != 'role' OR assignee_role IS NOT NULL",
            name='chk_assignee_role'
        ),
        Index('idx_tasks_is_blocker', 'is_blocker', postgresql_where=(is_blocker == True)),
    )
    
    # Relationships
    part = relationship("Part", back_populates="tasks")
    creator = relationship("User", foreign_keys=[creator_id], back_populates="created_tasks")
    accepted_by = relationship("User", foreign_keys=[accepted_by_id], back_populates="accepted_tasks")
    comments = relationship("TaskComment", back_populates="task", cascade="all, delete-orphan")
    read_statuses = relationship("TaskReadStatus", back_populates="task", cascade="all, delete-orphan")


class TaskReadStatus(Base):
    """Task read status model."""
    __tablename__ = "task_read_status"
    
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True, index=True)
    read_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    task = relationship("Task", back_populates="read_statuses")


class TaskComment(Base):
    """Task comment model."""
    __tablename__ = "task_comments"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    # Relationships
    task = relationship("Task", back_populates="comments")
    attachments = relationship("TaskAttachment", back_populates="comment", cascade="all, delete-orphan")


class TaskAttachment(Base):
    """Task attachment model."""
    __tablename__ = "task_attachments"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True)
    comment_id = Column(UUID(as_uuid=True), ForeignKey("task_comments.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    url = Column(Text, nullable=False)
    type = Column(String(20), nullable=False)
    size = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (
        CheckConstraint(
            type.in_(['image', 'file']),
            name='chk_task_attachment_type'
        ),
        CheckConstraint(
            "(task_id IS NOT NULL AND comment_id IS NULL) OR (task_id IS NULL AND comment_id IS NOT NULL)",
            name='chk_attachment_parent'
        ),
    )
    
    # Relationships
    comment = relationship("TaskComment", back_populates="attachments")


class AuditEvent(Base):
    """Audit event model."""
    __tablename__ = "audit_events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), index=True)
    action = Column(String(50), nullable=False, index=True)
    entity_type = Column(String(20), nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    entity_name = Column(String(255), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    user_name = Column(String(100), nullable=True)
    details = Column(JSONB, default={})
    part_id = Column(UUID(as_uuid=True), ForeignKey("parts.id"), nullable=True, index=True)
    part_code = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    __table_args__ = (
        CheckConstraint(
            action.in_([
                'task_created', 'task_status_changed', 'task_accepted', 'task_comment_added',
                'task_sent_for_review', 'task_approved', 'task_returned', 'task_attachment_added',
                'fact_added', 'fact_updated', 'part_created', 'part_updated', 'part_stage_changed',
                'norm_configured', 'user_login', 'user_logout', 'password_changed',
                # Auth hardening / onboarding events
                'LOGIN_FAILED', 'LOGIN_RATE_LIMITED',
                'USER_CREATED_WITH_TEMP_PASSWORD', 'PASSWORD_RESET_BY_ADMIN',
            ]),
            name='chk_audit_action'
        ),
        CheckConstraint(
            entity_type.in_(['task', 'part', 'fact', 'norm', 'logistics', 'user']),
            name='chk_audit_entity_type'
        ),
        Index('idx_audit_events_entity', 'entity_type', 'entity_id'),
    )


class NotificationOutbox(Base):
    """
    Notification outbox model - ONE ROW PER RECIPIENT (requirement A).
    Supports concurrent processing with SELECT FOR UPDATE SKIP LOCKED.
    """
    __tablename__ = "notification_outbox"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), index=True)
    type = Column(String(50), nullable=False)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    task_title = Column(String(500), nullable=True)
    part_code = Column(String(100), nullable=True)
    triggered_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    triggered_by_name = Column(String(100), nullable=True)
    
    # ONE recipient per row
    recipient_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    recipient_chat_id = Column(String(100), nullable=True)  # Telegram chat_id snapshot
    
    message = Column(Text, nullable=False)
    meta_data = Column(JSONB, default={})  # Renamed from 'metadata' (SQLAlchemy reserved)
    
    # Status tracking for requirement A
    status = Column(String(20), default='pending', index=True)  # pending/sent/failed/skipped
    attempts = Column(Integer, default=0)
    next_retry_at = Column(DateTime(timezone=True), nullable=True, index=True)  # For backoff
    last_error = Column(Text, nullable=True)
    
    # Idempotency key - UNIQUE (requirement A)
    idempotency_key = Column(String(255), unique=True, nullable=False)  # Format: type:task_id:user_id
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    failed_at = Column(DateTime(timezone=True), nullable=True)
    
    __table_args__ = (
        CheckConstraint(
            type.in_([
                'task_created', 'task_accepted', 'task_comment', 'task_for_review',
                'task_approved', 'task_returned', 'task_assigned', 'fact_added'
            ]),
            name='chk_notification_type'
        ),
        CheckConstraint(
            status.in_(['pending', 'sent', 'failed', 'skipped']),
            name='chk_notification_status'
        ),
        # Index for efficient SELECT FOR UPDATE SKIP LOCKED (without now() - not IMMUTABLE)
        Index('idx_outbox_pending_retry', 'status', 'next_retry_at', 
              postgresql_where=(status == 'pending')),
    )


class LogisticsEntry(Base):
    """Logistics entry model."""
    __tablename__ = "logistics_entries"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), index=True)
    part_id = Column(UUID(as_uuid=True), ForeignKey("parts.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    quantity = Column(Integer, nullable=True)
    date = Column(Date, nullable=False, index=True)
    status = Column(String(20), default='pending')
    tracking_number = Column(String(100), nullable=True)
    counterparty = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        CheckConstraint(
            type.in_(['material_in', 'tooling_in', 'shipping_out', 'coop_out', 'coop_in']),
            name='chk_logistics_type'
        ),
        CheckConstraint(
            status.in_(['pending', 'in_transit', 'received', 'completed']),
            name='chk_logistics_status'
        ),
    )
