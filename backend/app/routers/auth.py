"""Auth endpoints."""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from ..database import get_db
from ..models import User, AuditEvent
from ..schemas import LoginRequest, TokenResponse, UserResponse, RefreshTokenRequest, ChangePasswordRequest
from ..auth import (
    verify_password, hash_password, create_access_token, create_refresh_token,
    get_current_user, get_current_user_allow_password_change, decode_token
)
from ..config import settings
from datetime import timedelta

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Login with username and password."""
    user = db.query(User).filter(
        User.username == request.username,
        User.is_active == True
    ).first()
    
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create tokens
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    
    # Audit failure must not break successful login.
    try:
        audit = AuditEvent(
            org_id=user.org_id,
            action="user_login",
            entity_type="user",
            entity_id=user.id,
            user_id=user.id,
            user_name=user.initials,
        )
        db.add(audit)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to write login audit event")
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse.model_validate(user),
        must_change_password=user.must_change_password
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(request: RefreshTokenRequest, db: Session = Depends(get_db)):
    """Refresh access token."""
    payload = decode_token(request.refresh_token)
    
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type"
        )
    
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    # Create new tokens
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse.model_validate(user)
    )


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user_allow_password_change), db: Session = Depends(get_db)):
    """Logout (audit log only)."""
    audit = AuditEvent(
        org_id=current_user.org_id,
        action="user_logout",
        entity_type="user",
        entity_id=current_user.id,
        user_id=current_user.id,
        user_name=current_user.initials,
    )
    db.add(audit)
    db.commit()
    
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info."""
    return UserResponse.model_validate(current_user)


@router.post("/change-password")
def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user_allow_password_change),
    db: Session = Depends(get_db)
):
    """Change user password."""
    # Verify old password
    if not verify_password(request.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid current password"
        )

    # Persist password change first, so audit issues do not block login recovery.
    try:
        current_user.password_hash = hash_password(request.new_password)
        current_user.must_change_password = False
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to persist password change")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to change password",
        )

    # Best-effort audit.
    try:
        audit = AuditEvent(
            org_id=current_user.org_id,
            action="password_changed",
            entity_type="user",
            entity_id=current_user.id,
            user_id=current_user.id,
            user_name=current_user.initials,
        )
        db.add(audit)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to write password change audit event")

    return {"message": "Password changed successfully"}
