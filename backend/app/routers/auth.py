"""Auth endpoints."""
import logging
import time
import ipaddress
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from uuid import UUID, uuid4

import redis
from redis.exceptions import RedisError
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from ..auth import (
    PermissionChecker,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_temporary_password,
    get_current_user,
    get_current_user_allow_password_change,
    hash_password,
    validate_new_password,
    verify_password,
    get_role_ui_permissions,
)
from ..config import settings
from ..database import get_db
from ..models import AuditEvent, RefreshSession, User
from ..schemas import (
    AuthUserResponse,
    ChangePasswordRequest,
    LoginRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


_redis_client = None


def _auth_user_response(user: User) -> AuthUserResponse:
    base = UserResponse.model_validate(user)
    return AuthUserResponse(**base.model_dump(), permissions=get_role_ui_permissions(user.role))


def _get_redis():
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


def _get_client_ip(request: Request) -> str:
    if settings.TRUST_PROXY_HEADERS:
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            try:
                ipaddress.ip_address(real_ip)
                return real_ip
            except ValueError:
                pass

        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # X-Forwarded-For may contain a list: client, proxy1, proxy2
            candidate = forwarded.split(",")[0].strip()
            try:
                ipaddress.ip_address(candidate)
                return candidate
            except ValueError:
                pass

    if request.client:
        return request.client.host
    return "unknown"


def _set_no_store(response: Response) -> None:
    # Reduce the chance of logging/caching secrets (temporary passwords, tokens).
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _csrf_trusted_origins() -> set[str]:
    raw = settings.CSRF_TRUSTED_ORIGINS or settings.ALLOWED_ORIGINS
    trusted: set[str] = set()
    for origin in raw.split(","):
        normalized = _normalize_origin(origin)
        if normalized:
            trusted.add(normalized)
    return trusted


def _normalize_origin(value: str | None) -> str | None:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    parsed = urlparse(raw)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


def _enforce_csrf_origin(request: Request) -> None:
    """CSRF defense for browser clients using cookies.

    If Origin/Referer headers are present, they must match an allowed origin.
    In production, unsafe requests carrying cookies MUST include Origin/Referer.
    """
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return

    trusted = _csrf_trusted_origins()
    origin = request.headers.get("origin")
    if origin:
        normalized_origin = _normalize_origin(origin)
        if not normalized_origin or normalized_origin not in trusted:
            raise HTTPException(status_code=403, detail="CSRF origin denied")
        return

    referer = request.headers.get("referer")
    if referer:
        normalized_referer_origin = _normalize_origin(referer)
        if not normalized_referer_origin or normalized_referer_origin not in trusted:
            raise HTTPException(status_code=403, detail="CSRF origin denied")
        return

    # Production: if cookies are present on an unsafe request, require Origin/Referer.
    # This blocks classic CSRF where the browser automatically includes cookies cross-site.
    if settings.ENV.lower() == "production":
        has_cookies = bool(request.headers.get("cookie")) or bool(request.cookies)
        if has_cookies:
            # Some browsers/proxy chains may omit Origin/Referer on same-origin fetches.
            # Use Fetch Metadata as a strict fallback: allow only same-origin/same-site.
            sec_fetch_site = (request.headers.get("sec-fetch-site") or "").strip().lower()
            if sec_fetch_site in {"same-origin", "same-site", "none"}:
                return
            raise HTTPException(status_code=403, detail="CSRF origin required")


def _incr_with_ttl(key: str, ttl_seconds: int) -> tuple[int, int]:
    """
    Increment a Redis counter and ensure it has an expiry.
    Returns (value, ttl_remaining_seconds).
    """
    r = _get_redis()
    value = r.incr(key)
    if value == 1:
        r.expire(key, ttl_seconds)
    ttl = r.ttl(key)
    if ttl is None or ttl < 0:
        ttl = ttl_seconds
    return int(value), int(ttl)


def _enforce_login_rate_limits(*, request: Request, username: str | None) -> None:
    ip = _get_client_ip(request)
    try:
        # Hard per-IP limit (password spraying protection).
        attempts, ttl = _incr_with_ttl(f"auth:rl:login:ip:{ip}", 60)
        if attempts > settings.AUTH_LOGIN_IP_LIMIT_PER_MINUTE:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Try again later.",
                headers={"Retry-After": str(ttl)},
            )

        # Per-username lockout (brute force protection). Only check when username is present.
        if username:
            r = _get_redis()
            lock_key = f"auth:lock:login:user:{username.lower()}"
            lock_ttl = r.ttl(lock_key)
            if lock_ttl and lock_ttl > 0:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Account temporarily locked due to failed logins. Try again later.",
                    headers={"Retry-After": str(int(lock_ttl))},
                )
    except RedisError:
        # Fail open if Redis is down to avoid total auth outage.
        logger.exception("Redis error during login rate limiting (fail-open)")


def _register_login_failure(*, user: User | None, username: str | None) -> None:
    if not username:
        return
    try:
        if not user:
            return

        username_key = username.lower()
        fails, _ = _incr_with_ttl(
            f"auth:fail:login:user:{username_key}",
            settings.AUTH_LOGIN_USER_LOCK_SECONDS,
        )
        if fails >= settings.AUTH_LOGIN_USER_FAIL_THRESHOLD:
            r = _get_redis()
            r.set(
                f"auth:lock:login:user:{username_key}",
                "1",
                ex=settings.AUTH_LOGIN_USER_LOCK_SECONDS,
            )
    except RedisError:
        logger.exception("Redis error during login failure tracking (fail-open)")


def _clear_login_failures(*, username: str | None) -> None:
    if not username:
        return
    try:
        r = _get_redis()
        username_key = username.lower()
        r.delete(f"auth:fail:login:user:{username_key}")
        r.delete(f"auth:lock:login:user:{username_key}")
    except RedisError:
        logger.exception("Redis error during login failure cleanup (ignored)")


def _is_request_https(request: Request) -> bool:
    if settings.TRUST_PROXY_HEADERS:
        proto = request.headers.get("x-forwarded-proto")
        if proto:
            return proto.split(",")[0].strip().lower() == "https"
    return request.url.scheme == "https"


def _set_refresh_cookie(response: Response, *, request: Request, token: str) -> None:
    secure = bool(settings.AUTH_REFRESH_COOKIE_SECURE or _is_request_https(request))
    response.set_cookie(
        key=settings.AUTH_REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=secure,
        samesite=settings.AUTH_REFRESH_COOKIE_SAMESITE,
        path=settings.AUTH_REFRESH_COOKIE_PATH,
        max_age=int(settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS) * 86400,
    )


def _clear_refresh_cookie(response: Response, *, request: Request) -> None:
    secure = bool(settings.AUTH_REFRESH_COOKIE_SECURE or _is_request_https(request))
    response.delete_cookie(
        key=settings.AUTH_REFRESH_COOKIE_NAME,
        path=settings.AUTH_REFRESH_COOKIE_PATH,
        secure=secure,
        samesite=settings.AUTH_REFRESH_COOKIE_SAMESITE,
    )


def _revoke_all_refresh_sessions(db: Session, *, user_id: UUID) -> None:
    now = _utc_now()
    db.query(RefreshSession).filter(
        RefreshSession.user_id == user_id,
        RefreshSession.revoked_at.is_(None),
    ).update(
        {"revoked_at": now},
        synchronize_session=False,
    )


def _create_refresh_session(db: Session, *, user: User, request: Request) -> str:
    jti = uuid4().hex
    now = _utc_now()
    expires_at = now + timedelta(days=int(settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS))
    session = RefreshSession(
        user_id=user.id,
        jti=jti,
        issued_at=now,
        expires_at=expires_at,
        created_ip=_get_client_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:512],
    )
    db.add(session)
    return jti


class AdminCreateUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    initials: str = Field(min_length=1, max_length=50)
    role: str = Field(pattern="^(admin|director|chief_engineer|shop_head|supply|master|operator)$")
    email: str | None = Field(default=None, max_length=255)


class AdminCreateUserResponse(BaseModel):
    user: UserResponse
    temporary_password: str
    must_change_password: bool = True
    warning: str


class AdminResetPasswordRequest(BaseModel):
    user_id: UUID | None = None
    username: str | None = Field(default=None, min_length=1, max_length=100)


class AdminResetPasswordResponse(BaseModel):
    user: UserResponse
    temporary_password: str
    must_change_password: bool = True
    warning: str

@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """Login with username and password."""
    _set_no_store(response)
    # Login sets the refresh cookie; enforce Origin/Referer checks to reduce login CSRF risk.
    _enforce_csrf_origin(request)

    username = (payload.username or "").strip()

    # Rate limits / lockouts (fail-open if Redis is unavailable).
    try:
        _enforce_login_rate_limits(request=request, username=username or None)
    except HTTPException as exc:
        # Best-effort audit (do not block on audit failures).
        if exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS and username:
            try:
                user = db.query(User).filter(
                    User.username == username,
                ).first()
                if user:
                    audit = AuditEvent(
                        org_id=user.org_id,
                        action="LOGIN_RATE_LIMITED",
                        entity_type="user",
                        entity_id=user.id,
                        user_id=user.id,
                        user_name=user.initials,
                        details={"ip": _get_client_ip(request)},
                    )
                    db.add(audit)
                    db.commit()
            except SQLAlchemyError:
                db.rollback()
                logger.exception("Failed to write rate limit audit event")
        raise

    user = db.query(User).filter(
        User.username == username,
        User.is_active == True
    ).first()
    
    if not user or not verify_password(payload.password, user.password_hash):
        # Register failure (best-effort) and lock account on repeated failures.
        _register_login_failure(user=user, username=username or None)

        # Best-effort audit for known users (avoid leaking user existence).
        if user:
            try:
                audit = AuditEvent(
                    org_id=user.org_id,
                    action="LOGIN_FAILED",
                    entity_type="user",
                    entity_id=user.id,
                    user_id=user.id,
                    user_name=user.initials,
                    details={"ip": _get_client_ip(request)},
                )
                db.add(audit)
                db.commit()
            except SQLAlchemyError:
                db.rollback()
                logger.exception("Failed to write login failure audit event")

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    _clear_login_failures(username=username)
    
    # Create tokens
    access_token = create_access_token({"sub": str(user.id), "ver": user.token_version})

    # Create refresh session + cookie (rotation is enforced in /auth/refresh).
    jti = _create_refresh_session(db, user=user, request=request)
    refresh_cookie_token = create_refresh_token({"sub": str(user.id), "ver": user.token_version, "jti": jti})
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to persist refresh session during login")
        raise HTTPException(status_code=500, detail="Failed to login")

    _set_refresh_cookie(response, request=request, token=refresh_cookie_token)
    
    # Audit failure must not break successful login.
    try:
        audit = AuditEvent(
            org_id=user.org_id,
            action="user_login",
            entity_type="user",
            entity_id=user.id,
            user_id=user.id,
            user_name=user.initials,
            details={"ip": _get_client_ip(request)},
        )
        db.add(audit)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to write login audit event")
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=None,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=_auth_user_response(user),
        must_change_password=user.must_change_password
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(request: Request, response: Response, db: Session = Depends(get_db)):
    """Refresh access token."""
    _set_no_store(response)
    _enforce_csrf_origin(request)

    # Rate limit refresh to reduce abuse (fail-open if Redis is unavailable).
    try:
        ip = _get_client_ip(request)
        attempts, ttl = _incr_with_ttl(f"auth:rl:refresh:ip:{ip}", 60)
        if attempts > settings.AUTH_REFRESH_IP_LIMIT_PER_MINUTE:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many refresh attempts. Try again later.",
                headers={"Retry-After": str(ttl)},
            )
    except RedisError:
        logger.exception("Redis error during refresh rate limiting (fail-open)")

    cookie_token = request.cookies.get(settings.AUTH_REFRESH_COOKIE_NAME)
    if not cookie_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token_payload = decode_token(cookie_token)
    
    if token_payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type"
        )
    
    user_id_raw = token_payload.get("sub")
    try:
        user_id = UUID(str(user_id_raw))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    
    if not user:
        _clear_refresh_cookie(response, request=request)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    try:
        token_ver = int(token_payload.get("ver", 0) or 0)
    except Exception:
        _clear_refresh_cookie(response, request=request)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")

    if user.token_version != token_ver:
        _clear_refresh_cookie(response, request=request)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")

    jti = token_payload.get("jti")
    if not jti or not isinstance(jti, str):
        _clear_refresh_cookie(response, request=request)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")

    # Transactional safety: lock the refresh session row to make rotation + replay detection
    # concurrency-safe under Postgres (SELECT ... FOR UPDATE).
    session = (
        db.query(RefreshSession)
        .filter(
            RefreshSession.user_id == user.id,
            RefreshSession.jti == jti,
        )
        .with_for_update()
        .first()
    )

    if not session:
        _clear_refresh_cookie(response, request=request)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")

    now = _utc_now()

    # Revoked refresh token: could be either benign duplicate refresh (race within grace)
    # or actual replay/theft. If this refresh was rotated recently and we have a replacement
    # session, re-issue the replacement cookie + access token idempotently.
    if session.revoked_at is not None:
        grace = int(settings.AUTH_REFRESH_REUSE_GRACE_SECONDS)
        revoked_at = _as_utc(session.revoked_at)
        if grace > 0 and session.replaced_by_jti and revoked_at:
            age_seconds = (now - revoked_at).total_seconds()
            if age_seconds <= grace:
                replacement = (
                    db.query(RefreshSession)
                    .filter(
                        RefreshSession.user_id == user.id,
                        RefreshSession.jti == session.replaced_by_jti,
                        RefreshSession.revoked_at.is_(None),
                    )
                    .with_for_update()
                    .first()
                )
                replacement_expires_at = _as_utc(replacement.expires_at) if replacement else None
                if replacement and replacement_expires_at and replacement_expires_at >= now:
                    user_resp = _auth_user_response(user)
                    must_change = user.must_change_password
                    access_token = create_access_token({"sub": str(user.id), "ver": user.token_version})
                    refresh_cookie_token = create_refresh_token(
                        {"sub": str(user.id), "ver": user.token_version, "jti": replacement.jti}
                    )
                    # No DB writes in this branch; rollback to release row locks before response side-effects.
                    db.rollback()
                    _set_refresh_cookie(response, request=request, token=refresh_cookie_token)
                    return TokenResponse(
                        access_token=access_token,
                        refresh_token=None,
                        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                        user=user_resp,
                        must_change_password=must_change,
                    )

        # Outside grace or replacement missing/invalid: treat as replay/theft.
        try:
            user.token_version += 1
            _revoke_all_refresh_sessions(db, user_id=user.id)
            db.commit()
        except SQLAlchemyError:
            db.rollback()
            logger.exception("Failed to revoke sessions after refresh replay detection")

        _clear_refresh_cookie(response, request=request)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token replay detected")
    session_expires_at = _as_utc(session.expires_at)
    if session_expires_at and session_expires_at < now:
        try:
            session.revoked_at = now
            db.commit()
        except SQLAlchemyError:
            db.rollback()
            logger.exception("Failed to revoke expired refresh session")
        _clear_refresh_cookie(response, request=request)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")

    # Rotate: revoke old jti, issue a new refresh session and cookie.
    new_jti = uuid4().hex
    session.revoked_at = now
    session.replaced_by_jti = new_jti
    new_session = RefreshSession(
        user_id=user.id,
        jti=new_jti,
        issued_at=now,
        expires_at=now + timedelta(days=int(settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)),
        created_ip=_get_client_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:512],
    )
    db.add(new_session)
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to rotate refresh token")
        raise HTTPException(status_code=500, detail="Failed to refresh session")
    
    # Create new tokens
    access_token = create_access_token({"sub": str(user.id), "ver": user.token_version})
    refresh_cookie_token = create_refresh_token({"sub": str(user.id), "ver": user.token_version, "jti": new_jti})
    _set_refresh_cookie(response, request=request, token=refresh_cookie_token)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=None,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=_auth_user_response(user),
        must_change_password=user.must_change_password,
    )


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user_allow_password_change),
    db: Session = Depends(get_db),
):
    """Logout by revoking currently issued tokens (token_version bump) + audit."""
    start = time.perf_counter()
    _set_no_store(response)
    _enforce_csrf_origin(request)

    try:
        _revoke_all_refresh_sessions(db, user_id=current_user.id)
        current_user.token_version += 1
        audit = AuditEvent(
            org_id=current_user.org_id,
            action="user_logout",
            entity_type="user",
            entity_id=current_user.id,
            user_id=current_user.id,
            user_name=current_user.initials,
            details={"ip": _get_client_ip(request)},
        )
        db.add(audit)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to logout user")
        raise HTTPException(status_code=500, detail="Failed to logout")

    _clear_refresh_cookie(response, request=request)

    if settings.DEBUG:
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info("auth.logout user=%s ms=%.0f", current_user.id, elapsed_ms)

    return {"message": "Logged out successfully"}


@router.get("/me", response_model=AuthUserResponse)
def get_me(response: Response, current_user: User = Depends(get_current_user_allow_password_change)):
    """Get current user info."""
    _set_no_store(response)
    return _auth_user_response(current_user)


@router.post("/change-password", response_model=TokenResponse)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user_allow_password_change),
    db: Session = Depends(get_db)
):
    """Change user password."""
    _set_no_store(response)
    _enforce_csrf_origin(request)

    if payload.new_password == payload.old_password:
        raise HTTPException(status_code=400, detail="New password must differ from current password")

    validate_new_password(new_password=payload.new_password, username=current_user.username)

    # Verify old password
    if not verify_password(payload.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid current password"
        )

    # Persist password change first, so audit issues do not block login recovery.
    try:
        current_user.password_hash = hash_password(payload.new_password)
        current_user.must_change_password = False
        current_user.password_changed_at = _utc_now()
        current_user.token_version += 1
        _revoke_all_refresh_sessions(db, user_id=current_user.id)
        new_jti = _create_refresh_session(db, user=current_user, request=request)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to persist password change")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to change password",
        )

    # Issue fresh tokens (old ones are now revoked via token_version).
    access_token = create_access_token({"sub": str(current_user.id), "ver": current_user.token_version})
    refresh_cookie_token = create_refresh_token(
        {"sub": str(current_user.id), "ver": current_user.token_version, "jti": new_jti}
    )
    _set_refresh_cookie(response, request=request, token=refresh_cookie_token)

    # Best-effort audit.
    try:
        audit = AuditEvent(
            org_id=current_user.org_id,
            action="password_changed",
            entity_type="user",
            entity_id=current_user.id,
            user_id=current_user.id,
            user_name=current_user.initials,
            details={"ip": _get_client_ip(request)},
        )
        db.add(audit)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to write password change audit event")

    return TokenResponse(
        access_token=access_token,
        refresh_token=None,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=_auth_user_response(current_user),
        must_change_password=False,
    )


@router.post("/admin/users", response_model=AdminCreateUserResponse, status_code=201)
def admin_create_user(
    payload: AdminCreateUserRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(PermissionChecker("canManageUsers")),
    db: Session = Depends(get_db),
):
    """
    Admin-only onboarding: create user with a server-generated temporary password.

    The temporary password is returned ONLY ONCE in the response. Do not log or persist it.
    """
    _set_no_store(response)
    _enforce_csrf_origin(request)

    # Rate limit to limit abuse of admin sessions (fail-open if Redis is unavailable).
    try:
        ip = _get_client_ip(request)
        attempts, ttl = _incr_with_ttl(f"auth:rl:admin:create-user:ip:{ip}", 60)
        if attempts > settings.AUTH_ADMIN_RESET_IP_LIMIT_PER_MINUTE:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many admin operations. Try again later.",
                headers={"Retry-After": str(ttl)},
            )
    except RedisError:
        logger.exception("Redis error during admin create-user rate limiting (fail-open)")

    username = payload.username.strip()
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this username already exists")

    temp_password = generate_temporary_password()
    user = User(
        org_id=current_user.org_id,
        username=username,
        password_hash=hash_password(temp_password),
        name=payload.name,
        initials=payload.initials,
        role=payload.role,
        email=payload.email,
        is_active=True,
        must_change_password=True,
        password_changed_at=None,
        token_version=0,
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to create user")
        raise HTTPException(status_code=500, detail="Failed to create user")

    # Best-effort audit.
    try:
        audit = AuditEvent(
            org_id=current_user.org_id,
            action="USER_CREATED_WITH_TEMP_PASSWORD",
            entity_type="user",
            entity_id=user.id,
            entity_name=user.initials,
            user_id=current_user.id,
            user_name=current_user.initials,
            details={
                "target_username": user.username,
                "target_role": user.role,
                "ip": _get_client_ip(request),
            },
        )
        db.add(audit)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to write user creation audit event")

    return AdminCreateUserResponse(
        user=UserResponse.model_validate(user),
        temporary_password=temp_password,
        must_change_password=True,
        warning=(
            "This temporary password is shown only once. Share it via a secure channel. "
            "Do NOT store it in logs, tickets, or chat history."
        ),
    )


@router.post("/admin/reset-password", response_model=AdminResetPasswordResponse)
def admin_reset_password(
    payload: AdminResetPasswordRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(PermissionChecker("canManageUsers")),
    db: Session = Depends(get_db),
):
    """
    Admin-only password reset (temporary password only).

    Generates a new temporary password, forces password change on next login,
    and revokes existing tokens via token_version bump.
    """
    _set_no_store(response)
    _enforce_csrf_origin(request)

    if not payload.user_id and not payload.username:
        raise HTTPException(status_code=400, detail="Either user_id or username is required")

    # Rate limit to limit abuse of admin sessions (fail-open if Redis is unavailable).
    try:
        ip = _get_client_ip(request)
        attempts, ttl = _incr_with_ttl(f"auth:rl:admin:reset-password:ip:{ip}", 60)
        if attempts > settings.AUTH_ADMIN_RESET_IP_LIMIT_PER_MINUTE:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many admin operations. Try again later.",
                headers={"Retry-After": str(ttl)},
            )
    except RedisError:
        logger.exception("Redis error during admin reset-password rate limiting (fail-open)")

    query = db.query(User).filter(User.org_id == current_user.org_id)
    if payload.user_id:
        query = query.filter(User.id == payload.user_id)
    else:
        query = query.filter(User.username == payload.username)
    target_user = query.first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")

    temp_password = generate_temporary_password()

    # Persist reset first.
    try:
        target_user.password_hash = hash_password(temp_password)
        target_user.must_change_password = True
        target_user.password_changed_at = _utc_now()
        target_user.token_version += 1
        _revoke_all_refresh_sessions(db, user_id=target_user.id)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to reset password")
        raise HTTPException(status_code=500, detail="Failed to reset password")

    # Clear any login lockouts so the user can log in with the new temporary password.
    _clear_login_failures(username=target_user.username)

    # Best-effort audit.
    try:
        audit = AuditEvent(
            org_id=current_user.org_id,
            action="PASSWORD_RESET_BY_ADMIN",
            entity_type="user",
            entity_id=target_user.id,
            entity_name=target_user.initials,
            user_id=current_user.id,
            user_name=current_user.initials,
            details={
                "target_user_id": str(target_user.id),
                "target_username": target_user.username,
                "ip": _get_client_ip(request),
            },
        )
        db.add(audit)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to write admin reset audit event")

    return AdminResetPasswordResponse(
        user=UserResponse.model_validate(target_user),
        temporary_password=temp_password,
        must_change_password=True,
        warning=(
            "This temporary password is shown only once. Share it via a secure channel. "
            "Do NOT store it in logs, tickets, or chat history."
        ),
    )
