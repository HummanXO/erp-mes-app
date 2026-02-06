"""Task endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from uuid import UUID
from typing import Optional
from ..database import get_db
from ..models import User, Part, Task, TaskComment, TaskReadStatus, TaskAttachment, AuditEvent, NotificationOutbox
from ..schemas import (
    TaskCreate, TaskResponse, TaskCommentCreate, TaskCommentResponse,
    TaskReviewRequest, UserBrief, PartBrief, AttachmentBase, TaskReadInfo
)
from ..auth import get_current_user, PermissionChecker, ROLE_PERMISSIONS
from ..celery_app import create_notification_for_task

router = APIRouter(prefix="/tasks", tags=["tasks"])


def is_task_assigned_to_user(task: Task, user: User) -> bool:
    """Check if task is assigned to user."""
    if task.assignee_type == "all":
        return True
    if task.assignee_type == "role" and task.assignee_role == user.role:
        return True
    if task.assignee_type == "user" and task.assignee_id == user.id:
        return True
    return False


def task_to_response(db: Session, task: Task, current_user: User) -> TaskResponse:
    """Convert task to response with all relations."""
    creator = db.query(User).filter(User.id == task.creator_id).first()
    accepted_by = db.query(User).filter(User.id == task.accepted_by_id).first() if task.accepted_by_id else None
    reviewed_by = db.query(User).filter(User.id == task.reviewed_by_id).first() if task.reviewed_by_id else None
    part = db.query(Part).filter(Part.id == task.part_id).first() if task.part_id else None
    
    # Check if read
    is_read = db.query(TaskReadStatus).filter(
        TaskReadStatus.task_id == task.id,
        TaskReadStatus.user_id == current_user.id
    ).first() is not None
    
    # Get all read statuses (who read and when)
    read_statuses = db.query(TaskReadStatus, User).join(
        User, TaskReadStatus.user_id == User.id
    ).filter(
        TaskReadStatus.task_id == task.id
    ).all()
    
    read_by_users = [
        {"user": UserBrief.model_validate(user), "read_at": status.read_at}
        for status, user in read_statuses
    ]
    
    # Get comments with attachments
    comments = []
    for comment in task.comments:
        comment_user = db.query(User).filter(User.id == comment.user_id).first()
        comments.append(TaskCommentResponse(
            id=comment.id,
            user=UserBrief.model_validate(comment_user) if comment_user else None,
            message=comment.message,
            attachments=[AttachmentBase.model_validate(a) for a in comment.attachments],
            created_at=comment.created_at
        ))
    
    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        creator=UserBrief.model_validate(creator) if creator else None,
        assignee_type=task.assignee_type,
        assignee_id=task.assignee_id,
        assignee_role=task.assignee_role,
        accepted_by=UserBrief.model_validate(accepted_by) if accepted_by else None,
        accepted_at=task.accepted_at,
        status=task.status,
        is_blocker=task.is_blocker,
        due_date=task.due_date,
        category=task.category,
        stage=task.stage,
        part=PartBrief.model_validate(part) if part else None,
        is_read=is_read,
        read_by_users=read_by_users,
        comments=comments,
        review_comment=task.review_comment,
        reviewed_by=UserBrief.model_validate(reviewed_by) if reviewed_by else None,
        reviewed_at=task.reviewed_at,
        created_at=task.created_at,
        updated_at=task.updated_at
    )


@router.get("", response_model=list[TaskResponse])
def get_tasks(
    status: Optional[str] = None,
    assigned_to_me: bool = False,
    created_by_me: bool = False,
    is_blocker: Optional[bool] = None,
    part_id: Optional[UUID] = None,
    unread: bool = False,
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
    
    # Get tasks
    tasks = query.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()
    
    # Filter unread on Python side (easier than complex SQL)
    if unread:
        unread_task_ids = db.query(TaskReadStatus.task_id).filter(
            TaskReadStatus.user_id == current_user.id
        ).all()
        unread_task_ids = {tid[0] for tid in unread_task_ids}
        tasks = [t for t in tasks if t.id not in unread_task_ids]
    
    return [task_to_response(db, task, current_user) for task in tasks]


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
    part = db.query(Part).filter(Part.id == data.part_id).first() if data.part_id else None
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
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.org_id == current_user.org_id
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if assigned to current user
    if not is_task_assigned_to_user(task, current_user):
        raise HTTPException(status_code=403, detail="Task not assigned to you")
    
    # Idempotent: if already accepted by this user, return OK
    if task.accepted_by_id == current_user.id:
        return task_to_response(db, task, current_user)
    
    # If already accepted by someone else
    if task.accepted_by_id and task.accepted_by_id != current_user.id:
        raise HTTPException(status_code=400, detail="Task already accepted by another user")
    
    # Accept task
    old_status = task.status
    task.accepted_by_id = current_user.id
    task.accepted_at = func.now()
    task.status = "accepted"
    
    # Mark as read
    read_status = db.query(TaskReadStatus).filter(
        TaskReadStatus.task_id == task_id,
        TaskReadStatus.user_id == current_user.id
    ).first()
    if not read_status:
        read_status = TaskReadStatus(task_id=task_id, user_id=current_user.id)
        db.add(read_status)
    
    # Audit
    audit = AuditEvent(
        org_id=current_user.org_id,
        action="task_accepted",
        entity_type="task",
        entity_id=task.id,
        entity_name=task.title,
        user_id=current_user.id,
        user_name=current_user.initials,
        details={"oldStatus": old_status, "newStatus": "accepted"}
    )
    db.add(audit)
    
    db.commit()
    
    return task_to_response(db, task, current_user)


@router.post("/{task_id}/start", response_model=TaskResponse)
def start_task(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start work on task."""
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.org_id == current_user.org_id
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task.accepted_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only accepted user can start task")
    
    if task.status != "accepted":
        raise HTTPException(status_code=400, detail="Task must be in accepted status")
    
    old_status = task.status
    task.status = "in_progress"
    
    # Audit
    audit = AuditEvent(
        org_id=current_user.org_id,
        action="task_status_changed",
        entity_type="task",
        entity_id=task.id,
        entity_name=task.title,
        user_id=current_user.id,
        user_name=current_user.initials,
        details={"oldStatus": old_status, "newStatus": "in_progress"}
    )
    db.add(audit)
    
    db.commit()
    
    return task_to_response(db, task, current_user)


@router.post("/{task_id}/send-to-review", response_model=TaskResponse)
def send_to_review(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send task for review."""
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.org_id == current_user.org_id
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task.accepted_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only accepted user can send for review")
    
    # Idempotent
    if task.status == "review":
        return task_to_response(db, task, current_user)
    
    old_status = task.status
    task.status = "review"
    
    # Audit
    audit = AuditEvent(
        org_id=current_user.org_id,
        action="task_sent_for_review",
        entity_type="task",
        entity_id=task.id,
        entity_name=task.title,
        user_id=current_user.id,
        user_name=current_user.initials,
        details={"oldStatus": old_status, "newStatus": "review"}
    )
    db.add(audit)
    
    db.commit()
    
    return task_to_response(db, task, current_user)


@router.post("/{task_id}/review", response_model=TaskResponse)
def review_task(
    task_id: UUID,
    data: TaskReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Review task (approve or return)."""
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.org_id == current_user.org_id
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Only creator can review
    if task.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only creator can review task")
    
    if task.status != "review":
        raise HTTPException(status_code=400, detail="Task must be in review status")
    
    old_status = task.status
    task.reviewed_by_id = current_user.id
    task.reviewed_at = func.now()
    
    if data.approved:
        task.status = "done"
        if data.comment:
            # Add comment
            comment = TaskComment(
                task_id=task_id,
                user_id=current_user.id,
                message=f"Принято: {data.comment}"
            )
            db.add(comment)
        
        # Audit
        audit = AuditEvent(
            org_id=current_user.org_id,
            action="task_approved",
            entity_type="task",
            entity_id=task.id,
            entity_name=task.title,
            user_id=current_user.id,
            user_name=current_user.initials,
            details={"oldStatus": old_status, "newStatus": "done", "comment": data.comment}
        )
        db.add(audit)
    else:
        task.status = "in_progress"
        task.review_comment = data.comment
        if data.comment:
            comment = TaskComment(
                task_id=task_id,
                user_id=current_user.id,
                message=f"Возвращено: {data.comment}"
            )
            db.add(comment)
        
        # Audit
        audit = AuditEvent(
            org_id=current_user.org_id,
            action="task_returned",
            entity_type="task",
            entity_id=task.id,
            entity_name=task.title,
            user_id=current_user.id,
            user_name=current_user.initials,
            details={"oldStatus": old_status, "newStatus": "in_progress", "comment": data.comment}
        )
        db.add(audit)
    
    db.commit()
    
    return task_to_response(db, task, current_user)


@router.post("/{task_id}/comments", response_model=TaskCommentResponse)
def add_comment(
    task_id: UUID,
    data: TaskCommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add comment to task."""
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.org_id == current_user.org_id
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Create comment
    comment = TaskComment(
        task_id=task_id,
        user_id=current_user.id,
        message=data.message
    )
    db.add(comment)
    db.flush()
    
    # Add attachments
    for att_data in data.attachments:
        attachment = TaskAttachment(
            comment_id=comment.id,
            **att_data.model_dump()
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
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.org_id == current_user.org_id
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
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


# Import func for timestamps
from sqlalchemy import func
