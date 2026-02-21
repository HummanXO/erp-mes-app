"""Inventory API vertical slice use-cases (API mode)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..domain_errors import DomainError
from ..models import LogisticsEntry, Part, User
from ..schemas import (
    InventoryItemRef,
    InventoryMetalOut,
    InventoryMovementCreate,
    InventoryMovementOut,
    InventoryQty,
    MovementCreate,
)
from ..security import apply_part_visibility_scope, can_access_part, require_org_entity
from ..services.movement_rules import normalize_movement_status
from .movements_use_cases import MovementUseCaseHooks, create_movement_use_case

_RECEIVED_STATUSES: tuple[str, ...] = ("received", "completed")
_OUTBOUND_STATUSES: tuple[str, ...] = ("sent", "in_transit")


def _qty_value(movement: LogisticsEntry) -> int:
    return int(movement.qty_received or movement.qty_sent or movement.quantity or 0)


def _event_timestamp(movement: LogisticsEntry | None) -> datetime:
    if movement is None:
        return datetime.now(timezone.utc)
    return (
        movement.sent_at
        or movement.received_at
        or movement.updated_at
        or movement.created_at
        or datetime.now(timezone.utc)
    )


def _load_visible_parts(*, db: Session, current_user: User) -> list[Part]:
    base_query = db.query(Part).filter(Part.org_id == current_user.org_id)
    scoped_query = apply_part_visibility_scope(base_query, db, current_user)
    return scoped_query.order_by(Part.code.asc()).all()


def _map_inventory_type(movement: LogisticsEntry) -> str:
    raw_type = (movement.type or "").strip().lower()
    if raw_type in {"receipt", "issue", "transfer", "adjustment", "inventory"}:
        return raw_type

    status = normalize_movement_status(movement.status)
    if status in _RECEIVED_STATUSES:
        return "receipt"
    if status in _OUTBOUND_STATUSES:
        if (movement.to_location or "").strip().lower() in {"цех", "производство", "shop", "production"}:
            return "issue"
        return "transfer"
    if status in {"returned", "cancelled"}:
        return "adjustment"
    return "transfer"


def _raw_payload_link(movement: LogisticsEntry) -> str | None:
    if isinstance(movement.raw_payload, dict):
        link = movement.raw_payload.get("link_to_task")
        if isinstance(link, str) and link.strip():
            return link
    return None


def _movement_list_query(*, db: Session, current_user: User, part_ids: Iterable[UUID]):
    return (
        db.query(LogisticsEntry)
        .filter(
            LogisticsEntry.org_id == current_user.org_id,
            LogisticsEntry.part_id.in_(tuple(part_ids)),
            LogisticsEntry.stage_id.is_(None),
        )
        .order_by(func.coalesce(LogisticsEntry.sent_at, LogisticsEntry.created_at).desc())
    )


def list_inventory_metal_use_case(*, db: Session, current_user: User) -> list[InventoryMetalOut]:
    """Return minimal metal-like read model required by movement dialog in API mode."""
    parts = _load_visible_parts(db=db, current_user=current_user)
    if not parts:
        return []

    part_ids = [part.id for part in parts]
    movements = _movement_list_query(db=db, current_user=current_user, part_ids=part_ids).all()

    balance_by_part: dict[UUID, int] = {part.id: 0 for part in parts}
    location_by_part: dict[UUID, str] = {}
    latest_by_part: dict[UUID, LogisticsEntry] = {}

    for movement in movements:
        status = normalize_movement_status(movement.status)
        qty = _qty_value(movement)
        if status in _RECEIVED_STATUSES:
            balance_by_part[movement.part_id] = balance_by_part.get(movement.part_id, 0) + qty
        elif status in _OUTBOUND_STATUSES:
            balance_by_part[movement.part_id] = balance_by_part.get(movement.part_id, 0) - qty
        elif status == "returned":
            balance_by_part[movement.part_id] = balance_by_part.get(movement.part_id, 0) + qty

        if movement.part_id not in latest_by_part:
            latest_by_part[movement.part_id] = movement
            if status in _RECEIVED_STATUSES:
                location_by_part[movement.part_id] = movement.to_location or movement.from_location or "Производство"
            elif status in _OUTBOUND_STATUSES:
                location_by_part[movement.part_id] = movement.from_location or movement.to_location or "В пути"
            else:
                location_by_part[movement.part_id] = movement.to_location or movement.from_location or "Производство"

    items: list[InventoryMetalOut] = []
    for part in parts:
        qty_pcs = balance_by_part.get(part.id, 0)
        if qty_pcs <= 0:
            qty_pcs = max(int(part.qty_done or 0), 0)

        latest_movement = latest_by_part.get(part.id)
        default_location = "Склад готовой продукции" if part.status == "done" else "Производство"
        location = location_by_part.get(part.id, default_location)

        items.append(
            InventoryMetalOut(
                id=part.id,
                material_grade=part.code,
                shape="деталь",
                size=part.name,
                length=1,
                qty=InventoryQty(pcs=qty_pcs),
                location=location,
                status="available" if qty_pcs > 0 else "reserved",
                min_level=InventoryQty(pcs=0),
                lot=None,
                supplier=None,
                certificate_ref=None,
                reserved_qty=InventoryQty(pcs=0),
                in_use_qty=InventoryQty(pcs=0),
                created_at=latest_movement.created_at if latest_movement else None,
                updated_at=latest_movement.updated_at if latest_movement else None,
            )
        )
    return items


def list_inventory_movements_use_case(*, db: Session, current_user: User) -> list[InventoryMovementOut]:
    """Return inventory movement journal over accessible parts."""
    parts = _load_visible_parts(db=db, current_user=current_user)
    if not parts:
        return []
    part_map = {part.id: part for part in parts}

    movements = _movement_list_query(
        db=db,
        current_user=current_user,
        part_ids=part_map.keys(),
    ).all()

    result: list[InventoryMovementOut] = []
    for movement in movements:
        part = part_map.get(movement.part_id)
        if part is None:
            continue
        result.append(
            InventoryMovementOut(
                id=movement.id,
                type=_map_inventory_type(movement),
                datetime=_event_timestamp(movement),
                item_ref=InventoryItemRef(
                    type="metal",
                    id=movement.part_id,
                    label=f"{part.code} {part.name}",
                ),
                qty=InventoryQty(
                    pcs=_qty_value(movement),
                    kg=None,
                ),
                from_location=movement.from_location,
                to_location=movement.to_location,
                reason=movement.notes or movement.description,
                user_id="system",
                link_to_task=_raw_payload_link(movement),
            )
        )
    return result


def _movement_status_for_inventory_type(movement_type: str) -> str:
    if movement_type in {"receipt", "adjustment", "inventory"}:
        return "received"
    return "sent"


def create_inventory_movement_use_case(
    *,
    db: Session,
    current_user: User,
    payload: InventoryMovementCreate,
    hooks: MovementUseCaseHooks,
) -> InventoryMovementOut:
    """Create inventory movement by delegating to canonical movement use-case."""
    if payload.item_ref.type != "metal":
        raise DomainError(
            code="INVENTORY_ITEM_TYPE_NOT_SUPPORTED",
            http_status=400,
            message="Only metal item type is supported in API vertical slice",
        )

    qty_pcs = int(payload.qty.pcs or 0)
    if qty_pcs <= 0:
        raise DomainError(
            code="INVENTORY_QTY_REQUIRED",
            http_status=400,
            message="qty.pcs must be greater than 0",
        )

    part = require_org_entity(
        db,
        Part,
        entity_id=payload.item_ref.id,
        org_id=current_user.org_id,
        not_found="Part not found",
    )
    if not can_access_part(db, part, current_user):
        raise DomainError(
            code="PART_ACCESS_DENIED",
            http_status=403,
            message="Access denied",
        )

    status = _movement_status_for_inventory_type(payload.type)
    movement = create_movement_use_case(
        part_id=payload.item_ref.id,
        data=MovementCreate(
            status=status,
            from_location=payload.from_location,
            to_location=payload.to_location,
            qty_sent=qty_pcs,
            qty_received=qty_pcs if status == "received" else None,
            notes=payload.reason,
            description=payload.reason,
            type=payload.type,
            allow_parallel=True,
        ),
        current_user=current_user,
        db=db,
        hooks=hooks,
    )

    movement_data = movement.model_dump() if hasattr(movement, "model_dump") else movement
    movement_datetime = movement_data.get("sent_at") or movement_data.get("received_at")
    parsed_datetime: datetime
    if isinstance(movement_datetime, datetime):
        parsed_datetime = movement_datetime
    else:
        parsed_datetime = datetime.now(timezone.utc)

    return InventoryMovementOut(
        id=UUID(str(movement_data["id"])),
        type=payload.type,
        datetime=parsed_datetime,
        item_ref=InventoryItemRef(
            type="metal",
            id=part.id,
            label=f"{part.code} {part.name}",
        ),
        qty=InventoryQty(pcs=qty_pcs, kg=payload.qty.kg),
        from_location=movement_data.get("from_location"),
        to_location=movement_data.get("to_location"),
        reason=movement_data.get("notes") or movement_data.get("description") or payload.reason,
        user_id=str(current_user.id),
        link_to_task=payload.link_to_task,
    )
