from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.models import LogisticsEntry, MachineNorm, Part
from app.use_cases import parts_related as use_case


class _PartQueryStub:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows

    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return self._rows


class _RowsQueryStub:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows

    def filter(self, *_args, **_kwargs):
        return self

    def order_by(self, *_args, **_kwargs):
        return self

    def all(self):
        return self._rows


class _SessionStub:
    def __init__(self, *, parts: list[object], movements: list[object], norms: list[object]) -> None:
        self._parts = parts
        self._movements = movements
        self._norms = norms

    def query(self, model):
        if model is Part:
            return _PartQueryStub(self._parts)
        if model is LogisticsEntry:
            return _RowsQueryStub(self._movements)
        if model is MachineNorm:
            return _RowsQueryStub(self._norms)
        raise AssertionError(f"Unexpected model: {model}")


def test_parts_related_batch_use_case_returns_ordered_compound_payload(monkeypatch) -> None:
    org_id = uuid4()
    part_a = SimpleNamespace(id=uuid4(), org_id=org_id)
    part_b = SimpleNamespace(id=uuid4(), org_id=org_id)

    movement = SimpleNamespace(
        id=uuid4(),
        part_id=part_a.id,
        status="sent",
        from_location="A",
        from_holder=None,
        to_location="B",
        to_holder=None,
        carrier=None,
        tracking_number=None,
        planned_eta=None,
        sent_at=datetime(2026, 2, 20, 10, 0, tzinfo=timezone.utc),
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
        type=None,
        description=None,
        quantity=5,
        date=None,
        counterparty=None,
        created_at=datetime(2026, 2, 20, 10, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 2, 20, 10, 0, tzinfo=timezone.utc),
    )

    norm = SimpleNamespace(
        machine_id=uuid4(),
        part_id=part_a.id,
        stage="machining",
        qty_per_shift=100,
        is_configured=True,
        configured_at=datetime(2026, 2, 20, 10, 0, tzinfo=timezone.utc),
        configured_by_id=uuid4(),
    )

    db = _SessionStub(parts=[part_a, part_b], movements=[movement], norms=[norm])

    monkeypatch.setattr(use_case, "apply_part_visibility_scope", lambda query, _db, _user: query)

    items = use_case.get_parts_related_batch_use_case(
        db=db,
        current_user=SimpleNamespace(id=uuid4(), org_id=org_id),
        part_ids=[part_b.id, part_a.id, part_a.id],
    )

    assert [item.part_id for item in items] == [part_b.id, part_a.id]
    assert items[0].movements == []
    assert items[0].norms == []
    assert len(items[1].movements) == 1
    assert items[1].movements[0].part_id == part_a.id
    assert len(items[1].norms) == 1
    assert items[1].norms[0].part_id == part_a.id
