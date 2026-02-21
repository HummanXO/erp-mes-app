"""Domain-level exception primitives with stable machine-readable codes."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(eq=False)
class DomainError(Exception):
    """Use-case level error with stable code and HTTP mapping."""

    code: str
    http_status: int
    message: str
    details: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


class UseCaseError(DomainError):
    """Backward-compatible alias used by use-case modules."""
