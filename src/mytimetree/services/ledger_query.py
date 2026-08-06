"""Paginated ledger queries with account / category filters."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass

from mytimetree.db.connection import execute
from mytimetree.domain.display import (
    DisplayTone,
    display_tone_for_category,
    theme_for_locale,
)
from mytimetree.domain.errors import DomainError, ErrorCode, ensure
from mytimetree.domain.ledger import LedgerCategory, LedgerEntry
from mytimetree.services.accounts import AccountService


@dataclass(frozen=True, slots=True)
class LedgerQueryItem:
    entry: LedgerEntry
    tone: DisplayTone
    color: str
    signed_asset_effect: int
    signed_liability_effect: int


@dataclass(frozen=True, slots=True)
class LedgerPage:
    items: list[LedgerQueryItem]
    total: int
    limit: int
    offset: int

    @property
    def has_more(self) -> bool:
        return self.offset + len(self.items) < self.total


class LedgerQueryService:
    def __init__(self, conn: sqlite3.Connection, *, accounts: AccountService) -> None:
        self._conn = conn
        self._accounts = accounts

    def query(
        self,
        *,
        account_id: int,
        category: LedgerCategory | str | None = None,
        limit: int = 20,
        offset: int = 0,
        locale: str = "zh-CN",
    ) -> LedgerPage:
        self._accounts.get_account(account_id)
        ensure(limit > 0 and limit <= 200, ErrorCode.VALIDATION, "limit 须在 1–200")
        ensure(offset >= 0, ErrorCode.VALIDATION, "offset 不能为负")

        cat: str | None = None
        if category is not None:
            if isinstance(category, LedgerCategory):
                cat = category.value
            else:
                try:
                    cat = LedgerCategory(str(category)).value
                except ValueError as exc:
                    raise DomainError(ErrorCode.VALIDATION, f"未知分类: {category}") from exc

        where = "WHERE account_id = ?"
        params: list[object] = [account_id]
        if cat is not None:
            where += " AND category = ?"
            params.append(cat)

        total_row = execute(
            self._conn,
            f"SELECT COUNT(*) AS c FROM ledger_entries {where}",
            tuple(params),
        ).fetchone()
        total = int(total_row["c"] if total_row else 0)

        rows = execute(
            self._conn,
            f"SELECT id, account_id, category, amount_minutes, summary, correlation_id, "
            f"created_at, meta_json FROM ledger_entries {where} "
            f"ORDER BY id DESC LIMIT ? OFFSET ?",
            (*params, limit, offset),
        ).fetchall()

        theme = theme_for_locale(locale)
        items: list[LedgerQueryItem] = []
        for r in rows:
            entry = LedgerEntry(
                id=int(r["id"]),
                account_id=int(r["account_id"]),
                category=LedgerCategory(str(r["category"])),
                amount_minutes=int(r["amount_minutes"]),
                summary=r["summary"],
                correlation_id=r["correlation_id"],
                created_at=str(r["created_at"]),
                meta_json=str(r["meta_json"] or "{}"),
            )
            meta = json.loads(entry.meta_json or "{}")
            side = meta.get("side") if isinstance(meta, dict) else None
            tone = display_tone_for_category(entry.category, side=side)
            da, dl = _signed_effects(entry.category, entry.amount_minutes, side)
            items.append(
                LedgerQueryItem(
                    entry=entry,
                    tone=tone,
                    color=theme.color_for(tone),
                    signed_asset_effect=da,
                    signed_liability_effect=dl,
                )
            )
        return LedgerPage(items=items, total=total, limit=limit, offset=offset)


def _signed_effects(
    category: LedgerCategory, amount: int, side: str | None
) -> tuple[int, int]:
    if category == LedgerCategory.SPEND:
        return -amount, 0
    if category in (LedgerCategory.DEPOSIT, LedgerCategory.AUTO_GRANT):
        return amount, 0
    if category == LedgerCategory.BORROW:
        return 0, amount
    if category == LedgerCategory.REPAY:
        return 0, -amount
    if category == LedgerCategory.AUTO_INTEREST:
        if side == "liability":
            return 0, amount
        return amount, 0
    return 0, 0
