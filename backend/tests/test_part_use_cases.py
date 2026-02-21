from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.domain_errors import DomainError
from app.models import Part
from app.use_cases.part_lifecycle import delete_part_use_case


class _QueryStub:
    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return None


class _SessionStub:
    def query(self, model):
        if model is Part:
            return _QueryStub()
        raise AssertionError(f"Unexpected model queried: {model}")


def test_delete_part_not_found_returns_stable_code() -> None:
    user = SimpleNamespace(id=uuid4(), org_id=uuid4(), initials="USR")
    db = _SessionStub()

    with pytest.raises(DomainError, match="Part not found") as exc:
        delete_part_use_case(
            db=db,
            part_id=uuid4(),
            current_user=user,
            recompute_specification_status=lambda *_args, **_kwargs: None,
        )

    assert exc.value.http_status == 404
    assert exc.value.code == "PART_NOT_FOUND"

