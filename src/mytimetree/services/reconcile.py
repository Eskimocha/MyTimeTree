"""Month-end reconcile: prior month-end snapshot + month activity == current balance."""

from __future__ import annotations

import calendar
import json
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime

from mytimetree.db.connection import execute
from mytimetree.domain.ledger import LedgerCategory
from mytimetree.domain.time import ensure_app_tz
from mytimetree.services.ledger import LedgerService


@dataclass(frozen=True, slots=True)
class ReconcileReport:
    ok: bool
    details: list[str]


def is_month_end(day: date) -> bool:
    last = calendar.monthrange(day.year, day.month)[1]
    return day.day == last


def _entry_effects(category: str, amount: int, meta_json: str) -> tuple[int, int]:
    """Return (delta_asset, delta_liability)."""
    cat = LedgerCategory(category)
    if cat == LedgerCategory.SPEND:
        return -amount, 0
    if cat in (LedgerCategory.DEPOSIT, LedgerCategory.AUTO_GRANT):
        return amount, 0
    if cat == LedgerCategory.BORROW:
        return 0, amount
    if cat == LedgerCategory.REPAY:
        return 0, -amount
    if cat == LedgerCategory.AUTO_INTEREST:
        side = json.loads(meta_json or "{}").get("side", "asset")
        if side == "liability":
            return 0, amount
        return amount, 0
    return 0, 0


def reconcile_accounts(
    conn: sqlite3.Connection,
    *,
    ledger: LedgerService,
    now: datetime,
) -> ReconcileReport:
    today = ensure_app_tz(now).date()
    # Previous month last day
    if today.month == 1:
        prev_month_end = date(today.year - 1, 12, 31)
    else:
        last = calendar.monthrange(today.year, today.month - 1)[1]
        prev_month_end = date(today.year, today.month - 1, last)

    details: list[str] = []
    ok = True
    accounts = execute(conn, "SELECT id FROM accounts ORDER BY id").fetchall()
    month_start = date(today.year, today.month, 1).isoformat()

    for row in accounts:
        account_id = int(row["id"])
        snap = execute(
            conn,
            "SELECT asset_minutes, liability_minutes FROM balance_snapshots "
            "WHERE account_id = ? AND kind = ? AND as_of = ?",
            (account_id, "month_end", prev_month_end.isoformat()),
        ).fetchone()

        current = ledger.get_balance(account_id)
        if snap is None:
            # First month-end for this account: baseline OK, record snapshot later by caller
            details.append(f"account {account_id}: no prior month_end snapshot; baseline ok")
            continue

        # Sum this month's ledger effects (created_at date >= month_start)
        entries = execute(
            conn,
            "SELECT category, amount_minutes, meta_json, created_at FROM ledger_entries "
            "WHERE account_id = ?",
            (account_id,),
        ).fetchall()
        da = db = 0
        for e in entries:
            created = str(e["created_at"])[:10]
            if created < month_start:
                continue
            a, l = _entry_effects(
                str(e["category"]), int(e["amount_minutes"]), str(e["meta_json"] or "{}")
            )
            da += a
            db += l

        expected_asset = int(snap["asset_minutes"]) + da
        expected_liab = int(snap["liability_minutes"]) + db
        if expected_asset != current.asset.value or expected_liab != current.liability.value:
            ok = False
            details.append(
                f"account {account_id}: expected asset={expected_asset} liab={expected_liab}, "
                f"actual asset={current.asset.value} liab={current.liability.value}"
            )
        else:
            details.append(f"account {account_id}: ok")

    return ReconcileReport(ok=ok, details=details)


def save_month_end_snapshots(
    conn: sqlite3.Connection,
    *,
    ledger: LedgerService,
    now: datetime,
) -> None:
    today = ensure_app_tz(now).date().isoformat()
    for row in execute(conn, "SELECT id FROM accounts").fetchall():
        account_id = int(row["id"])
        bal = ledger.get_balance(account_id)
        execute(
            conn,
            "INSERT INTO balance_snapshots "
            "(account_id, as_of, asset_minutes, liability_minutes, kind) "
            "VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(account_id, as_of, kind) DO UPDATE SET "
            "asset_minutes = excluded.asset_minutes, "
            "liability_minutes = excluded.liability_minutes",
            (account_id, today, bal.asset.value, bal.liability.value, "month_end"),
        )
    conn.commit()
