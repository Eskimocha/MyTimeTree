"""Weekly / monthly trend aggregates for portal analytics."""

from __future__ import annotations

import calendar
import json
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from mytimetree.db.connection import execute
from mytimetree.domain.ledger import LedgerCategory
from mytimetree.domain.time import Clock, SystemClock, ensure_app_tz
from mytimetree.services.accounts import AccountService
from mytimetree.services.ledger import LedgerService


@dataclass(frozen=True, slots=True)
class TrendReport:
    account_id: int
    granularity: str  # week | month
    period_start: str
    period_end: str
    entry_count: int
    asset_in_minutes: int
    asset_out_minutes: int
    interest_minutes: int
    liability_in_minutes: int
    liability_out_minutes: int
    ending_asset: int
    ending_liability: int
    ending_net: int


class AnalyticsService:
    def __init__(
        self,
        conn: sqlite3.Connection,
        *,
        accounts: AccountService,
        ledger: LedgerService,
        clock: Clock | None = None,
    ) -> None:
        self._conn = conn
        self._accounts = accounts
        self._ledger = ledger
        self._clock = clock or SystemClock()

    def weekly_trend(
        self, *, account_id: int, as_of: datetime | None = None
    ) -> TrendReport:
        now = ensure_app_tz(as_of or self._clock.now())
        day = now.date()
        # ISO week: Monday = 0
        start = day - timedelta(days=day.weekday())
        end = start + timedelta(days=6)
        return self._aggregate(account_id, start, end, granularity="week")

    def monthly_trend(
        self, *, account_id: int, as_of: datetime | None = None
    ) -> TrendReport:
        now = ensure_app_tz(as_of or self._clock.now())
        day = now.date()
        start = date(day.year, day.month, 1)
        last = calendar.monthrange(day.year, day.month)[1]
        end = date(day.year, day.month, last)
        return self._aggregate(account_id, start, end, granularity="month")

    def _aggregate(
        self,
        account_id: int,
        start: date,
        end: date,
        *,
        granularity: str,
    ) -> TrendReport:
        self._accounts.get_account(account_id)
        start_s, end_s = start.isoformat(), end.isoformat()
        rows = execute(
            self._conn,
            "SELECT category, amount_minutes, meta_json, created_at FROM ledger_entries "
            "WHERE account_id = ? ORDER BY id ASC",
            (account_id,),
        ).fetchall()

        entry_count = 0
        asset_in = asset_out = interest = 0
        liab_in = liab_out = 0
        # ending balance = replay all entries up to period_end (inclusive)
        end_asset = end_liab = 0

        for r in rows:
            created = str(r["created_at"])[:10]
            cat = LedgerCategory(str(r["category"]))
            amount = int(r["amount_minutes"])
            meta = json.loads(r["meta_json"] or "{}")
            side = meta.get("side") if isinstance(meta, dict) else None
            da, dl = _effects(cat, amount, side)

            if created <= end_s:
                end_asset += da
                end_liab += dl

            if start_s <= created <= end_s:
                entry_count += 1
                if da > 0:
                    asset_in += da
                elif da < 0:
                    asset_out += -da
                if dl > 0:
                    liab_in += dl
                elif dl < 0:
                    liab_out += -dl
                if cat == LedgerCategory.AUTO_INTEREST:
                    interest += amount

        return TrendReport(
            account_id=account_id,
            granularity=granularity,
            period_start=start_s,
            period_end=end_s,
            entry_count=entry_count,
            asset_in_minutes=asset_in,
            asset_out_minutes=asset_out,
            interest_minutes=interest,
            liability_in_minutes=liab_in,
            liability_out_minutes=liab_out,
            ending_asset=end_asset,
            ending_liability=end_liab,
            ending_net=end_asset - end_liab,
        )

    def weekly_habit_stats(
        self, *, account_id: int, as_of: datetime | None = None
    ) -> dict[str, int | float | str]:
        """H8.4 — weekly habit completion / parent logging rate."""
        self._accounts.get_account(account_id)
        now = ensure_app_tz(as_of or self._clock.now())
        day = now.date()
        start = day - timedelta(days=day.weekday())
        end = start + timedelta(days=6)
        start_s, end_s = start.isoformat(), end.isoformat()
        enabled = execute(
            self._conn,
            "SELECT COUNT(*) AS c FROM habits WHERE account_id = ? AND archived_at IS NULL",
            (account_id,),
        ).fetchone()
        enabled_n = int(enabled["c"]) if enabled else 0
        logs = execute(
            self._conn,
            "SELECT COUNT(*) AS c FROM habit_logs WHERE account_id = ? "
            "AND voided_at IS NULL AND day_key >= ? AND day_key <= ?",
            (account_id, start_s, end_s),
        ).fetchone()
        log_n = int(logs["c"]) if logs else 0
        expected = enabled_n * 7
        rate = (log_n / expected) if expected else 0.0
        return {
            "account_id": account_id,
            "period_start": start_s,
            "period_end": end_s,
            "enabled_habits": enabled_n,
            "logs_in_week": log_n,
            "expected_slots": expected,
            "completion_rate": round(rate, 4),
        }


def _effects(category: LedgerCategory, amount: int, side: str | None) -> tuple[int, int]:
    if category == LedgerCategory.SPEND:
        return -amount, 0
    if category in (
        LedgerCategory.DEPOSIT,
        LedgerCategory.AUTO_GRANT,
        LedgerCategory.HABIT_REWARD,
    ):
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
