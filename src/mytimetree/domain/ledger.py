"""Ledger categories and entry model."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class LedgerCategory(str, Enum):
    SPEND = "spend"
    BORROW = "borrow"
    REPAY = "repay"
    DEPOSIT = "deposit"
    AUTO_GRANT = "auto_grant"
    AUTO_INTEREST = "auto_interest"


@dataclass(frozen=True, slots=True)
class LedgerEntry:
    id: int
    account_id: int
    category: LedgerCategory
    amount_minutes: int
    summary: str | None
    correlation_id: str | None
    created_at: str
    meta_json: str = "{}"
