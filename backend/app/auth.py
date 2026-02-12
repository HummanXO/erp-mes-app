"""Authentication and authorization."""
from datetime import datetime, timedelta
from typing import Optional
import logging
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .config import settings
from .database import get_db
from .models import User

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = logging.getLogger(__name__)

# Bearer token scheme
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash."""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        # Invalid/corrupted hash should not crash login flow.
        logger.exception("Password verification failed due to invalid hash format")
        return False


def get_password_hash(password: str) -> str:
    """Hash password."""
    return pwd_context.hash(password)


# Alias for convenience
hash_password = get_password_hash


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """Create JWT refresh token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict:
    """Decode JWT token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user."""
    token = credentials.credentials
    payload = decode_token(token)
    
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type"
        )
    
    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )
    
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password change required before continuing",
        )
    
    return user


def get_current_user_allow_password_change(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user, allowing only password-change flow."""
    token = credentials.credentials
    payload = decode_token(token)
    
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type"
        )
    
    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )
    
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    return user


# Permission checks
class PermissionChecker:
    """Check user permissions based on role."""
    
    def __init__(self, required_permission: str):
        self.required_permission = required_permission
    
    def __call__(self, current_user: User = Depends(get_current_user)):
        """Check if user has required permission."""
        permissions = ROLE_PERMISSIONS.get(current_user.role, {})
        if not permissions.get(self.required_permission, False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {self.required_permission} required"
            )
        return current_user


# Role permissions matrix
ROLE_PERMISSIONS = {
    "admin": {
        "canViewAll": True,
        "canViewCooperation": True,
        "canEditFacts": True,
        "canCreateTasks": True,
        "canManageUsers": True,
        "canDeleteData": True,
        "canViewReports": True,
        "canCreateParts": True,
        "canEditParts": True,
        "canManageLogistics": True,
        "canViewSpecifications": True,
        "canManageSpecifications": True,
    },
    "director": {
        "canViewAll": True,
        "canViewCooperation": True,
        "canEditFacts": True,
        "canCreateTasks": True,
        "canManageUsers": False,
        "canDeleteData": False,
        "canViewReports": True,
        "canCreateParts": True,
        "canEditParts": True,
        "canManageLogistics": True,
        "canViewSpecifications": True,
        "canManageSpecifications": True,
    },
    "chief_engineer": {
        "canViewAll": True,
        "canViewCooperation": True,
        "canEditFacts": False,
        "canCreateTasks": True,
        "canManageUsers": False,
        "canDeleteData": False,
        "canViewReports": True,
        "canCreateParts": True,
        "canEditParts": True,
        "canManageLogistics": False,
        "canViewSpecifications": True,
        "canManageSpecifications": True,
    },
    "shop_head": {
        "canViewAll": True,
        "canViewCooperation": True,
        "canEditFacts": True,
        "canCreateTasks": True,
        "canManageUsers": False,
        "canDeleteData": False,
        "canViewReports": True,
        "canCreateParts": True,
        "canEditParts": True,
        "canManageLogistics": True,
        "canViewSpecifications": True,
        "canManageSpecifications": True,
    },
    "supply": {
        "canViewAll": True,
        "canViewCooperation": True,
        "canEditFacts": False,
        "canCreateTasks": True,
        "canManageUsers": False,
        "canDeleteData": False,
        "canViewReports": True,
        "canCreateParts": True,
        "canEditParts": True,
        "canManageLogistics": True,
        "canViewSpecifications": True,
        "canManageSpecifications": True,
    },
    "master": {
        "canViewAll": True,
        "canViewCooperation": False,
        "canEditFacts": True,
        "canCreateTasks": True,
        "canManageUsers": False,
        "canDeleteData": False,
        "canViewReports": True,
        "canCreateParts": True,
        "canEditParts": True,
        "canManageLogistics": False,
        "canViewSpecifications": True,
        "canManageSpecifications": True,
    },
    "operator": {
        "canViewAll": False,
        "canViewCooperation": False,
        "canEditFacts": True,
        "canCreateTasks": False,
        "canManageUsers": False,
        "canDeleteData": False,
        "canViewReports": False,
        "canCreateParts": False,
        "canEditParts": False,
        "canManageLogistics": False,
        "canViewSpecifications": True,
        "canManageSpecifications": False,
    },
}


def check_permission(user: User, permission: str) -> bool:
    """Check if user has specific permission."""
    permissions = ROLE_PERMISSIONS.get(user.role, {})
    return permissions.get(permission, False)
