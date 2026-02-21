"""Task response serialization helpers with batched relation loading."""
from __future__ import annotations

from collections import defaultdict
from uuid import UUID

from sqlalchemy.orm import Session, selectinload

from ..models import Part, Task, TaskComment, TaskReadStatus, User
from ..schemas import AttachmentBase, PartBrief, TaskCommentResponse, TaskResponse, UserBrief


def build_task_response_context(db: Session, tasks: list[Task], current_user: User) -> dict:
    """Preload all related entities in O(1) query count for a task page."""
    if not tasks:
        return {
            "users_by_id": {},
            "parts_by_id": {},
            "comments_by_task_id": {},
            "read_rows_by_task_id": {},
        }

    task_ids = [task.id for task in tasks]
    user_ids: set[UUID] = set()
    part_ids: set[UUID] = set()

    for task in tasks:
        if task.creator_id:
            user_ids.add(task.creator_id)
        if task.accepted_by_id:
            user_ids.add(task.accepted_by_id)
        if task.reviewed_by_id:
            user_ids.add(task.reviewed_by_id)
        if task.part_id:
            part_ids.add(task.part_id)

    comments = (
        db.query(TaskComment)
        .options(selectinload(TaskComment.attachments))
        .filter(TaskComment.task_id.in_(task_ids))
        .all()
    )
    comments_by_task_id: dict[UUID, list[TaskComment]] = defaultdict(list)
    for comment in comments:
        comments_by_task_id[comment.task_id].append(comment)
        if comment.user_id:
            user_ids.add(comment.user_id)

    users_by_id: dict[UUID, User] = {}
    if user_ids:
        users = (
            db.query(User)
            .filter(
                User.org_id == current_user.org_id,
                User.id.in_(user_ids),
            )
            .all()
        )
        users_by_id = {user.id: user for user in users}

    parts_by_id: dict[UUID, Part] = {}
    if part_ids:
        parts = (
            db.query(Part)
            .filter(
                Part.org_id == current_user.org_id,
                Part.id.in_(part_ids),
            )
            .all()
        )
        parts_by_id = {part.id: part for part in parts}

    read_rows = (
        db.query(TaskReadStatus, User)
        .join(User, TaskReadStatus.user_id == User.id)
        .filter(TaskReadStatus.task_id.in_(task_ids))
        .all()
    )
    read_rows_by_task_id: dict[UUID, list[tuple[TaskReadStatus, User]]] = defaultdict(list)
    for status, user in read_rows:
        read_rows_by_task_id[status.task_id].append((status, user))

    return {
        "users_by_id": users_by_id,
        "parts_by_id": parts_by_id,
        "comments_by_task_id": comments_by_task_id,
        "read_rows_by_task_id": read_rows_by_task_id,
    }


def task_to_response_from_context(task: Task, current_user: User, context: dict) -> TaskResponse:
    users_by_id: dict[UUID, User] = context["users_by_id"]
    parts_by_id: dict[UUID, Part] = context["parts_by_id"]
    comments_by_task_id: dict[UUID, list[TaskComment]] = context["comments_by_task_id"]
    read_rows_by_task_id: dict[UUID, list[tuple[TaskReadStatus, User]]] = context["read_rows_by_task_id"]

    creator = users_by_id.get(task.creator_id)
    accepted_by = users_by_id.get(task.accepted_by_id) if task.accepted_by_id else None
    reviewed_by = users_by_id.get(task.reviewed_by_id) if task.reviewed_by_id else None
    part = parts_by_id.get(task.part_id) if task.part_id else None

    read_rows = read_rows_by_task_id.get(task.id, [])
    is_read = any(status.user_id == current_user.id for status, _user in read_rows)
    read_by_users = [
        {"user": UserBrief.model_validate(user), "read_at": status.read_at}
        for status, user in read_rows
        if status.user_id != task.creator_id
    ]

    comments = []
    for comment in comments_by_task_id.get(task.id, []):
        comment_user = users_by_id.get(comment.user_id)
        comments.append(
            TaskCommentResponse(
                id=comment.id,
                user=UserBrief.model_validate(comment_user) if comment_user else None,
                message=comment.message,
                attachments=[AttachmentBase.model_validate(a) for a in comment.attachments],
                created_at=comment.created_at,
            )
        )

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
        updated_at=task.updated_at,
    )


def tasks_to_response(db: Session, tasks: list[Task], current_user: User) -> list[TaskResponse]:
    context = build_task_response_context(db, tasks, current_user)
    return [task_to_response_from_context(task, current_user, context) for task in tasks]


def task_to_response(db: Session, task: Task, current_user: User) -> TaskResponse:
    return tasks_to_response(db, [task], current_user)[0]

