"""Task endpoints."""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from uuid import UUID
from typing import Optional
from ..database import get_db
from ..models import (
    Machine,
    Part,
    Task,
    TaskAttachment,
    TaskComment,
    TaskReadStatus,
    AuditEvent,
    NotificationOutbox,
    User,
)
from ..schemas import (
    TaskCreate, TaskResponse, TaskCommentCreate, TaskCommentResponse,
    TaskReviewRequest, UserBrief, AttachmentBase
)
from ..auth import get_current_user, PermissionChecker
from ..celery_app import create_notification_for_task
from ..config import settings
from ..security import can_view_task, is_task_assigned_to_user, require_org_entity
from ..services.task_response_builder import task_to_response, tasks_to_response
from ..use_cases.task_transitions import (
    accept_task_use_case,
    review_task_use_case,
    send_to_review_use_case,
    start_task_use_case,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])

PRODUCTION_STAGES = {"machining", "fitting", "galvanic", "heat_treatment", "grinding", "qc"}

_SAFE_FILENAME_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\.[A-Za-z0-9]{1,16}$"
)


def _extract_attachment_filename(url: str) -> str | None:
    """Accept only internal attachment URLs and return the safe filename."""
    if not url:
        return None
    try:
        parsed = urlparse(url)
        path = parsed.path or ""
    except Exception:
        return None

    prefixes = (
        "/api/v1/attachments/serve/",
        "/attachments/serve/",
        "/uploads/",
    )
    filename = None
    for prefix in prefixes:
        if path.startswith(prefix):
            filename = path[len(prefix) :]
            break
    if not filename:
        return None

    if "/" in filename or "\\" in filename or ".." in filename:
        return None
    if Path(filename).name != filename:
        return None
    if not _SAFE_FILENAME_RE.match(filename):
        return None
    return filename


def _normalize_attachment_url(filename: str) -> str:
    return f"/api/v1/attachments/serve/{filename}"


def _assert_attachment_files_exist(*, filenames: list[str], current_user: User) -> None:
    base_dir = Path(settings.UPLOAD_DIR) / str(current_user.org_id)
    for name in filenames:
        path = base_dir / name
        if not path.exists() or not path.is_file():
            raise HTTPException(status_code=400, detail="Attachment not found")


def get_task_assignee_user(db: Session, org_id, assignee_id):
    if not assignee_id:
        return None
    return db.query(User).filter(
        User.id == assignee_id,
        User.org_id == org_id,
        User.is_active == True,
    ).first()


def validate_task_assignment_rules(db: Session, current_user: User, data: TaskCreate):
    """Enforce business-specific task assignment restrictions."""
    # Master: production-only tasks, assignee only operators.
    if current_user.role == "master":
        if not data.stage or data.stage not in PRODUCTION_STAGES:
            raise HTTPException(
                status_code=400,
                detail="Master can create tasks only for production stages",
            )
        if data.assignee_type == "all":
            raise HTTPException(
                status_code=400,
                detail="Master must assign tasks only to operators",
            )
        if data.assignee_type == "role":
            if data.assignee_role != "operator":
                raise HTTPException(
                    status_code=400,
                    detail="Master can assign tasks only to operators",
                )
        if data.assignee_type == "user":
            assignee = get_task_assignee_user(db, current_user.org_id, data.assignee_id)
            if not assignee:
                raise HTTPException(status_code=404, detail="Assignee user not found")
            if assignee.role != "operator":
                raise HTTPException(
                    status_code=400,
                    detail="Master can assign tasks only to operators",
                )

    # Shop head: can assign everyone except director.
    if current_user.role == "shop_head":
        if data.assignee_type == "all":
            raise HTTPException(
                status_code=400,
                detail="Shop head cannot assign task to all users because director must be excluded",
            )
        if data.assignee_type == "role" and data.assignee_role == "director":
            raise HTTPException(
                status_code=400,
                detail="Shop head cannot assign tasks to director",
            )
        if data.assignee_type == "user":
            assignee = get_task_assignee_user(db, current_user.org_id, data.assignee_id)
            if not assignee:
                raise HTTPException(status_code=404, detail="Assignee user not found")
            if assignee.role == "director":
                raise HTTPException(
                    status_code=400,
                    detail="Shop head cannot assign tasks to director",
                )


@router.get("", response_model=list[TaskResponse])
def get_tasks(
    status: Optional[str] = None,
    assigned_to_me: bool = False,
    created_by_me: bool = False,
    is_blocker: Optional[bool] = None,
    part_id: Optional[UUID] = None,
    unread: bool = False,
    assignee_user_id: Optional[UUID] = None,
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get tasks with filters."""
    query = db.query(Task).filter(Task.org_id == current_user.org_id)
    
    # RBAC: operator sees only tasks assigned to them or created by them (requirement D)
    if current_user.role == "operator":
        query = query.filter(
            or_(
                Task.creator_id == current_user.id,
                Task.assignee_type == "all",
                and_(Task.assignee_type == "role", Task.assignee_role == "operator"),
                and_(Task.assignee_type == "user", Task.assignee_id == current_user.id)
            )
        )

    # Optional: query tasks for a specific target user assignment scope.
    # Includes direct + role-based + assignee_type=all tasks for that user.
    if assignee_user_id:
        target_user = db.query(User).filter(
            User.id == assignee_user_id,
            User.org_id == current_user.org_id,
            User.is_active == True,
        ).first()
        if not target_user:
            return []
        query = query.filter(
            or_(
                Task.assignee_type == "all",
                and_(Task.assignee_type == "role", Task.assignee_role == target_user.role),
                and_(Task.assignee_type == "user", Task.assignee_id == target_user.id),
            )
        )
    
    # Filter by status
    if status:
        statuses = status.split(',')
        query = query.filter(Task.status.in_(statuses))
    
    # Filter by assignment
    if assigned_to_me:
        # Check assignee_type
        query = query.filter(
            or_(
                Task.assignee_type == "all",
                and_(Task.assignee_type == "role", Task.assignee_role == current_user.role),
                and_(Task.assignee_type == "user", Task.assignee_id == current_user.id)
            )
        )
    
    if created_by_me:
        query = query.filter(Task.creator_id == current_user.id)
    
    if is_blocker is not None:
        query = query.filter(Task.is_blocker == is_blocker)
    
    if part_id:
        query = query.filter(Task.part_id == part_id)
    
    # Apply unread filter before pagination to keep pages stable and hole-free.
    if unread:
        query = query.filter(
            ~Task.read_statuses.any(TaskReadStatus.user_id == current_user.id)
        )

    # Get paginated tasks
    tasks = query.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()
    
    return tasks_to_response(db, tasks, current_user)


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get task by ID."""
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.org_id == current_user.org_id
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # RBAC: operator can only view tasks assigned to them or created by them (requirement D)
    if current_user.role == "operator":
        is_assigned = is_task_assigned_to_user(task, current_user)
        is_creator = task.creator_id == current_user.id
        
        if not (is_assigned or is_creator):
            raise HTTPException(status_code=403, detail="Access denied: task not assigned to you")
    
    return task_to_response(db, task, current_user)


@router.post("", response_model=TaskResponse, dependencies=[Depends(PermissionChecker("canCreateTasks"))])
def create_task(
    data: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create new task."""
    # Validate assignee
    if data.assignee_type == "user" and not data.assignee_id:
        raise HTTPException(status_code=400, detail="assignee_id required for user assignment")
    if data.assignee_type == "role" and not data.assignee_role:
        raise HTTPException(status_code=400, detail="assignee_role required for role assignment")
    validate_task_assignment_rules(db, current_user, data)

    # Multi-tenant boundary: validate foreign keys belong to current org.
    part = None
    if data.part_id:
        part = require_org_entity(
            db,
            Part,
            entity_id=data.part_id,
            org_id=current_user.org_id,
            not_found="Part not found",
        )

    if data.machine_id:
        require_org_entity(
            db,
            Machine,
            entity_id=data.machine_id,
            org_id=current_user.org_id,
            not_found="Machine not found",
        )
    
    # Create task
    task = Task(
        org_id=current_user.org_id,
        creator_id=current_user.id,
        **data.model_dump()
    )
    db.add(task)
    db.flush()
    
    # Creator auto-read
    read_status = TaskReadStatus(task_id=task.id, user_id=current_user.id)
    db.add(read_status)
    
    # Audit log
    audit = AuditEvent(
        org_id=current_user.org_id,
        action="task_created",
        entity_type="task",
        entity_id=task.id,
        entity_name=task.title,
        user_id=current_user.id,
        user_name=current_user.initials,
        part_id=part.id if part else None,
        part_code=part.code if part else None
    )
    db.add(audit)
    
    db.commit()
    db.refresh(task)
    
    # Create notification (Requirement A: outbox pattern)
    target_user_ids = []
    if task.assignee_type == "user" and task.assignee_id:
        target_user_ids = [str(task.assignee_id)]
    elif task.assignee_type == "role" and task.assignee_role:
        # Get all users with this role
        users = db.query(User).filter(
            User.org_id == current_user.org_id,
            User.role == task.assignee_role,
            User.is_active == True
        ).all()
        target_user_ids = [str(u.id) for u in users]
    
    if target_user_ids:
        part_code = part.code if part else "N/A"
        message = f"📋 Новая задача: {task.title}\nДеталь: {part_code}\nОт: {current_user.initials}"
        create_notification_for_task.delay(
            str(task.id),
            "task_created",
            target_user_ids,
            message
        )
    
    return task_to_response(db, task, current_user)


@router.post("/{task_id}/accept", response_model=TaskResponse)
def accept_task(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Accept task."""
    task = accept_task_use_case(db=db, task_id=task_id, current_user=current_user)
    return task_to_response(db, task, current_user)


@router.post("/{task_id}/start", response_model=TaskResponse)
def start_task(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start work on task."""
    task = start_task_use_case(db=db, task_id=task_id, current_user=current_user)
    return task_to_response(db, task, current_user)


@router.post("/{task_id}/send-to-review", response_model=TaskResponse)
def send_to_review(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send task for review."""
    task = send_to_review_use_case(db=db, task_id=task_id, current_user=current_user)
    return task_to_response(db, task, current_user)


@router.post("/{task_id}/review", response_model=TaskResponse)
def review_task(
    task_id: UUID,
    data: TaskReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Review task (approve or return)."""
    task = review_task_use_case(
        db=db,
        task_id=task_id,
        current_user=current_user,
        approved=data.approved,
        comment=data.comment,
    )
    return task_to_response(db, task, current_user)


@router.post("/{task_id}/comments", response_model=TaskCommentResponse)
def add_comment(
    task_id: UUID,
    data: TaskCommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add comment to task."""
    task = require_org_entity(
        db,
        Task,
        entity_id=task_id,
        org_id=current_user.org_id,
        not_found="Task not found",
    )
    
    if not can_view_task(task, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    # Validate attachment URLs up-front to avoid storing arbitrary/external URLs.
    filenames: list[str] = []
    for att_data in data.attachments:
        filename = _extract_attachment_filename(att_data.url)
        if not filename:
            raise HTTPException(status_code=400, detail="Invalid attachment url")
        filenames.append(filename)
    if filenames:
        _assert_attachment_files_exist(filenames=filenames, current_user=current_user)
    
    # Create comment
    comment = TaskComment(
        task_id=task_id,
        user_id=current_user.id,
        message=data.message
    )
    db.add(comment)
    db.flush()
    
    # Add attachments
    for att_data, filename in zip(data.attachments, filenames):
        attachment = TaskAttachment(
            comment_id=comment.id,
            name=att_data.name,
            url=_normalize_attachment_url(filename),
            type=att_data.type,
            size=att_data.size,
        )
        db.add(attachment)
    
    # Audit
    action = "task_attachment_added" if data.attachments else "task_comment_added"
    audit = AuditEvent(
        org_id=current_user.org_id,
        action=action,
        entity_type="task",
        entity_id=task.id,
        entity_name=task.title,
        user_id=current_user.id,
        user_name=current_user.initials,
        details={"message": data.message[:100], "attachmentCount": len(data.attachments)}
    )
    db.add(audit)
    
    db.commit()
    db.refresh(comment)
    
    return TaskCommentResponse(
        id=comment.id,
        user=UserBrief.model_validate(current_user),
        message=comment.message,
        attachments=[AttachmentBase.model_validate(a) for a in comment.attachments],
        created_at=comment.created_at
    )


@router.post("/{task_id}/read")
def mark_as_read(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark task as read."""
    task = require_org_entity(
        db,
        Task,
        entity_id=task_id,
        org_id=current_user.org_id,
        not_found="Task not found",
    )

    if not can_view_task(task, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check if already read
    read_status = db.query(TaskReadStatus).filter(
        TaskReadStatus.task_id == task_id,
        TaskReadStatus.user_id == current_user.id
    ).first()
    
    if not read_status:
        read_status = TaskReadStatus(task_id=task_id, user_id=current_user.id)
        db.add(read_status)
        db.commit()
    
    return {"message": "Marked as read"}
