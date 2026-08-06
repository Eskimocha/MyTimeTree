"""Magic tree: stage from net + ornaments + monthly fruiting reward."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import date

from mytimetree.db.connection import execute
from mytimetree.domain.monthly_fruit import monthly_fruit_reward_for_average
from mytimetree.domain.ornaments import Ornaments, add_fruit
from mytimetree.domain.time import Clock, SystemClock, ensure_app_tz
from mytimetree.domain.tree import TreeStage, stage_for_net_minutes
from mytimetree.services.accounts import AccountService
from mytimetree.services.ledger import LedgerService

MONTHLY_DIVISOR = 30


@dataclass(frozen=True, slots=True)
class TreeStateView:
    account_id: int
    stage: TreeStage
    net_minutes: int
    asset_minutes: int
    liability_minutes: int
    ornaments: Ornaments


def monthly_asset_average(daily_assets: dict[str, int]) -> float:
    """Sum of recorded daily asset balances / 30 (product rule)."""
    if not daily_assets:
        return 0.0
    return sum(daily_assets.values()) / float(MONTHLY_DIVISOR)


class TreeService:
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

    def get_state(self, account_id: int) -> TreeStateView:
        self._accounts.get_account(account_id)
        bal = self._ledger.get_balance(account_id)
        return TreeStateView(
            account_id=account_id,
            stage=stage_for_net_minutes(bal.net.value),
            net_minutes=bal.net.value,
            asset_minutes=bal.asset.value,
            liability_minutes=bal.liability.value,
            ornaments=self._ledger.get_ornaments(account_id),
        )

    def record_daily_asset_snapshot(self, account_id: int) -> None:
        """Persist today's settled asset balance (kind=daily)."""
        self._accounts.get_account(account_id)
        bal = self._ledger.get_balance(account_id)
        as_of = ensure_app_tz(self._clock.now()).date().isoformat()
        execute(
            self._conn,
            "INSERT INTO balance_snapshots "
            "(account_id, as_of, asset_minutes, liability_minutes, kind) "
            "VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(account_id, as_of, kind) DO UPDATE SET "
            "asset_minutes = excluded.asset_minutes, "
            "liability_minutes = excluded.liability_minutes",
            (account_id, as_of, bal.asset.value, bal.liability.value, "daily"),
        )
        self._conn.commit()

    def try_award_monthly_fruit(self, account_id: int) -> int:
        """
        Fruiting stage only: tiered fruits from monthly avg asset (÷30).
        Awarded at most once per YYYY-MM. Returns fruits awarded (0 if none).
        """
        state = self.get_state(account_id)
        if state.stage != TreeStage.FRUITING:
            return 0

        today = ensure_app_tz(self._clock.now()).date()
        key = f"monthly_fruit:{account_id}:{today.year:04d}-{today.month:02d}"
        if self._get_state(key) == "1":
            return 0

        daily = self._daily_assets_for_month(account_id, today.year, today.month)
        avg = monthly_asset_average(daily)
        fruits = monthly_fruit_reward_for_average(avg)
        if fruits <= 0:
            return 0

        orn = add_fruit(self._ledger.get_ornaments(account_id), fruits)
        self._ledger_save_ornaments(account_id, orn)
        self._set_state(key, "1")
        return fruits

    def _daily_assets_for_month(
        self, account_id: int, year: int, month: int
    ) -> dict[str, int]:
        prefix = f"{year:04d}-{month:02d}-"
        rows = execute(
            self._conn,
            "SELECT as_of, asset_minutes FROM balance_snapshots "
            "WHERE account_id = ? AND kind = ? AND as_of LIKE ?",
            (account_id, "daily", prefix + "%"),
        ).fetchall()
        return {str(r["as_of"]): int(r["asset_minutes"]) for r in rows}

    def _ledger_save_ornaments(self, account_id: int, orn: Ornaments) -> None:
        # Reuse ledger private persistence path via SQL (same table)
        execute(
            self._conn,
            "INSERT OR IGNORE INTO tree_ornaments (account_id) VALUES (?)",
            (account_id,),
        )
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
        self._conn.commit()

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
