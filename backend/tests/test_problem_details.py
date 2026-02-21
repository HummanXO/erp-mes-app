from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.domain_errors import DomainError, UseCaseError
from app.problem_details import build_problem_details_response


def test_problem_details_payload_contains_stable_code_and_rfc7807_fields() -> None:
    response = build_problem_details_response(
        DomainError(
            code="PROBE_ERROR",
            http_status=409,
            message="probe failed",
            details={"probe": True},
        )
    )

    assert response.status_code == 409
    assert response.media_type == "application/problem+json"

    body = response.body.decode("utf-8")
    assert '"type":"https://api.erp-mes.local/problems/probe_error"' in body
    assert '"title":"Conflict"' in body
    assert '"status":409' in body
    assert '"detail":"probe failed"' in body
    assert '"code":"PROBE_ERROR"' in body
    assert '"details":{"probe":true}' in body


def test_problem_details_accepts_use_case_error_alias() -> None:
    response = build_problem_details_response(
        UseCaseError(
            code="USE_CASE_FAILED",
            http_status=400,
            message="use case failed",
            details=None,
        )
    )

    assert response.status_code == 400
    assert response.media_type == "application/problem+json"
    assert '"code":"USE_CASE_FAILED"' in response.body.decode("utf-8")


def test_problem_details_omits_details_when_none() -> None:
    response = build_problem_details_response(
        DomainError(
            code="NO_DETAILS",
            http_status=422,
            message="validation failed",
            details=None,
        )
    )

    body = response.body.decode("utf-8")
    assert response.status_code == 422
    assert response.media_type == "application/problem+json"
    assert '"code":"NO_DETAILS"' in body
    assert '"details"' not in body


def test_fastapi_exception_handler_maps_domain_error_to_problem_details() -> None:
    app = FastAPI()

    async def _handle_domain_error(_: Request, exc: DomainError):
        return build_problem_details_response(exc)

    app.add_exception_handler(DomainError, _handle_domain_error)

    @app.get("/boom")
    def _boom():
        raise DomainError(
            code="ROUTE_PROBLEM",
            http_status=409,
            message="route failed",
            details={"source": "test"},
        )

    client = TestClient(app)
    response = client.get("/boom")

    assert response.status_code == 409
    assert response.headers["content-type"].startswith("application/problem+json")
    payload = response.json()
    assert payload["code"] == "ROUTE_PROBLEM"
    assert payload["detail"] == "route failed"
