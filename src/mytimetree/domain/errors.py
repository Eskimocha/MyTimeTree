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
    # Habit module (H0+) — specific codes for TDD assertions
    HABIT_NOT_MICRO = "habit_not_micro"
    HABIT_ALREADY_LOGGED = "habit_already_logged"
    HABIT_ARCHIVED = "habit_archived"
    CREDIT_NOT_REDEEMABLE = "credit_not_redeemable"
    EXCHANGE_RULE_INACTIVE = "exchange_rule_inactive"


class DomainError(Exception):
    def __init__(self, code: ErrorCode, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(f"[{code.value}] {message}")


def ensure(condition: bool, code: ErrorCode, message: str) -> None:
    if not condition:
        raise DomainError(code, message)
