"""Movement use-cases extracted from HTTP router handlers."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..domain_errors import DomainError
from ..models import AuditEvent, LogisticsEntry, Part, PartStageStatus, User
from ..schemas import MovementCreate, MovementOut, MovementUpdate
from ..security import can_access_part, require_org_entity
from ..services.movement_rules import (
    apply_status_timestamps,
    ensure_not_cancelled_to_received,
    ensure_received_requires_sent,
    ensure_single_active_movement,
    ensure_stage_link_matches_part,
    initial_movement_state,
    normalize_movement_status,
    validate_status_transition,
)
from ..services.part_state import recompute_part_state

RECEIVED_MOVEMENT_STATUSES: tuple[str, ...] = ("received", "completed")


@dataclass(frozen=True)
class MovementUseCaseHooks:
    """Hooks for router-level helpers reused by movement use-cases."""

    get_stage_status_in_org: Callable[[Session, UUID, UUID], PartStageStatus] | None = None
    ensure_stage_movement_allowed: Callable[..., None] | None = None
    count_active_movements: Callable[..., int] | None = None
    is_cooperation_inbound: Callable[..., bool] | None = None
    ensure_cooperation_receive_limit: Callable[..., None] | None = None
    now_utc: Callable[[], datetime] | None = None
    to_movement_out_safe: Callable[[LogisticsEntry], MovementOut] | None = None
    resolve_org_entity: Callable[..., object] = require_org_entity
    can_access_part: Callable[[Session, Part, User], bool] = can_access_part
    recompute_part_state: Callable[[Session, Part], None] = recompute_part_state


def _required(name: str, hook: object):
    if hook is None:
        raise RuntimeError(f"Missing movement use-case hook: {name}")
    return hook


def _http_detail(exc: HTTPException) -> str:
    detail = exc.detail
    if isinstance(detail, str):
        return detail
    return str(detail)


def _domain_error_from_http_exception(
    *,
    exc: HTTPException,
    code: str,
    fallback_status: int,
    fallback_message: str,
) -> DomainError:
    return DomainError(
        code=code,
        http_status=int(exc.status_code or fallback_status),
        message=_http_detail(exc) or fallback_message,
    )


def create_movement_use_case(
    *,
    part_id: UUID,
    data: MovementCreate,
    current_user: User,
    db: Session,
    hooks: MovementUseCaseHooks,
) -> MovementOut:
    get_stage_status_in_org = _required("get_stage_status_in_org", hooks.get_stage_status_in_org)
    ensure_stage_movement_allowed = _required(
        "ensure_stage_movement_allowed",
        hooks.ensure_stage_movement_allowed,
    )
    count_active_movements = _required("count_active_movements", hooks.count_active_movements)
    is_cooperation_inbound = _required("is_cooperation_inbound", hooks.is_cooperation_inbound)
    ensure_cooperation_receive_limit = _required(
        "ensure_cooperation_receive_limit",
        hooks.ensure_cooperation_receive_limit,
    )
    now_utc = _required("now_utc", hooks.now_utc)
    to_movement_out_safe = _required("to_movement_out_safe", hooks.to_movement_out_safe)

    try:
        part = hooks.resolve_org_entity(
            db,
            Part,
            entity_id=part_id,
            org_id=current_user.org_id,
            not_found="Part not found",
        )
    except HTTPException as exc:
        raise _domain_error_from_http_exception(
            exc=exc,
            code="PART_NOT_FOUND",
            fallback_status=404,
            fallback_message="Part not found",
        ) from exc
    if not hooks.can_access_part(db, part, current_user):
        raise DomainError(
            code="PART_ACCESS_DENIED",
            http_status=403,
            message="Access denied",
        )

    if data.qty_sent is not None and data.qty_received is not None and data.qty_received > data.qty_sent:
        raise DomainError(
            code="MOVEMENT_INVALID_QUANTITY",
            http_status=409,
            message="qty_received cannot exceed qty_sent",
        )

    stage_status: PartStageStatus | None = None
    if data.stage_id:
        try:
            stage_status = get_stage_status_in_org(
                db,
                stage_id=data.stage_id,
                org_id=current_user.org_id,
            )
        except HTTPException as exc:
            raise _domain_error_from_http_exception(
                exc=exc,
                code="STAGE_STATUS_NOT_FOUND",
                fallback_status=404,
                fallback_message="Stage status not found",
            ) from exc
        try:
            ensure_stage_link_matches_part(movement_part_id=part.id, stage_part_id=stage_status.part_id)
        except ValueError as error:
            raise DomainError(
                code="MOVEMENT_STAGE_PART_MISMATCH",
                http_status=409,
                message=str(error),
            ) from error

    requested_initial_status = normalize_movement_status(data.status)
    status = requested_initial_status
    sent_at: datetime | None = None
    received_at: datetime | None = None

    if requested_initial_status == "sent":
        status, sent_at = initial_movement_state()
    elif requested_initial_status == "pending":
        status, sent_at = "pending", None
    elif requested_initial_status == "received":
        sent_at = now_utc()
        received_at = sent_at
        ensure_received_requires_sent(sent_at=sent_at, next_status="received")
    else:
        raise DomainError(
            code="MOVEMENT_INVALID_INITIAL_STATUS",
            http_status=400,
            message="Invalid initial movement status",
        )

    if stage_status is not None and status in {"sent", "received"}:
        requested_stage_qty = (
            data.qty_received
            if status == "received" and data.qty_received is not None
            else data.qty_sent
        )
        if requested_stage_qty is None and status == "received":
            requested_stage_qty = data.qty_sent
        if requested_stage_qty is None:
            raise DomainError(
                code="MOVEMENT_STAGE_QTY_REQUIRED",
                http_status=409,
                message="Для отправки/приёмки на этап нужно указать количество",
            )
        try:
            ensure_stage_movement_allowed(
                db=db,
                part=part,
                stage_status=stage_status,
                requested_qty=int(requested_stage_qty),
            )
        except HTTPException as exc:
            raise _domain_error_from_http_exception(
                exc=exc,
                code="MOVEMENT_STAGE_CONSTRAINT_VIOLATION",
                fallback_status=409,
                fallback_message="Stage movement validation failed",
            ) from exc

    active_count = count_active_movements(db, org_id=current_user.org_id, part_id=part.id)
    try:
        ensure_single_active_movement(
            existing_active_count=active_count,
            current_status=None,
            next_status=status,
            allow_parallel=data.allow_parallel,
        )
    except ValueError as error:
        raise DomainError(
            code="MOVEMENT_ACTIVE_CONFLICT",
            http_status=409,
            message=str(error),
        ) from error

    resolved_qty_received = (
        data.qty_received
        if data.qty_received is not None
        else (data.qty_sent if status == "received" else None)
    )
    if status in RECEIVED_MOVEMENT_STATUSES and is_cooperation_inbound(
        part=part,
        stage_id=data.stage_id,
        movement_type=data.type,
        to_location=data.to_location,
        to_holder=data.to_holder,
    ):
        try:
            ensure_cooperation_receive_limit(
                db=db,
                part=part,
                incoming_qty=int(resolved_qty_received) if resolved_qty_received is not None else None,
            )
        except HTTPException as exc:
            raise _domain_error_from_http_exception(
                exc=exc,
                code="MOVEMENT_COOPERATION_LIMIT_VIOLATION",
                fallback_status=409,
                fallback_message="Cooperation receive limit violated",
            ) from exc

    movement = LogisticsEntry(
        org_id=current_user.org_id,
        part_id=part.id,
        status=status,
        sent_at=sent_at,
        received_at=received_at,
        from_location=data.from_location,
        from_holder=data.from_holder,
        to_location=data.to_location,
        to_holder=data.to_holder,
        carrier=data.carrier,
        tracking_number=data.tracking_number,
        planned_eta=data.planned_eta,
        qty_sent=data.qty_sent,
        qty_received=resolved_qty_received,
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
    hooks.recompute_part_state(db, part=part)

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
    return to_movement_out_safe(movement)


def update_movement_use_case(
    *,
    movement_id: UUID,
    data: MovementUpdate,
    current_user: User,
    db: Session,
    hooks: MovementUseCaseHooks,
) -> MovementOut:
    get_stage_status_in_org = _required("get_stage_status_in_org", hooks.get_stage_status_in_org)
    ensure_stage_movement_allowed = _required(
        "ensure_stage_movement_allowed",
        hooks.ensure_stage_movement_allowed,
    )
    count_active_movements = _required("count_active_movements", hooks.count_active_movements)
    is_cooperation_inbound = _required("is_cooperation_inbound", hooks.is_cooperation_inbound)
    ensure_cooperation_receive_limit = _required(
        "ensure_cooperation_receive_limit",
        hooks.ensure_cooperation_receive_limit,
    )
    now_utc = _required("now_utc", hooks.now_utc)
    to_movement_out_safe = _required("to_movement_out_safe", hooks.to_movement_out_safe)

    try:
        movement = hooks.resolve_org_entity(
            db,
            LogisticsEntry,
            entity_id=movement_id,
            org_id=current_user.org_id,
            not_found="Movement not found",
        )
    except HTTPException as exc:
        raise _domain_error_from_http_exception(
            exc=exc,
            code="MOVEMENT_NOT_FOUND",
            fallback_status=404,
            fallback_message="Movement not found",
        ) from exc

    try:
        part = hooks.resolve_org_entity(
            db,
            Part,
            entity_id=movement.part_id,
            org_id=current_user.org_id,
            not_found="Part not found",
        )
    except HTTPException as exc:
        raise _domain_error_from_http_exception(
            exc=exc,
            code="PART_NOT_FOUND",
            fallback_status=404,
            fallback_message="Part not found",
        ) from exc
    if not hooks.can_access_part(db, part, current_user):
        raise DomainError(
            code="PART_ACCESS_DENIED",
            http_status=403,
            message="Access denied",
        )

    payload = data.model_dump(exclude_unset=True)

    next_qty_sent = payload.get("qty_sent", movement.qty_sent)
    next_qty_received = payload.get("qty_received", movement.qty_received)
    if next_qty_sent is not None and next_qty_received is not None and next_qty_received > next_qty_sent:
        raise DomainError(
            code="MOVEMENT_INVALID_QUANTITY",
            http_status=409,
            message="qty_received cannot exceed qty_sent",
        )

    if "stage_id" in payload and payload["stage_id"]:
        try:
            stage_status = get_stage_status_in_org(
                db,
                stage_id=payload["stage_id"],
                org_id=current_user.org_id,
            )
        except HTTPException as exc:
            raise _domain_error_from_http_exception(
                exc=exc,
                code="STAGE_STATUS_NOT_FOUND",
                fallback_status=404,
                fallback_message="Stage status not found",
            ) from exc
        try:
            ensure_stage_link_matches_part(movement_part_id=movement.part_id, stage_part_id=stage_status.part_id)
        except ValueError as error:
            raise DomainError(
                code="MOVEMENT_STAGE_PART_MISMATCH",
                http_status=409,
                message=str(error),
            ) from error
    else:
        if movement.stage_id:
            try:
                stage_status = get_stage_status_in_org(
                    db,
                    stage_id=movement.stage_id,
                    org_id=current_user.org_id,
                )
            except HTTPException as exc:
                raise _domain_error_from_http_exception(
                    exc=exc,
                    code="STAGE_STATUS_NOT_FOUND",
                    fallback_status=404,
                    fallback_message="Stage status not found",
                ) from exc
        else:
            stage_status = None

    new_status = None
    if "status" in payload and payload["status"] is not None:
        requested_status = str(payload["status"])
        try:
            ensure_not_cancelled_to_received(current_status=movement.status, next_status=requested_status)
            new_status = validate_status_transition(current_status=movement.status, next_status=requested_status)
            ensure_received_requires_sent(sent_at=movement.sent_at, next_status=new_status)
            ensure_single_active_movement(
                existing_active_count=count_active_movements(
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
            raise DomainError(
                code="MOVEMENT_INVALID_STATUS_TRANSITION",
                http_status=409,
                message=str(error),
            ) from error

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
            at=now_utc(),
        )
        movement.sent_at = timestamp_updates["sent_at"]
        movement.received_at = timestamp_updates["received_at"]
        movement.returned_at = timestamp_updates["returned_at"]
        movement.cancelled_at = timestamp_updates["cancelled_at"]
        if new_status == "received" and payload.get("qty_received") is None and movement.qty_received is None:
            movement.qty_received = movement.qty_sent

    effective_status = normalize_movement_status(new_status or movement.status)
    if stage_status is not None and (
        "stage_id" in payload
        or "qty_sent" in payload
        or "qty_received" in payload
        or "status" in payload
    ) and effective_status in {"sent", "in_transit", "received"}:
        requested_stage_qty = (
            movement.qty_received
            if effective_status == "received" and movement.qty_received is not None
            else movement.qty_sent
        )
        if requested_stage_qty is None and effective_status == "received":
            requested_stage_qty = movement.qty_sent
        if requested_stage_qty is None:
            raise DomainError(
                code="MOVEMENT_STAGE_QTY_REQUIRED",
                http_status=409,
                message="Для отправки/приёмки на этап нужно указать количество",
            )
        try:
            ensure_stage_movement_allowed(
                db=db,
                part=part,
                stage_status=stage_status,
                requested_qty=int(requested_stage_qty),
                exclude_movement_id=movement.id,
            )
        except HTTPException as exc:
            raise _domain_error_from_http_exception(
                exc=exc,
                code="MOVEMENT_STAGE_CONSTRAINT_VIOLATION",
                fallback_status=409,
                fallback_message="Stage movement validation failed",
            ) from exc

    if (
        effective_status in RECEIVED_MOVEMENT_STATUSES
        and is_cooperation_inbound(
            part=part,
            stage_id=movement.stage_id,
            movement_type=movement.type,
            to_location=movement.to_location,
            to_holder=movement.to_holder,
        )
        and any(
            field in payload
            for field in (
                "status",
                "qty_sent",
                "qty_received",
                "stage_id",
                "to_location",
                "to_holder",
                "type",
            )
        )
    ):
        incoming_qty = movement.qty_received if movement.qty_received is not None else movement.qty_sent
        try:
            ensure_cooperation_receive_limit(
                db=db,
                part=part,
                incoming_qty=int(incoming_qty) if incoming_qty is not None else None,
                exclude_movement_id=movement.id,
            )
        except HTTPException as exc:
            raise _domain_error_from_http_exception(
                exc=exc,
                code="MOVEMENT_COOPERATION_LIMIT_VIOLATION",
                fallback_status=409,
                fallback_message="Cooperation receive limit violated",
            ) from exc

    hooks.recompute_part_state(db, part=part)

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
    return to_movement_out_safe(movement)
