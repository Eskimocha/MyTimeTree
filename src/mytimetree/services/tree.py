"""Magic tree: stage from net + ornaments (星/太阳/果/虫/鸟)."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from mytimetree.db.connection import execute
from mytimetree.domain.ornaments import Ornaments
from mytimetree.domain.time import Clock, SystemClock, ensure_app_tz
from mytimetree.domain.tree import TreeStage, stage_for_net_minutes
from mytimetree.services.accounts import AccountService
from mytimetree.services.ledger import LedgerService


@dataclass(frozen=True, slots=True)
class TreeStateView:
    account_id: int
    stage: TreeStage
    net_minutes: int
    asset_minutes: int
    liability_minutes: int
    ornaments: Ornaments
    cumulative_interest: int
    today_interest: int


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
        stage = stage_for_net_minutes(bal.net.value)
        # Catch up 果 for accounts that already had interest before this feature
        orn = self._ledger.sync_interest_fruits(account_id)
        cum = self._ledger.get_cumulative_interest(account_id)["net"]
        today = self._ledger.preview_today_interest(account_id)["net"]
        return TreeStateView(
            account_id=account_id,
            stage=stage,
            net_minutes=bal.net.value,
            asset_minutes=bal.asset.value,
            liability_minutes=bal.liability.value,
            ornaments=orn,
            cumulative_interest=cum,
            today_interest=today,
        )

    def record_daily_asset_snapshot(self, account_id: int) -> None:
        """Persist today's settled balance (kind=daily) for analytics / reconcile."""
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
