"""File upload endpoints."""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os
import uuid
from pathlib import Path
from ..database import get_db
from ..models import User
from ..auth import get_current_user
from ..config import settings

router = APIRouter(prefix="/attachments", tags=["attachments"])

# Ensure upload directory exists
UPLOAD_DIR = Path(settings.UPLOAD_DIR)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def validate_file(file: UploadFile) -> bool:
    """Validate uploaded file."""
    # Check size
    if file.size and file.size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE} bytes"
        )
    
    # Check extension
    if file.filename:
        ext = file.filename.split('.')[-1].lower()
        if ext not in settings.allowed_extensions_list:
            raise HTTPException(
                status_code=400,
                detail=f"File type not allowed. Allowed: {settings.ALLOWED_EXTENSIONS}"
            )
    
    return True


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload a file."""
    validate_file(file)
    
    # Generate unique filename
    file_id = str(uuid.uuid4())
    ext = file.filename.split('.')[-1] if file.filename else 'bin'
    filename = f"{file_id}.{ext}"
    file_path = UPLOAD_DIR / filename
    
    # Save file
    try:
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Determine type
    image_exts = ['jpg', 'jpeg', 'png', 'gif', 'webp']
    file_type = 'image' if ext in image_exts else 'file'
    
    return {
        "id": file_id,
        "name": file.filename,
        "url": f"/uploads/{filename}",
        "type": file_type,
        "size": len(content)
    }


@router.get("/{file_id}")
async def get_file_metadata(
    file_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get file metadata."""
    # Find file in upload directory
    for file_path in UPLOAD_DIR.iterdir():
        if file_path.stem == file_id:
            return {
                "id": file_id,
                "name": file_path.name,
                "url": f"/uploads/{file_path.name}",
                "size": file_path.stat().st_size
            }
    
    raise HTTPException(status_code=404, detail="File not found")


# Serve uploaded files
@router.get("/serve/{filename}")
async def serve_file(filename: str):
    """Serve uploaded file."""
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(file_path)
