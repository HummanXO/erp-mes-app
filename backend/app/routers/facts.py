"""Stage Facts endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from uuid import UUID
from ..database import get_db
from ..models import User, Part, StageFact, StageFactAttachment, PartStageStatus, AuditEvent
from ..schemas import StageFactCreate, StageFactResponse, UserBrief, AttachmentBase
from ..auth import get_current_user, PermissionChecker

router = APIRouter(tags=["facts"])


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
        raise HTTPException(status_code=404, detail="Part not found")
    
    # Validate and auto-set shift_type based on stage
    if data.stage == 'machining':
        # For machining: shift_type must be day/night, operator required
        if not data.shift_type or data.shift_type == 'none':
            raise HTTPException(
                status_code=400,
                detail="shift_type must be 'day' or 'night' for machining stage"
            )
        if data.shift_type not in ['day', 'night']:
            raise HTTPException(
                status_code=400,
                detail="shift_type must be 'day' or 'night' for machining stage"
            )
        if not data.operator_id:
            raise HTTPException(
                status_code=400,
                detail="operator_id is required for machining stage"
            )
        
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
                detail="Fact for this date/shift/stage already exists",
                headers={"X-Existing-Fact-Id": str(existing.id)}
            )
    else:
        # For non-machining: shift_type = none
        data.shift_type = 'none'
    
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
