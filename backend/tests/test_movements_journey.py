from datetime import date, datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.routers import movements as movements_router
from app.routers.movements import (
    _apply_cooperation_location_fallback,
    _apply_cooperation_partial_location,
    _movement_affects_location,
    _resolve_eta,
    _to_movement_out_safe,
)


def test_pending_movement_does_not_affect_location() -> None:
    pending = SimpleNamespace(status="pending", sent_at=None)
    assert _movement_affects_location(pending) is False


def test_sent_without_sent_at_does_not_affect_location() -> None:
    broken_sent = SimpleNamespace(status="sent", sent_at=None)
    assert _movement_affects_location(broken_sent) is False


def test_sent_with_sent_at_affects_location() -> None:
    sent = SimpleNamespace(status="sent", sent_at=datetime.now(timezone.utc))
    assert _movement_affects_location(sent) is True


def test_cooperation_fallback_location_and_holder_without_movements() -> None:
    part = SimpleNamespace(is_cooperation=True, cooperation_partner="ПК Реном")
    current_location, current_holder = _apply_cooperation_location_fallback(
        part=part,
        current_location=None,
        current_holder=None,
    )
    assert current_location == "У кооператора"
    assert current_holder == "ПК Реном"


def test_cooperation_partial_location_for_mixed_holder_state() -> None:
    part = SimpleNamespace(is_cooperation=True, qty_plan=18196)
    current_location, current_holder = _apply_cooperation_partial_location(
        part=part,
        current_location="Цех",
        current_holder="Производство",
        received_qty=5000,
    )
    assert current_location == "Кооператор + Цех"
    assert current_holder == "В цехе 5000 из 18196 шт"


def test_cooperation_partial_location_does_not_override_when_fully_received() -> None:
    part = SimpleNamespace(is_cooperation=True, qty_plan=18196)
    current_location, current_holder = _apply_cooperation_partial_location(
        part=part,
        current_location="Цех",
        current_holder="Производство",
        received_qty=18196,
    )
    assert current_location == "Цех"
    assert current_holder == "Производство"


def test_cooperation_eta_fallback_from_part_due_date() -> None:
    part = SimpleNamespace(cooperation_due_date=date(2026, 2, 27))
    eta = _resolve_eta(part, active_movement=None)
    assert eta == datetime(2026, 2, 27, 0, 0, tzinfo=timezone.utc)


def test_active_movement_eta_has_priority_over_part_due_date() -> None:
    part = SimpleNamespace(cooperation_due_date=date(2026, 2, 27))
    movement_eta = datetime(2026, 2, 25, 8, 30, tzinfo=timezone.utc)
    movement = SimpleNamespace(planned_eta=movement_eta)
    eta = _resolve_eta(part, active_movement=movement)
    assert eta == movement_eta


def test_to_movement_out_safe_falls_back_when_timestamps_missing() -> None:
    movement = SimpleNamespace(
        id=uuid4(),
        part_id=uuid4(),
        status="sent",
        from_location="Склад",
        from_holder=None,
        to_location="Цех",
        to_holder=None,
        carrier=None,
        tracking_number=None,
        planned_eta=None,
        sent_at=None,
        received_at=None,
        returned_at=None,
        cancelled_at=None,
        qty_sent=5,
        qty_received=None,
        stage_id=None,
        last_tracking_status=None,
        tracking_last_checked_at=None,
        raw_payload=None,
        notes=None,
        type="shipping_out",
        description="movement",
        quantity=5,
        date=date(2026, 2, 20),
        counterparty="Цех",
        created_at=None,
        updated_at=None,
    )

    response = _to_movement_out_safe(movement)

    assert response.id == movement.id
    assert response.created_at is not None
    assert response.updated_at is not None


def test_to_movement_out_safe_does_not_mask_unexpected_errors(monkeypatch) -> None:
    movement = SimpleNamespace(
        id=uuid4(),
        part_id=uuid4(),
        status="sent",
        created_at=datetime(2026, 2, 20, 10, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 2, 20, 10, 0, tzinfo=timezone.utc),
    )

    def _raise_runtime_error(_cls, _value):
        raise RuntimeError("unexpected")

    monkeypatch.setattr(movements_router.MovementOut, "model_validate", classmethod(_raise_runtime_error))

    with pytest.raises(RuntimeError, match="unexpected"):
        _to_movement_out_safe(movement)
