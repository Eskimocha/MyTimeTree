"""Immutable ledger + transaction operations for the current/parent-managed account."""

from __future__ import annotations

import json
import sqlite3
import uuid
from typing import Literal

from mytimetree.db.connection import execute
from mytimetree.domain.errors import DomainError, ErrorCode, ensure
from mytimetree.domain.ledger import LedgerCategory, LedgerEntry
from mytimetree.domain.money_time import Balance, Minutes
from mytimetree.domain.ornaments import Ornaments, add_fruit, add_pest, add_woodpecker
from mytimetree.domain.sanitize import sanitize_summary
from mytimetree.domain.time import Clock, SystemClock, ensure_app_tz
from mytimetree.services.accounts import AccountService


class LedgerService:
    def __init__(
        self,
        conn: sqlite3.Connection,
        *,
        accounts: AccountService,
        clock: Clock | None = None,
    ) -> None:
        self._conn = conn
        self._accounts = accounts
        self._clock = clock or SystemClock()

    # --- immutability guards ---

    def update_entry(self, entry_id: int, **_: object) -> None:
        raise DomainError(ErrorCode.FORBIDDEN, "流水一旦记录不可修改")

    def delete_entry(self, entry_id: int) -> None:
        raise DomainError(ErrorCode.FORBIDDEN, "流水一旦记录不可删除")

    # --- queries ---

    def list_entries(self, account_id: int) -> list[LedgerEntry]:
        self._accounts.get_account(account_id)
        rows = execute(
            self._conn,
            "SELECT id, account_id, category, amount_minutes, summary, correlation_id, "
            "created_at, meta_json FROM ledger_entries WHERE account_id = ? ORDER BY id ASC",
            (account_id,),
        ).fetchall()
        return [self._row_to_entry(r) for r in rows]

    def get_balance(self, account_id: int) -> Balance:
        self._accounts.get_account(account_id)
        asset = 0
        liability = 0
        for e in self.list_entries(account_id):
            if e.category in (
                LedgerCategory.DEPOSIT,
                LedgerCategory.AUTO_GRANT,
                LedgerCategory.SPEND,
            ):
                if e.category == LedgerCategory.SPEND:
                    asset -= e.amount_minutes
                else:
                    asset += e.amount_minutes
            elif e.category == LedgerCategory.BORROW:
                liability += e.amount_minutes
            elif e.category == LedgerCategory.REPAY:
                liability -= e.amount_minutes
            elif e.category == LedgerCategory.AUTO_INTEREST:
                meta = json.loads(e.meta_json or "{}")
                side = meta.get("side", "asset")
                if side == "liability":
                    liability += e.amount_minutes
                else:
                    asset += e.amount_minutes
        # spend paired with borrow already decreases asset via SPEND rows
        return Balance(asset=Minutes(asset), liability=Minutes(liability))

    def get_ornaments(self, account_id: int) -> Ornaments:
        self._ensure_ornaments_row(account_id)
        row = execute(
            self._conn,
            "SELECT fruit_count, golden_fruit_count, pest_count, woodpecker_count "
            "FROM tree_ornaments WHERE account_id = ?",
            (account_id,),
        ).fetchone()
        assert row is not None
        return Ornaments(
            fruit_count=int(row["fruit_count"]),
            golden_fruit_count=int(row["golden_fruit_count"]),
            pest_count=int(row["pest_count"]),
            woodpecker_count=int(row["woodpecker_count"]),
        )

    # --- transactions ---

    def spend(
        self,
        account_id: int,
        minutes: int | None = None,
        summary: str | None = None,
        *,
        correlation_id: str | None = None,
    ) -> LedgerEntry:
        amount = self._resolve_spend_minutes(account_id, minutes)
        bal = self.get_balance(account_id)
        ensure(
            bal.asset.value >= amount,
            ErrorCode.VALIDATION,
            f"时间资产不足: 现有 {bal.asset.value}，需要 {amount}",
        )
        return self._append(
            account_id,
            LedgerCategory.SPEND,
            amount,
            summary=summary,
            correlation_id=correlation_id,
        )

    def borrow(self, account_id: int, minutes: int, summary: str | None = None) -> list[LedgerEntry]:
        ensure(minutes > 0, ErrorCode.VALIDATION, "借用分钟必须为正")
        bal = self.get_balance(account_id)
        ensure(
            bal.asset.value >= minutes,
            ErrorCode.VALIDATION,
            f"随借随用需要足够资产可支出: 现有 {bal.asset.value}，需要 {minutes}",
        )
        cid = str(uuid.uuid4())
        borrow_row = self._append(
            account_id,
            LedgerCategory.BORROW,
            minutes,
            summary=summary,
            correlation_id=cid,
            commit=False,
        )
        spend_row = self._append(
            account_id,
            LedgerCategory.SPEND,
            minutes,
            summary=summary,
            correlation_id=cid,
            commit=False,
        )
        orn = add_pest(self.get_ornaments(account_id))
        self._save_ornaments(account_id, orn)
        self._conn.commit()
        return [borrow_row, spend_row]

    def repay(
        self,
        account_id: int,
        minutes: int,
        summary: str | None = None,
    ) -> LedgerEntry:
        ensure(minutes > 0, ErrorCode.VALIDATION, "还款分钟必须为正")
        bal = self.get_balance(account_id)
        ensure(
            bal.liability.value >= minutes,
            ErrorCode.VALIDATION,
            f"负债不足: 现有 {bal.liability.value}，还款 {minutes}",
        )
        was_positive = bal.liability.value > 0
        entry = self._append(
            account_id,
            LedgerCategory.REPAY,
            minutes,
            summary=summary,
            commit=False,
        )
        new_bal = self.get_balance(account_id)
        if was_positive and new_bal.liability.value == 0:
            orn = add_woodpecker(self.get_ornaments(account_id))
            self._save_ornaments(account_id, orn)
        self._conn.commit()
        return entry

    def repay_preset(self, account_id: int, scene: str) -> LedgerEntry:
        minutes = self._default_repay_minutes(account_id)
        return self.repay(account_id, minutes=minutes, summary=scene)

    def deposit(
        self,
        account_id: int,
        minutes: int,
        summary: str | None = None,
    ) -> LedgerEntry:
        ensure(minutes > 0, ErrorCode.VALIDATION, "存入分钟必须为正")
        entry = self._append(
            account_id,
            LedgerCategory.DEPOSIT,
            minutes,
            summary=summary,
            commit=False,
        )
        orn = add_fruit(self.get_ornaments(account_id))
        self._save_ornaments(account_id, orn)
        self._conn.commit()
        return entry

    def auto_grant(
        self,
        account_id: int,
        minutes: int,
        summary: str | None = "自动派发",
    ) -> LedgerEntry:
        ensure(minutes > 0, ErrorCode.VALIDATION, "派发分钟必须为正")
        entry = self._append(
            account_id,
            LedgerCategory.AUTO_GRANT,
            minutes,
            summary=summary,
            commit=False,
        )
        orn = add_fruit(self.get_ornaments(account_id))
        self._save_ornaments(account_id, orn)
        self._conn.commit()
        return entry

    def post_interest(
        self,
        account_id: int,
        minutes: int,
        side: Literal["asset", "liability"],
    ) -> LedgerEntry:
        """Post interest without awarding fruit (D3)."""
        ensure(minutes > 0, ErrorCode.VALIDATION, "结息分钟必须为正")
        return self._append(
            account_id,
            LedgerCategory.AUTO_INTEREST,
            minutes,
            summary=f"结息-{side}",
            meta={"side": side},
        )

    # --- internals ---

    def _append(
        self,
        account_id: int,
        category: LedgerCategory,
        amount: int,
        *,
        summary: str | None = None,
        correlation_id: str | None = None,
        meta: dict | None = None,
        commit: bool = True,
    ) -> LedgerEntry:
        self._accounts.get_account(account_id)
        ensure(amount > 0, ErrorCode.VALIDATION, "交易分钟必须为正")
        clean_summary = sanitize_summary(summary)
        now = ensure_app_tz(self._clock.now()).isoformat()
        meta_json = json.dumps(meta or {}, ensure_ascii=False)
        cur = execute(
            self._conn,
            "INSERT INTO ledger_entries "
            "(account_id, category, amount_minutes, summary, correlation_id, meta_json, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                account_id,
                category.value,
                amount,
                clean_summary,
                correlation_id,
                meta_json,
                now,
            ),
        )
        if commit:
            self._conn.commit()
        return LedgerEntry(
            id=int(cur.lastrowid),
            account_id=account_id,
            category=category,
            amount_minutes=amount,
            summary=clean_summary,
            correlation_id=correlation_id,
            created_at=now,
            meta_json=meta_json,
        )

    def _resolve_spend_minutes(self, account_id: int, minutes: int | None) -> int:
        if minutes is not None:
            ensure(minutes > 0, ErrorCode.VALIDATION, "支出分钟必须为正")
            return minutes
        return self._default_spend_minutes(account_id)

    def _default_spend_minutes(self, account_id: int) -> int:
        row = execute(
            self._conn,
            "SELECT default_spend_minutes FROM settings WHERE account_id = ?",
            (account_id,),
        ).fetchone()
        ensure(row is not None, ErrorCode.NOT_FOUND, "账户设置不存在")
        return int(row["default_spend_minutes"])

    def _default_repay_minutes(self, account_id: int) -> int:
        row = execute(
            self._conn,
            "SELECT default_repay_minutes FROM settings WHERE account_id = ?",
            (account_id,),
        ).fetchone()
        ensure(row is not None, ErrorCode.NOT_FOUND, "账户设置不存在")
        return int(row["default_repay_minutes"])

    def _ensure_ornaments_row(self, account_id: int) -> None:
        execute(
            self._conn,
            "INSERT OR IGNORE INTO tree_ornaments (account_id) VALUES (?)",
            (account_id,),
        )
        self._conn.commit()

    def _save_ornaments(self, account_id: int, orn: Ornaments) -> None:
        self._ensure_ornaments_row(account_id)
        execute(
            self._conn,
            "UPDATE tree_ornaments SET fruit_count = ?, golden_fruit_count = ?, "
            "pest_count = ?, woodpecker_count = ? WHERE account_id = ?",
            (
                orn.fruit_count,
                orn.golden_fruit_count,
                orn.pest_count,
                orn.woodpecker_count,
                account_id,
            ),
        )

    def _row_to_entry(self, row: sqlite3.Row) -> LedgerEntry:
        return LedgerEntry(
            id=int(row["id"]),
            account_id=int(row["account_id"]),
            category=LedgerCategory(str(row["category"])),
            amount_minutes=int(row["amount_minutes"]),
            summary=row["summary"],
            correlation_id=row["correlation_id"],
            created_at=str(row["created_at"]),
            meta_json=str(row["meta_json"] or "{}"),
        )
