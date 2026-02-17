"""Pydantic schemas for API."""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import date, datetime
from uuid import UUID


# Base schemas
class UserBase(BaseModel):
    username: str
    name: str
    initials: str
    role: str
    email: Optional[str] = None
    telegram_chat_id: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserResponse(UserBase):
    id: UUID
    is_active: bool
    must_change_password: bool
    model_config = ConfigDict(from_attributes=True)


class UserDirectoryItem(BaseModel):
    """Minimal user directory entry (safe to show to all authenticated users)."""

    id: UUID
    initials: str
    role: str
    name: str
    username: str
    is_active: bool
    model_config = ConfigDict(from_attributes=True)


class UserBrief(BaseModel):
    """Brief user info for nested responses."""
    id: UUID
    initials: str
    model_config = ConfigDict(from_attributes=True)


class TaskReadInfo(BaseModel):
    """Info about who read the task and when."""
    user: UserBrief
    read_at: datetime
    model_config = ConfigDict(from_attributes=True)


# Auth schemas
class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    expires_in: int
    user: UserResponse
    must_change_password: bool = False


class RefreshTokenRequest(BaseModel):
    # Legacy body-based refresh token is not used in production.
    refresh_token: Optional[str] = None


# Part schemas
class PartCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    drawing_url: Optional[str] = None
    qty_plan: int = Field(gt=0)
    deadline: date
    is_cooperation: bool = False
    cooperation_partner: Optional[str] = None
    cooperation_due_date: Optional[date] = None
    cooperation_qc_status: Optional[str] = Field(default=None, pattern="^(pending|accepted|rejected)$")
    cooperation_qc_checked_at: Optional[datetime] = None
    cooperation_qc_comment: Optional[str] = None
    machine_id: Optional[UUID] = None
    customer: Optional[str] = None
    required_stages: list[str]


class PartUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    drawing_url: Optional[str] = None
    qty_plan: Optional[int] = Field(None, gt=0)
    deadline: Optional[date] = None
    is_cooperation: Optional[bool] = None
    cooperation_partner: Optional[str] = None
    cooperation_due_date: Optional[date] = None
    cooperation_qc_status: Optional[str] = Field(default=None, pattern="^(pending|accepted|rejected)$")
    cooperation_qc_checked_at: Optional[datetime] = None
    cooperation_qc_comment: Optional[str] = None
    machine_id: Optional[UUID] = None
    customer: Optional[str] = None
    required_stages: Optional[list[str]] = None


class MachineResponse(BaseModel):
    id: UUID
    name: str
    department: str
    rate_per_shift: int
    
    model_config = ConfigDict(from_attributes=True)


class StageStatusResponse(BaseModel):
    id: UUID
    stage: str
    status: str
    percent: int
    qty_good: int
    qty_scrap: int = 0
    operator_id: Optional[UUID] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None


class PartProgressResponse(BaseModel):
    overall_percent: int
    overall_qty_done: int
    qty_scrap: int
    bottleneck_stage: Optional[str] = None  # Requirement C: stage with minimum progress


class PartForecastResponse(BaseModel):
    days_remaining: int
    shifts_remaining: int
    qty_remaining: int
    avg_per_shift: int
    will_finish_on_time: bool
    estimated_finish_date: str
    shifts_needed: int


class PartResponse(BaseModel):
    id: UUID
    code: str
    name: str
    description: Optional[str] = None
    qty_plan: int
    qty_done: int
    qty_ready: int  # Alias for qty_done (frontend compatibility)
    deadline: date
    status: str
    drawing_url: Optional[str] = None
    is_cooperation: bool
    cooperation_partner: Optional[str] = None
    cooperation_due_date: Optional[date] = None
    cooperation_qc_status: Optional[str] = None
    cooperation_qc_checked_at: Optional[datetime] = None
    cooperation_qc_comment: Optional[str] = None
    machine_id: Optional[UUID] = None
    machine: Optional[MachineResponse] = None
    customer: Optional[str] = None
    required_stages: list[str]
    progress: Optional[PartProgressResponse] = None
    forecast: Optional[PartForecastResponse] = None
    stage_statuses: list[StageStatusResponse]
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
    
    @classmethod
    def from_orm_with_progress(cls, part, progress=None, forecast=None, stage_statuses=None):
        """Create response with computed fields."""
        data = {
            **{k: v for k, v in part.__dict__.items() if not k.startswith('_')},
            'qty_ready': part.qty_done,  # Alias
            'progress': progress,
            'forecast': forecast,
            'stage_statuses': stage_statuses or []
        }
        return cls(**data)


# Specification schemas
class SpecificationCreate(BaseModel):
    number: str
    customer: Optional[str] = None
    deadline: Optional[date] = None
    note: Optional[str] = None
    status: str = Field(default="draft", pattern="^(draft|active|closed)$")
    published_to_operators: bool = False


class SpecificationUpdate(BaseModel):
    number: Optional[str] = None
    customer: Optional[str] = None
    deadline: Optional[date] = None
    note: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(draft|active|closed)$")
    published_to_operators: Optional[bool] = None


class SpecificationPublishRequest(BaseModel):
    published: bool


class SpecificationResponse(BaseModel):
    id: UUID
    number: str
    customer: Optional[str] = None
    deadline: Optional[date] = None
    note: Optional[str] = None
    status: str
    published_to_operators: bool
    created_by: UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class SpecItemCreate(BaseModel):
    item_type: str = Field(pattern="^(make|coop)$")
    part_id: Optional[UUID] = None
    description: str
    qty_required: int = Field(gt=0)
    uom: str = "шт"
    comment: Optional[str] = None


class SpecItemProgressUpdate(BaseModel):
    qty_done: int = Field(ge=0)
    status_override: Optional[str] = Field(
        default=None,
        pattern="^(open|partial|fulfilled|blocked|canceled)$",
    )


class SpecItemResponse(BaseModel):
    id: UUID
    specification_id: UUID
    line_no: int
    item_type: str
    part_id: Optional[UUID] = None
    description: str
    qty_required: int
    qty_done: int
    uom: str
    comment: Optional[str] = None
    status: str
    model_config = ConfigDict(from_attributes=True)


class AccessGrantCreate(BaseModel):
    entity_type: str = Field(pattern="^(specification|work_order|part)$")
    entity_id: UUID
    user_id: UUID
    permission: str = Field(pattern="^(view|report|manage)$")


class AccessGrantResponse(BaseModel):
    id: UUID
    entity_type: str
    entity_id: UUID
    user_id: UUID
    permission: str
    created_by: UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# Stage Fact schemas
class AttachmentBase(BaseModel):
    name: str
    url: str
    type: str = Field(pattern="^(image|file)$")
    size: Optional[int] = None


class StageFactCreate(BaseModel):
    stage: str
    date: date
    shift_type: Optional[str] = None  # Auto-set based on stage
    machine_id: Optional[UUID] = None
    operator_id: Optional[UUID] = None
    qty_good: int = Field(ge=0)
    qty_scrap: int = Field(default=0, ge=0)
    comment: Optional[str] = None
    deviation_reason: Optional[str] = None
    attachments: list[AttachmentBase] = []


class StageFactUpdate(BaseModel):
    operator_id: Optional[UUID] = None
    qty_good: int = Field(ge=0)
    qty_scrap: int = Field(default=0, ge=0)
    comment: Optional[str] = None
    deviation_reason: Optional[str] = None
    attachments: list[AttachmentBase] = []


class StageFactResponse(BaseModel):
    id: UUID
    stage: str
    date: date
    shift_type: str
    qty_good: int
    qty_scrap: int
    qty_expected: Optional[int] = None
    comment: Optional[str] = None
    deviation_reason: Optional[str] = None
    operator: Optional[UserBrief] = None
    attachments: list[AttachmentBase] = []
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class MachineNormUpsert(BaseModel):
    machine_id: UUID
    stage: str = Field(pattern="^(machining)$")
    qty_per_shift: int = Field(gt=0)
    is_configured: bool = True


class MachineNormResponse(BaseModel):
    machine_id: UUID
    part_id: UUID
    stage: str
    qty_per_shift: int
    is_configured: bool
    configured_at: Optional[datetime] = None
    configured_by_id: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)


# Movements / transfers (logistics separated from production stages)
class MovementCreate(BaseModel):
    status: Optional[str] = Field(default="sent", pattern="^(pending|sent|received)$")
    from_location: Optional[str] = None
    from_holder: Optional[str] = None
    to_location: Optional[str] = None
    to_holder: Optional[str] = None
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    planned_eta: Optional[datetime] = None
    qty_sent: Optional[int] = Field(default=None, ge=0)
    qty_received: Optional[int] = Field(default=None, ge=0)
    stage_id: Optional[UUID] = None
    notes: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None  # deprecated legacy field
    allow_parallel: bool = False


class MovementUpdate(BaseModel):
    status: Optional[str] = Field(
        default=None,
        pattern="^(sent|in_transit|received|returned|cancelled|pending|completed)$",
    )
    from_location: Optional[str] = None
    from_holder: Optional[str] = None
    to_location: Optional[str] = None
    to_holder: Optional[str] = None
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    planned_eta: Optional[datetime] = None
    qty_sent: Optional[int] = Field(default=None, ge=0)
    qty_received: Optional[int] = Field(default=None, ge=0)
    stage_id: Optional[UUID] = None
    notes: Optional[str] = None
    description: Optional[str] = None
    allow_parallel: bool = False


class MovementOut(BaseModel):
    id: UUID
    part_id: UUID
    status: str
    from_location: Optional[str] = None
    from_holder: Optional[str] = None
    to_location: Optional[str] = None
    to_holder: Optional[str] = None
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    planned_eta: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    returned_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    qty_sent: Optional[int] = None
    qty_received: Optional[int] = None
    stage_id: Optional[UUID] = None
    last_tracking_status: Optional[str] = None
    tracking_last_checked_at: Optional[datetime] = None
    raw_payload: Optional[dict] = None
    notes: Optional[str] = None

    # Deprecated legacy fields (kept for backward compatibility)
    type: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[int] = None
    date: Optional[date] = None
    counterparty: Optional[str] = None

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class JourneyEventOut(BaseModel):
    event_type: str
    occurred_at: Optional[datetime] = None
    description: Optional[str] = None


class JourneyOut(BaseModel):
    part_id: UUID
    current_location: Optional[str] = None
    current_holder: Optional[str] = None
    next_required_stage: Optional[str] = None
    eta: Optional[datetime] = None
    last_movement: Optional[MovementOut] = None
    last_event: Optional[JourneyEventOut] = None


# Task schemas
class TaskCreate(BaseModel):
    part_id: Optional[UUID] = None
    machine_id: Optional[UUID] = None
    stage: Optional[str] = None
    title: str
    description: Optional[str] = None
    assignee_type: str = Field(pattern="^(user|role|all)$")
    assignee_id: Optional[UUID] = None
    assignee_role: Optional[str] = None
    is_blocker: bool = False
    due_date: date
    category: str = Field(default="general")


class TaskCommentCreate(BaseModel):
    message: str
    attachments: list[AttachmentBase] = []


class TaskCommentResponse(BaseModel):
    id: UUID
    user: UserBrief
    message: str
    attachments: list[AttachmentBase]
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class PartBrief(BaseModel):
    id: UUID
    code: str
    model_config = ConfigDict(from_attributes=True)


class TaskResponse(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    creator: UserBrief
    assignee_type: str
    assignee_id: Optional[UUID] = None
    assignee_role: Optional[str] = None
    accepted_by: Optional[UserBrief] = None
    accepted_at: Optional[datetime] = None
    status: str
    is_blocker: bool
    due_date: date
    category: str
    stage: Optional[str] = None
    part: Optional[PartBrief] = None
    is_read: bool
    read_by_users: list[TaskReadInfo] = []
    comments: list[TaskCommentResponse] = []
    review_comment: Optional[str] = None
    reviewed_by: Optional[UserBrief] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class TaskReviewRequest(BaseModel):
    approved: bool
    comment: Optional[str] = None


# Audit Event
class AuditEventResponse(BaseModel):
    id: UUID
    action: str
    entity_type: str
    entity_id: UUID
    user: Optional[UserBrief] = None
    details: dict
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# Pagination
class PaginationResponse(BaseModel):
    total: int
    limit: int
    offset: int
    next_cursor: Optional[str] = None


class PaginatedResponse(BaseModel):
    data: list
    pagination: PaginationResponse


# System
class CurrentShiftResponse(BaseModel):
    shift: str
    started_at: str
    ends_at: str
    server_time: datetime


class HealthCheckResponse(BaseModel):
    status: str
    database: str
    redis: str
    version: str
