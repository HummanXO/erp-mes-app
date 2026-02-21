from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.routers import specifications as specifications_router


class _SpecItemQueryStub:
    def __init__(self, item):
        self._item = item

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self._item


class _DeleteSessionStub:
    def __init__(self, item):
        self._item = item
        self.deleted = None
        self.committed = False

    def query(self, model):
        if model is specifications_router.SpecItem:
            return _SpecItemQueryStub(self._item)
        return _SpecItemQueryStub(None)

    def delete(self, obj):
        self.deleted = obj

    def commit(self):
        self.committed = True

    def flush(self):
        return None

    def refresh(self, _obj):
        return None


class _SharedRefSessionStub:
    def __init__(self, shared_reference):
        self._shared_reference = shared_reference

    def query(self, _model):
        return _SpecItemQueryStub(self._shared_reference)


def _user(role: str = "admin"):
    return SimpleNamespace(id=uuid4(), org_id=uuid4(), role=role, initials="USR")


def test_delete_specification_item_requires_manage_permission() -> None:
    with pytest.raises(HTTPException) as exc_info:
        specifications_router.delete_specification_item(
            specification_id=uuid4(),
            spec_item_id=uuid4(),
            current_user=_user("master"),
            db=SimpleNamespace(),
        )

    assert exc_info.value.status_code == 403


def test_delete_specification_item_returns_204_and_commits(monkeypatch) -> None:
    specification = SimpleNamespace(id=uuid4(), org_id=uuid4(), items=[])
    item = SimpleNamespace(id=uuid4(), specification_id=specification.id, part_id=None)
    db = _DeleteSessionStub(item)
    current_user = _user("admin")
    current_user.org_id = specification.org_id

    recomputed = {"called": False}

    monkeypatch.setattr(specifications_router, "_get_specification_or_404", lambda *_args, **_kwargs: specification)
    monkeypatch.setattr(specifications_router, "_ensure_spec_item_deletable", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        specifications_router,
        "_recompute_specification_status",
        lambda _specification: recomputed.__setitem__("called", True),
    )

    response = specifications_router.delete_specification_item(
        specification_id=specification.id,
        spec_item_id=item.id,
        current_user=current_user,
        db=db,
    )

    assert response.status_code == 204
    assert db.deleted is item
    assert db.committed is True
    assert recomputed["called"] is True


def test_delete_spec_item_conflict_when_part_has_dependencies(monkeypatch) -> None:
    item = SimpleNamespace(id=uuid4(), part_id=uuid4())
    db = _SharedRefSessionStub(shared_reference=None)

    monkeypatch.setattr(
        specifications_router,
        "_part_has_deletion_dependencies",
        lambda *_args, **_kwargs: True,
    )

    with pytest.raises(HTTPException) as exc_info:
        specifications_router._ensure_spec_item_deletable(
            db,
            item=item,
            org_id=uuid4(),
        )

    assert exc_info.value.status_code == 409
