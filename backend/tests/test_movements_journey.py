from datetime import datetime, timezone
from types import SimpleNamespace

from datetime import date

from app.routers.movements import (
    _apply_cooperation_location_fallback,
    _movement_affects_location,
    _resolve_eta,
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
