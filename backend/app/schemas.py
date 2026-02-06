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


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str


# Part schemas
class PartCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    qty_plan: int = Field(gt=0)
    priority: str = Field(default="medium", pattern="^(high|medium|low)$")
    deadline: date
    is_cooperation: bool = False
    cooperation_partner: Optional[str] = None
    machine_id: Optional[UUID] = None
    customer: Optional[str] = None
    required_stages: list[str]


class PartUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    qty_plan: Optional[int] = Field(None, gt=0)
    priority: Optional[str] = Field(None, pattern="^(high|medium|low)$")
    deadline: Optional[date] = None
    is_cooperation: Optional[bool] = None
    cooperation_partner: Optional[str] = None
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
    stage: str
    status: str
    percent: int
    qty_good: int
    qty_scrap: int = 0
    operator_id: Optional[UUID] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


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
    priority: str
    deadline: date
    status: str
    drawing_url: Optional[str] = None
    is_cooperation: bool
    cooperation_partner: Optional[str] = None
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
