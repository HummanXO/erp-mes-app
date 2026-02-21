"""Movement / transfer endpoints (logistics separated from production stages)."""

from __future__ import annotations

from datetime import datetime, time, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import and_, func
from sqlalchemy.orm import Session
from sqlalchemy.exc import ProgrammingError

from ..auth import PermissionChecker, get_current_user
from ..database import get_db
from ..models import LogisticsEntry, Part, PartStageStatus, StageFact, User
from ..schemas import JourneyEventOut, JourneyOut, MovementCreate, MovementOut, MovementUpdate
from ..security import can_access_part, require_org_entity
from ..services.part_state import compute_stage_totals, stage_prerequisites
from ..services.movement_rules import (
    ACTIVE_MOVEMENT_STATUSES,
    has_real_shipment_semantics,
    normalize_movement_status,
)
from ..use_cases.movements_use_cases import (
    MovementUseCaseHooks,
    create_movement_use_case,
    update_movement_use_case,
)

router = APIRouter(tags=["movements"])

STAGE_FLOW_ORDER = ("machining", "fitting", "heat_treatment", "galvanic", "grinding", "qc")
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
RECEIVED_MOVEMENT_STATUSES: tuple[str, ...] = ("received", "completed")


def _movement_qty_from_row(*, qty_received: int | None, qty_sent: int | None, quantity: int | None) -> int:
    value = qty_received if qty_received is not None else qty_sent if qty_sent is not None else quantity
    return int(value or 0)


def _cooperation_received_qty(
    *,
    db: Session,
    part: Part,
    exclude_movement_id: UUID | None = None,
) -> int:
    query = db.query(
        func.coalesce(
            func.sum(
                func.coalesce(
                    LogisticsEntry.qty_received,
                    LogisticsEntry.qty_sent,
                    LogisticsEntry.quantity,
                    0,
                )
            ),
            0,
        )
    ).filter(
        LogisticsEntry.org_id == part.org_id,
        LogisticsEntry.part_id == part.id,
        LogisticsEntry.stage_id.is_(None),
        LogisticsEntry.status.in_(RECEIVED_MOVEMENT_STATUSES),
    )
    if exclude_movement_id is not None:
        query = query.filter(LogisticsEntry.id != exclude_movement_id)
    qty = query.scalar()
    return int(qty or 0)


def _is_cooperation_inbound(
    *,
    part: Part,
    stage_id: UUID | None,
    movement_type: str | None,
    to_location: str | None,
    to_holder: str | None,
) -> bool:
    if not part.is_cooperation:
        return False
    if stage_id is not None:
        return False

    normalized_type = (movement_type or "").strip().lower()
    if normalized_type == "coop_in":
        return True

    target = (to_holder or to_location or "").strip().lower()
    return target in {"производство", "цех", "production", "shop"}


def _ensure_cooperation_receive_limit(
    *,
    db: Session,
    part: Part,
    incoming_qty: int | None,
    exclude_movement_id: UUID | None = None,
) -> None:
    if incoming_qty is None:
        raise HTTPException(
            status_code=409,
            detail="Для поступления от кооператора укажите количество",
        )
    if incoming_qty <= 0:
        raise HTTPException(
            status_code=409,
            detail="Количество поступления должно быть больше 0",
        )

    already_received = _cooperation_received_qty(
        db=db,
        part=part,
        exclude_movement_id=exclude_movement_id,
    )
    remaining = max(int(part.qty_plan or 0) - already_received, 0)
    if incoming_qty > remaining:
        raise HTTPException(
            status_code=409,
            detail=(
                "Нельзя принять больше плана: "
                f"остаток к поступлению {remaining} шт, попытка принять {incoming_qty} шт."
            ),
        )


def _stage_allocated_qty(
    *,
    db: Session,
    org_id: UUID,
    part_id: UUID,
    stage_id: UUID,
    exclude_movement_id: UUID | None = None,
) -> int:
    rows = (
        db.query(
            LogisticsEntry.status,
            LogisticsEntry.sent_at,
            LogisticsEntry.qty_sent,
            LogisticsEntry.qty_received,
            LogisticsEntry.quantity,
        )
        .filter(
            LogisticsEntry.org_id == org_id,
            LogisticsEntry.part_id == part_id,
            LogisticsEntry.stage_id == stage_id,
        )
        .all()
    )

    allocated = 0
    for status, sent_at, qty_sent, qty_received, quantity in rows:
        normalized = normalize_movement_status(status)
        if normalized in RECEIVED_MOVEMENT_STATUSES:
            allocated += _movement_qty_from_row(
                qty_received=qty_received,
                qty_sent=qty_sent,
                quantity=quantity,
            )
            continue
        if normalized in ACTIVE_MOVEMENT_STATUSES and sent_at is not None:
            allocated += _movement_qty_from_row(
                qty_received=None,
                qty_sent=qty_sent,
                quantity=quantity,
            )
    if exclude_movement_id is None:
        return allocated

    current = (
        db.query(
            LogisticsEntry.status,
            LogisticsEntry.sent_at,
            LogisticsEntry.qty_sent,
            LogisticsEntry.qty_received,
            LogisticsEntry.quantity,
        )
        .filter(
            LogisticsEntry.org_id == org_id,
            LogisticsEntry.part_id == part_id,
            LogisticsEntry.stage_id == stage_id,
            LogisticsEntry.id == exclude_movement_id,
        )
        .first()
    )
    if not current:
        return allocated

    status, sent_at, qty_sent, qty_received, quantity = current
    normalized = normalize_movement_status(status)
    current_allocated = 0
    if normalized in RECEIVED_MOVEMENT_STATUSES:
        current_allocated = _movement_qty_from_row(
            qty_received=qty_received,
            qty_sent=qty_sent,
            quantity=quantity,
        )
    elif normalized in ACTIVE_MOVEMENT_STATUSES and sent_at is not None:
        current_allocated = _movement_qty_from_row(
            qty_received=None,
            qty_sent=qty_sent,
            quantity=quantity,
        )
    return max(allocated - current_allocated, 0)


def _stage_source_qty(
    *,
    db: Session,
    part: Part,
    stage_status: PartStageStatus,
) -> int:
    prerequisites = stage_prerequisites(part, stage_status.stage)
    if prerequisites:
        totals = compute_stage_totals(db, part=part)
        return min(int((totals.get(stage).good if totals.get(stage) else 0)) for stage in prerequisites)

    if part.is_cooperation and stage_status.stage in {"heat_treatment", "galvanic", "grinding"}:
        return _cooperation_received_qty(db=db, part=part)

    return int(part.qty_plan or 0)


def _ensure_stage_movement_allowed(
    *,
    db: Session,
    part: Part,
    stage_status: PartStageStatus,
    requested_qty: int,
    exclude_movement_id: UUID | None = None,
) -> None:
    if requested_qty <= 0:
        raise HTTPException(status_code=409, detail="Для этапа укажите количество больше 0")

    source_qty = _stage_source_qty(db=db, part=part, stage_status=stage_status)
    allocated_qty = _stage_allocated_qty(
        db=db,
        org_id=part.org_id,
        part_id=part.id,
        stage_id=stage_status.id,
        exclude_movement_id=exclude_movement_id,
    )
    remaining_qty = max(source_qty - allocated_qty, 0)

    if requested_qty > remaining_qty:
        stage_label = STAGE_LABELS.get(stage_status.stage, stage_status.stage)
        raise HTTPException(
            status_code=409,
            detail=(
                f"Недостаточно доступного количества для этапа «{stage_label}»: "
                f"доступно {remaining_qty} шт, запрошено {requested_qty} шт."
            ),
        )


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


def _apply_cooperation_partial_location(
    *,
    part: Part,
    current_location: str | None,
    current_holder: str | None,
    received_qty: int,
) -> tuple[str | None, str | None]:
    if not part.is_cooperation:
        return current_location, current_holder

    qty_plan = int(part.qty_plan or 0)
    if qty_plan <= 0:
        return current_location, current_holder

    if 0 < received_qty < qty_plan:
        return "Кооператор + Цех", f"В цехе {received_qty} из {qty_plan} шт"
    return current_location, current_holder


def _resolve_eta(part: Part, active_movement: LogisticsEntry | None) -> datetime | None:
    if active_movement and active_movement.planned_eta:
        return active_movement.planned_eta
    if part.cooperation_due_date is None:
        return None
    return datetime.combine(part.cooperation_due_date, time.min, tzinfo=timezone.utc)


def _to_movement_out_safe(movement: LogisticsEntry) -> MovementOut:
    try:
        return MovementOut.model_validate(movement)
    except (ValidationError, TypeError, ValueError):
        fallback_ts = movement.updated_at or movement.created_at or _now_utc()
        base_payload = {
            "id": movement.id,
            "part_id": movement.part_id,
            "status": normalize_movement_status(movement.status),
            "from_location": movement.from_location,
            "from_holder": movement.from_holder,
            "to_location": movement.to_location,
            "to_holder": movement.to_holder,
            "carrier": movement.carrier,
            "tracking_number": movement.tracking_number,
            "planned_eta": movement.planned_eta,
            "sent_at": movement.sent_at,
            "received_at": movement.received_at,
            "returned_at": movement.returned_at,
            "cancelled_at": movement.cancelled_at,
            "qty_sent": movement.qty_sent,
            "qty_received": movement.qty_received,
            "stage_id": movement.stage_id,
            "last_tracking_status": movement.last_tracking_status,
            "tracking_last_checked_at": movement.tracking_last_checked_at,
            "raw_payload": movement.raw_payload,
            "notes": movement.notes,
            "type": movement.type,
            "description": movement.description,
            "quantity": movement.quantity,
            "date": movement.date,
            "counterparty": movement.counterparty,
            "created_at": movement.created_at or fallback_ts,
            "updated_at": movement.updated_at or fallback_ts,
        }
        try:
            return MovementOut(**base_payload)
        except (ValidationError, TypeError, ValueError):
            # Last-resort fallback for legacy edge-cases on nullable date serialization.
            base_payload["date"] = None
            return MovementOut(**base_payload)
def _get_stage_status_in_org(
    db: Session,
    *,
    stage_id: UUID,
    org_id: UUID,
) -> PartStageStatus:
    stage_status = (
        db.query(PartStageStatus)
        .join(Part, Part.id == PartStageStatus.part_id)
        .filter(
            PartStageStatus.id == stage_id,
            Part.org_id == org_id,
        )
        .first()
    )
    if not stage_status:
        raise HTTPException(status_code=404, detail="Stage status not found")
    return stage_status


MOVEMENT_USE_CASE_HOOKS = MovementUseCaseHooks(
    get_stage_status_in_org=_get_stage_status_in_org,
    ensure_stage_movement_allowed=_ensure_stage_movement_allowed,
    count_active_movements=_count_active_movements,
    is_cooperation_inbound=_is_cooperation_inbound,
    ensure_cooperation_receive_limit=_ensure_cooperation_receive_limit,
    now_utc=_now_utc,
    to_movement_out_safe=_to_movement_out_safe,
)


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
    return create_movement_use_case(
        part_id=part_id,
        data=data,
        current_user=current_user,
        db=db,
        hooks=MOVEMENT_USE_CASE_HOOKS,
    )


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
    return update_movement_use_case(
        movement_id=movement_id,
        data=data,
        current_user=current_user,
        db=db,
        hooks=MOVEMENT_USE_CASE_HOOKS,
    )


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
    )
    try:
        rows = movements.all()
    except ProgrammingError as error:
        raise HTTPException(
            status_code=500,
            detail="Ошибка схемы БД для перемещений. Требуется применить миграции backend (alembic upgrade head).",
        ) from error
    return [_to_movement_out_safe(movement) for movement in rows]


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

    try:
        movements = (
            db.query(LogisticsEntry)
            .filter(
                LogisticsEntry.org_id == current_user.org_id,
                LogisticsEntry.part_id == part.id,
            )
            .order_by(func.coalesce(LogisticsEntry.sent_at, LogisticsEntry.created_at).desc())
            .all()
        )
    except ProgrammingError as error:
        raise HTTPException(
            status_code=500,
            detail="Ошибка схемы БД для маршрута/перемещений. Требуется применить миграции backend (alembic upgrade head).",
        ) from error

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
    cooperation_received_qty = (
        _cooperation_received_qty(db=db, part=part)
        if part.is_cooperation
        else 0
    )
    current_location, current_holder = _derive_current_location_and_holder(active_movement or location_movement)
    current_location, current_holder = _apply_cooperation_partial_location(
        part=part,
        current_location=current_location,
        current_holder=current_holder,
        received_qty=cooperation_received_qty,
    )
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
        last_movement=_to_movement_out_safe(last_movement) if last_movement else None,
        last_event=last_event,
    )
