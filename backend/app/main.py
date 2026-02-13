"""FastAPI application."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .routers import auth, users, parts, facts, tasks, uploads, telegram, machines, audit, specifications, directory

# Create app
app = FastAPI(
    title="ERP/MES Production Control",
    version="1.0.0",
    description="Backend API for ERP/MES Production Control System"
)

# Production safety checks (fail closed on insecure cookie config).
if settings.ENV.lower() == "production" and not settings.AUTH_REFRESH_COOKIE_SECURE:
    raise RuntimeError("AUTH_REFRESH_COOKIE_SECURE must be true in production (requires HTTPS).")
if settings.ENV.lower() == "production" and not settings.cors_origins:
    raise RuntimeError("ALLOWED_ORIGINS must be set in production (explicit frontend origin required).")
if settings.ENV.lower() == "production" and any(origin.strip() == "*" for origin in settings.cors_origins):
    raise RuntimeError("ALLOWED_ORIGINS must be explicit in production (no wildcard when using credentials).")
if settings.ENV.lower() == "production" and any(
    origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1") for origin in settings.cors_origins
):
    raise RuntimeError("ALLOWED_ORIGINS contains localhost in production; set it to your real frontend origin.")

# CORS
cors_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
# If you add new custom headers, whitelist them explicitly (required when using cookies + credentials).
cors_headers = ["Authorization", "Content-Type", "X-CSRF-Token"]
if settings.ENV.lower() != "production":
    cors_headers = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=cors_methods,
    allow_headers=cors_headers,
)

# Include routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(directory.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(parts.router, prefix="/api/v1")
app.include_router(facts.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(uploads.router, prefix="/api/v1")
app.include_router(telegram.router, prefix="/api/v1")
app.include_router(machines.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(specifications.router, prefix="/api/v1")


@app.get("/api/v1/system/health")
def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "version": "1.0.0",
        "database": "ok",
        "redis": "ok"
    }


@app.get("/api/v1/system/current-shift")
def get_current_shift():
    """Get current shift based on server time."""
    from datetime import datetime
    now = datetime.now()
    hour = now.hour
    
    # Parse shift times
    day_start = int(settings.DAY_SHIFT_START.split(':')[0])
    day_end = int(settings.DAY_SHIFT_END.split(':')[0])
    
    if day_start <= hour < day_end:
        shift = "day"
        started_at = settings.DAY_SHIFT_START
        ends_at = settings.DAY_SHIFT_END
    else:
        shift = "night"
        started_at = settings.DAY_SHIFT_END
        ends_at = settings.DAY_SHIFT_START
    
    return {
        "shift": shift,
        "started_at": started_at,
        "ends_at": ends_at,
        "server_time": now.isoformat()
    }


@app.get("/")
def root():
    """Root endpoint."""
    return {
        "message": "ERP/MES Production Control API",
        "version": "1.0.0",
        "docs": "/docs"
    }
