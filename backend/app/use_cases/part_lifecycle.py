"""Part lifecycle use-cases extracted from HTTP router."""
from __future__ import annotations

from collections.abc import Callable
from uuid import UUID

from sqlalchemy.orm import Session

from ..domain_errors import DomainError
from ..models import (
    AuditEvent,
    LogisticsEntry,
    MachineNorm,
    Part,
    PartStageStatus,
    SpecItem,
    Specification,
    StageFact,
    Task,
    User,
)


def delete_part_use_case(
    *,
    db: Session,
    part_id: UUID,
    current_user: User,
    recompute_specification_status: Callable[[Session, Specification], None],
) -> None:
    """Delete part and dependent records, keeping specification counters consistent."""
    part = db.query(Part).filter(
        Part.id == part_id,
        Part.org_id == current_user.org_id,
    ).first()
    if not part:
        raise DomainError(
            code="PART_NOT_FOUND",
            http_status=404,
            message="Part not found",
        )

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

    # Keep audit rows but clear FK.
    db.query(AuditEvent).filter(AuditEvent.part_id == part_id).update(
        {"part_id": None},
        synchronize_session=False,
    )

    db.query(MachineNorm).filter(MachineNorm.part_id == part_id).delete(synchronize_session=False)
    db.query(LogisticsEntry).filter(LogisticsEntry.part_id == part_id).delete(synchronize_session=False)
    db.query(Task).filter(Task.part_id == part_id).delete(synchronize_session=False)
    db.query(StageFact).filter(StageFact.part_id == part_id).delete(synchronize_session=False)
    db.query(PartStageStatus).filter(PartStageStatus.part_id == part_id).delete(synchronize_session=False)

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
            recompute_specification_status(db, specification)

    db.commit()
