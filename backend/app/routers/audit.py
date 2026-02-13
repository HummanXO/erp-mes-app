"""Audit event endpoints."""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..auth import PermissionChecker
from ..database import get_db
from ..models import AuditEvent, User

router = APIRouter(prefix="/audit-events", tags=["audit"])


@router.get("")
def get_audit_events(
    part_id: Optional[UUID] = None,
    limit: int = Query(200, ge=1, le=1000),
    current_user: User = Depends(PermissionChecker("canViewAudit")),
    db: Session = Depends(get_db),
):
    """Get recent audit events for organization (optionally scoped to part)."""
    query = db.query(AuditEvent).filter(AuditEvent.org_id == current_user.org_id)

    if part_id:
        query = query.filter(AuditEvent.part_id == part_id)

    events = (
        query.order_by(AuditEvent.created_at.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": str(event.id),
            "action": event.action,
            "entity_type": event.entity_type,
            "entity_id": str(event.entity_id),
            "entity_name": event.entity_name,
            "user_id": str(event.user_id) if event.user_id else None,
            "user_name": event.user_name,
            "timestamp": event.created_at.isoformat() if event.created_at else None,
            "details": event.details or {},
            "part_id": str(event.part_id) if event.part_id else None,
            "part_code": event.part_code,
        }
        for event in events
    ]
