from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.domain_errors import DomainError
from app.models import LogisticsEntry, Part
from app.schemas import InventoryItemRef, InventoryMovementCreate, InventoryQty
from app.use_cases.movements_use_cases import MovementUseCaseHooks
from app.use_cases import inventory_slice as use_case


class _PartQueryStub:
    def __init__(self, parts: list[object]) -> None:
        self._parts = parts

    def filter(self, *_args, **_kwargs):
        return self

    def order_by(self, *_args, **_kwargs):
        return self

    def all(self):
        return self._parts


class _MovementQueryStub:
    def __init__(self, movements: list[object]) -> None:
        self._movements = movements

    def filter(self, *_args, **_kwargs):
        return self

    def order_by(self, *_args, **_kwargs):
        return self

    def all(self):
        return self._movements


class _SessionStub:
    def __init__(self, *, parts: list[object], movements: list[object]) -> None:
        self._parts = parts
        self._movements = movements

    def query(self, model):
        if model is Part:
            return _PartQueryStub(self._parts)
        if model is LogisticsEntry:
            return _MovementQueryStub(self._movements)
        raise AssertionError(f"Unexpected model queried: {model}")


def _user(*, org_id):
    return SimpleNamespace(id=uuid4(), org_id=org_id, initials="USR", role="shop_head")


def _part(*, org_id, code: str, status: str = "in_progress", qty_done: int = 0):
    return SimpleNamespace(
        id=uuid4(),
        org_id=org_id,
        code=code,
        name=f"Part {code}",
        status=status,
        qty_done=qty_done,
    )


def _movement(*, part_id, status="received", qty_sent=5, qty_received=None, movement_type="receipt"):
    ts = datetime(2026, 2, 20, 12, 0, tzinfo=timezone.utc)
    return SimpleNamespace(
        id=uuid4(),
        part_id=part_id,
        status=status,
        qty_sent=qty_sent,
        qty_received=qty_received,
        quantity=qty_sent,
        type=movement_type,
        from_location="Склад",
        to_location="Цех",
        notes="test movement",
        description="test movement",
        raw_payload=None,
        sent_at=ts,
        received_at=ts,
        created_at=ts,
        updated_at=ts,
    )


def _hooks() -> MovementUseCaseHooks:
    return MovementUseCaseHooks(
        resolve_org_entity=lambda *_args, **_kwargs: None,
        can_access_part=lambda *_args, **_kwargs: True,
        recompute_part_state=lambda *_args, **_kwargs: None,
        get_stage_status_in_org=lambda *_args, **_kwargs: None,
        ensure_stage_movement_allowed=lambda **_kwargs: None,
        count_active_movements=lambda _db, **_kwargs: 0,
        is_cooperation_inbound=lambda **_kwargs: False,
        ensure_cooperation_receive_limit=lambda **_kwargs: None,
        now_utc=lambda: datetime(2026, 2, 20, 12, 0, tzinfo=timezone.utc),
        to_movement_out_safe=lambda movement: movement,
    )


def test_list_inventory_metal_happy_path_returns_part_mapped_items(monkeypatch: pytest.MonkeyPatch) -> None:
    org_id = uuid4()
    part_a = _part(org_id=org_id, code="P-100", qty_done=7)
    part_b = _part(org_id=org_id, code="P-200", status="done", qty_done=2)
    movements = [_movement(part_id=part_a.id, status="received", qty_sent=9, qty_received=9)]
    db = _SessionStub(parts=[part_a, part_b], movements=movements)

    monkeypatch.setattr(use_case, "apply_part_visibility_scope", lambda query, _db, _user: query)

    result = use_case.list_inventory_metal_use_case(db=db, current_user=_user(org_id=org_id))

    assert len(result) == 2
    assert result[0].id == part_a.id
    assert result[0].qty.pcs == 9
    assert result[0].material_grade == "P-100"
    assert result[1].id == part_b.id
    assert result[1].location == "Склад готовой продукции"


def test_list_inventory_movements_happy_path_maps_core_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    org_id = uuid4()
    part = _part(org_id=org_id, code="P-300")
    movement = _movement(part_id=part.id, status="sent", qty_sent=4, qty_received=None, movement_type="transfer")
    db = _SessionStub(parts=[part], movements=[movement])

    monkeypatch.setattr(use_case, "apply_part_visibility_scope", lambda query, _db, _user: query)

    rows = use_case.list_inventory_movements_use_case(db=db, current_user=_user(org_id=org_id))

    assert len(rows) == 1
    assert rows[0].item_ref.id == part.id
    assert rows[0].item_ref.type == "metal"
    assert rows[0].qty.pcs == 4
    assert rows[0].type == "transfer"


def test_create_inventory_movement_happy_path_delegates_to_movement_use_case(monkeypatch: pytest.MonkeyPatch) -> None:
    org_id = uuid4()
    user = _user(org_id=org_id)
    part = _part(org_id=org_id, code="P-400")
    db = _SessionStub(parts=[], movements=[])

    captured: dict[str, object] = {}

    def _fake_create_movement_use_case(*, part_id, data, current_user, db, hooks):  # noqa: ANN001
        captured["part_id"] = part_id
        captured["status"] = data.status
        captured["qty_sent"] = data.qty_sent
        captured["current_user_id"] = current_user.id
        return {
            "id": str(uuid4()),
            "from_location": data.from_location,
            "to_location": data.to_location,
            "notes": data.notes,
            "description": data.description,
            "sent_at": datetime(2026, 2, 20, 13, 0, tzinfo=timezone.utc),
            "received_at": None,
        }

    monkeypatch.setattr(use_case, "create_movement_use_case", _fake_create_movement_use_case)
    monkeypatch.setattr(use_case, "require_org_entity", lambda *_args, **_kwargs: part)
    monkeypatch.setattr(use_case, "can_access_part", lambda *_args, **_kwargs: True)

    payload = InventoryMovementCreate(
        type="receipt",
        item_ref=InventoryItemRef(type="metal", id=part.id, label=None),
        qty=InventoryQty(pcs=3, kg=None),
        from_location="Поставщик",
        to_location="Склад",
        reason="Поступление",
    )
    created = use_case.create_inventory_movement_use_case(
        db=db,
        current_user=user,
        payload=payload,
        hooks=_hooks(),
    )

    assert captured["part_id"] == part.id
    assert captured["status"] == "received"
    assert captured["qty_sent"] == 3
    assert captured["current_user_id"] == user.id
    assert created.item_ref.id == part.id
    assert created.qty.pcs == 3
    assert created.user_id == str(user.id)


def test_create_inventory_movement_rejects_tooling_item_type_with_stable_code() -> None:
    org_id = uuid4()
    payload = InventoryMovementCreate(
        type="receipt",
        item_ref=InventoryItemRef(type="tooling", id=uuid4(), label=None),
        qty=InventoryQty(pcs=1, kg=None),
        from_location="A",
        to_location="B",
    )

    with pytest.raises(DomainError) as exc:
        use_case.create_inventory_movement_use_case(
            db=_SessionStub(parts=[], movements=[]),
            current_user=_user(org_id=org_id),
            payload=payload,
            hooks=_hooks(),
        )

    assert exc.value.http_status == 400
    assert exc.value.code == "INVENTORY_ITEM_TYPE_NOT_SUPPORTED"
