"""Batch read-model use-cases for part-related data (movements + norms)."""

from __future__ import annotations

from collections import defaultdict
from typing import Iterable
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import LogisticsEntry, MachineNorm, Part, User
from ..schemas import MachineNormResponse, MovementOut, PartRelatedBatchItem
from ..security import apply_part_visibility_scope


def _normalize_part_ids(part_ids: Iterable[UUID]) -> list[UUID]:
    seen: set[UUID] = set()
    normalized: list[UUID] = []
    for part_id in part_ids:
        if part_id in seen:
            continue
        seen.add(part_id)
        normalized.append(part_id)
    return normalized


def get_parts_related_batch_use_case(
    *,
    db: Session,
    current_user: User,
    part_ids: Iterable[UUID],
) -> list[PartRelatedBatchItem]:
    """Return related movements and machine norms for visible parts in one batch."""
    requested_ids = _normalize_part_ids(part_ids)
    if not requested_ids:
        return []

    visible_parts_query = db.query(Part).filter(
        Part.org_id == current_user.org_id,
        Part.id.in_(tuple(requested_ids)),
    )
    visible_parts = apply_part_visibility_scope(visible_parts_query, db, current_user).all()
    visible_ids = {part.id for part in visible_parts}
    if not visible_ids:
        return []

    movements = (
        db.query(LogisticsEntry)
        .filter(
            LogisticsEntry.org_id == current_user.org_id,
            LogisticsEntry.part_id.in_(tuple(visible_ids)),
        )
        .order_by(
            LogisticsEntry.part_id.asc(),
            func.coalesce(LogisticsEntry.sent_at, LogisticsEntry.created_at).desc(),
        )
        .all()
    )

    norms = (
        db.query(MachineNorm)
        .filter(MachineNorm.part_id.in_(tuple(visible_ids)))
        .order_by(
            MachineNorm.part_id.asc(),
            MachineNorm.machine_id.asc(),
            MachineNorm.stage.asc(),
        )
        .all()
    )

    movements_by_part: dict[UUID, list[MovementOut]] = defaultdict(list)
    norms_by_part: dict[UUID, list[MachineNormResponse]] = defaultdict(list)

    for movement in movements:
        movements_by_part[movement.part_id].append(MovementOut.model_validate(movement))

    for norm in norms:
        norms_by_part[norm.part_id].append(MachineNormResponse.model_validate(norm))

    return [
        PartRelatedBatchItem(
            part_id=part_id,
            movements=movements_by_part.get(part_id, []),
            norms=norms_by_part.get(part_id, []),
        )
        for part_id in requested_ids
        if part_id in visible_ids
    ]
