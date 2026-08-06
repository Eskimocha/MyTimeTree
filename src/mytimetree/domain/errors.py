"""Domain errors shared across layers."""

from __future__ import annotations

from enum import Enum


class ErrorCode(str, Enum):
    VALIDATION = "validation"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    INVALID_BALANCE = "invalid_balance"
    FORBIDDEN = "forbidden"
    INTERNAL = "internal"


class DomainError(Exception):
    def __init__(self, code: ErrorCode, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(f"[{code.value}] {message}")


def ensure(condition: bool, code: ErrorCode, message: str) -> None:
    if not condition:
        raise DomainError(code, message)
