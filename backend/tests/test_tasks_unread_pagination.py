from __future__ import annotations

import sys
from types import SimpleNamespace
from uuid import uuid4

sys.modules.setdefault(
    "app.celery_app",
    SimpleNamespace(create_notification_for_task=lambda *_args, **_kwargs: None),
)

from app.routers import tasks as tasks_router


class _TaskQueryStub:
    def __init__(self, rows: list[SimpleNamespace], unread_ids: set[object]) -> None:
        self._rows = rows
        self._unread_ids = unread_ids
        self._offset = 0
        self._limit: int | None = None
        self._unread_only = False

    def filter(self, *conditions, **_kwargs):
        serialized = " ".join(str(condition) for condition in conditions).lower()
        if "task_read_status" in serialized and "exists" in serialized:
            self._unread_only = True
        return self

    def order_by(self, *_args, **_kwargs):
        return self

    def offset(self, value: int):
        self._offset = value
        return self

    def limit(self, value: int):
        self._limit = value
        return self

    def all(self):
        rows = self._rows
        if self._unread_only:
            rows = [row for row in rows if row.id in self._unread_ids]
        if self._limit is None:
            return rows[self._offset :]
        return rows[self._offset : self._offset + self._limit]


class _SessionStub:
    def __init__(self, rows: list[SimpleNamespace], unread_ids: set[object]) -> None:
        self._task_query = _TaskQueryStub(rows, unread_ids)

    def query(self, model):
        if model is tasks_router.Task:
            return self._task_query
        raise AssertionError(f"Unexpected query model: {model}")


def _task(label: str) -> SimpleNamespace:
    return SimpleNamespace(id=uuid4(), title=label)


def _user() -> SimpleNamespace:
    return SimpleNamespace(id=uuid4(), org_id=uuid4(), role="master", initials="USR")


def test_unread_pagination_distributes_consistently_across_pages(monkeypatch) -> None:
    t1 = _task("t1")
    t2 = _task("t2")
    t3 = _task("t3")
    t4 = _task("t4")
    t5 = _task("t5")
    t6 = _task("t6")

    rows = [t1, t2, t3, t4, t5, t6]
    unread_ids = {t1.id, t3.id, t4.id, t6.id}
    db = _SessionStub(rows, unread_ids)

    monkeypatch.setattr(tasks_router, "tasks_to_response", lambda _db, tasks, _user: tasks)

    page1 = tasks_router.get_tasks(
        unread=True,
        limit=2,
        offset=0,
        current_user=_user(),
        db=db,
    )
    page2 = tasks_router.get_tasks(
        unread=True,
        limit=2,
        offset=2,
        current_user=_user(),
        db=db,
    )

    assert [task.title for task in page1] == ["t1", "t3"]
    assert [task.title for task in page2] == ["t4", "t6"]


def test_unread_pagination_has_no_holes_when_enough_unread_rows_exist(monkeypatch) -> None:
    t1 = _task("t1")
    t2 = _task("t2")
    t3 = _task("t3")
    t4 = _task("t4")
    t5 = _task("t5")

    rows = [t1, t2, t3, t4, t5]
    unread_ids = {t1.id, t4.id, t5.id}
    db = _SessionStub(rows, unread_ids)

    monkeypatch.setattr(tasks_router, "tasks_to_response", lambda _db, tasks, _user: tasks)

    page1 = tasks_router.get_tasks(
        unread=True,
        limit=2,
        offset=0,
        current_user=_user(),
        db=db,
    )
    page2 = tasks_router.get_tasks(
        unread=True,
        limit=2,
        offset=2,
        current_user=_user(),
        db=db,
    )

    assert len(page1) == 2
    assert [task.title for task in page1] == ["t1", "t4"]
    assert [task.title for task in page2] == ["t5"]
