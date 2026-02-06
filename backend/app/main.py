"""FastAPI application."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from .config import settings
from .routers import auth, users, parts, facts, tasks, uploads, telegram, machines

# Create app
app = FastAPI(
    title="ERP/MES Production Control",
    version="1.0.0",
    description="Backend API for ERP/MES Production Control System"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(parts.router, prefix="/api/v1")
app.include_router(facts.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(uploads.router, prefix="/api/v1")
app.include_router(telegram.router, prefix="/api/v1")
app.include_router(machines.router, prefix="/api/v1")

# Serve uploaded files
upload_dir = Path(settings.UPLOAD_DIR)
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")


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
