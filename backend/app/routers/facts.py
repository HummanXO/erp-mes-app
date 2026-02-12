"""Stage Facts endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from uuid import UUID
from ..database import get_db
from ..models import User, Part, StageFact, StageFactAttachment, PartStageStatus, AuditEvent
from ..schemas import StageFactCreate, StageFactUpdate, StageFactResponse, UserBrief, AttachmentBase
from ..auth import get_current_user, PermissionChecker

router = APIRouter(tags=["facts"])

STAGE_LABELS_RU = {
    "machining": "Механообработка",
    "fitting": "Слесарка",
    "galvanic": "Гальваника",
    "heat_treatment": "Термообработка",
    "grinding": "Шлифовка",
    "qc": "ОТК",
    "logistics": "Логистика",
}


def _ensure_stage_prerequisites(db: Session, part: Part, stage: str) -> None:
    """Validate basic production flow dependencies for shop parts."""
    required_stages = set(part.required_stages or [])
    required_for_stage: list[str] = []

    if part.is_cooperation:
        if stage == "qc":
            required_for_stage = [
                optional_stage
                for optional_stage in ("galvanic", "heat_treatment", "grinding")
                if optional_stage in required_stages
            ]
    else:
        if stage == "fitting":
            required_for_stage = ["machining"]
        elif stage in {"galvanic", "heat_treatment", "grinding"}:
            required_for_stage = ["fitting"]
        elif stage == "qc":
            # QC should go after fitting and all selected finishing stages.
            required_for_stage = ["fitting"] + [
                optional_stage
                for optional_stage in ("galvanic", "heat_treatment", "grinding")
                if optional_stage in required_stages
            ]

    if not required_for_stage:
        return

    missing: list[str] = []
    for prerequisite_stage in required_for_stage:
        if prerequisite_stage not in required_stages:
            continue

        has_prerequisite_fact = db.query(StageFact.id).filter(
            StageFact.part_id == part.id,
            StageFact.stage == prerequisite_stage,
        ).first()

        if not has_prerequisite_fact:
            missing.append(prerequisite_stage)

    if missing:
        current_label = STAGE_LABELS_RU.get(stage, stage)
        missing_labels = ", ".join(STAGE_LABELS_RU.get(s, s) for s in missing)
        raise HTTPException(
            status_code=409,
            detail=(
                f"Нельзя внести факт по этапу «{current_label}», пока не внесены факты по этапам: {missing_labels}"
            ),
        )


def _ensure_single_shift_per_operator(
    db: Session,
    *,
    part_id: UUID,
    date_value,
    operator_id: UUID | None,
    shift_type: str,
    exclude_fact_id: UUID | None = None,
) -> None:
    """One operator can be assigned only to one machining shift per part/day."""
    if not operator_id:
        return

    query = db.query(StageFact).filter(
        StageFact.part_id == part_id,
        StageFact.stage == "machining",
        StageFact.date == date_value,
        StageFact.operator_id == operator_id,
    )
    if exclude_fact_id:
        query = query.filter(StageFact.id != exclude_fact_id)

    existing_fact = query.first()
    if existing_fact and existing_fact.shift_type != shift_type:
        raise HTTPException(
            status_code=409,
            detail="Оператор уже закреплён за другой сменой в этот день по этой детали. Один оператор = одна смена.",
        )


@router.post("/parts/{part_id}/facts", response_model=StageFactResponse, dependencies=[Depends(PermissionChecker("canEditFacts"))])
def create_stage_fact(
    part_id: UUID,
    data: StageFactCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create stage fact."""
    # Get part
    part = db.query(Part).filter(
        Part.id == part_id,
        Part.org_id == current_user.org_id
    ).first()
    
    if not part:
        raise HTTPException(status_code=404, detail="Деталь не найдена")

    if current_user.role == "operator":
        if data.stage != "machining":
            raise HTTPException(status_code=403, detail="Оператор может вносить факт только по механообработке")
        data.operator_id = current_user.id

    if data.stage == "logistics":
        raise HTTPException(
            status_code=400,
            detail="Для этапа логистика факты производства не ведутся"
        )

    if data.stage not in (part.required_stages or []):
        raise HTTPException(status_code=400, detail="Этап не включён для этой детали")

    _ensure_stage_prerequisites(db, part, data.stage)
    
    # Validate and auto-set shift_type based on stage
    if data.stage == 'machining':
        # For machining: shift_type must be day/night, operator required
        if not data.shift_type or data.shift_type == 'none':
            raise HTTPException(
                status_code=400,
                detail="Для механообработки нужно выбрать смену: день или ночь"
            )
        if data.shift_type not in ['day', 'night']:
            raise HTTPException(
                status_code=400,
                detail="Для механообработки нужно выбрать смену: день или ночь"
            )
        if not data.operator_id:
            raise HTTPException(
                status_code=400,
                detail="Для механообработки нужно выбрать оператора"
            )
        if not part.machine_id:
            raise HTTPException(
                status_code=400,
                detail="Для детали не назначен станок"
            )
        data.machine_id = part.machine_id
        
        # Check for duplicate (same part, stage, date, shift)
        existing = db.query(StageFact).filter(
            StageFact.part_id == part_id,
            StageFact.stage == data.stage,
            StageFact.date == data.date,
            StageFact.shift_type == data.shift_type
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=409,
                detail="Факт за эту дату и смену уже существует",
                headers={"X-Existing-Fact-Id": str(existing.id)}
            )

        _ensure_single_shift_per_operator(
            db,
            part_id=part_id,
            date_value=data.date,
            operator_id=data.operator_id,
            shift_type=data.shift_type,
        )
    else:
        # For non-machining: shift_type = none
        data.shift_type = 'none'
        data.machine_id = None
    
    # Create fact
    fact = StageFact(
        org_id=current_user.org_id,
        part_id=part_id,
        stage=data.stage,
        date=data.date,
        shift_type=data.shift_type,
        machine_id=data.machine_id,
        operator_id=data.operator_id,
        qty_good=data.qty_good,
        qty_scrap=data.qty_scrap,
        comment=data.comment,
        deviation_reason=data.deviation_reason,
        created_by_id=current_user.id
    )
    db.add(fact)
    db.flush()
    
    # Add attachments
    for att_data in data.attachments:
        attachment = StageFactAttachment(
            stage_fact_id=fact.id,
            **att_data.model_dump()
        )
        db.add(attachment)
    
    # Update part qty_done
    part.qty_done += data.qty_good
    if part.status == 'not_started':
        part.status = 'in_progress'
    if part.qty_done >= part.qty_plan:
        part.status = 'done'
    
    # Update stage status
    stage_status = db.query(PartStageStatus).filter(
        PartStageStatus.part_id == part_id,
        PartStageStatus.stage == data.stage
    ).first()
    
    if stage_status and stage_status.status == 'pending':
        stage_status.status = 'in_progress'
        stage_status.started_at = func.now()
        if data.operator_id:
            stage_status.operator_id = data.operator_id
    
    # Audit log
    audit = AuditEvent(
        org_id=current_user.org_id,
        action="fact_added",
        entity_type="fact",
        entity_id=fact.id,
        user_id=current_user.id,
        user_name=current_user.initials,
        part_id=part_id,
        part_code=part.code,
        details={
            "stage": data.stage,
            "shift": data.shift_type,
            "qtyGood": data.qty_good,
            "qtyScrap": data.qty_scrap,
            "date": str(data.date)
        }
    )
    db.add(audit)
    
    db.commit()
    db.refresh(fact)
    
    # Build response
    operator = db.query(User).filter(User.id == data.operator_id).first() if data.operator_id else None
    
    return StageFactResponse(
        id=fact.id,
        stage=fact.stage,
        date=fact.date,
        shift_type=fact.shift_type,
        qty_good=fact.qty_good,
        qty_scrap=fact.qty_scrap,
        qty_expected=fact.qty_expected,
        comment=fact.comment,
        deviation_reason=fact.deviation_reason,
        operator=UserBrief.model_validate(operator) if operator else None,
        attachments=[AttachmentBase.model_validate(a) for a in fact.attachments],
        created_at=fact.created_at
    )


@router.get("/parts/{part_id}/facts", response_model=list[StageFactResponse])
def get_part_facts(
    part_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all facts for a part."""
    facts = db.query(StageFact).filter(
        StageFact.part_id == part_id,
        StageFact.org_id == current_user.org_id
    ).order_by(StageFact.date.desc(), StageFact.created_at.desc()).all()
    
    responses = []
    for fact in facts:
        operator = db.query(User).filter(User.id == fact.operator_id).first() if fact.operator_id else None
        responses.append(StageFactResponse(
            id=fact.id,
            stage=fact.stage,
            date=fact.date,
            shift_type=fact.shift_type,
            qty_good=fact.qty_good,
            qty_scrap=fact.qty_scrap,
            qty_expected=fact.qty_expected,
            comment=fact.comment,
            deviation_reason=fact.deviation_reason,
            operator=UserBrief.model_validate(operator) if operator else None,
            attachments=[AttachmentBase.model_validate(a) for a in fact.attachments],
            created_at=fact.created_at
        ))
    
    return responses


@router.put("/facts/{fact_id}", response_model=StageFactResponse, dependencies=[Depends(PermissionChecker("canEditFacts"))])
def update_stage_fact(
    fact_id: UUID,
    data: StageFactUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update existing stage fact."""
    fact = db.query(StageFact).filter(
        StageFact.id == fact_id,
        StageFact.org_id == current_user.org_id
    ).first()

    if not fact:
        raise HTTPException(status_code=404, detail="Факт не найден")

    if fact.stage == "logistics":
        raise HTTPException(
            status_code=400,
            detail="Для этапа логистика факты производства не ведутся"
        )

    part = db.query(Part).filter(
        Part.id == fact.part_id,
        Part.org_id == current_user.org_id
    ).first()
    if not part:
        raise HTTPException(status_code=404, detail="Деталь не найдена")

    if current_user.role == "operator":
        if fact.stage != "machining":
            raise HTTPException(status_code=403, detail="Оператор может редактировать факт только по механообработке")
        if fact.operator_id and fact.operator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Оператор может редактировать только свои факты")
        data.operator_id = current_user.id

    old_qty_good = fact.qty_good

    if fact.stage == "machining":
        if not data.operator_id:
            raise HTTPException(status_code=400, detail="Для механообработки нужно выбрать оператора")
        if not part.machine_id:
            raise HTTPException(status_code=400, detail="Для детали не назначен станок")
        fact.machine_id = part.machine_id
        _ensure_single_shift_per_operator(
            db,
            part_id=part.id,
            date_value=fact.date,
            operator_id=data.operator_id,
            shift_type=fact.shift_type,
            exclude_fact_id=fact.id,
        )
    else:
        data.operator_id = None
        fact.machine_id = None

    fact.operator_id = data.operator_id
    fact.qty_good = data.qty_good
    fact.qty_scrap = data.qty_scrap
    fact.comment = data.comment
    fact.deviation_reason = data.deviation_reason

    # Replace attachments
    db.query(StageFactAttachment).filter(
        StageFactAttachment.stage_fact_id == fact.id
    ).delete(synchronize_session=False)
    for att_data in data.attachments:
        attachment = StageFactAttachment(
            stage_fact_id=fact.id,
            **att_data.model_dump()
        )
        db.add(attachment)

    delta_good = fact.qty_good - old_qty_good
    part.qty_done = max(0, part.qty_done + delta_good)
    part_facts_count = db.query(StageFact).filter(StageFact.part_id == part.id).count()
    if part.qty_done >= part.qty_plan:
        part.status = "done"
    elif part_facts_count > 0:
        part.status = "in_progress"
    else:
        part.status = "not_started"

    # Audit log
    audit = AuditEvent(
        org_id=current_user.org_id,
        action="fact_updated",
        entity_type="fact",
        entity_id=fact.id,
        user_id=current_user.id,
        user_name=current_user.initials,
        part_id=part.id,
        part_code=part.code,
        details={
            "stage": fact.stage,
            "shift": fact.shift_type,
            "qtyGoodOld": old_qty_good,
            "qtyGoodNew": fact.qty_good,
            "qtyScrap": fact.qty_scrap,
            "date": str(fact.date)
        }
    )
    db.add(audit)

    db.commit()
    db.refresh(fact)

    operator = db.query(User).filter(User.id == fact.operator_id).first() if fact.operator_id else None
    return StageFactResponse(
        id=fact.id,
        stage=fact.stage,
        date=fact.date,
        shift_type=fact.shift_type,
        qty_good=fact.qty_good,
        qty_scrap=fact.qty_scrap,
        qty_expected=fact.qty_expected,
        comment=fact.comment,
        deviation_reason=fact.deviation_reason,
        operator=UserBrief.model_validate(operator) if operator else None,
        attachments=[AttachmentBase.model_validate(a) for a in fact.attachments],
        created_at=fact.created_at
    )


@router.delete("/facts/{fact_id}", status_code=204, dependencies=[Depends(PermissionChecker("canRollbackFacts"))])
def delete_stage_fact(
    fact_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rollback (delete) a stage fact.

    Only high-privilege roles can delete facts. The deletion is audited.
    """
    fact = db.query(StageFact).filter(
        StageFact.id == fact_id,
        StageFact.org_id == current_user.org_id,
    ).first()
    if not fact:
        raise HTTPException(status_code=404, detail="Факт не найден")

    part = db.query(Part).filter(
        Part.id == fact.part_id,
        Part.org_id == current_user.org_id,
    ).first()
    if not part:
        raise HTTPException(status_code=404, detail="Деталь не найдена")

    # Snapshot for audit before delete.
    deleted_stage = fact.stage
    deleted_shift = fact.shift_type
    deleted_qty_good = fact.qty_good
    deleted_qty_scrap = fact.qty_scrap
    deleted_date = fact.date
    deleted_operator_id = fact.operator_id

    db.delete(fact)
    db.flush()

    # Revert part counters/status (keep existing semantics used on create/update).
    part.qty_done = max(0, part.qty_done - deleted_qty_good)
    remaining_facts_count = db.query(StageFact).filter(StageFact.part_id == part.id).count()
    if part.qty_done >= part.qty_plan:
        part.status = "done"
    elif remaining_facts_count > 0:
        part.status = "in_progress"
    else:
        part.status = "not_started"

    # Revert stage status if no facts left for this stage.
    stage_status = db.query(PartStageStatus).filter(
        PartStageStatus.part_id == part.id,
        PartStageStatus.stage == deleted_stage,
    ).first()
    if stage_status and stage_status.status != "skipped":
        stage_facts_left = db.query(StageFact.id).filter(
            StageFact.part_id == part.id,
            StageFact.stage == deleted_stage,
        ).first()
        if not stage_facts_left:
            stage_status.status = "pending"
            stage_status.started_at = None
            stage_status.completed_at = None
            stage_status.operator_id = None

    audit = AuditEvent(
        org_id=current_user.org_id,
        action="fact_deleted",
        entity_type="fact",
        entity_id=fact_id,
        user_id=current_user.id,
        user_name=current_user.initials,
        part_id=part.id,
        part_code=part.code,
        details={
            "stage": deleted_stage,
            "shift": deleted_shift,
            "qtyGood": deleted_qty_good,
            "qtyScrap": deleted_qty_scrap,
            "date": str(deleted_date),
            "operatorId": str(deleted_operator_id) if deleted_operator_id else None,
        },
    )
    db.add(audit)

    db.commit()
    return None
