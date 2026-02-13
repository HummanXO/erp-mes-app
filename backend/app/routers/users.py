"""User endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID
from ..database import get_db
from ..models import User
from ..schemas import UserResponse
from ..auth import PermissionChecker

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
def get_users(
    current_user: User = Depends(PermissionChecker("canManageUsers")),
    db: Session = Depends(get_db)
):
    """Get all users."""
    users = db.query(User).filter(User.org_id == current_user.org_id).all()
    return [UserResponse.model_validate(u) for u in users]


@router.get("/operators", response_model=list[UserResponse])
def get_operators(
    current_user: User = Depends(PermissionChecker("canManageUsers")),
    db: Session = Depends(get_db)
):
    """Get all operators."""
    users = db.query(User).filter(
        User.org_id == current_user.org_id,
        User.role == "operator"
    ).all()
    return [UserResponse.model_validate(u) for u in users]


@router.get("/by-role/{role}", response_model=list[UserResponse])
def get_users_by_role(
    role: str,
    current_user: User = Depends(PermissionChecker("canManageUsers")),
    db: Session = Depends(get_db)
):
    """Get users by role."""
    users = db.query(User).filter(
        User.org_id == current_user.org_id,
        User.role == role
    ).all()
    return [UserResponse.model_validate(u) for u in users]


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: UUID,
    current_user: User = Depends(PermissionChecker("canManageUsers")),
    db: Session = Depends(get_db)
):
    """Get user by ID."""
    user = db.query(User).filter(
        User.id == user_id,
        User.org_id == current_user.org_id
    ).first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse.model_validate(user)
