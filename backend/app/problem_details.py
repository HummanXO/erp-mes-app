"""RFC 7807 Problem Details helpers."""
from __future__ import annotations

from http import HTTPStatus

from fastapi.responses import JSONResponse

from .domain_errors import DomainError


def build_problem_details_response(exc: DomainError) -> JSONResponse:
    """Render DomainError as RFC 7807 payload with stable domain code."""
    try:
        title = HTTPStatus(exc.http_status).phrase
    except ValueError:
        title = "Domain Error"

    payload: dict[str, object] = {
        "type": f"https://api.erp-mes.local/problems/{exc.code.lower()}",
        "title": title,
        "status": exc.http_status,
        "detail": exc.message,
        "code": exc.code,
    }
    if exc.details is not None:
        payload["details"] = exc.details

    return JSONResponse(
        status_code=exc.http_status,
        content=payload,
        media_type="application/problem+json",
    )

