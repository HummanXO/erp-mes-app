"""File upload endpoints (authenticated + authorized)."""

from __future__ import annotations

import logging
import mimetypes
import re
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..config import settings
from ..database import get_db
from ..models import (
    Part,
    StageFact,
    StageFactAttachment,
    Task,
    TaskAttachment,
    TaskComment,
    User,
)
from ..security import can_access_part, can_view_task

router = APIRouter(prefix="/attachments", tags=["attachments"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(settings.UPLOAD_DIR)

_SAFE_FILENAME_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\.[A-Za-z0-9]{1,16}$"
)
_CHUNK_SIZE = 1024 * 1024  # 1MB


def _org_upload_dir(user: User) -> Path:
    # Strict tenant isolation on disk. Do not store multi-tenant uploads in a shared folder.
    org_dir = UPLOAD_DIR / str(user.org_id)
    org_dir.mkdir(parents=True, exist_ok=True)
    return org_dir


def _sanitize_filename(filename: str) -> str:
    if not filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Reject traversal and path separators regardless of OS.
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    if Path(filename).name != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not _SAFE_FILENAME_RE.match(filename):
        raise HTTPException(status_code=400, detail="Invalid filename")

    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in settings.allowed_extensions_list:
        raise HTTPException(status_code=400, detail="Invalid filename")

    return filename


def _validate_upload(file: UploadFile) -> str:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    if "." not in file.filename:
        raise HTTPException(status_code=400, detail="File extension is required")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in settings.allowed_extensions_list:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {settings.ALLOWED_EXTENSIONS}",
        )
    return ext


async def _stream_save_upload(*, file: UploadFile, dest_path: Path) -> int:
    """Stream UploadFile to disk with a hard size limit (avoid loading into memory)."""
    size = 0
    try:
        with dest_path.open("xb") as out:
            while True:
                chunk = await file.read(_CHUNK_SIZE)
                if not chunk:
                    break
                size += len(chunk)
                if size > settings.MAX_UPLOAD_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE} bytes",
                    )
                out.write(chunk)
    except HTTPException:
        # Ensure partial file is removed.
        dest_path.unlink(missing_ok=True)
        raise
    except FileExistsError:
        raise HTTPException(status_code=409, detail="File collision, try again")
    except Exception:
        dest_path.unlink(missing_ok=True)
        logger.exception("Failed to save upload")
        raise HTTPException(status_code=500, detail="Failed to save file")
    finally:
        try:
            await file.close()
        except Exception:
            pass
    return size


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a file for later attachment to an entity."""
    ext = _validate_upload(file)

    file_id = str(uuid.uuid4())
    filename = f"{file_id}.{ext}"

    org_dir = _org_upload_dir(current_user)
    file_path = org_dir / filename

    size = await _stream_save_upload(file=file, dest_path=file_path)

    # Determine type
    image_exts = {"jpg", "jpeg", "png", "gif", "webp"}
    file_type = "image" if ext in image_exts else "file"

    # NOTE: Use the authenticated/authorized serve endpoint; do not expose static mounts.
    return {
        "id": file_id,
        "name": file.filename,
        "url": f"/api/v1/attachments/serve/{filename}",
        "type": file_type,
        "size": size,
        "uploaded_at": datetime.utcnow().isoformat(),
    }


def _attachment_url_matches_filename(url: str | None, filename: str) -> bool:
    if not url:
        return False
    # Accept both legacy (/uploads/...) and new (/api/v1/attachments/serve/...) URLs, including absolute URLs.
    return url.endswith(f"/{filename}") or url.endswith(filename)


@router.get("/serve/{filename}")
def serve_file(
    filename: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Serve an uploaded file with strict authz (multi-tenant + entity-level checks)."""
    filename = _sanitize_filename(filename)

    file_path = _org_upload_dir(current_user) / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    # Basic size guard for unexpected files on disk.
    try:
        if file_path.stat().st_size > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=404, detail="File not found")
    except OSError:
        raise HTTPException(status_code=404, detail="File not found")

    # Authorization: file must be attached to an entity the user can access.
    response_headers = {
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
    }
    # 1) Task attachments (direct task attachments)
    task_attachment = (
        db.query(TaskAttachment, Task)
        .join(Task, TaskAttachment.task_id == Task.id)
        .filter(
            Task.org_id == current_user.org_id,
            or_(
                TaskAttachment.url.like(f"%{filename}"),
                TaskAttachment.url.like(f"%/{filename}"),
            ),
        )
        .first()
    )
    if task_attachment:
        _attachment, task = task_attachment
        if not can_view_task(task, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        mime, _ = mimetypes.guess_type(str(file_path))
        return FileResponse(
            path=str(file_path),
            media_type=mime or "application/octet-stream",
            headers=response_headers,
        )

    # 2) Task attachments (comment attachments -> task)
    comment_attachment = (
        db.query(TaskAttachment, Task)
        .join(TaskComment, TaskAttachment.comment_id == TaskComment.id)
        .join(Task, TaskComment.task_id == Task.id)
        .filter(
            Task.org_id == current_user.org_id,
            or_(
                TaskAttachment.url.like(f"%{filename}"),
                TaskAttachment.url.like(f"%/{filename}"),
            ),
        )
        .first()
    )
    if comment_attachment:
        _attachment, task = comment_attachment
        if not can_view_task(task, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        mime, _ = mimetypes.guess_type(str(file_path))
        return FileResponse(
            path=str(file_path),
            media_type=mime or "application/octet-stream",
            headers=response_headers,
        )

    # 3) Stage fact attachments -> part
    fact_attachment = (
        db.query(StageFactAttachment, StageFact, Part)
        .join(StageFact, StageFactAttachment.stage_fact_id == StageFact.id)
        .join(Part, StageFact.part_id == Part.id)
        .filter(
            StageFact.org_id == current_user.org_id,
            or_(
                StageFactAttachment.url.like(f"%{filename}"),
                StageFactAttachment.url.like(f"%/{filename}"),
            ),
        )
        .first()
    )
    if fact_attachment:
        _attachment, _fact, part = fact_attachment
        if not can_access_part(db, part, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        mime, _ = mimetypes.guess_type(str(file_path))
        return FileResponse(
            path=str(file_path),
            media_type=mime or "application/octet-stream",
            headers=response_headers,
        )

    # 4) Part drawing_url points to this filename
    part = (
        db.query(Part)
        .filter(
            Part.org_id == current_user.org_id,
            Part.drawing_url.like(f"%{filename}"),
        )
        .first()
    )
    if part and _attachment_url_matches_filename(part.drawing_url, filename):
        if not can_access_part(db, part, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        mime, _ = mimetypes.guess_type(str(file_path))
        return FileResponse(
            path=str(file_path),
            media_type=mime or "application/octet-stream",
            headers=response_headers,
        )

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
