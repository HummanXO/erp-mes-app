"""Part endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from uuid import UUID
from typing import Optional
from datetime import date, datetime
from ..database import get_db
from ..models import (
    User,
    Part,
    PartStageStatus,
    StageFact,
    Machine,
    AuditEvent,
    Task,
    LogisticsEntry,
    MachineNorm,
)
from ..schemas import (
    PartCreate, PartUpdate, PartResponse, StageStatusResponse,
    PartProgressResponse, PartForecastResponse, MachineResponse
)
from ..auth import get_current_user, PermissionChecker

router = APIRouter(prefix="/parts", tags=["parts"])

COOP_REQUIRED_STAGES = {"logistics", "qc"}
SHOP_REQUIRED_STAGES = {"machining", "fitting", "qc"}
SHOP_ALLOWED_STAGES = SHOP_REQUIRED_STAGES | {"galvanic", "heat_treatment", "grinding", "logistics"}


def calculate_part_progress(db: Session, part: Part) -> tuple[PartProgressResponse, list[StageStatusResponse]]:
    """
    Calculate part progress with BOTTLENECK approach (requirement C).
    
    - stage_done_qty(stage) = MIN(sum(qty_good), qty_plan)
    - qty_ready = MIN(stage_done_qty for required_stages excluding skipped/optional)
    - overall_percent = floor(qty_ready / qty_plan * 100)
    - bottleneck_stage = stage with lowest qty_done
    
    NO AVERAGING - only MIN (bottleneck).
    """
    # Get all stage facts for this part
    facts = db.query(StageFact).filter(StageFact.part_id == part.id).all()
    
    # Calculate per-stage statistics
    stage_statuses_data = []
    stage_done_quantities = {}  # stage -> qty_done
    total_scrap = sum(f.qty_scrap for f in facts)
    
    for stage_status in part.stage_statuses:
        stage_facts = [f for f in facts if f.stage == stage_status.stage]
        qty_good = sum(f.qty_good for f in stage_facts)
        qty_scrap = sum(f.qty_scrap for f in stage_facts)
        
        # stage_done_qty = min(sum(qty_good), qty_plan) (requirement C)
        stage_done_qty = min(qty_good, part.qty_plan)
        stage_done_quantities[stage_status.stage] = stage_done_qty
        
        # Percent for this stage
        if stage_status.status == 'done':
            percent = 100
        elif part.qty_plan > 0:
            percent = min(100, int((stage_done_qty / part.qty_plan) * 100))
        else:
            percent = 0
        
        stage_statuses_data.append(StageStatusResponse(
            stage=stage_status.stage,
            status=stage_status.status,
            percent=percent,
            qty_good=qty_good,
            qty_scrap=qty_scrap,
            operator_id=stage_status.operator_id,
            started_at=stage_status.started_at,
            completed_at=stage_status.completed_at
        ))
    
    # qty_ready = MIN(stage_done_qty) for required_stages (excluding skipped) (requirement C)
    required_stages = [s for s in part.stage_statuses if s.status not in ['skipped', 'pending']]
    if required_stages:
        qty_ready = min(stage_done_quantities.get(s.stage, 0) for s in required_stages)
    else:
        qty_ready = 0
    
    # overall_percent = floor(qty_ready / qty_plan * 100) (requirement C)
    if part.qty_plan > 0:
        overall_percent = int((qty_ready / part.qty_plan) * 100)  # floor by default with int()
    else:
        overall_percent = 0
    
    # bottleneck_stage = stage with minimum qty_done (requirement C)
    bottleneck_stage = None
    if required_stages:
        bottleneck_stage = min(required_stages, key=lambda s: stage_done_quantities.get(s.stage, 0)).stage
    
    progress = PartProgressResponse(
        overall_percent=overall_percent,
        overall_qty_done=qty_ready,  # This is qty_ready, not average
        qty_scrap=total_scrap,
        bottleneck_stage=bottleneck_stage  # NEW: requirement C
    )
    
    return progress, stage_statuses_data


def calculate_part_forecast(db: Session, part: Part, current_date: date) -> PartForecastResponse:
    """Calculate part forecast."""
    # Days until deadline
    deadline = part.deadline
    days_remaining = max(0, (deadline - current_date).days)
    shifts_remaining = days_remaining * 2  # 2 shifts per day
    
    # Get facts for machining stage (primary indicator)
    machining_facts = db.query(StageFact).filter(
        StageFact.part_id == part.id,
        StageFact.stage == 'machining'
    ).all()
    
    # Calculate average per shift
    if machining_facts:
        total_good = sum(f.qty_good for f in machining_facts)
        avg_per_shift = int(total_good / len(machining_facts))
    else:
        # Use machine rate or default
        if part.machine:
            avg_per_shift = part.machine.rate_per_shift
        else:
            avg_per_shift = 100
    
    # Calculate remaining qty
    progress, _ = calculate_part_progress(db, part)
    qty_remaining = max(0, part.qty_plan - progress.overall_qty_done)
    
    # Shifts needed
    shifts_needed = int(qty_remaining / avg_per_shift) if avg_per_shift > 0 else 999
    
    # Will finish on time?
    will_finish_on_time = shifts_needed <= shifts_remaining
    
    # Estimated finish date
    days_needed = (shifts_needed + 1) // 2  # Round up
    from datetime import timedelta
    estimated_finish = current_date + timedelta(days=days_needed)
    
    return PartForecastResponse(
        days_remaining=days_remaining,
        shifts_remaining=shifts_remaining,
        qty_remaining=qty_remaining,
        avg_per_shift=avg_per_shift,
        will_finish_on_time=will_finish_on_time,
        estimated_finish_date=estimated_finish.isoformat(),
        shifts_needed=shifts_needed
    )


@router.get("", response_model=list[PartResponse])
def get_parts(
    status: Optional[str] = None,
    is_cooperation: Optional[bool] = None,
    machine_id: Optional[UUID] = None,
    limit: int = Query(20, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of parts with filters."""
    query = db.query(Part).filter(Part.org_id == current_user.org_id)
    
    # Apply filters
    if status:
        query = query.filter(Part.status == status)
    if is_cooperation is not None:
        query = query.filter(Part.is_cooperation == is_cooperation)
    if machine_id:
        query = query.filter(Part.machine_id == machine_id)
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    parts = query.order_by(Part.deadline).offset(offset).limit(limit).all()
    
    # Build responses with progress
    responses = []
    for part in parts:
        progress, stage_statuses = calculate_part_progress(db, part)
        
        response_data = {
            **{k: v for k, v in part.__dict__.items() if not k.startswith('_')},
            'qty_ready': part.qty_done,
            'progress': progress,
            'stage_statuses': stage_statuses,
            'machine': MachineResponse.model_validate(part.machine) if part.machine else None
        }
        responses.append(PartResponse(**response_data))
    
    return responses


@router.get("/{part_id}", response_model=PartResponse)
def get_part(
    part_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get part by ID with full progress and forecast."""
    part = db.query(Part).filter(
        Part.id == part_id,
        Part.org_id == current_user.org_id
    ).first()
    
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    
    # RBAC: operator can only view parts they worked on (requirement D)
    if current_user.role == "operator":
        from ..models import StageFact
        has_worked = db.query(StageFact).filter(
            StageFact.part_id == part_id,
            StageFact.operator_id == current_user.id
        ).first()
        
        if not has_worked:
            raise HTTPException(status_code=403, detail="Access denied: you haven't worked on this part")
    
    # Calculate progress and forecast
    progress, stage_statuses = calculate_part_progress(db, part)
    forecast = calculate_part_forecast(db, part, date.today())
    
    response_data = {
        **{k: v for k, v in part.__dict__.items() if not k.startswith('_')},
        'qty_ready': part.qty_done,
        'progress': progress,
        'forecast': forecast,
        'stage_statuses': stage_statuses,
        'machine': MachineResponse.model_validate(part.machine) if part.machine else None
    }
    
    return PartResponse(**response_data)


@router.post("", response_model=PartResponse, dependencies=[Depends(PermissionChecker("canCreateParts"))])
def create_part(
    data: PartCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create new part."""
    requested_stages = set(data.required_stages)
    if not requested_stages:
        raise HTTPException(status_code=400, detail="required_stages cannot be empty")

    if data.is_cooperation:
        if requested_stages != COOP_REQUIRED_STAGES:
            raise HTTPException(
                status_code=400,
                detail="Cooperation part must have stages: logistics and qc",
            )
        if not (data.cooperation_partner or "").strip():
            raise HTTPException(
                status_code=400,
                detail="cooperation_partner is required for cooperation part",
            )
        if data.machine_id is not None:
            raise HTTPException(
                status_code=400,
                detail="machine_id must be empty for cooperation part",
            )
    else:
        if not SHOP_REQUIRED_STAGES.issubset(requested_stages):
            raise HTTPException(
                status_code=400,
                detail="Shop part must include machining, fitting and qc stages",
            )
        invalid_stages = requested_stages - SHOP_ALLOWED_STAGES
        if invalid_stages:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported stages for shop part: {', '.join(sorted(invalid_stages))}",
            )
        if data.machine_id is None:
            raise HTTPException(
                status_code=400,
                detail="machine_id is required for shop part",
            )

    # Check if code already exists
    existing = db.query(Part).filter(
        Part.org_id == current_user.org_id,
        Part.code == data.code
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Part with this code already exists")
    
    # Create part
    part = Part(
        org_id=current_user.org_id,
        **data.model_dump()
    )
    db.add(part)
    db.flush()
    
    # Create stage statuses for required stages
    for stage in data.required_stages:
        stage_status = PartStageStatus(
            part_id=part.id,
            stage=stage,
            status='pending'
        )
        db.add(stage_status)
    
    # Audit log
    audit = AuditEvent(
        org_id=current_user.org_id,
        action="part_created",
        entity_type="part",
        entity_id=part.id,
        entity_name=part.name,
        user_id=current_user.id,
        user_name=current_user.initials,
        part_id=part.id,
        part_code=part.code
    )
    db.add(audit)
    
    db.commit()
    db.refresh(part)
    
    # Return with progress
    progress, stage_statuses = calculate_part_progress(db, part)
    response_data = {
        **{k: v for k, v in part.__dict__.items() if not k.startswith('_')},
        'qty_ready': part.qty_done,
        'progress': progress,
        'stage_statuses': stage_statuses,
        'machine': MachineResponse.model_validate(part.machine) if part.machine else None
    }
    
    return PartResponse(**response_data)


@router.put("/{part_id}", response_model=PartResponse, dependencies=[Depends(PermissionChecker("canEditParts"))])
def update_part(
    part_id: UUID,
    data: PartUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update part."""
    part = db.query(Part).filter(
        Part.id == part_id,
        Part.org_id == current_user.org_id
    ).first()
    
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    
    # Update fields
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(part, field, value)
    
    # Audit log
    audit = AuditEvent(
        org_id=current_user.org_id,
        action="part_updated",
        entity_type="part",
        entity_id=part.id,
        entity_name=part.name,
        user_id=current_user.id,
        user_name=current_user.initials,
        part_id=part.id,
        part_code=part.code
    )
    db.add(audit)
    
    db.commit()
    db.refresh(part)
    
    # Return with progress
    progress, stage_statuses = calculate_part_progress(db, part)
    response_data = {
        **{k: v for k, v in part.__dict__.items() if not k.startswith('_')},
        'qty_ready': part.qty_done,
        'progress': progress,
        'stage_statuses': stage_statuses,
        'machine': MachineResponse.model_validate(part.machine) if part.machine else None
    }
    
    return PartResponse(**response_data)


@router.delete("/{part_id}", status_code=204, dependencies=[Depends(PermissionChecker("canCreateParts"))])
def delete_part(
    part_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete part with dependent records."""
    part = db.query(Part).filter(
        Part.id == part_id,
        Part.org_id == current_user.org_id
    ).first()

    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    # Keep audit trail rows but remove FK link to avoid constraint violations
    db.query(AuditEvent).filter(
        AuditEvent.org_id == current_user.org_id,
        AuditEvent.part_id == part_id
    ).update({"part_id": None}, synchronize_session=False)

    # Delete dependents that don't have ON DELETE CASCADE in schema
    db.query(MachineNorm).filter(
        MachineNorm.org_id == current_user.org_id,
        MachineNorm.part_id == part_id
    ).delete(synchronize_session=False)

    db.query(LogisticsEntry).filter(
        LogisticsEntry.org_id == current_user.org_id,
        LogisticsEntry.part_id == part_id
    ).delete(synchronize_session=False)

    db.query(Task).filter(
        Task.org_id == current_user.org_id,
        Task.part_id == part_id
    ).delete(synchronize_session=False)

    db.query(StageFact).filter(
        StageFact.org_id == current_user.org_id,
        StageFact.part_id == part_id
    ).delete(synchronize_session=False)

    db.query(PartStageStatus).filter(
        PartStageStatus.part_id == part_id
    ).delete(synchronize_session=False)

    db.delete(part)
    db.commit()
