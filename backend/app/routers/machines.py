"""Machine endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from ..database import get_db
from ..models import Machine, User
from ..schemas import MachineResponse
from ..auth import get_current_user

router = APIRouter(prefix="/machines", tags=["machines"])


@router.get("", response_model=list[MachineResponse])
def list_machines(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List active machines for current organization."""
    machines = (
        db.query(Machine)
        .filter(
            Machine.org_id == current_user.org_id,
            Machine.is_active.is_(True),
        )
        .order_by(Machine.name)
        .all()
    )
    return machines


@router.get("/{machine_id}", response_model=MachineResponse)
def get_machine(
    machine_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get single machine by ID."""
    machine = (
        db.query(Machine)
        .filter(
            Machine.id == machine_id,
            Machine.org_id == current_user.org_id,
        )
        .first()
    )
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine

