"""Security helpers (RBAC, multi-tenant scoping, and access checks)."""

from __future__ import annotations

from typing import Any, TypeVar
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from .auth import check_permission
from .models import AccessGrant, Part, SpecItem, Specification, Task, User

T = TypeVar("T")


def require_permission(user: User, permission: str) -> None:
    """Enforce a role permission server-side."""
    if not check_permission(user, permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: {permission} required",
        )


def require_org_entity(db: Session, model: type[T], *, entity_id: UUID, org_id: UUID, not_found: str) -> T:
    """Load an entity by (id, org_id) or raise 404."""
    entity = db.query(model).filter(  # type: ignore[arg-type]
        getattr(model, "id") == entity_id,  # noqa: B009
        getattr(model, "org_id") == org_id,  # noqa: B009
    ).first()
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found)
    return entity


def is_task_assigned_to_user(task: Task, user: User) -> bool:
    """Check if a task is assigned to a user (including group assignments)."""
    if task.assignee_type == "all":
        return True
    if task.assignee_type == "role" and task.assignee_role == user.role:
        return True
    if task.assignee_type == "user" and task.assignee_id == user.id:
        return True
    return False


def can_view_task(task: Task, user: User) -> bool:
    """Task visibility policy: operators are scoped, other roles are org-wide."""
    if user.role != "operator":
        return True
    return bool(task.creator_id == user.id or is_task_assigned_to_user(task, user))


def _granted_specification_ids_query(db: Session, user: User):
    return db.query(AccessGrant.entity_id).filter(
        AccessGrant.org_id == user.org_id,
        AccessGrant.entity_type == "specification",
        AccessGrant.user_id == user.id,
    )


def _operator_visible_specification_ids_query(db: Session, user: User):
    granted_spec_ids = _granted_specification_ids_query(db, user)
    return db.query(Specification.id).filter(
        Specification.org_id == user.org_id,
        (Specification.published_to_operators.is_(True))
        | (Specification.id.in_(granted_spec_ids)),
    )


def _part_linked_to_any_spec_exists(db: Session, org_id: UUID):
    return db.query(SpecItem.id).join(
        Specification,
        SpecItem.specification_id == Specification.id,
    ).filter(
        SpecItem.part_id == Part.id,
        Specification.org_id == org_id,
    ).exists()


def _part_linked_to_granted_spec_exists(db: Session, user: User):
    visible_spec_ids = _operator_visible_specification_ids_query(db, user)
    return db.query(SpecItem.id).join(
        Specification,
        SpecItem.specification_id == Specification.id,
    ).filter(
        SpecItem.part_id == Part.id,
        Specification.org_id == user.org_id,
        Specification.id.in_(visible_spec_ids),
    ).exists()


def apply_part_visibility_scope(query: Any, db: Session, current_user: User):
    """Apply Part visibility policy to a SQLAlchemy query."""
    if check_permission(current_user, "canManageSpecifications"):
        return query
    if current_user.role == "operator":
        return query.filter(_part_linked_to_granted_spec_exists(db, current_user))
    if not check_permission(current_user, "canViewSpecifications"):
        return query.filter(~_part_linked_to_any_spec_exists(db, current_user.org_id))
    return query


def can_access_part(db: Session, part: Part, current_user: User) -> bool:
    """Object-level part access check (used for IDOR prevention)."""
    if part.org_id != current_user.org_id:
        return False
    if check_permission(current_user, "canManageSpecifications"):
        return True

    linked_spec_ids = {
        row[0]
        for row in db.query(SpecItem.specification_id).join(
            Specification,
            SpecItem.specification_id == Specification.id,
        ).filter(
            SpecItem.part_id == part.id,
            Specification.org_id == current_user.org_id,
        ).distinct().all()
    }

    if current_user.role == "operator":
        if not linked_spec_ids:
            return False
        visible_spec_ids = {row[0] for row in _operator_visible_specification_ids_query(db, current_user).all()}
        return bool(linked_spec_ids.intersection(visible_spec_ids))

    if not check_permission(current_user, "canViewSpecifications"):
        return not linked_spec_ids

    return True

