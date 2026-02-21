from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.models import Part, TaskComment, TaskReadStatus, User
from app.routers.facts import _load_fact_operators
from app.services.task_response_builder import build_task_response_context


class _QueryStub:
    def __init__(self, result):
        self._result = result

    def options(self, *_args, **_kwargs):
        return self

    def filter(self, *_args, **_kwargs):
        return self

    def join(self, *_args, **_kwargs):
        return self

    def all(self):
        return self._result


class _TaskSessionStub:
    def __init__(self, *, comments, users, parts, read_rows):
        self._comments = comments
        self._users = users
        self._parts = parts
        self._read_rows = read_rows
        self.calls: dict[tuple[str, ...], int] = defaultdict(int)

    def query(self, *entities):
        key = tuple(entity.__name__ for entity in entities)
        self.calls[key] += 1

        if entities == (TaskComment,):
            return _QueryStub(self._comments)
        if entities == (User,):
            return _QueryStub(self._users)
        if entities == (Part,):
            return _QueryStub(self._parts)
        if entities == (TaskReadStatus, User):
            return _QueryStub(self._read_rows)
        raise AssertionError(f"Unexpected query entities: {entities}")


class _FactsSessionStub:
    def __init__(self, users):
        self._users = users
        self.calls: dict[tuple[str, ...], int] = defaultdict(int)

    def query(self, *entities):
        key = tuple(entity.__name__ for entity in entities)
        self.calls[key] += 1
        if entities == (User,):
            return _QueryStub(self._users)
        raise AssertionError(f"Unexpected query entities: {entities}")


def _task(*, org_id, creator_id, accepted_by_id, reviewed_by_id, part_id):
    return SimpleNamespace(
        id=uuid4(),
        org_id=org_id,
        creator_id=creator_id,
        accepted_by_id=accepted_by_id,
        reviewed_by_id=reviewed_by_id,
        part_id=part_id,
    )


def test_task_response_context_uses_fixed_query_count_for_many_tasks() -> None:
    org_id = uuid4()
    creator = SimpleNamespace(id=uuid4(), org_id=org_id)
    accepter = SimpleNamespace(id=uuid4(), org_id=org_id)
    reviewer = SimpleNamespace(id=uuid4(), org_id=org_id)
    commenter = SimpleNamespace(id=uuid4(), org_id=org_id)
    part = SimpleNamespace(id=uuid4(), org_id=org_id)

    task_a = _task(
        org_id=org_id,
        creator_id=creator.id,
        accepted_by_id=accepter.id,
        reviewed_by_id=reviewer.id,
        part_id=part.id,
    )
    task_b = _task(
        org_id=org_id,
        creator_id=creator.id,
        accepted_by_id=None,
        reviewed_by_id=None,
        part_id=part.id,
    )

    comment_a = SimpleNamespace(task_id=task_a.id, user_id=commenter.id, attachments=[])
    comment_b = SimpleNamespace(task_id=task_b.id, user_id=commenter.id, attachments=[])
    read_a = SimpleNamespace(task_id=task_a.id, user_id=creator.id, read_at=datetime.now(timezone.utc))
    read_b = SimpleNamespace(task_id=task_b.id, user_id=commenter.id, read_at=datetime.now(timezone.utc))

    db = _TaskSessionStub(
        comments=[comment_a, comment_b],
        users=[creator, accepter, reviewer, commenter],
        parts=[part],
        read_rows=[(read_a, creator), (read_b, commenter)],
    )

    context = build_task_response_context(
        db,
        tasks=[task_a, task_b],
        current_user=SimpleNamespace(id=commenter.id, org_id=org_id),
    )

    assert context["users_by_id"][creator.id] is creator
    assert context["parts_by_id"][part.id] is part
    assert len(context["comments_by_task_id"][task_a.id]) == 1
    assert len(context["read_rows_by_task_id"][task_b.id]) == 1

    assert db.calls[("TaskComment",)] == 1
    assert db.calls[("User",)] == 1
    assert db.calls[("Part",)] == 1
    assert db.calls[("TaskReadStatus", "User")] == 1


def test_load_fact_operators_queries_users_once_for_many_facts() -> None:
    org_id = uuid4()
    user_a = SimpleNamespace(id=uuid4(), org_id=org_id)
    user_b = SimpleNamespace(id=uuid4(), org_id=org_id)
    facts = [
        SimpleNamespace(operator_id=user_a.id),
        SimpleNamespace(operator_id=user_b.id),
        SimpleNamespace(operator_id=user_a.id),
    ]

    db = _FactsSessionStub(users=[user_a, user_b])
    operators = _load_fact_operators(db, org_id=org_id, facts=facts)

    assert operators[user_a.id] is user_a
    assert operators[user_b.id] is user_b
    assert db.calls[("User",)] == 1


def test_load_fact_operators_skips_query_when_no_operators() -> None:
    db = _FactsSessionStub(users=[])
    operators = _load_fact_operators(
        db,
        org_id=uuid4(),
        facts=[SimpleNamespace(operator_id=None), SimpleNamespace(operator_id=None)],
    )
    assert operators == {}
    assert db.calls.get(("User",), 0) == 0
