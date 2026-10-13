"""Job runner: midnight interest→snapshot→reconcile?→backup; 01:00 auto-grant.

Also supports catch-up: on startup (or any tick) settle all missed calendar days
so offline / single-machine use still compounds interest when the process returns.
"""

from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING

from mytimetree.db.connection import execute
from mytimetree.domain.interest import daily_interest_minutes
from mytimetree.domain.time import APP_TZ, Clock, SystemClock, ensure_app_tz
from mytimetree.services.accounts import AccountService
from mytimetree.services.backup import create_daily_backup
from mytimetree.services.ledger import LedgerService
from mytimetree.services.reconcile import (
    ReconcileReport,
    is_month_end,
    reconcile_accounts,
    save_month_end_snapshots,
)

if TYPE_CHECKING:
    from mytimetree.services.tree import TreeService

logger = logging.getLogger(__name__)

STATE_MIDNIGHT = "job_last_midnight_date"
STATE_GRANT = "job_last_grant_date"

# Safety cap for first-run / long offline catch-up (calendar days).
MAX_CATCHUP_DAYS = 366


@dataclass
class MidnightReport:
    steps: list[str] = field(default_factory=list)
    reconcile: ReconcileReport | None = None
    backup_path: str | None = None
    interest_posted: dict[int, dict[str, int]] = field(default_factory=dict)
    interest_fruit_awarded: dict[int, int] = field(default_factory=dict)
    as_of: str | None = None


@dataclass
class GrantReport:
    granted: dict[int, int] = field(default_factory=dict)
    as_of: str | None = None


@dataclass
class CatchUpReport:
    """Result of settling missed midnight / auto-grant days."""

    midnight_dates: list[str] = field(default_factory=list)
    grant_dates: list[str] = field(default_factory=list)
    events: list[str] = field(default_factory=list)


class JobRunner:
    def __init__(
        self,
        conn: sqlite3.Connection,
        *,
        accounts: AccountService,
        ledger: LedgerService,
        backup_dir: Path,
        clock: Clock | None = None,
        tree: TreeService | None = None,
    ) -> None:
        self._conn = conn
        self._accounts = accounts
        self._ledger = ledger
        self._backup_dir = Path(backup_dir)
        self._clock = clock or SystemClock()
        self._tree = tree

    def run_midnight(
        self,
        *,
        as_of: date | None = None,
        do_backup: bool = True,
    ) -> MidnightReport:
        now = self._as_of_datetime(as_of, hour=0)
        report = MidnightReport(as_of=now.date().isoformat())

        # 1) interest (+ 果 from cumulative net interest)
        report.steps.append("interest")
        for acc in self._accounts.list_accounts():
            rates = execute(
                self._conn,
                "SELECT asset_interest_rate, liability_interest_rate FROM settings "
                "WHERE account_id = ?",
                (acc.id,),
            ).fetchone()
            if rates is None:
                continue
            fruit_before = self._ledger.get_ornaments(acc.id).interest_fruit_count
            bal = self._ledger.get_balance(acc.id)
            asset_i = daily_interest_minutes(
                bal.asset.value, float(rates["asset_interest_rate"])
            )
            liab_i = daily_interest_minutes(
                bal.liability.value, float(rates["liability_interest_rate"])
            )
            posted = {"asset": 0, "liability": 0}
            if asset_i > 0:
                self._ledger.post_interest(acc.id, asset_i, side="asset", at=now)
                posted["asset"] = asset_i
            if liab_i > 0:
                self._ledger.post_interest(acc.id, liab_i, side="liability", at=now)
                posted["liability"] = liab_i
            report.interest_posted[acc.id] = posted
            gained = (
                self._ledger.get_ornaments(acc.id).interest_fruit_count - fruit_before
            )
            if gained:
                report.interest_fruit_awarded[acc.id] = gained

        # 2) daily asset snapshot
        if self._tree is not None:
            report.steps.append("daily_snapshot")
            day_s = now.date().isoformat()
            for acc in self._accounts.list_accounts():
                self._tree.record_daily_asset_snapshot(acc.id, as_of=day_s)

        # 3) month-end reconcile
        if is_month_end(now.date()):
            report.steps.append("reconcile")
            report.reconcile = reconcile_accounts(
                self._conn, ledger=self._ledger, now=now
            )
            save_month_end_snapshots(self._conn, ledger=self._ledger, now=now)

            if do_backup:
                create_daily_backup(
                    self._conn,
                    accounts=self._accounts,
                    ledger=self._ledger,
                    backup_dir=self._backup_dir,
                    now=now,
                    kind="monthly_reconcile",
                    extra={
                        "reconcile_ok": report.reconcile.ok if report.reconcile else None,
                        "reconcile_details": list(report.reconcile.details)
                        if report.reconcile
                        else [],
                    },
                )

        # 4) backup (optional — catch-up only backs up on the last day)
        if do_backup:
            report.steps.append("backup")
            backup = create_daily_backup(
                self._conn,
                accounts=self._accounts,
                ledger=self._ledger,
                backup_dir=self._backup_dir,
                now=now,
                kind="daily",
            )
            report.backup_path = str(backup.path)

        self._set_state(STATE_MIDNIGHT, now.date().isoformat())
        return report

    def run_auto_grant(self, *, as_of: date | None = None) -> GrantReport:
        now = self._as_of_datetime(as_of, hour=1)
        report = GrantReport(as_of=now.date().isoformat())
        for acc in self._accounts.list_accounts():
            row = execute(
                self._conn,
                "SELECT daily_grant_minutes FROM settings WHERE account_id = ?",
                (acc.id,),
            ).fetchone()
            if row is None:
                continue
            minutes = int(row["daily_grant_minutes"])
            if minutes <= 0:
                continue
            self._ledger.auto_grant(acc.id, minutes=minutes, at=now)
            report.granted[acc.id] = minutes
        self._set_state(STATE_GRANT, now.date().isoformat())
        return report

    def catch_up(self) -> CatchUpReport:
        """Settle all missed midnight / auto-grant days up to now (Shanghai).

        - Midnight job is due for each calendar day through *today* (0:00 already passed).
        - Auto-grant is due through yesterday, and also today once hour >= 1.
        - First run (no app_state): from earliest account open date through today.
        - Idempotent via job_last_*_date; safe to call on every startup / tick.
        """
        now = ensure_app_tz(self._clock.now())
        today = now.date()
        report = CatchUpReport()

        midnight_days = self._missed_dates(
            state_key=STATE_MIDNIGHT,
            through=today,
        )
        for i, day in enumerate(midnight_days):
            is_last = i == len(midnight_days) - 1
            self.run_midnight(as_of=day, do_backup=is_last)
            day_s = day.isoformat()
            report.midnight_dates.append(day_s)
            report.events.append(f"midnight:{day_s}")

        grant_through = today if now.hour >= 1 else today - timedelta(days=1)
        grant_days = self._missed_dates(
            state_key=STATE_GRANT,
            through=grant_through,
        )
        for day in grant_days:
            self.run_auto_grant(as_of=day)
            day_s = day.isoformat()
            report.grant_dates.append(day_s)
            report.events.append(f"auto_grant:{day_s}")

        if report.events:
            logger.info(
                "jobs catch-up: midnight=%s grant=%s",
                report.midnight_dates,
                report.grant_dates,
            )
        return report

    def tick(self) -> list[str]:
        """Periodic entry: catch up any missed jobs (hour window no longer required)."""
        return self.catch_up().events

    def _missed_dates(self, *, state_key: str, through: date) -> list[date]:
        if through < date.min:
            return []
        last = self._parse_state_date(self._get_state(state_key))
        if last is None:
            start = self._first_due_date()
        else:
            start = last + timedelta(days=1)
        if start is None or start > through:
            return []
        # Cap long offline catch-up
        earliest = through - timedelta(days=MAX_CATCHUP_DAYS - 1)
        if start < earliest:
            logger.warning(
                "jobs catch-up truncated from %s to %s (%s)",
                start.isoformat(),
                earliest.isoformat(),
                state_key,
            )
            start = earliest
        days: list[date] = []
        d = start
        while d <= through:
            days.append(d)
            d += timedelta(days=1)
        return days

    def _first_due_date(self) -> date | None:
        """Earliest account open date (Shanghai); None if no accounts yet."""
        row = execute(
            self._conn, "SELECT MIN(created_at) AS m FROM accounts"
        ).fetchone()
        if row is None or row["m"] is None:
            return None
        created = datetime.fromisoformat(str(row["m"]))
        return ensure_app_tz(created).date()

    def _as_of_datetime(self, as_of: date | None, *, hour: int) -> datetime:
        if as_of is None:
            return ensure_app_tz(self._clock.now())
        return datetime(as_of.year, as_of.month, as_of.day, hour, 0, 0, tzinfo=APP_TZ)

    @staticmethod
    def _parse_state_date(value: str | None) -> date | None:
        if not value:
            return None
        try:
            return date.fromisoformat(str(value)[:10])
        except ValueError:
            return None

    def _get_state(self, key: str) -> str | None:
        row = execute(
            self._conn, "SELECT value FROM app_state WHERE key = ?", (key,)
        ).fetchone()
        return None if row is None else str(row["value"])

    def _set_state(self, key: str, value: str) -> None:
        execute(
            self._conn,
            "INSERT INTO app_state (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        self._conn.commit()
