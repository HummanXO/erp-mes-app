from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.domain_errors import DomainError
from app.models import AuditEvent, LogisticsEntry, Part
from app.schemas import MovementCreate, MovementUpdate
from app.use_cases.movements_use_cases import (
    MovementUseCaseHooks,
    create_movement_use_case,
    update_movement_use_case,
)


class _SessionStub:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.flush_calls = 0
        self.commit_calls = 0
        self.refresh_calls = 0

    def add(self, obj: object) -> None:
        self.added.append(obj)

    def flush(self) -> None:
        self.flush_calls += 1

    def commit(self) -> None:
        self.commit_calls += 1

    def refresh(self, _obj: object) -> None:
        self.refresh_calls += 1


def _user(*, org_id):
    return SimpleNamespace(id=uuid4(), org_id=org_id, initials="USR", role="master")


def _part(*, org_id, is_cooperation=False):
    return SimpleNamespace(
        id=uuid4(),
        org_id=org_id,
        code="P-001",
        qty_plan=10,
        is_cooperation=is_cooperation,
    )


def _movement(*, part_id, status="sent", qty_sent=5):
    return SimpleNamespace(
        id=uuid4(),
        part_id=part_id,
        status=status,
        sent_at=datetime(2026, 2, 20, 10, 0, tzinfo=timezone.utc),
        received_at=None,
        returned_at=None,
        cancelled_at=None,
        from_location="Склад",
        from_holder=None,
        to_location="Цех",
        to_holder=None,
        carrier=None,
        tracking_number=None,
        planned_eta=None,
        qty_sent=qty_sent,
        qty_received=None,
        stage_id=None,
        notes=None,
        description="Movement",
        quantity=qty_sent,
        counterparty="Цех",
        type="shipping_out",
    )


def _resolver(part, movement=None):
    def _inner(_db, model, *, entity_id, org_id, not_found):  # noqa: ARG001
        if model is Part:
            return part
        if model is LogisticsEntry:
            if movement is None:
                raise AssertionError("Movement resolver called unexpectedly")
            return movement
        raise AssertionError(f"Unexpected model in resolver: {model}")

    return _inner


def _hooks(*, part, movement=None, can_access=True, now=None) -> MovementUseCaseHooks:
    fixed_now = now or datetime(2026, 2, 20, 12, 0, tzinfo=timezone.utc)

    return MovementUseCaseHooks(
        resolve_org_entity=_resolver(part, movement),
        can_access_part=lambda _db, _part, _user: can_access,
        recompute_part_state=lambda _db, part: None,
        get_stage_status_in_org=lambda _db, stage_id, org_id: SimpleNamespace(id=stage_id, part_id=part.id),  # noqa: ARG005
        ensure_stage_movement_allowed=lambda **_kwargs: None,
        count_active_movements=lambda _db, **_kwargs: 0,
        is_cooperation_inbound=lambda **_kwargs: False,
        ensure_cooperation_receive_limit=lambda **_kwargs: None,
        now_utc=lambda: fixed_now,
        to_movement_out_safe=lambda movement: {
            "id": str(movement.id),
            "status": movement.status,
            "qty_sent": movement.qty_sent,
            "qty_received": movement.qty_received,
        },
    )


def test_create_movement_happy_path_creates_audit_and_returns_output() -> None:
    org_id = uuid4()
    part = _part(org_id=org_id)
    user = _user(org_id=org_id)
    db = _SessionStub()

    result = create_movement_use_case(
        part_id=part.id,
        data=MovementCreate(status="sent", qty_sent=5, to_location="Цех"),
        current_user=user,
        db=db,
        hooks=_hooks(part=part),
    )

    assert result["status"] == "sent"
    assert db.flush_calls == 1
    assert db.commit_calls == 1
    audits = [item for item in db.added if isinstance(item, AuditEvent)]
    assert len(audits) == 1
    assert audits[0].action == "movement_created"


def test_create_movement_denied_when_part_not_accessible() -> None:
    org_id = uuid4()
    part = _part(org_id=org_id)
    user = _user(org_id=org_id)
    db = _SessionStub()

    with pytest.raises(DomainError, match="Access denied") as exc:
        create_movement_use_case(
            part_id=part.id,
            data=MovementCreate(status="sent", qty_sent=3),
            current_user=user,
            db=db,
            hooks=_hooks(part=part, can_access=False),
        )

    assert exc.value.http_status == 403
    assert exc.value.code == "PART_ACCESS_DENIED"
    assert db.commit_calls == 0


def test_create_movement_rejects_qty_received_gt_qty_sent_with_code() -> None:
    org_id = uuid4()
    part = _part(org_id=org_id)
    user = _user(org_id=org_id)
    db = _SessionStub()

    with pytest.raises(DomainError, match="qty_received cannot exceed qty_sent") as exc:
        create_movement_use_case(
            part_id=part.id,
            data=MovementCreate(status="sent", qty_sent=2, qty_received=3),
            current_user=user,
            db=db,
            hooks=_hooks(part=part),
        )

    assert exc.value.http_status == 409
    assert exc.value.code == "MOVEMENT_INVALID_QUANTITY"
    assert db.commit_calls == 0


def test_update_movement_happy_path_to_received_sets_qty_received_and_audits() -> None:
    org_id = uuid4()
    part = _part(org_id=org_id)
    movement = _movement(part_id=part.id, status="sent", qty_sent=7)
    user = _user(org_id=org_id)
    db = _SessionStub()

    result = update_movement_use_case(
        movement_id=movement.id,
        data=MovementUpdate(status="received"),
        current_user=user,
        db=db,
        hooks=_hooks(part=part, movement=movement),
    )

    assert result["status"] == "received"
    assert movement.status == "received"
    assert movement.qty_received == 7
    assert db.commit_calls == 1
    audits = [item for item in db.added if isinstance(item, AuditEvent)]
    assert len(audits) == 1
    assert audits[0].action == "movement_status_changed"


def test_update_movement_rejects_cancelled_to_received_transition() -> None:
    org_id = uuid4()
    part = _part(org_id=org_id)
    movement = _movement(part_id=part.id, status="cancelled", qty_sent=4)
    user = _user(org_id=org_id)
    db = _SessionStub()

    with pytest.raises(DomainError) as exc:
        update_movement_use_case(
            movement_id=movement.id,
            data=MovementUpdate(status="received"),
            current_user=user,
            db=db,
            hooks=_hooks(part=part, movement=movement),
        )

    assert exc.value.http_status == 409
    assert exc.value.code == "MOVEMENT_INVALID_STATUS_TRANSITION"
    assert db.commit_calls == 0
