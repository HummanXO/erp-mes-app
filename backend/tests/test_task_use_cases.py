from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.domain_errors import DomainError
from app.models import AuditEvent, Task, TaskComment, TaskReadStatus
from app.use_cases.task_transitions import (
    accept_task_use_case,
    review_task_use_case,
    send_to_review_use_case,
    start_task_use_case,
)


class _QueryStub:
    def __init__(self, *, first_result=None):
        self._first_result = first_result

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self._first_result


class _SessionStub:
    def __init__(self, *, task, read_status=None):
        self._task = task
        self._read_status = read_status
        self.added = []
        self.commit_calls = 0

    def query(self, model):
        if model is Task:
            return _QueryStub(first_result=self._task)
        if model is TaskReadStatus:
            return _QueryStub(first_result=self._read_status)
        raise AssertionError(f"Unexpected query model: {model}")

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.commit_calls += 1


def _user(*, org_id, role="operator"):
    return SimpleNamespace(
        id=uuid4(),
        org_id=org_id,
        role=role,
        initials="USR",
    )


def _task(
    *,
    org_id,
    creator_id=None,
    assignee_type="user",
    assignee_id=None,
    assignee_role=None,
    accepted_by_id=None,
    status="open",
):
    return SimpleNamespace(
        id=uuid4(),
        org_id=org_id,
        creator_id=creator_id or uuid4(),
        assignee_type=assignee_type,
        assignee_id=assignee_id,
        assignee_role=assignee_role,
        accepted_by_id=accepted_by_id,
        accepted_at=None,
        status=status,
        title="Test task",
        reviewed_by_id=None,
        reviewed_at=None,
        review_comment=None,
    )


def test_accept_task_sets_status_marks_as_read_and_audits() -> None:
    org_id = uuid4()
    current_user = _user(org_id=org_id)
    task = _task(org_id=org_id, assignee_id=current_user.id, status="open")
    db = _SessionStub(task=task, read_status=None)

    result = accept_task_use_case(db=db, task_id=task.id, current_user=current_user)

    assert result is task
    assert task.status == "accepted"
    assert task.accepted_by_id == current_user.id
    assert db.commit_calls == 1
    assert any(isinstance(item, TaskReadStatus) for item in db.added)
    audits = [item for item in db.added if isinstance(item, AuditEvent)]
    assert len(audits) == 1
    assert audits[0].action == "task_accepted"


def test_start_task_requires_accepted_status() -> None:
    org_id = uuid4()
    current_user = _user(org_id=org_id)
    task = _task(
        org_id=org_id,
        assignee_id=current_user.id,
        accepted_by_id=current_user.id,
        status="open",
    )
    db = _SessionStub(task=task)

    with pytest.raises(DomainError, match="Task must be in accepted status") as exc:
        start_task_use_case(db=db, task_id=task.id, current_user=current_user)

    assert exc.value.http_status == 400
    assert exc.value.code == "TASK_INVALID_STATUS_FOR_START"
    assert db.commit_calls == 0


def test_accept_task_requires_assignment_with_stable_code() -> None:
    org_id = uuid4()
    current_user = _user(org_id=org_id)
    task = _task(org_id=org_id, assignee_id=uuid4(), status="open")
    db = _SessionStub(task=task, read_status=None)

    with pytest.raises(DomainError, match="Task not assigned to you") as exc:
        accept_task_use_case(db=db, task_id=task.id, current_user=current_user)

    assert exc.value.http_status == 403
    assert exc.value.code == "TASK_NOT_ASSIGNED"
    assert db.commit_calls == 0


def test_send_to_review_is_idempotent_for_review_status() -> None:
    org_id = uuid4()
    current_user = _user(org_id=org_id)
    task = _task(
        org_id=org_id,
        assignee_id=current_user.id,
        accepted_by_id=current_user.id,
        status="review",
    )
    db = _SessionStub(task=task)

    result = send_to_review_use_case(db=db, task_id=task.id, current_user=current_user)

    assert result is task
    assert db.commit_calls == 0
    assert db.added == []


def test_review_task_returns_to_in_progress_with_comment_and_audit() -> None:
    org_id = uuid4()
    current_user = _user(org_id=org_id, role="master")
    task = _task(
        org_id=org_id,
        creator_id=current_user.id,
        assignee_id=uuid4(),
        accepted_by_id=uuid4(),
        status="review",
    )
    db = _SessionStub(task=task)

    result = review_task_use_case(
        db=db,
        task_id=task.id,
        current_user=current_user,
        approved=False,
        comment="доработать операцию",
    )

    assert result is task
    assert task.status == "in_progress"
    assert task.review_comment == "доработать операцию"
    assert task.reviewed_by_id == current_user.id
    assert db.commit_calls == 1
    comments = [item for item in db.added if isinstance(item, TaskComment)]
    assert len(comments) == 1
    assert comments[0].message == "Возвращено: доработать операцию"
    audits = [item for item in db.added if isinstance(item, AuditEvent)]
    assert len(audits) == 1
    assert audits[0].action == "task_returned"
