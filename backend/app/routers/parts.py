"""Part endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from uuid import UUID
from typing import Optional
from datetime import date, datetime
from urllib.parse import urlparse
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
    SpecItem,
    Specification,
)
from ..schemas import (
    PartCreate, PartUpdate, PartResponse, StageStatusResponse,
    PartProgressResponse, PartForecastResponse, MachineResponse,
    MachineNormUpsert, MachineNormResponse
)
from ..auth import get_current_user, PermissionChecker
from ..security import apply_part_visibility_scope, can_access_part
from ..services.part_state import compute_stage_totals, recompute_part_state, validate_stage_flow

router = APIRouter(prefix="/parts", tags=["parts"])

DEPRECATED_STAGES = {"logistics", "grinding"}
COOP_REQUIRED_STAGES = {"qc"}
COOP_OPTIONAL_STAGES = {"galvanic", "heat_treatment"}
COOP_ALLOWED_STAGES = COOP_REQUIRED_STAGES | COOP_OPTIONAL_STAGES
SHOP_REQUIRED_STAGES = {"machining", "fitting", "qc"}
SHOP_ALLOWED_STAGES = SHOP_REQUIRED_STAGES | {"galvanic", "heat_treatment"}
STAGE_FLOW_ORDER = ["machining", "fitting", "heat_treatment", "galvanic", "grinding", "qc"]
PROGRESS_STAGES = {"machining", "fitting", "galvanic", "heat_treatment", "grinding", "qc"}


def _sort_stages_by_flow(stages: set[str]) -> list[str]:
    return [stage for stage in STAGE_FLOW_ORDER if stage in stages]


def _sanitize_requested_stages(stages: list[str]) -> set[str]:
    """Backward compatibility: ignore deprecated/disabled stages in incoming payloads."""
    return {stage for stage in stages if stage not in DEPRECATED_STAGES}


def _normalize_drawing_url(value: str | None) -> str | None:
    if value is None:
        return None

    candidate = value.strip()
    if not candidate:
        return None

    parsed = urlparse(candidate)
    path = parsed.path if parsed.scheme else candidate

    if path.startswith("/uploads/"):
        filename = path.rsplit("/", 1)[-1]
        if filename:
            return f"/api/v1/attachments/serve/{filename}"

    if path.startswith("/api/v1/attachments/serve/"):
        filename = path.rsplit("/", 1)[-1]
        if filename:
            return f"/api/v1/attachments/serve/{filename}"

    return candidate


def _recompute_specification_status(db: Session, specification: Specification) -> None:
    """Keep specification status in sync when linked items are removed."""
    items = db.query(SpecItem).filter(SpecItem.specification_id == specification.id).all()

    all_done = bool(items) and all(item.status in {"fulfilled", "canceled"} for item in items)
    has_work = any(item.qty_done > 0 or item.status in {"partial", "blocked"} for item in items)

    next_status = specification.status
    if all_done:
        next_status = "closed"
    elif specification.status != "closed" and (specification.published_to_operators or has_work):
        next_status = "active"
    elif specification.status != "closed":
        next_status = "draft"

    if specification.status != next_status:
        specification.status = next_status


def calculate_part_progress(db: Session, part: Part) -> tuple[PartProgressResponse, list[StageStatusResponse]]:
    """
    Calculate part progress with BOTTLENECK approach (requirement C).
    
    - stage_done_qty(stage) = MIN(sum(qty_good), qty_plan)
    - qty_ready = MIN(stage_done_qty for required_stages excluding skipped/optional)
    - overall_percent = floor(qty_ready / qty_plan * 100)
    - bottleneck_stage = stage with lowest qty_done
    
    NO AVERAGING - only MIN (bottleneck).
    """
    totals = compute_stage_totals(db, part=part)
    total_scrap = (
        db.query(func.coalesce(func.sum(StageFact.qty_scrap), 0))
        .filter(
            StageFact.part_id == part.id,
            StageFact.org_id == part.org_id,
        )
        .scalar()
        or 0
    )

    # Calculate per-stage statistics.
    stage_statuses_data = []
    stage_done_quantities = {}  # stage -> qty_done
    stage_statuses_ordered = sorted(
        part.stage_statuses,
        key=lambda item: STAGE_FLOW_ORDER.index(item.stage) if item.stage in STAGE_FLOW_ORDER else len(STAGE_FLOW_ORDER)
    )
    
    for stage_status in stage_statuses_ordered:
        stage_total = totals.get(stage_status.stage)
        qty_good = stage_total.good if stage_total else 0
        qty_scrap = stage_total.scrap if stage_total else 0
        
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
            id=stage_status.id,
            stage=stage_status.stage,
            status=stage_status.status,
            percent=percent,
            qty_good=qty_good,
            qty_scrap=qty_scrap,
            operator_id=stage_status.operator_id,
            started_at=stage_status.started_at,
            completed_at=stage_status.completed_at,
            notes=stage_status.notes,
        ))
    
    # qty_ready = MIN(stage_done_qty) across production stages (excluding logistics and skipped).
    progress_stages = [s for s in stage_statuses_ordered if s.status != "skipped" and s.stage in PROGRESS_STAGES]
    qty_ready = min((stage_done_quantities.get(s.stage, 0) for s in progress_stages), default=0)
    
    # overall_percent = floor(qty_ready / qty_plan * 100) (requirement C)
    if part.qty_plan > 0:
        overall_percent = int((qty_ready / part.qty_plan) * 100)  # floor by default with int()
    else:
        overall_percent = 0
    
    # bottleneck_stage = stage with minimum qty_done (requirement C)
    bottleneck_stage = None
    if progress_stages:
        bottleneck_stage = min(progress_stages, key=lambda s: stage_done_quantities.get(s.stage, 0)).stage
    
    progress = PartProgressResponse(
        overall_percent=overall_percent,
        overall_qty_done=qty_ready,  # This is qty_ready, not average
        qty_scrap=int(total_scrap),
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
    query = apply_part_visibility_scope(query, db, current_user)
    
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
    
    if not can_access_part(db, part, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
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


@router.post("/recompute-all", dependencies=[Depends(PermissionChecker("canEditFacts"))])
def recompute_all_parts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Recompute qty_done/status and stage statuses for all parts in the organization.

    This is intended as a safe one-time repair after business-logic changes.
    """
    parts = db.query(Part).filter(Part.org_id == current_user.org_id).all()

    updated = 0
    violations: list[dict] = []

    for part in parts:
        totals = recompute_part_state(db, part=part)
        violation = validate_stage_flow(part, totals)
        if violation:
            violations.append({"part_id": str(part.id), "code": part.code, "error": violation})
            continue
        updated += 1

    db.commit()
    return {"updated": updated, "violations": violations}


@router.post("/{part_id}/recompute", response_model=PartResponse, dependencies=[Depends(PermissionChecker("canEditFacts"))])
def recompute_part(
    part_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Recompute qty_done/status and stage statuses for a single part."""
    part = db.query(Part).filter(
        Part.id == part_id,
        Part.org_id == current_user.org_id,
    ).first()

    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    totals = recompute_part_state(db, part=part)
    violation = validate_stage_flow(part, totals)
    if violation:
        raise HTTPException(status_code=409, detail=violation)

    db.commit()
    db.refresh(part)

    progress, stage_statuses = calculate_part_progress(db, part)
    response_data = {
        **{k: v for k, v in part.__dict__.items() if not k.startswith('_')},
        'qty_ready': part.qty_done,
        'progress': progress,
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
    requested_stages = _sanitize_requested_stages(data.required_stages)
    if not requested_stages:
        raise HTTPException(status_code=400, detail="Нужно выбрать хотя бы один этап")

    if data.is_cooperation:
        if not COOP_REQUIRED_STAGES.issubset(requested_stages):
            raise HTTPException(
                status_code=400,
                detail="Для кооперации обязателен этап: ОТК",
            )
        invalid_stages = requested_stages - COOP_ALLOWED_STAGES
        if invalid_stages:
            raise HTTPException(
                status_code=400,
                detail=f"Недопустимые этапы для кооперации: {', '.join(sorted(invalid_stages))}",
            )
        if not (data.cooperation_partner or "").strip():
            raise HTTPException(
                status_code=400,
                detail="Для кооперации нужно указать партнёра-кооператора",
            )
        if data.machine_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Для кооперационной детали поле станка должно быть пустым",
            )
    else:
        if not SHOP_REQUIRED_STAGES.issubset(requested_stages):
            raise HTTPException(
                status_code=400,
                detail="Для цеховой детали обязательны этапы: механообработка, слесарка и ОТК",
            )
        invalid_stages = requested_stages - SHOP_ALLOWED_STAGES
        if invalid_stages:
            raise HTTPException(
                status_code=400,
                detail=f"Недопустимые этапы для цеховой детали: {', '.join(sorted(invalid_stages))}",
            )
        if data.machine_id is None:
            raise HTTPException(
                status_code=400,
                detail="Для цеховой детали нужно выбрать станок",
            )
        machine = db.query(Machine).filter(
            Machine.id == data.machine_id,
            Machine.org_id == current_user.org_id,
            Machine.is_active.is_(True),
        ).first()
        if not machine:
            raise HTTPException(status_code=404, detail="Machine not found")

    ordered_required_stages = _sort_stages_by_flow(requested_stages)

    # Check if code already exists
    existing = db.query(Part).filter(
        Part.org_id == current_user.org_id,
        Part.code == data.code
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Part with this code already exists")
    
    part_payload = data.model_dump()
    if "drawing_url" in part_payload:
        part_payload["drawing_url"] = _normalize_drawing_url(part_payload.get("drawing_url"))
    if data.is_cooperation and not part_payload.get("cooperation_qc_status"):
        part_payload["cooperation_qc_status"] = "pending"
        part_payload["cooperation_qc_checked_at"] = None
        part_payload["cooperation_qc_comment"] = None

    if not data.is_cooperation:
        part_payload["cooperation_partner"] = None
        part_payload["cooperation_due_date"] = None
        part_payload["cooperation_qc_status"] = None
        part_payload["cooperation_qc_checked_at"] = None
        part_payload["cooperation_qc_comment"] = None

    # Create part
    part = Part(
        org_id=current_user.org_id,
        **{**part_payload, "required_stages": ordered_required_stages}
    )
    db.add(part)
    db.flush()
    
    # Create stage statuses for required stages
    for stage in ordered_required_stages:
        stage_status = PartStageStatus(
            part_id=part.id,
            stage=stage,
            status='pending'
        )
        db.add(stage_status)

    recompute_part_state(db, part=part)
    
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

    # Multi-tenant boundary: validate foreign keys on update.
    update_payload = data.model_dump(exclude_unset=True)
    if "drawing_url" in update_payload:
        update_payload["drawing_url"] = _normalize_drawing_url(update_payload.get("drawing_url"))
    if "required_stages" in update_payload and isinstance(update_payload["required_stages"], list):
        sanitized_stages = _sanitize_requested_stages(update_payload["required_stages"])
        update_payload["required_stages"] = _sort_stages_by_flow(sanitized_stages)

    if "machine_id" in update_payload and update_payload["machine_id"] is not None:
        machine = db.query(Machine).filter(
            Machine.id == update_payload["machine_id"],
            Machine.org_id == current_user.org_id,
            Machine.is_active.is_(True),
        ).first()
        if not machine:
            raise HTTPException(status_code=404, detail="Machine not found")

    will_be_cooperation = bool(update_payload.get("is_cooperation", part.is_cooperation))
    if not will_be_cooperation:
        update_payload["cooperation_due_date"] = None
        update_payload["cooperation_partner"] = None
        update_payload["cooperation_qc_status"] = None
        update_payload["cooperation_qc_checked_at"] = None
        update_payload["cooperation_qc_comment"] = None
    elif (
        "cooperation_qc_status" in update_payload
        and update_payload.get("cooperation_qc_status") == "pending"
    ):
        update_payload["cooperation_qc_checked_at"] = None

    # Update fields
    for field, value in update_payload.items():
        setattr(part, field, value)

    # Keep stage statuses / qty_done consistent after cooperation ETA/QC and stage changes.
    recompute_part_state(db, part=part)
    
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

    affected_spec_ids = [
        row[0]
        for row in db.query(SpecItem.specification_id).join(
            Specification,
            SpecItem.specification_id == Specification.id,
        ).filter(
            Specification.org_id == current_user.org_id,
            SpecItem.part_id == part_id,
        ).distinct().all()
    ]

    # Keep audit trail rows but remove FK link to avoid constraint violations
    db.query(AuditEvent).filter(
        AuditEvent.part_id == part_id
    ).update({"part_id": None}, synchronize_session=False)

    # Delete dependents that don't have ON DELETE CASCADE in schema
    db.query(MachineNorm).filter(
        MachineNorm.part_id == part_id
    ).delete(synchronize_session=False)

    db.query(LogisticsEntry).filter(
        LogisticsEntry.part_id == part_id
    ).delete(synchronize_session=False)

    db.query(Task).filter(
        Task.part_id == part_id
    ).delete(synchronize_session=False)

    db.query(StageFact).filter(
        StageFact.part_id == part_id
    ).delete(synchronize_session=False)

    db.query(PartStageStatus).filter(
        PartStageStatus.part_id == part_id
    ).delete(synchronize_session=False)

    # Remove orphan spec positions linked to this part so specification counters stay consistent.
    if affected_spec_ids:
        db.query(SpecItem).filter(
            SpecItem.part_id == part_id,
            SpecItem.specification_id.in_(affected_spec_ids),
        ).delete(synchronize_session=False)

    db.delete(part)

    if affected_spec_ids:
        affected_specs = db.query(Specification).filter(
            Specification.id.in_(affected_spec_ids),
            Specification.org_id == current_user.org_id,
        ).all()
        for specification in affected_specs:
            _recompute_specification_status(db, specification)

    db.commit()


@router.get("/{part_id}/norms", response_model=list[MachineNormResponse])
def get_part_norms(
    part_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get machine norms for part."""
    part = db.query(Part).filter(
        Part.id == part_id,
        Part.org_id == current_user.org_id
    ).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    if not can_access_part(db, part, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    norms = db.query(MachineNorm).filter(
        MachineNorm.part_id == part_id
    ).all()
    return norms


@router.put("/{part_id}/norms", response_model=MachineNormResponse, dependencies=[Depends(PermissionChecker("canEditFacts"))])
def upsert_part_norm(
    part_id: UUID,
    data: MachineNormUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create or update machine norm for part."""
    part = db.query(Part).filter(
        Part.id == part_id,
        Part.org_id == current_user.org_id
    ).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    if not can_access_part(db, part, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    machine = db.query(Machine).filter(
        Machine.id == data.machine_id,
        Machine.org_id == current_user.org_id
    ).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    existing = db.query(MachineNorm).filter(
        MachineNorm.part_id == part_id,
        MachineNorm.machine_id == data.machine_id,
        MachineNorm.stage == data.stage
    ).first()

    if existing:
        existing.qty_per_shift = data.qty_per_shift
        existing.is_configured = data.is_configured
        existing.configured_by_id = current_user.id
        norm = existing
    else:
        norm = MachineNorm(
            machine_id=data.machine_id,
            part_id=part_id,
            stage=data.stage,
            qty_per_shift=data.qty_per_shift,
            is_configured=data.is_configured,
            configured_by_id=current_user.id
        )
        db.add(norm)
        db.flush()

    audit = AuditEvent(
        org_id=current_user.org_id,
        action="norm_configured",
        entity_type="norm",
        entity_id=norm.id,
        entity_name=f"{part.code} / {data.stage}",
        user_id=current_user.id,
        user_name=current_user.initials,
        part_id=part.id,
        part_code=part.code,
        details={
            "stage": data.stage,
            "machine_id": str(data.machine_id),
            "qty_per_shift": data.qty_per_shift,
            "is_configured": data.is_configured
        }
    )
    db.add(audit)

    db.commit()
    db.refresh(norm)

    return norm
