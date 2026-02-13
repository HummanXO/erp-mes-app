"""Authentication and authorization."""
from datetime import datetime, timedelta
from typing import Optional
import logging
import secrets
import time
from uuid import UUID
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


TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"


def generate_temporary_password(length: int | None = None) -> str:
    """Generate a cryptographically strong temporary password (returned only once)."""
    size = length or settings.TEMP_PASSWORD_LENGTH
    if size < 16:
        # Enforce a safe minimum regardless of env misconfiguration.
        size = 16
    return "".join(secrets.choice(TEMP_PASSWORD_ALPHABET) for _ in range(size))


def validate_new_password(*, new_password: str, username: str | None = None) -> None:
    """Server-side password policy validation."""
    if new_password is None:
        raise HTTPException(status_code=400, detail="New password is required")

    pwd = new_password.strip("\n")
    if len(pwd) < settings.PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters",
        )
    if len(pwd) > settings.PASSWORD_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at most {settings.PASSWORD_MAX_LENGTH} characters",
        )
    if username and pwd.lower() == username.lower():
        raise HTTPException(status_code=400, detail="Password must not match username")


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
    now = int(time.time())
    if expires_delta:
        exp = now + int(expires_delta.total_seconds())
    else:
        exp = now + int(settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES) * 60
    to_encode.update({"exp": exp, "iat": now, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """Create JWT refresh token."""
    to_encode = data.copy()
    now = int(time.time())
    exp = now + int(settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS) * 86400
    to_encode.update({"exp": exp, "iat": now, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict:
    """Decode JWT token."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": False},
        )
        now = int(time.time())
        exp = payload.get("exp")
        if exp is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        try:
            exp_int = int(exp)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if now > exp_int + int(settings.JWT_LEEWAY_SECONDS):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expired",
                headers={"WWW-Authenticate": "Bearer"},
            )

        iat = payload.get("iat")
        if iat is not None:
            try:
                iat_int = int(iat)
                # Reject tokens issued far in the future (clock skew / malicious tokens).
                if iat_int > now + int(settings.JWT_LEEWAY_SECONDS):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Could not validate credentials",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Could not validate credentials",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _parse_token_subject(payload: dict) -> UUID:
    """Parse and validate JWT subject as UUID."""
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return UUID(str(sub))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _get_token_version(payload: dict) -> int:
    """Return token version from JWT payload (legacy tokens default to 0)."""
    ver = payload.get("ver", 0)
    try:
        return int(ver)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _assert_token_not_revoked(user: User, payload: dict) -> None:
    token_ver = _get_token_version(payload)
    if user.token_version != token_ver:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
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
    
    user_id = _parse_token_subject(payload)
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )

    _assert_token_not_revoked(user, payload)
    
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
    
    user_id = _parse_token_subject(payload)
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )

    _assert_token_not_revoked(user, payload)
    
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
        "canRollbackFacts": True,
        "canCreateTasks": True,
        "canManageUsers": True,
        "canDeleteData": True,
        "canViewReports": True,
        "canViewAudit": True,
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
        "canRollbackFacts": True,
        "canCreateTasks": True,
        "canManageUsers": False,
        "canDeleteData": False,
        "canViewReports": True,
        "canViewAudit": True,
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
        "canRollbackFacts": False,
        "canCreateTasks": True,
        "canManageUsers": False,
        "canDeleteData": False,
        "canViewReports": True,
        "canViewAudit": True,
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
        "canRollbackFacts": True,
        "canCreateTasks": True,
        "canManageUsers": False,
        "canDeleteData": False,
        "canViewReports": True,
        "canViewAudit": True,
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
        "canRollbackFacts": False,
        "canCreateTasks": True,
        "canManageUsers": False,
        "canDeleteData": False,
        "canViewReports": True,
        "canViewAudit": True,
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
        "canRollbackFacts": True,
        "canCreateTasks": True,
        "canManageUsers": False,
        "canDeleteData": False,
        "canViewReports": True,
        "canViewAudit": True,
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
        "canRollbackFacts": False,
        "canCreateTasks": False,
        "canManageUsers": False,
        "canDeleteData": False,
        "canViewReports": False,
        "canViewAudit": False,
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
