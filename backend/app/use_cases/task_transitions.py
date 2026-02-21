"""Task lifecycle use-cases used by task router endpoints."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..domain_errors import DomainError
from ..models import AuditEvent, Task, TaskComment, TaskReadStatus, User
from ..security import is_task_assigned_to_user


def _get_task_or_404(*, db: Session, task_id: UUID, org_id: UUID) -> Task:
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.org_id == org_id,
    ).first()
    if not task:
        raise DomainError(
            code="TASK_NOT_FOUND",
            http_status=404,
            message="Task not found",
        )
    return task


def _ensure_read_status(*, db: Session, task_id: UUID, user_id: UUID) -> None:
    read_status = db.query(TaskReadStatus).filter(
        TaskReadStatus.task_id == task_id,
        TaskReadStatus.user_id == user_id,
    ).first()
    if not read_status:
        db.add(TaskReadStatus(task_id=task_id, user_id=user_id))


def accept_task_use_case(*, db: Session, task_id: UUID, current_user: User) -> Task:
    """Accept task by assigned user."""
    task = _get_task_or_404(db=db, task_id=task_id, org_id=current_user.org_id)

    if not is_task_assigned_to_user(task, current_user):
        raise DomainError(
            code="TASK_NOT_ASSIGNED",
            http_status=403,
            message="Task not assigned to you",
        )

    # Idempotent: if already accepted by this user, return as-is.
    if task.accepted_by_id == current_user.id:
        return task

    if task.accepted_by_id and task.accepted_by_id != current_user.id:
        raise DomainError(
            code="TASK_ALREADY_ACCEPTED",
            http_status=400,
            message="Task already accepted by another user",
        )

    old_status = task.status
    task.accepted_by_id = current_user.id
    task.accepted_at = func.now()
    task.status = "accepted"

    _ensure_read_status(db=db, task_id=task_id, user_id=current_user.id)

    db.add(
        AuditEvent(
            org_id=current_user.org_id,
            action="task_accepted",
            entity_type="task",
            entity_id=task.id,
            entity_name=task.title,
            user_id=current_user.id,
            user_name=current_user.initials,
            details={"oldStatus": old_status, "newStatus": "accepted"},
        )
    )
    db.commit()
    return task


def start_task_use_case(*, db: Session, task_id: UUID, current_user: User) -> Task:
    """Start accepted task."""
    task = _get_task_or_404(db=db, task_id=task_id, org_id=current_user.org_id)

    if task.accepted_by_id != current_user.id:
        raise DomainError(
            code="TASK_START_FORBIDDEN",
            http_status=403,
            message="Only accepted user can start task",
        )
    if task.status != "accepted":
        raise DomainError(
            code="TASK_INVALID_STATUS_FOR_START",
            http_status=400,
            message="Task must be in accepted status",
        )

    old_status = task.status
    task.status = "in_progress"

    db.add(
        AuditEvent(
            org_id=current_user.org_id,
            action="task_status_changed",
            entity_type="task",
            entity_id=task.id,
            entity_name=task.title,
            user_id=current_user.id,
            user_name=current_user.initials,
            details={"oldStatus": old_status, "newStatus": "in_progress"},
        )
    )
    db.commit()
    return task


def send_to_review_use_case(*, db: Session, task_id: UUID, current_user: User) -> Task:
    """Move task to review state."""
    task = _get_task_or_404(db=db, task_id=task_id, org_id=current_user.org_id)

    if task.accepted_by_id != current_user.id:
        raise DomainError(
            code="TASK_SEND_REVIEW_FORBIDDEN",
            http_status=403,
            message="Only accepted user can send for review",
        )

    # Idempotent.
    if task.status == "review":
        return task

    old_status = task.status
    task.status = "review"

    db.add(
        AuditEvent(
            org_id=current_user.org_id,
            action="task_sent_for_review",
            entity_type="task",
            entity_id=task.id,
            entity_name=task.title,
            user_id=current_user.id,
            user_name=current_user.initials,
            details={"oldStatus": old_status, "newStatus": "review"},
        )
    )
    db.commit()
    return task


def review_task_use_case(
    *,
    db: Session,
    task_id: UUID,
    current_user: User,
    approved: bool,
    comment: str | None,
) -> Task:
    """Approve or return task from review."""
    task = _get_task_or_404(db=db, task_id=task_id, org_id=current_user.org_id)

    if task.creator_id != current_user.id:
        raise DomainError(
            code="TASK_REVIEW_FORBIDDEN",
            http_status=403,
            message="Only creator can review task",
        )
    if task.status != "review":
        raise DomainError(
            code="TASK_INVALID_STATUS_FOR_REVIEW",
            http_status=400,
            message="Task must be in review status",
        )

    old_status = task.status
    task.reviewed_by_id = current_user.id
    task.reviewed_at = func.now()

    if approved:
        task.status = "done"
        if comment:
            db.add(
                TaskComment(
                    task_id=task_id,
                    user_id=current_user.id,
                    message=f"Принято: {comment}",
                )
            )
        db.add(
            AuditEvent(
                org_id=current_user.org_id,
                action="task_approved",
                entity_type="task",
                entity_id=task.id,
                entity_name=task.title,
                user_id=current_user.id,
                user_name=current_user.initials,
                details={"oldStatus": old_status, "newStatus": "done", "comment": comment},
            )
        )
    else:
        task.status = "in_progress"
        task.review_comment = comment
        if comment:
            db.add(
                TaskComment(
                    task_id=task_id,
                    user_id=current_user.id,
                    message=f"Возвращено: {comment}",
                )
            )
        db.add(
            AuditEvent(
                org_id=current_user.org_id,
                action="task_returned",
                entity_type="task",
                entity_id=task.id,
                entity_name=task.title,
                user_id=current_user.id,
                user_name=current_user.initials,
                details={"oldStatus": old_status, "newStatus": "in_progress", "comment": comment},
            )
        )

    db.commit()
    return task
