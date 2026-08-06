"""Job runner: midnight interest→snapshot→reconcile?→monthly_fruit?→backup; 01:00 auto-grant."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

from mytimetree.db.connection import execute
from mytimetree.domain.interest import daily_interest_minutes
from mytimetree.domain.time import Clock, SystemClock, ensure_app_tz
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

STATE_MIDNIGHT = "job_last_midnight_date"
STATE_GRANT = "job_last_grant_date"


@dataclass
class MidnightReport:
    steps: list[str] = field(default_factory=list)
    reconcile: ReconcileReport | None = None
    backup_path: str | None = None
    interest_posted: dict[int, dict[str, int]] = field(default_factory=dict)
    monthly_fruit_awarded: dict[int, int] = field(default_factory=dict)


@dataclass
class GrantReport:
    granted: dict[int, int] = field(default_factory=dict)


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

    def run_midnight(self) -> MidnightReport:
        now = ensure_app_tz(self._clock.now())
        report = MidnightReport()

        # 1) interest
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
            bal = self._ledger.get_balance(acc.id)
            asset_i = daily_interest_minutes(bal.asset.value, float(rates["asset_interest_rate"]))
            liab_i = daily_interest_minutes(
                bal.liability.value, float(rates["liability_interest_rate"])
            )
            posted = {"asset": 0, "liability": 0}
            if asset_i > 0:
                self._ledger.post_interest(acc.id, asset_i, side="asset")
                posted["asset"] = asset_i
            if liab_i > 0:
                self._ledger.post_interest(acc.id, liab_i, side="liability")
                posted["liability"] = liab_i
            report.interest_posted[acc.id] = posted

        # 2) daily asset snapshot for tree monthly average
        if self._tree is not None:
            report.steps.append("daily_snapshot")
            for acc in self._accounts.list_accounts():
                self._tree.record_daily_asset_snapshot(acc.id)

        # 3) month-end reconcile + monthly fruit
        if is_month_end(now.date()):
            report.steps.append("reconcile")
            report.reconcile = reconcile_accounts(
                self._conn, ledger=self._ledger, now=now
            )
            save_month_end_snapshots(self._conn, ledger=self._ledger, now=now)

            if self._tree is not None:
                report.steps.append("monthly_fruit")
                for acc in self._accounts.list_accounts():
                    awarded = self._tree.try_award_monthly_fruit(acc.id)
                    if awarded:
                        report.monthly_fruit_awarded[acc.id] = awarded

            # month-end reconcile artifact (in addition to daily backup below)
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

        # 4) backup
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

    def run_auto_grant(self) -> GrantReport:
        now = ensure_app_tz(self._clock.now())
        report = GrantReport()
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
            self._ledger.auto_grant(acc.id, minutes=minutes)
            report.granted[acc.id] = minutes
        self._set_state(STATE_GRANT, now.date().isoformat())
        return report

    def tick(self) -> list[str]:
        now = ensure_app_tz(self._clock.now())
        today = now.date().isoformat()
        events: list[str] = []

        if now.hour == 0 and self._get_state(STATE_MIDNIGHT) != today:
            self.run_midnight()
            events.append("midnight")

        if now.hour == 1 and self._get_state(STATE_GRANT) != today:
            self.run_auto_grant()
            events.append("auto_grant")

        return events

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
