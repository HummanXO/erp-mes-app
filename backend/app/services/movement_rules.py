"""Movement/transfer invariant helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID


ACTIVE_MOVEMENT_STATUSES: set[str] = {"sent", "in_transit"}
_TERMINAL_STATUSES: set[str] = {"received", "returned", "cancelled", "completed"}
_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"sent", "cancelled"},
    "sent": {"in_transit", "received", "returned", "cancelled"},
    "in_transit": {"received", "returned", "cancelled"},
    "received": set(),
    "returned": set(),
    "cancelled": set(),
    "completed": set(),
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def normalize_movement_status(status: str | None) -> str:
    if not status:
        return "pending"
    return status.strip().lower()


def initial_movement_state(*, at: datetime | None = None) -> tuple[str, datetime]:
    ts = at or now_utc()
    return "sent", ts


def validate_status_transition(*, current_status: str | None, next_status: str | None) -> str:
    if next_status is None:
        return normalize_movement_status(current_status)

    current = normalize_movement_status(current_status)
    nxt = normalize_movement_status(next_status)

    if nxt == current:
        return nxt

    allowed = _ALLOWED_TRANSITIONS.get(current, set())
    if nxt not in allowed:
        raise ValueError(f"Invalid movement status transition: {current} -> {nxt}")
    return nxt


def ensure_received_requires_sent(*, sent_at: datetime | None, next_status: str) -> None:
    if normalize_movement_status(next_status) == "received" and sent_at is None:
        raise ValueError("Cannot mark movement as received without sent_at")


def ensure_not_cancelled_to_received(*, current_status: str | None, next_status: str) -> None:
    current = normalize_movement_status(current_status)
    nxt = normalize_movement_status(next_status)
    if current == "cancelled" and nxt != "cancelled":
        raise ValueError("Cannot change movement after cancelled")


def ensure_single_active_movement(
    *,
    existing_active_count: int,
    current_status: str | None,
    next_status: str,
    allow_parallel: bool,
) -> None:
    if allow_parallel:
        return

    current = normalize_movement_status(current_status)
    nxt = normalize_movement_status(next_status)
    if nxt in ACTIVE_MOVEMENT_STATUSES and current not in ACTIVE_MOVEMENT_STATUSES and existing_active_count > 0:
        raise ValueError("Another active movement already exists for this part")


def ensure_stage_link_matches_part(*, movement_part_id: UUID, stage_part_id: UUID) -> None:
    if movement_part_id != stage_part_id:
        raise ValueError("Stage link does not belong to the same part")


def is_terminal_status(status: str | None) -> bool:
    return normalize_movement_status(status) in _TERMINAL_STATUSES


def has_real_shipment_semantics(*, status: str | None, sent_at: datetime | None) -> bool:
    current = normalize_movement_status(status)
    if current in {"sent", "in_transit"}:
        return sent_at is not None
    return current in {"received", "returned", "cancelled"}


def apply_status_timestamps(
    *,
    next_status: str,
    sent_at: datetime | None,
    received_at: datetime | None,
    returned_at: datetime | None,
    cancelled_at: datetime | None,
    at: datetime | None = None,
) -> dict[str, datetime | None]:
    ts = at or now_utc()
    nxt = normalize_movement_status(next_status)

    updated_sent_at = sent_at
    updated_received_at = received_at
    updated_returned_at = returned_at
    updated_cancelled_at = cancelled_at

    if updated_sent_at is None and nxt in {"sent", "in_transit"}:
        updated_sent_at = ts
    if nxt == "received" and updated_received_at is None:
        updated_received_at = ts
    if nxt == "returned" and updated_returned_at is None:
        updated_returned_at = ts
    if nxt == "cancelled" and updated_cancelled_at is None:
        updated_cancelled_at = ts

    return {
        "sent_at": updated_sent_at,
        "received_at": updated_received_at,
        "returned_at": updated_returned_at,
        "cancelled_at": updated_cancelled_at,
    }
