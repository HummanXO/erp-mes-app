"""Stage Facts endpoints."""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from ..database import get_db
from ..models import User, Part, StageFact, StageFactAttachment, AuditEvent
from ..schemas import StageFactCreate, StageFactUpdate, StageFactResponse, UserBrief, AttachmentBase
from ..auth import get_current_user, PermissionChecker
from ..config import settings
from ..security import can_access_part, require_org_entity
from ..services.part_state import (
    STAGE_LABELS_RU,
    StageTotals,
    compute_stage_totals,
    recompute_part_state,
    stage_prerequisites,
    validate_stage_flow,
)

router = APIRouter(tags=["facts"])
FACT_ENABLED_STAGES: set[str] = {"machining", "fitting", "qc"}

_SAFE_FILENAME_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\.[A-Za-z0-9]{1,16}$"
)


def _extract_attachment_filename(url: str) -> str | None:
    if not url:
        return None
    try:
        parsed = urlparse(url)
        path = parsed.path or ""
    except Exception:
        return None

    prefixes = (
        "/api/v1/attachments/serve/",
        "/attachments/serve/",
        "/uploads/",
    )
    filename = None
    for prefix in prefixes:
        if path.startswith(prefix):
            filename = path[len(prefix) :]
            break
    if not filename:
        return None

    if "/" in filename or "\\" in filename or ".." in filename:
        return None
    if Path(filename).name != filename:
        return None
    if not _SAFE_FILENAME_RE.match(filename):
        return None
    return filename


def _normalize_attachment_url(filename: str) -> str:
    return f"/api/v1/attachments/serve/{filename}"


def _assert_attachment_files_exist(*, filenames: list[str], current_user: User) -> None:
    base_dir = Path(settings.UPLOAD_DIR) / str(current_user.org_id)
    for name in filenames:
        path = base_dir / name
        if not path.exists() or not path.is_file():
            raise HTTPException(status_code=400, detail="Attachment not found")


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


def _ensure_stage_supports_facts(stage: str) -> None:
    if stage in FACT_ENABLED_STAGES:
        return
    stage_label = STAGE_LABELS_RU.get(stage, stage)
    raise HTTPException(
        status_code=400,
        detail=f"По этапу «{stage_label}» факты не ведутся. Используйте журнал логистики/перемещений.",
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
    part = require_org_entity(
        db,
        Part,
        entity_id=part_id,
        org_id=current_user.org_id,
        not_found="Деталь не найдена",
    )

    if not can_access_part(db, part, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    if current_user.role == "operator":
        if data.stage != "machining":
            raise HTTPException(status_code=403, detail="Оператор может вносить факт только по механообработке")
        data.operator_id = current_user.id

    _ensure_stage_supports_facts(data.stage)

    if data.stage not in (part.required_stages or []):
        raise HTTPException(status_code=400, detail="Этап не включён для этой детали")

    _ensure_stage_prerequisites(db, part, data.stage)

    # Enforce flow quantity constraints (for downstream stages).
    if data.stage != "machining":
        prereq = stage_prerequisites(part, data.stage)
        if prereq:
            totals_before = compute_stage_totals(db, part=part)
            available = min(totals_before.get(s, StageTotals()).good for s in prereq)
            processed_before = totals_before.get(data.stage, StageTotals()).processed
            processed_after = processed_before + data.qty_good + data.qty_scrap
            if processed_after > available:
                stage_label = STAGE_LABELS_RU.get(data.stage, data.stage)
                prereq_labels = ", ".join(STAGE_LABELS_RU.get(s, s) for s in prereq)
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Нельзя внести факт по этапу «{stage_label}»: "
                        f"после сохранения будет обработано {processed_after} шт (годные+брак), "
                        f"но доступно после этапов ({prereq_labels}) только {available} шт."
                    ),
                )
    
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
        operator = db.query(User).filter(
            User.id == data.operator_id,
            User.org_id == current_user.org_id,
            User.is_active == True,
            User.role == "operator",
        ).first()
        if not operator:
            raise HTTPException(status_code=404, detail="Оператор не найден")
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
    filenames: list[str] = []
    for att_data in data.attachments:
        filename = _extract_attachment_filename(att_data.url)
        if not filename:
            raise HTTPException(status_code=400, detail="Invalid attachment url")
        filenames.append(filename)
    if filenames:
        _assert_attachment_files_exist(filenames=filenames, current_user=current_user)

    for att_data, filename in zip(data.attachments, filenames):
        attachment = StageFactAttachment(
            stage_fact_id=fact.id,
            name=att_data.name,
            url=_normalize_attachment_url(filename),
            type=att_data.type,
            size=att_data.size,
        )
        db.add(attachment)

    totals_after = compute_stage_totals(db, part=part)
    violation = validate_stage_flow(part, totals_after)
    if violation:
        raise HTTPException(status_code=409, detail=violation)

    recompute_part_state(db, part=part, stage_totals=totals_after)
    
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
    operator = (
        db.query(User).filter(User.id == data.operator_id, User.org_id == current_user.org_id).first()
        if data.operator_id
        else None
    )
    
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
    part = require_org_entity(
        db,
        Part,
        entity_id=part_id,
        org_id=current_user.org_id,
        not_found="Деталь не найдена",
    )
    if not can_access_part(db, part, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    facts = db.query(StageFact).filter(
        StageFact.part_id == part_id,
        StageFact.org_id == current_user.org_id
    ).order_by(StageFact.date.desc(), StageFact.created_at.desc()).all()
    
    responses = []
    for fact in facts:
        operator = (
            db.query(User).filter(User.id == fact.operator_id, User.org_id == current_user.org_id).first()
            if fact.operator_id
            else None
        )
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

    _ensure_stage_supports_facts(fact.stage)

    part = require_org_entity(
        db,
        Part,
        entity_id=fact.part_id,
        org_id=current_user.org_id,
        not_found="Деталь не найдена",
    )
    if not can_access_part(db, part, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

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
        operator = db.query(User).filter(
            User.id == data.operator_id,
            User.org_id == current_user.org_id,
            User.is_active == True,
            User.role == "operator",
        ).first()
        if not operator:
            raise HTTPException(status_code=404, detail="Оператор не найден")
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
    filenames: list[str] = []
    for att_data in data.attachments:
        filename = _extract_attachment_filename(att_data.url)
        if not filename:
            raise HTTPException(status_code=400, detail="Invalid attachment url")
        filenames.append(filename)
    if filenames:
        _assert_attachment_files_exist(filenames=filenames, current_user=current_user)

    for att_data, filename in zip(data.attachments, filenames):
        attachment = StageFactAttachment(
            stage_fact_id=fact.id,
            name=att_data.name,
            url=_normalize_attachment_url(filename),
            type=att_data.type,
            size=att_data.size,
        )
        db.add(attachment)

    totals_after = compute_stage_totals(db, part=part)
    violation = validate_stage_flow(part, totals_after)
    if violation:
        raise HTTPException(status_code=409, detail=violation)

    recompute_part_state(db, part=part, stage_totals=totals_after)

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

    operator = (
        db.query(User).filter(User.id == fact.operator_id, User.org_id == current_user.org_id).first()
        if fact.operator_id
        else None
    )
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

    part = require_org_entity(
        db,
        Part,
        entity_id=fact.part_id,
        org_id=current_user.org_id,
        not_found="Деталь не найдена",
    )
    if not can_access_part(db, part, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    # Snapshot for audit before delete.
    deleted_stage = fact.stage
    deleted_shift = fact.shift_type
    deleted_qty_good = fact.qty_good
    deleted_qty_scrap = fact.qty_scrap
    deleted_date = fact.date
    deleted_operator_id = fact.operator_id

    db.delete(fact)
    db.flush()

    totals_after = compute_stage_totals(db, part=part)
    violation = validate_stage_flow(part, totals_after)
    if violation:
        raise HTTPException(status_code=409, detail=violation)

    recompute_part_state(db, part=part, stage_totals=totals_after)

    audit = AuditEvent(
        org_id=current_user.org_id,
        # NOTE: audit_events.action has a strict CHECK constraint in production.
        # Until we roll out a DB migration to allow "fact_deleted", record as "fact_updated"
        # with an explicit event marker in details.
        action="fact_updated",
        entity_type="fact",
        entity_id=fact_id,
        user_id=current_user.id,
        user_name=current_user.initials,
        part_id=part.id,
        part_code=part.code,
        details={
            "event": "fact_deleted",
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
