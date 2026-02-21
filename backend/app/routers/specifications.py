"""Specification, specification item and access grant endpoints."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from ..auth import check_permission, get_current_user
from ..database import get_db
from ..models import (
    AccessGrant,
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
from ..schemas import (
    AccessGrantCreate,
    AccessGrantResponse,
    SpecItemCreate,
    SpecItemProgressUpdate,
    SpecItemResponse,
    SpecificationCreate,
    SpecificationPublishRequest,
    SpecificationResponse,
    SpecificationUpdate,
)

router = APIRouter()

specifications_router = APIRouter(prefix="/specifications", tags=["specifications"])
spec_items_router = APIRouter(prefix="/spec-items", tags=["spec-items"])
access_grants_router = APIRouter(prefix="/access-grants", tags=["access-grants"])


SPEC_ITEM_STATUSES = {"open", "partial", "fulfilled", "blocked", "canceled"}


def _ensure_manage_specifications(current_user: User) -> None:
    if not check_permission(current_user, "canManageSpecifications"):
        raise HTTPException(status_code=403, detail="Permission denied")


def _ensure_grant_specification_access(current_user: User) -> None:
    if not check_permission(current_user, "canGrantSpecificationAccess"):
        raise HTTPException(status_code=403, detail="Permission denied")


def _get_specification_or_404(db: Session, specification_id: UUID, org_id: UUID) -> Specification:
    specification = db.query(Specification).filter(
        Specification.id == specification_id,
        Specification.org_id == org_id,
    ).first()
    if not specification:
        raise HTTPException(status_code=404, detail="Specification not found")
    return specification


def _operator_can_access_specification(db: Session, specification: Specification, user: User) -> bool:
    if specification.published_to_operators:
        return True
    grant_exists = db.query(AccessGrant.id).filter(
        AccessGrant.org_id == user.org_id,
        AccessGrant.entity_type == "specification",
        AccessGrant.entity_id == specification.id,
        AccessGrant.user_id == user.id,
    ).first()
    return bool(grant_exists)


def _assert_specification_access(db: Session, specification: Specification, current_user: User) -> None:
    if current_user.role != "operator":
        return
    if not _operator_can_access_specification(db, specification, current_user):
        raise HTTPException(status_code=403, detail="Access denied")


def _sync_make_item_progress_from_part(item: SpecItem) -> bool:
    if item.item_type != "make" or not item.part_id or not item.part:
        return False

    effective_done = max(0, min(item.part.qty_done, item.qty_required))
    if effective_done <= 0:
        effective_status = "open"
    elif effective_done >= item.qty_required:
        effective_status = "fulfilled"
    else:
        effective_status = "partial"

    changed = False
    if item.qty_done != effective_done:
        item.qty_done = effective_done
        changed = True
    if item.status != effective_status:
        item.status = effective_status
        changed = True
    return changed


def _mark_part_started_if_needed(part: Optional[Part]) -> bool:
    if not part:
        return False
    if part.status != "not_started":
        return False
    if part.qty_done >= part.qty_plan:
        return False
    part.status = "in_progress"
    return True


def _recompute_specification_status(specification: Specification) -> None:
    items = specification.items

    all_done = bool(items) and all(item.status in {"fulfilled", "canceled"} for item in items)
    has_work = any(item.qty_done > 0 or item.status in {"partial", "blocked"} for item in items)

    next_status = specification.status
    if all_done:
        next_status = "closed"
    elif specification.status != "closed" and (specification.published_to_operators or has_work):
        next_status = "active"
    elif specification.status != "closed":
        next_status = "draft"

    if specification.status != next_status:
        specification.status = next_status


def _prune_orphan_make_items(
    db: Session,
    *,
    org_id: UUID,
    specification_id: Optional[UUID] = None,
) -> set[UUID]:
    """Delete spec items that still point to removed parts."""
    query = db.query(SpecItem.id, SpecItem.specification_id).join(
        Specification,
        SpecItem.specification_id == Specification.id,
    ).outerjoin(
        Part,
        Part.id == SpecItem.part_id,
    ).filter(
        Specification.org_id == org_id,
        SpecItem.item_type == "make",
        SpecItem.part_id.isnot(None),
        Part.id.is_(None),
    )
    if specification_id is not None:
        query = query.filter(SpecItem.specification_id == specification_id)

    orphan_rows = query.all()
    if not orphan_rows:
        return set()

    orphan_item_ids = [row[0] for row in orphan_rows]
    affected_spec_ids = {row[1] for row in orphan_rows}
    db.query(SpecItem).filter(SpecItem.id.in_(orphan_item_ids)).delete(synchronize_session=False)
    return affected_spec_ids


def _delete_part_with_dependents(db: Session, part: Part) -> None:
    db.query(AuditEvent).filter(
        AuditEvent.part_id == part.id
    ).update({"part_id": None}, synchronize_session=False)

    db.query(MachineNorm).filter(
        MachineNorm.part_id == part.id
    ).delete(synchronize_session=False)

    db.query(LogisticsEntry).filter(
        LogisticsEntry.part_id == part.id
    ).delete(synchronize_session=False)

    db.query(Task).filter(
        Task.part_id == part.id
    ).delete(synchronize_session=False)

    db.query(StageFact).filter(
        StageFact.part_id == part.id
    ).delete(synchronize_session=False)

    db.query(PartStageStatus).filter(
        PartStageStatus.part_id == part.id
    ).delete(synchronize_session=False)

    db.delete(part)


def _part_has_deletion_dependencies(db: Session, *, part_id: UUID, org_id: UUID) -> bool:
    part = db.query(Part).filter(
        Part.id == part_id,
        Part.org_id == org_id,
    ).first()
    if not part:
        return False

    if part.qty_done > 0 or part.status != "not_started":
        return True

    has_stage_facts = db.query(StageFact.id).filter(
        StageFact.org_id == org_id,
        StageFact.part_id == part_id,
    ).first()
    has_tasks = db.query(Task.id).filter(
        Task.org_id == org_id,
        Task.part_id == part_id,
    ).first()
    has_logistics = db.query(LogisticsEntry.id).filter(
        LogisticsEntry.org_id == org_id,
        LogisticsEntry.part_id == part_id,
    ).first()
    has_norms = db.query(MachineNorm.id).filter(
        MachineNorm.part_id == part_id,
    ).first()
    has_stage_progress = db.query(PartStageStatus.id).filter(
        PartStageStatus.part_id == part_id,
        PartStageStatus.status != "pending",
    ).first()

    return bool(has_stage_facts or has_tasks or has_logistics or has_norms or has_stage_progress)


def _ensure_spec_item_deletable(db: Session, *, item: SpecItem, org_id: UUID) -> None:
    if not item.part_id:
        return

    shared_part_reference = db.query(SpecItem.id).filter(
        SpecItem.part_id == item.part_id,
        SpecItem.id != item.id,
    ).first()
    if shared_part_reference:
        return

    if _part_has_deletion_dependencies(db, part_id=item.part_id, org_id=org_id):
        raise HTTPException(
            status_code=409,
            detail="Cannot delete specification item: linked part already has production activity",
        )


@specifications_router.get("", response_model=list[SpecificationResponse])
def get_specifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Specification).filter(Specification.org_id == current_user.org_id)

    if current_user.role == "operator":
        granted_spec_ids = db.query(AccessGrant.entity_id).filter(
            AccessGrant.org_id == current_user.org_id,
            AccessGrant.entity_type == "specification",
            AccessGrant.user_id == current_user.id,
        )
        query = query.filter(
            (Specification.published_to_operators.is_(True))
            | (Specification.id.in_(granted_spec_ids))
        )

    specifications = query.order_by(Specification.created_at.desc()).all()
    return [SpecificationResponse.model_validate(specification) for specification in specifications]


@specifications_router.get("/{specification_id}", response_model=SpecificationResponse)
def get_specification(
    specification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    specification = _get_specification_or_404(db, specification_id, current_user.org_id)
    _assert_specification_access(db, specification, current_user)
    return SpecificationResponse.model_validate(specification)


@specifications_router.post("", response_model=SpecificationResponse, status_code=201)
def create_specification(
    data: SpecificationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_manage_specifications(current_user)

    existing = db.query(Specification.id).filter(
        Specification.org_id == current_user.org_id,
        Specification.number == data.number,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Specification with this number already exists")

    specification = Specification(
        org_id=current_user.org_id,
        number=data.number,
        customer=data.customer,
        deadline=data.deadline,
        note=data.note,
        status=data.status,
        published_to_operators=data.published_to_operators,
        created_by=current_user.id,
    )
    db.add(specification)
    db.flush()

    _recompute_specification_status(specification)
    db.commit()
    db.refresh(specification)

    return SpecificationResponse.model_validate(specification)


@specifications_router.put("/{specification_id}", response_model=SpecificationResponse)
def update_specification(
    specification_id: UUID,
    data: SpecificationUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_manage_specifications(current_user)
    specification = _get_specification_or_404(db, specification_id, current_user.org_id)

    updates = data.model_dump(exclude_unset=True)

    if "number" in updates and updates["number"] != specification.number:
        duplicate = db.query(Specification.id).filter(
            Specification.org_id == current_user.org_id,
            Specification.number == updates["number"],
            Specification.id != specification.id,
        ).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="Specification with this number already exists")

    for field, value in updates.items():
        setattr(specification, field, value)

    for item in specification.items:
        _sync_make_item_progress_from_part(item)

    _recompute_specification_status(specification)

    db.commit()
    db.refresh(specification)
    return SpecificationResponse.model_validate(specification)


@specifications_router.post("/{specification_id}/publish", response_model=SpecificationResponse)
def set_specification_published(
    specification_id: UUID,
    data: SpecificationPublishRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_manage_specifications(current_user)
    specification = _get_specification_or_404(db, specification_id, current_user.org_id)

    specification.published_to_operators = data.published
    for item in specification.items:
        _sync_make_item_progress_from_part(item)
    _recompute_specification_status(specification)

    db.commit()
    db.refresh(specification)

    return SpecificationResponse.model_validate(specification)


@specifications_router.delete("/{specification_id}", status_code=204)
def delete_specification(
    specification_id: UUID,
    delete_linked_parts: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_manage_specifications(current_user)
    specification = _get_specification_or_404(db, specification_id, current_user.org_id)

    removed_items = db.query(SpecItem).filter(SpecItem.specification_id == specification.id).all()

    if delete_linked_parts:
        candidate_part_ids = {
            item.part_id
            for item in removed_items
            if item.part_id is not None
        }

        if candidate_part_ids:
            protected_part_ids = {
                row[0]
                for row in db.query(SpecItem.part_id).filter(
                    SpecItem.specification_id != specification.id,
                    SpecItem.part_id.isnot(None),
                    SpecItem.part_id.in_(candidate_part_ids),
                ).all()
            }

            for part_id in candidate_part_ids:
                if part_id in protected_part_ids:
                    continue
                part = db.query(Part).filter(
                    Part.id == part_id,
                    Part.org_id == current_user.org_id,
                ).first()
                if part:
                    _delete_part_with_dependents(db, part)

    db.query(AccessGrant).filter(
        AccessGrant.org_id == current_user.org_id,
        AccessGrant.entity_type == "specification",
        AccessGrant.entity_id == specification.id,
    ).delete(synchronize_session=False)

    db.delete(specification)
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@specifications_router.get("/{specification_id}/items", response_model=list[SpecItemResponse])
def get_specification_items(
    specification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    specification = _get_specification_or_404(db, specification_id, current_user.org_id)
    _assert_specification_access(db, specification, current_user)

    pruned_spec_ids = _prune_orphan_make_items(
        db,
        org_id=current_user.org_id,
        specification_id=specification.id,
    )
    if pruned_spec_ids:
        _recompute_specification_status(specification)
        db.commit()

    items = db.query(SpecItem).filter(
        SpecItem.specification_id == specification.id,
    ).order_by(SpecItem.line_no.asc()).all()

    changed = False
    for item in items:
        if _sync_make_item_progress_from_part(item):
            changed = True

    if changed:
        _recompute_specification_status(specification)
        db.commit()

    return [SpecItemResponse.model_validate(item) for item in items]


@specifications_router.post("/{specification_id}/items", response_model=SpecItemResponse, status_code=201)
def create_specification_item(
    specification_id: UUID,
    data: SpecItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_manage_specifications(current_user)
    specification = _get_specification_or_404(db, specification_id, current_user.org_id)

    if data.item_type == "make" and not data.part_id:
        raise HTTPException(status_code=400, detail="part_id is required for make item")

    part = None
    if data.part_id:
        part = db.query(Part).filter(
            Part.id == data.part_id,
            Part.org_id == current_user.org_id,
        ).first()
        if not part:
            raise HTTPException(status_code=404, detail="Part not found")

    max_line = db.query(SpecItem.line_no).filter(
        SpecItem.specification_id == specification.id,
    ).order_by(SpecItem.line_no.desc()).first()
    next_line_no = (max_line[0] if max_line else 0) + 1

    item = SpecItem(
        specification_id=specification.id,
        line_no=next_line_no,
        item_type=data.item_type,
        part_id=data.part_id,
        description=data.description,
        qty_required=data.qty_required,
        qty_done=0,
        uom=data.uom,
        comment=data.comment,
        status="open",
    )
    db.add(item)
    db.flush()

    _sync_make_item_progress_from_part(item)
    _mark_part_started_if_needed(part)
    _recompute_specification_status(specification)

    db.commit()
    db.refresh(item)

    return SpecItemResponse.model_validate(item)


@specifications_router.delete("/{specification_id}/items/{spec_item_id}", status_code=204)
def delete_specification_item(
    specification_id: UUID,
    spec_item_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_manage_specifications(current_user)
    specification = _get_specification_or_404(db, specification_id, current_user.org_id)

    item = db.query(SpecItem).filter(
        SpecItem.id == spec_item_id,
        SpecItem.specification_id == specification.id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Spec item not found")

    _ensure_spec_item_deletable(db, item=item, org_id=current_user.org_id)

    db.delete(item)
    db.flush()
    db.refresh(specification)
    _recompute_specification_status(specification)
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@spec_items_router.get("", response_model=list[SpecItemResponse])
def get_spec_items(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(SpecItem).join(
        Specification,
        SpecItem.specification_id == Specification.id,
    ).filter(Specification.org_id == current_user.org_id)

    if current_user.role == "operator":
        granted_spec_ids = db.query(AccessGrant.entity_id).filter(
            AccessGrant.org_id == current_user.org_id,
            AccessGrant.entity_type == "specification",
            AccessGrant.user_id == current_user.id,
        )
        query = query.filter(
            (Specification.published_to_operators.is_(True))
            | (Specification.id.in_(granted_spec_ids))
        )

    pruned_spec_ids = _prune_orphan_make_items(db, org_id=current_user.org_id)

    items = query.order_by(SpecItem.created_at.desc()).all()

    changed_spec_ids: set[UUID] = set()
    for item in items:
        if _sync_make_item_progress_from_part(item):
            changed_spec_ids.add(item.specification_id)

    changed_spec_ids.update(pruned_spec_ids)
    if changed_spec_ids:
        specs = db.query(Specification).filter(
            Specification.org_id == current_user.org_id,
            Specification.id.in_(changed_spec_ids),
        ).all()
        for specification in specs:
            _recompute_specification_status(specification)
        db.commit()

    return [SpecItemResponse.model_validate(item) for item in items]


@spec_items_router.patch("/{spec_item_id}/progress", response_model=SpecItemResponse)
def update_spec_item_progress(
    spec_item_id: UUID,
    data: SpecItemProgressUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_manage_specifications(current_user)

    item = db.query(SpecItem).join(
        Specification,
        SpecItem.specification_id == Specification.id,
    ).filter(
        SpecItem.id == spec_item_id,
        Specification.org_id == current_user.org_id,
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Spec item not found")

    item.qty_done = max(0, data.qty_done)

    if data.status_override is not None:
        if data.status_override not in SPEC_ITEM_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status_override")
        item.status = data.status_override
    else:
        if item.qty_done <= 0:
            item.status = "open"
        elif item.qty_done >= item.qty_required:
            item.status = "fulfilled"
        else:
            item.status = "partial"

    specification = db.query(Specification).filter(Specification.id == item.specification_id).first()
    if specification:
        _recompute_specification_status(specification)

    db.commit()
    db.refresh(item)

    return SpecItemResponse.model_validate(item)


@access_grants_router.get("", response_model=list[AccessGrantResponse])
def get_access_grants(
    entity_type: Optional[str] = Query(default=None),
    entity_id: Optional[UUID] = Query(default=None),
    user_id: Optional[UUID] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(AccessGrant).filter(AccessGrant.org_id == current_user.org_id)

    if current_user.role == "operator":
        query = query.filter(AccessGrant.user_id == current_user.id)

    if entity_type:
        query = query.filter(AccessGrant.entity_type == entity_type)
    if entity_id:
        query = query.filter(AccessGrant.entity_id == entity_id)
    if user_id:
        query = query.filter(AccessGrant.user_id == user_id)

    grants = query.order_by(AccessGrant.created_at.desc()).all()
    return [AccessGrantResponse.model_validate(grant) for grant in grants]


@access_grants_router.post("", response_model=AccessGrantResponse, status_code=201)
def grant_access(
    data: AccessGrantCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.entity_type == "specification":
        _ensure_grant_specification_access(current_user)
    else:
        _ensure_manage_specifications(current_user)

    user = db.query(User).filter(
        User.id == data.user_id,
        User.org_id == current_user.org_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.entity_type == "specification":
        _get_specification_or_404(db, data.entity_id, current_user.org_id)

    grant = db.query(AccessGrant).filter(
        AccessGrant.org_id == current_user.org_id,
        AccessGrant.entity_type == data.entity_type,
        AccessGrant.entity_id == data.entity_id,
        AccessGrant.user_id == data.user_id,
    ).first()

    if grant:
        grant.permission = data.permission
        grant.created_by = current_user.id
    else:
        grant = AccessGrant(
            org_id=current_user.org_id,
            entity_type=data.entity_type,
            entity_id=data.entity_id,
            user_id=data.user_id,
            permission=data.permission,
            created_by=current_user.id,
        )
        db.add(grant)

    db.commit()
    db.refresh(grant)
    return AccessGrantResponse.model_validate(grant)


@access_grants_router.delete("/{grant_id}", status_code=204)
def revoke_access(
    grant_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    grant = db.query(AccessGrant).filter(
        AccessGrant.id == grant_id,
        AccessGrant.org_id == current_user.org_id,
    ).first()
    if not grant:
        raise HTTPException(status_code=404, detail="Access grant not found")

    if grant.entity_type == "specification":
        _ensure_grant_specification_access(current_user)
    else:
        _ensure_manage_specifications(current_user)

    db.delete(grant)
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


router.include_router(specifications_router)
router.include_router(spec_items_router)
router.include_router(access_grants_router)
