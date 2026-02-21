from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.routers import parts as parts_router


class _QueryStub:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows
        self._offset = 0
        self._limit: int | None = None

    def filter(self, *_args, **_kwargs):
        return self

    def count(self) -> int:
        return len(self._rows)

    def order_by(self, *_args, **_kwargs):
        return self

    def offset(self, value: int):
        self._offset = value
        return self

    def limit(self, value: int):
        self._limit = value
        return self

    def all(self):
        if self._limit is None:
            return self._rows[self._offset :]
        return self._rows[self._offset : self._offset + self._limit]


class _SessionStub:
    def __init__(self, rows: list[object]) -> None:
        self._query = _QueryStub(rows)

    def query(self, model):
        if model is parts_router.Part:
            return self._query
        raise AssertionError(f"Unexpected model queried: {model}")


def _part(idx: int) -> SimpleNamespace:
    ts = datetime(2026, 2, 20, 10, 0, tzinfo=timezone.utc)
    return SimpleNamespace(
        id=uuid4(),
        org_id=uuid4(),
        code=f"P-{idx}",
        name=f"Part {idx}",
        description=None,
        qty_plan=10,
        qty_done=idx,
        deadline=date(2026, 2, 28),
        status="in_progress",
        drawing_url=None,
        is_cooperation=False,
        cooperation_partner=None,
        cooperation_due_date=None,
        cooperation_qc_status=None,
        cooperation_qc_checked_at=None,
        cooperation_qc_comment=None,
        machine_id=None,
        machine=None,
        customer=None,
        required_stages=["machining"],
        created_at=ts,
        updated_at=ts,
    )


def _user() -> SimpleNamespace:
    return SimpleNamespace(id=uuid4(), org_id=uuid4(), role="master", initials="USR")


def test_get_parts_returns_items_with_total_limit_offset(monkeypatch) -> None:
    rows = [_part(1), _part(2), _part(3)]
    db = _SessionStub(rows)

    monkeypatch.setattr(parts_router, "apply_part_visibility_scope", lambda query, _db, _user: query)
    monkeypatch.setattr(
        parts_router,
        "calculate_part_progress",
        lambda _db, _part: (
            {"overall_percent": 0, "overall_qty_done": 0, "qty_scrap": 0, "bottleneck_stage": None},
            [],
        ),
    )

    response = parts_router.get_parts(limit=2, offset=1, current_user=_user(), db=db)

    assert response.total == 3
    assert response.limit == 2
    assert response.offset == 1
    assert [item.code for item in response.items] == ["P-2", "P-3"]


def test_get_parts_keeps_total_when_page_is_empty(monkeypatch) -> None:
    rows = [_part(1), _part(2)]
    db = _SessionStub(rows)

    monkeypatch.setattr(parts_router, "apply_part_visibility_scope", lambda query, _db, _user: query)
    monkeypatch.setattr(
        parts_router,
        "calculate_part_progress",
        lambda _db, _part: (
            {"overall_percent": 0, "overall_qty_done": 0, "qty_scrap": 0, "bottleneck_stage": None},
            [],
        ),
    )

    response = parts_router.get_parts(limit=20, offset=100, current_user=_user(), db=db)

    assert response.total == 2
    assert response.items == []
