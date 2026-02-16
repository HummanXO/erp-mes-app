from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.services.movement_rules import (
    apply_status_timestamps,
    ensure_not_cancelled_to_received,
    ensure_received_requires_sent,
    ensure_single_active_movement,
    ensure_stage_link_matches_part,
    has_real_shipment_semantics,
    initial_movement_state,
    normalize_movement_status,
    validate_status_transition,
)


def test_create_movement_initial_state_is_sent_with_timestamp() -> None:
    status, sent_at = initial_movement_state()
    assert status == "sent"
    assert sent_at is not None


def test_cannot_mark_received_without_sent_at() -> None:
    with pytest.raises(ValueError, match="without sent_at"):
        ensure_received_requires_sent(sent_at=None, next_status="received")


def test_sent_to_received_sets_received_timestamp() -> None:
    sent_at = datetime(2026, 2, 16, 10, 0, tzinfo=timezone.utc)
    next_status = validate_status_transition(current_status="sent", next_status="received")
    updates = apply_status_timestamps(
        next_status=next_status,
        sent_at=sent_at,
        received_at=None,
        returned_at=None,
        cancelled_at=None,
        at=datetime(2026, 2, 16, 12, 30, tzinfo=timezone.utc),
    )

    assert updates["sent_at"] == sent_at
    assert updates["received_at"] == datetime(2026, 2, 16, 12, 30, tzinfo=timezone.utc)


def test_pending_does_not_imply_sent_at() -> None:
    updates = apply_status_timestamps(
        next_status="pending",
        sent_at=None,
        received_at=None,
        returned_at=None,
        cancelled_at=None,
        at=datetime(2026, 2, 16, 12, 30, tzinfo=timezone.utc),
    )
    assert updates["sent_at"] is None


def test_sent_requires_sent_at_timestamp_to_exist() -> None:
    updates = apply_status_timestamps(
        next_status="sent",
        sent_at=None,
        received_at=None,
        returned_at=None,
        cancelled_at=None,
        at=datetime(2026, 2, 16, 12, 30, tzinfo=timezone.utc),
    )
    assert updates["sent_at"] == datetime(2026, 2, 16, 12, 30, tzinfo=timezone.utc)


def test_cannot_receive_after_cancelled() -> None:
    with pytest.raises(ValueError, match="cancelled"):
        ensure_not_cancelled_to_received(current_status="cancelled", next_status="received")
    with pytest.raises(ValueError, match="cancelled"):
        ensure_not_cancelled_to_received(current_status="cancelled", next_status="in_transit")


def test_stage_link_mismatch_fails() -> None:
    with pytest.raises(ValueError, match="same part"):
        ensure_stage_link_matches_part(movement_part_id=uuid4(), stage_part_id=uuid4())


def test_single_active_movement_per_part_enforced() -> None:
    with pytest.raises(ValueError, match="active movement"):
        ensure_single_active_movement(
            existing_active_count=1,
            current_status="received",
            next_status="sent",
            allow_parallel=False,
        )


def test_legacy_statuses_normalized() -> None:
    assert normalize_movement_status("pending") == "pending"
    assert normalize_movement_status("completed") == "completed"


def test_pending_status_does_not_affect_journey_location() -> None:
    assert has_real_shipment_semantics(status="pending", sent_at=None) is False
    assert has_real_shipment_semantics(status="sent", sent_at=None) is False
    assert has_real_shipment_semantics(status="sent", sent_at=datetime.now(timezone.utc)) is True
