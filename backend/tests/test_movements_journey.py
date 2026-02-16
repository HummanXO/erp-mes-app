from datetime import datetime, timezone
from types import SimpleNamespace

from app.routers.movements import _movement_affects_location


def test_pending_movement_does_not_affect_location() -> None:
    pending = SimpleNamespace(status="pending", sent_at=None)
    assert _movement_affects_location(pending) is False


def test_sent_without_sent_at_does_not_affect_location() -> None:
    broken_sent = SimpleNamespace(status="sent", sent_at=None)
    assert _movement_affects_location(broken_sent) is False


def test_sent_with_sent_at_affects_location() -> None:
    sent = SimpleNamespace(status="sent", sent_at=datetime.now(timezone.utc))
    assert _movement_affects_location(sent) is True
