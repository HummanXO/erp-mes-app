"""Movement / transfer endpoints (logistics separated from production stages)."""

from __future__ import annotations

from datetime import datetime, time, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from ..auth import PermissionChecker, get_current_user
from ..database import get_db
from ..models import AuditEvent, LogisticsEntry, Part, PartStageStatus, StageFact, User
from ..schemas import JourneyEventOut, JourneyOut, MovementCreate, MovementOut, MovementUpdate
from ..security import can_access_part, require_org_entity
from ..services.movement_rules import (
    ACTIVE_MOVEMENT_STATUSES,
    apply_status_timestamps,
    ensure_not_cancelled_to_received,
    ensure_received_requires_sent,
    has_real_shipment_semantics,
    ensure_single_active_movement,
    ensure_stage_link_matches_part,
    initial_movement_state,
    normalize_movement_status,
    validate_status_transition,
)

router = APIRouter(tags=["movements"])

STAGE_FLOW_ORDER = ("machining", "fitting", "galvanic", "heat_treatment", "grinding", "qc")
STAGE_LABELS: dict[str, str] = {
    "machining": "механообработка",
    "fitting": "слесарка",
    "galvanic": "гальваника",
    "heat_treatment": "термообработка",
    "grinding": "шлифовка",
    "qc": "ОТК",
}
MOVEMENT_STATUS_LABELS: dict[str, str] = {
    "pending": "черновик",
    "sent": "отправлено",
    "in_transit": "в пути",
    "received": "получено",
    "returned": "возврат",
    "cancelled": "отменено",
    "completed": "завершено",
}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _count_active_movements(
    db: Session,
    *,
    org_id: UUID,
    part_id: UUID,
    exclude_movement_id: Optional[UUID] = None,
) -> int:
    active_statuses = tuple(ACTIVE_MOVEMENT_STATUSES)
    query = db.query(LogisticsEntry).filter(
        LogisticsEntry.org_id == org_id,
        LogisticsEntry.part_id == part_id,
        and_(
            LogisticsEntry.status.in_(active_statuses),
            LogisticsEntry.sent_at.isnot(None),
        ),
    )
    if exclude_movement_id:
        query = query.filter(LogisticsEntry.id != exclude_movement_id)
    return query.count()


def _movement_event_timestamp(movement: LogisticsEntry | None) -> datetime | None:
    if not movement:
        return None
    return (
        movement.cancelled_at
        or movement.returned_at
        or movement.received_at
        or movement.sent_at
        or movement.updated_at
        or movement.created_at
    )


def _next_required_stage(part: Part) -> str | None:
    stage_status_map = {stage_status.stage: stage_status for stage_status in (part.stage_statuses or [])}
    for stage in STAGE_FLOW_ORDER:
        stage_status = stage_status_map.get(stage)
        if stage_status and stage_status.status in {"pending", "in_progress"}:
            return stage
    return None


def _derive_current_location_and_holder(movement: LogisticsEntry | None) -> tuple[str | None, str | None]:
    if not movement:
        return None, None

    status = normalize_movement_status(movement.status)
    if status == "received":
        return movement.to_location or movement.from_location, movement.to_holder or movement.from_holder
    if status in {"returned", "cancelled"}:
        return movement.from_location or movement.to_location, movement.from_holder or movement.to_holder
    # sent / in_transit / legacy pending
    return (
        movement.to_location or movement.from_location,
        movement.to_holder or movement.carrier or movement.from_holder,
    )


def _movement_affects_location(movement: LogisticsEntry | None) -> bool:
    if not movement:
        return False
    return has_real_shipment_semantics(status=movement.status, sent_at=movement.sent_at)


def _apply_cooperation_location_fallback(
    *,
    part: Part,
    current_location: str | None,
    current_holder: str | None,
) -> tuple[str | None, str | None]:
    if not part.is_cooperation:
        return current_location, current_holder

    resolved_location = current_location or "У кооператора"
    resolved_holder = current_holder or part.cooperation_partner or "Партнёр не указан"
    return resolved_location, resolved_holder


def _resolve_eta(part: Part, active_movement: LogisticsEntry | None) -> datetime | None:
    if active_movement and active_movement.planned_eta:
        return active_movement.planned_eta
    if part.cooperation_due_date is None:
        return None
    return datetime.combine(part.cooperation_due_date, time.min, tzinfo=timezone.utc)


@router.post(
    "/parts/{part_id}/movements",
    response_model=MovementOut,
    dependencies=[Depends(PermissionChecker("canManageLogistics"))],
)
def create_movement(
    part_id: UUID,
    data: MovementCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    part = require_org_entity(
        db,
        Part,
        entity_id=part_id,
        org_id=current_user.org_id,
        not_found="Part not found",
    )
    if not can_access_part(db, part, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    if data.qty_sent is not None and data.qty_received is not None and data.qty_received > data.qty_sent:
        raise HTTPException(status_code=409, detail="qty_received cannot exceed qty_sent")

    if data.stage_id:
        stage_status = require_org_entity(
            db,
            PartStageStatus,
            entity_id=data.stage_id,
            org_id=current_user.org_id,
            not_found="Stage status not found",
        )
        try:
            ensure_stage_link_matches_part(movement_part_id=part.id, stage_part_id=stage_status.part_id)
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    requested_initial_status = normalize_movement_status(data.status)
    if requested_initial_status == "sent":
        status, sent_at = initial_movement_state()
    elif requested_initial_status == "pending":
        status, sent_at = "pending", None
    else:
        raise HTTPException(status_code=400, detail="Invalid initial movement status")

    active_count = _count_active_movements(db, org_id=current_user.org_id, part_id=part.id)
    try:
        ensure_single_active_movement(
            existing_active_count=active_count,
            current_status=None,
            next_status=status,
            allow_parallel=data.allow_parallel,
        )
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error

    movement = LogisticsEntry(
        org_id=current_user.org_id,
        part_id=part.id,
        status=status,
        sent_at=sent_at,
        from_location=data.from_location,
        from_holder=data.from_holder,
        to_location=data.to_location,
        to_holder=data.to_holder,
        carrier=data.carrier,
        tracking_number=data.tracking_number,
        planned_eta=data.planned_eta,
        qty_sent=data.qty_sent,
        qty_received=data.qty_received,
        stage_id=data.stage_id,
        notes=data.notes,
        # Deprecated fields kept populated for backward compatibility.
        type=data.type or "shipping_out",
        description=data.description or "Movement created",
        quantity=data.qty_sent,
        date=(sent_at.date() if sent_at else datetime.now(timezone.utc).date()),
        counterparty=data.to_holder or data.to_location,
    )
    db.add(movement)
    db.flush()

    audit = AuditEvent(
        org_id=current_user.org_id,
        action="movement_created",
        entity_type="logistics",
        entity_id=movement.id,
        entity_name=f"movement:{part.code}",
        user_id=current_user.id,
        user_name=current_user.initials,
        part_id=part.id,
        part_code=part.code,
        details={
            "movement_id": str(movement.id),
            "status": movement.status,
            "from_location": movement.from_location,
            "to_location": movement.to_location,
            "stage_id": str(movement.stage_id) if movement.stage_id else None,
            "tracking_number": movement.tracking_number,
        },
    )
    db.add(audit)

    db.commit()
    db.refresh(movement)
    return MovementOut.model_validate(movement)


@router.patch(
    "/movements/{movement_id}",
    response_model=MovementOut,
    dependencies=[Depends(PermissionChecker("canManageLogistics"))],
)
def update_movement(
    movement_id: UUID,
    data: MovementUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    movement = require_org_entity(
        db,
        LogisticsEntry,
        entity_id=movement_id,
        org_id=current_user.org_id,
        not_found="Movement not found",
    )

    part = require_org_entity(
        db,
        Part,
        entity_id=movement.part_id,
        org_id=current_user.org_id,
        not_found="Part not found",
    )
    if not can_access_part(db, part, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    payload = data.model_dump(exclude_unset=True)

    next_qty_sent = payload.get("qty_sent", movement.qty_sent)
    next_qty_received = payload.get("qty_received", movement.qty_received)
    if next_qty_sent is not None and next_qty_received is not None and next_qty_received > next_qty_sent:
        raise HTTPException(status_code=409, detail="qty_received cannot exceed qty_sent")

    if "stage_id" in payload and payload["stage_id"]:
        stage_status = require_org_entity(
            db,
            PartStageStatus,
            entity_id=payload["stage_id"],
            org_id=current_user.org_id,
            not_found="Stage status not found",
        )
        try:
            ensure_stage_link_matches_part(movement_part_id=movement.part_id, stage_part_id=stage_status.part_id)
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    new_status = None
    if "status" in payload and payload["status"] is not None:
        requested_status = str(payload["status"])
        try:
            ensure_not_cancelled_to_received(current_status=movement.status, next_status=requested_status)
            new_status = validate_status_transition(current_status=movement.status, next_status=requested_status)
            ensure_received_requires_sent(sent_at=movement.sent_at, next_status=new_status)
            ensure_single_active_movement(
                existing_active_count=_count_active_movements(
                    db,
                    org_id=current_user.org_id,
                    part_id=movement.part_id,
                    exclude_movement_id=movement.id,
                ),
                current_status=movement.status,
                next_status=new_status,
                allow_parallel=data.allow_parallel,
            )
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    for field in (
        "from_location",
        "from_holder",
        "to_location",
        "to_holder",
        "carrier",
        "tracking_number",
        "planned_eta",
        "qty_sent",
        "qty_received",
        "stage_id",
        "notes",
        "description",
    ):
        if field in payload:
            setattr(movement, field, payload[field])

    if "qty_sent" in payload:
        movement.quantity = payload["qty_sent"]
    if "to_holder" in payload or "to_location" in payload:
        movement.counterparty = movement.to_holder or movement.to_location

    if new_status:
        movement.status = new_status
        timestamp_updates = apply_status_timestamps(
            next_status=new_status,
            sent_at=movement.sent_at,
            received_at=movement.received_at,
            returned_at=movement.returned_at,
            cancelled_at=movement.cancelled_at,
            at=_now_utc(),
        )
        movement.sent_at = timestamp_updates["sent_at"]
        movement.received_at = timestamp_updates["received_at"]
        movement.returned_at = timestamp_updates["returned_at"]
        movement.cancelled_at = timestamp_updates["cancelled_at"]
        if new_status == "received" and payload.get("qty_received") is None and movement.qty_received is None:
            movement.qty_received = movement.qty_sent

    if normalize_movement_status(movement.status) in ACTIVE_MOVEMENT_STATUSES and movement.sent_at is None:
        movement.sent_at = _now_utc()

    audit = AuditEvent(
        org_id=current_user.org_id,
        action="movement_status_changed",
        entity_type="logistics",
        entity_id=movement.id,
        entity_name=f"movement:{part.code}",
        user_id=current_user.id,
        user_name=current_user.initials,
        part_id=part.id,
        part_code=part.code,
        details={
            "movement_id": str(movement.id),
            "status": movement.status,
            "from_location": movement.from_location,
            "to_location": movement.to_location,
            "stage_id": str(movement.stage_id) if movement.stage_id else None,
            "tracking_number": movement.tracking_number,
        },
    )
    db.add(audit)

    db.commit()
    db.refresh(movement)
    return MovementOut.model_validate(movement)


@router.get("/parts/{part_id}/movements", response_model=list[MovementOut])
def get_part_movements(
    part_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    part = require_org_entity(
        db,
        Part,
        entity_id=part_id,
        org_id=current_user.org_id,
        not_found="Part not found",
    )
    if not can_access_part(db, part, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    movements = (
        db.query(LogisticsEntry)
        .filter(
            LogisticsEntry.org_id == current_user.org_id,
            LogisticsEntry.part_id == part.id,
        )
        .order_by(func.coalesce(LogisticsEntry.sent_at, LogisticsEntry.created_at).desc())
        .all()
    )
    return [MovementOut.model_validate(movement) for movement in movements]


@router.get("/parts/{part_id}/journey", response_model=JourneyOut)
def get_part_journey(
    part_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    part = require_org_entity(
        db,
        Part,
        entity_id=part_id,
        org_id=current_user.org_id,
        not_found="Part not found",
    )
    if not can_access_part(db, part, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    movements = (
        db.query(LogisticsEntry)
        .filter(
            LogisticsEntry.org_id == current_user.org_id,
            LogisticsEntry.part_id == part.id,
        )
        .order_by(func.coalesce(LogisticsEntry.sent_at, LogisticsEntry.created_at).desc())
        .all()
    )

    last_movement = movements[0] if movements else None
    active_movement = next(
        (
            m
            for m in movements
            if normalize_movement_status(m.status) in ACTIVE_MOVEMENT_STATUSES and m.sent_at is not None
        ),
        None,
    )
    location_movement = next(
        (m for m in movements if _movement_affects_location(m)),
        None,
    )
    current_location, current_holder = _derive_current_location_and_holder(active_movement or location_movement)
    current_location, current_holder = _apply_cooperation_location_fallback(
        part=part,
        current_location=current_location,
        current_holder=current_holder,
    )

    eta = _resolve_eta(part, active_movement)

    latest_fact = (
        db.query(StageFact)
        .filter(
            StageFact.org_id == current_user.org_id,
            StageFact.part_id == part.id,
        )
        .order_by(StageFact.created_at.desc())
        .first()
    )

    movement_for_event = next(
        (
            m
            for m in movements
            if normalize_movement_status(m.status) != "pending"
            and not (
                normalize_movement_status(m.status) in ACTIVE_MOVEMENT_STATUSES and m.sent_at is None
            )
        ),
        None,
    )

    movement_ts = _movement_event_timestamp(movement_for_event)
    fact_ts = latest_fact.created_at if latest_fact else None

    if movement_ts and (fact_ts is None or movement_ts >= fact_ts):
        movement_status = normalize_movement_status(movement_for_event.status) if movement_for_event else "pending"
        last_event = JourneyEventOut(
            event_type="movement",
            occurred_at=movement_ts,
            description=f"Перемещение: {MOVEMENT_STATUS_LABELS.get(movement_status, movement_status)}",
        )
    elif latest_fact and fact_ts:
        stage_label = STAGE_LABELS.get(latest_fact.stage, latest_fact.stage)
        last_event = JourneyEventOut(
            event_type="fact",
            occurred_at=fact_ts,
            description=f"Факт этапа: {stage_label}",
        )
    else:
        last_event = JourneyEventOut(
            event_type="part",
            occurred_at=part.created_at,
            description="Деталь создана",
        )

    next_required_stage = _next_required_stage(part)
    if next_required_stage is None and part.is_cooperation and part.status != "done":
        next_required_stage = "qc"

    return JourneyOut(
        part_id=part.id,
        current_location=current_location,
        current_holder=current_holder,
        next_required_stage=next_required_stage,
        eta=eta,
        last_movement=MovementOut.model_validate(last_movement) if last_movement else None,
        last_event=last_event,
    )
