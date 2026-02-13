"""Directory endpoints (safe, limited user listings).

These endpoints exist so the UI can resolve IDs to initials/roles without granting
full user-management permissions.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from ..auth import get_current_user
from ..database import get_db
from ..models import User
from ..schemas import UserDirectoryItem

router = APIRouter(prefix="/directory", tags=["directory"])


@router.get("/users", response_model=list[UserDirectoryItem])
def list_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    users = (
        db.query(User)
        .filter(User.org_id == current_user.org_id, User.is_active.is_(True))
        .order_by(User.initials)
        .all()
    )
    return [UserDirectoryItem.model_validate(u) for u in users]


@router.get("/users/{user_id}", response_model=UserDirectoryItem)
def get_user(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.id == user_id, User.org_id == current_user.org_id, User.is_active.is_(True))
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserDirectoryItem.model_validate(user)

