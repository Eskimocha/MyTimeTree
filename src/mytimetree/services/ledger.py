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
from mytimetree.domain.ornaments import (
    Ornaments,
    add_fruit,
    add_interest_fruit,
    add_pest,
    add_woodpecker,
    clear_pest,
)
from mytimetree.domain.monthly_fruit import fruits_from_cumulative_interest
from mytimetree.domain.interest import daily_interest_minutes
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
        # borrow: BORROW(+liability) + DEPOSIT(+asset) + SPEND(−asset); net asset unchanged
        return Balance(asset=Minutes(asset), liability=Minutes(liability))

    def get_ornaments(self, account_id: int) -> Ornaments:
        self._ensure_ornaments_row(account_id)
        row = execute(
            self._conn,
            "SELECT fruit_count, golden_fruit_count, pest_count, woodpecker_count, "
            "interest_fruit_count "
            "FROM tree_ornaments WHERE account_id = ?",
            (account_id,),
        ).fetchone()
        assert row is not None
        return Ornaments(
            fruit_count=int(row["fruit_count"]),
            golden_fruit_count=int(row["golden_fruit_count"]),
            pest_count=int(row["pest_count"]),
            woodpecker_count=int(row["woodpecker_count"]),
            interest_fruit_count=int(row["interest_fruit_count"]),
        )

    def get_cumulative_interest(self, account_id: int) -> dict[str, int]:
        """Lifetime asset / liability / net interest minutes from ledger."""
        self._accounts.get_account(account_id)
        asset_i = 0
        liab_i = 0
        for e in self.list_entries(account_id):
            if e.category != LedgerCategory.AUTO_INTEREST:
                continue
            meta = json.loads(e.meta_json or "{}")
            if meta.get("side") == "liability":
                liab_i += e.amount_minutes
            else:
                asset_i += e.amount_minutes
        return {"asset": asset_i, "liability": liab_i, "net": asset_i - liab_i}

    def preview_today_interest(self, account_id: int) -> dict[str, int]:
        """Projected daily interest from current principals × rates (not yet posted)."""
        self._accounts.get_account(account_id)
        row = execute(
            self._conn,
            "SELECT asset_interest_rate, liability_interest_rate FROM settings "
            "WHERE account_id = ?",
            (account_id,),
        ).fetchone()
        ensure(row is not None, ErrorCode.NOT_FOUND, "账户设置不存在")
        bal = self.get_balance(account_id)
        asset_i = daily_interest_minutes(
            bal.asset.value, float(row["asset_interest_rate"])
        )
        liab_i = daily_interest_minutes(
            bal.liability.value, float(row["liability_interest_rate"])
        )
        return {"asset": asset_i, "liability": liab_i, "net": asset_i - liab_i}

    def sync_interest_fruits(self, account_id: int) -> Ornaments:
        """Align 果 with floor(cumulative_net_interest / 100); only increases; logs events."""
        before = self.get_ornaments(account_id)
        cum_net = self.get_cumulative_interest(account_id)["net"]
        target = fruits_from_cumulative_interest(cum_net)
        if target <= before.interest_fruit_count:
            return before
        delta = target - before.interest_fruit_count
        orn = add_interest_fruit(before, delta)
        self._apply_ornament_change(
            account_id,
            orn,
            reason="interest",
            awards={"fruit": delta},
            before=before,
            meta={"cumulative_interest_net": cum_net},
        )
        self._conn.commit()
        return orn

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
        """Borrow: liability+N, asset+N, then spend N (3 rows, same correlation_id)."""
        ensure(minutes > 0, ErrorCode.VALIDATION, "借用分钟必须为正")
        cid = str(uuid.uuid4())
        borrow_row = self._append(
            account_id,
            LedgerCategory.BORROW,
            minutes,
            summary=summary,
            correlation_id=cid,
            commit=False,
        )
        # Asset credit without fruit (not a parent deposit / auto grant).
        deposit_row = self._append(
            account_id,
            LedgerCategory.DEPOSIT,
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
        self._apply_ornament_change(
            account_id,
            orn,
            reason="borrow",
            correlation_id=cid,
            awards={"pest": 1},
        )
        self._conn.commit()
        return [borrow_row, deposit_row, spend_row]

    def repay(
        self,
        account_id: int,
        minutes: int,
        summary: str | None = None,
    ) -> list[LedgerEntry]:
        """存入：优先还负债；清零后多出的时间记入资产。

        每次 +1 星；负债归零时 +啄木鸟，并彻底清零虫数值。
        """
        ensure(minutes > 0, ErrorCode.VALIDATION, "存入分钟必须为正")
        bal = self.get_balance(account_id)
        liability_part = min(minutes, bal.liability.value)
        asset_part = minutes - liability_part
        was_positive = bal.liability.value > 0
        cid = str(uuid.uuid4())
        entries: list[LedgerEntry] = []
        if liability_part > 0:
            entries.append(
                self._append(
                    account_id,
                    LedgerCategory.REPAY,
                    liability_part,
                    summary=summary,
                    correlation_id=cid,
                    commit=False,
                )
            )
        if asset_part > 0:
            entries.append(
                self._append(
                    account_id,
                    LedgerCategory.DEPOSIT,
                    asset_part,
                    summary=summary,
                    correlation_id=cid,
                    commit=False,
                )
            )
        before = self.get_ornaments(account_id)
        orn = add_fruit(before)
        awards: dict[str, int] = {"star": 1}
        if was_positive and liability_part > 0:
            new_bal = self.get_balance(account_id)
            if new_bal.liability.value == 0:
                pest_before = orn.pest_count
                orn = add_woodpecker(orn)
                awards["woodpecker"] = 1
                if pest_before > 0:
                    orn = clear_pest(orn)
                    awards["pest"] = -pest_before
        self._apply_ornament_change(
            account_id,
            orn,
            reason="deposit",
            correlation_id=cid,
            awards=awards,
            before=before,
        )
        self._conn.commit()
        return entries

    def repay_preset(self, account_id: int, scene: str) -> list[LedgerEntry]:
        minutes = self._default_repay_minutes(account_id)
        return self.repay(account_id, minutes=minutes, summary=scene)

    def deposit(
        self,
        account_id: int,
        minutes: int,
        summary: str | None = None,
    ) -> list[LedgerEntry]:
        """存入与 repay 同语义：优先还债，超额进资产，并奖励星。"""
        return self.repay(account_id, minutes=minutes, summary=summary)

    def auto_grant(
        self,
        account_id: int,
        minutes: int,
        summary: str | None = "自动派发",
    ) -> LedgerEntry:
        """Daily auto-grant adds asset only — no star (stars are for manual 存入)."""
        ensure(minutes > 0, ErrorCode.VALIDATION, "派发分钟必须为正")
        return self._append(
            account_id,
            LedgerCategory.AUTO_GRANT,
            minutes,
            summary=summary,
        )

    def post_interest(
        self,
        account_id: int,
        minutes: int,
        side: Literal["asset", "liability"],
    ) -> LedgerEntry:
        """Post interest; sync 果 from cumulative net interest (no star)."""
        ensure(minutes > 0, ErrorCode.VALIDATION, "结息分钟必须为正")
        entry = self._append(
            account_id,
            LedgerCategory.AUTO_INTEREST,
            minutes,
            summary=f"结息-{side}",
            meta={"side": side},
        )
        self.sync_interest_fruits(account_id)
        return entry

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

    def _apply_ornament_change(
        self,
        account_id: int,
        new: Ornaments,
        *,
        reason: str,
        awards: dict[str, int],
        correlation_id: str | None = None,
        before: Ornaments | None = None,
        meta: dict | None = None,
    ) -> None:
        """Persist ornament counters and append audit events (星/太阳/果/虫/鸟)."""
        prev = before if before is not None else self.get_ornaments(account_id)
        self._save_ornaments(account_id, new)
        for kind, delta in awards.items():
            if delta:
                self._log_ornament_event(
                    account_id,
                    kind=kind,
                    delta=delta,
                    reason=reason,
                    correlation_id=correlation_id,
                    meta=meta,
                )
        gained_sun = new.golden_fruit_count - prev.golden_fruit_count
        awarded_sun = int(awards.get("sun", 0))
        converted = gained_sun - awarded_sun
        if converted > 0:
            self._log_ornament_event(
                account_id,
                kind="sun",
                delta=converted,
                reason="star_conversion",
                correlation_id=correlation_id,
                meta={"stars_consumed": converted * 100},
            )

    def _log_ornament_event(
        self,
        account_id: int,
        *,
        kind: str,
        delta: int,
        reason: str,
        correlation_id: str | None = None,
        meta: dict | None = None,
    ) -> None:
        now = ensure_app_tz(self._clock.now()).isoformat()
        execute(
            self._conn,
            "INSERT INTO ornament_events "
            "(account_id, kind, delta, reason, correlation_id, meta_json, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                account_id,
                kind,
                delta,
                reason,
                correlation_id,
                json.dumps(meta or {}, ensure_ascii=False),
                now,
            ),
        )

    def list_ornament_events(self, account_id: int, *, limit: int = 200) -> list[dict]:
        """Audit trail for accumulated ornaments (not shown in portal UI)."""
        self._accounts.get_account(account_id)
        rows = execute(
            self._conn,
            "SELECT id, kind, delta, reason, correlation_id, meta_json, created_at "
            "FROM ornament_events WHERE account_id = ? ORDER BY id DESC LIMIT ?",
            (account_id, limit),
        ).fetchall()
        return [
            {
                "id": int(r["id"]),
                "kind": str(r["kind"]),
                "delta": int(r["delta"]),
                "reason": r["reason"],
                "correlation_id": r["correlation_id"],
                "meta_json": str(r["meta_json"] or "{}"),
                "created_at": str(r["created_at"]),
            }
            for r in rows
        ]

    def _save_ornaments(self, account_id: int, orn: Ornaments) -> None:
        self._ensure_ornaments_row(account_id)
        execute(
            self._conn,
            "UPDATE tree_ornaments SET fruit_count = ?, golden_fruit_count = ?, "
            "pest_count = ?, woodpecker_count = ?, interest_fruit_count = ? "
            "WHERE account_id = ?",
            (
                orn.fruit_count,
                orn.golden_fruit_count,
                orn.pest_count,
                orn.woodpecker_count,
                orn.interest_fruit_count,
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
