"""E3 — daily interest, midnight workflow, auto-grant, job runner."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import pytest

from mytimetree.db.connection import connect
from mytimetree.db.migrate import apply_migrations
from mytimetree.domain.interest import daily_interest_minutes
from mytimetree.domain.ledger import LedgerCategory
from mytimetree.domain.time import APP_TZ, FakeClock
from mytimetree.jobs.runner import JobRunner
from mytimetree.services.accounts import AccountService
from mytimetree.services.ledger import LedgerService


@pytest.fixture
def env(tmp_path):
    conn = connect(tmp_path / "e3.db")
    apply_migrations(conn)
    clock = FakeClock(datetime(2026, 8, 5, 0, 0, 0, tzinfo=APP_TZ))
    accounts = AccountService(conn, clock=clock)
    ledger = LedgerService(conn, accounts=accounts, clock=clock)
    backup_dir = tmp_path / "backups"
    runner = JobRunner(
        conn,
        accounts=accounts,
        ledger=ledger,
        clock=clock,
        backup_dir=backup_dir,
    )
    yield {
        "conn": conn,
        "clock": clock,
        "accounts": accounts,
        "ledger": ledger,
        "runner": runner,
        "backup_dir": backup_dir,
    }
    conn.close()


@pytest.mark.unit
@pytest.mark.parametrize(
    "principal,daily_rate,expected",
    [
        (100, 0.01, 1),  # 100 × 1%/天 = 1
        (100, 0.0, 0),
        (50, 0.01, 0),  # floor(0.5) = 0
        (200, 0.005, 1),  # 200 × 0.5%/天 = 1
        (1000, 0.02, 20),
    ],
)
def test_daily_interest_formula(principal, daily_rate, expected):
    assert daily_interest_minutes(principal, daily_rate) == expected


@pytest.mark.integration
def test_interest_amounts_locked(env):
    accounts, ledger, runner = env["accounts"], env["ledger"], env["runner"]
    # 日利率 1%
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.01)
    env["conn"].execute(
        "UPDATE settings SET liability_interest_rate = 0.01 WHERE account_id = ?",
        (acc.id,),
    )
    env["conn"].commit()
    ledger.deposit(acc.id, minutes=5000)
    ledger.borrow(acc.id, minutes=2000)
    before = ledger.get_balance(acc.id)
    fruit_before = ledger.get_ornaments(acc.id).fruit_count
    runner.run_midnight()
    after = ledger.get_balance(acc.id)
    assert after.asset.value == before.asset.value + daily_interest_minutes(
        before.asset.value, 0.01
    )
    assert after.liability.value == before.liability.value + daily_interest_minutes(
        before.liability.value, 0.01
    )
    assert ledger.get_ornaments(acc.id).fruit_count == fruit_before

    entries = [
        e for e in ledger.list_entries(acc.id) if e.category == LedgerCategory.AUTO_INTEREST
    ]
    sides = sorted(json.loads(e.meta_json).get("side") for e in entries)
    assert sides == ["asset", "liability"]


@pytest.mark.integration
def test_midnight_workflow_order_and_month_end_reconcile(env):
    accounts, ledger, runner, clock = (
        env["accounts"],
        env["ledger"],
        env["runner"],
        env["clock"],
    )
    clock.set(datetime(2026, 8, 31, 0, 0, 0, tzinfo=APP_TZ))
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    ledger.deposit(acc.id, minutes=100)
    report = runner.run_midnight()
    assert report.steps == ["interest", "reconcile", "backup"]
    assert report.reconcile is not None
    assert report.reconcile.ok is True
    assert any(env["backup_dir"].glob("*.json"))


@pytest.mark.integration
def test_non_month_end_skips_reconcile(env):
    accounts, ledger, runner, clock = (
        env["accounts"],
        env["ledger"],
        env["runner"],
        env["clock"],
    )
    clock.set(datetime(2026, 8, 15, 0, 0, 0, tzinfo=APP_TZ))
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    ledger.deposit(acc.id, minutes=50)
    report = runner.run_midnight()
    assert report.steps == ["interest", "backup"]
    assert report.reconcile is None


@pytest.mark.integration
def test_auto_grant_at_one_am(env):
    accounts, ledger, runner, clock = (
        env["accounts"],
        env["ledger"],
        env["runner"],
        env["clock"],
    )
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    env["conn"].execute(
        "UPDATE settings SET daily_grant_minutes = 15 WHERE account_id = ?",
        (acc.id,),
    )
    env["conn"].commit()
    clock.set(datetime(2026, 8, 5, 1, 0, 0, tzinfo=APP_TZ))
    report = runner.run_auto_grant()
    assert report.granted[acc.id] == 15
    assert ledger.get_balance(acc.id).asset.value == 15
    assert ledger.get_ornaments(acc.id).fruit_count == 0  # 自动派发不发星


@pytest.mark.integration
def test_job_runner_tick_dispatches_by_shanghai_hour(env):
    accounts, ledger, runner, clock = (
        env["accounts"],
        env["ledger"],
        env["runner"],
        env["clock"],
    )
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    env["conn"].execute(
        "UPDATE settings SET daily_grant_minutes = 10 WHERE account_id = ?",
        (acc.id,),
    )
    env["conn"].commit()

    clock.set(datetime(2026, 8, 5, 0, 0, 0, tzinfo=APP_TZ))
    events = runner.tick()
    assert "midnight" in events

    clock.set(datetime(2026, 8, 5, 1, 0, 0, tzinfo=APP_TZ))
    events2 = runner.tick()
    assert "auto_grant" in events2
    assert ledger.get_balance(acc.id).asset.value == 10

    events3 = runner.tick()
    assert events3 == []
    assert ledger.get_balance(acc.id).asset.value == 10


@pytest.mark.integration
def test_backup_contains_ledger_balance_settings(env):
    accounts, ledger, runner = env["accounts"], env["ledger"], env["runner"]
    accounts.open_account(name="小明", password="p", asset_interest_rate=0.02)
    acc = accounts.list_accounts()[0]
    ledger.deposit(acc.id, minutes=40)
    report = runner.run_midnight()
    path = Path(report.backup_path)
    assert path.exists()
    data = json.loads(path.read_text(encoding="utf-8"))
    assert "accounts" in data
    assert "ledger_entries" in data
    assert "settings" in data
    assert "balances" in data


@pytest.mark.integration
def test_reconcile_detects_tampered_balance_snapshot(env):
    """If stored month-start snapshot disagrees with ledger replay, reconcile fails."""
    accounts, ledger, runner, clock = (
        env["accounts"],
        env["ledger"],
        env["runner"],
        env["clock"],
    )
    clock.set(datetime(2026, 8, 31, 0, 0, 0, tzinfo=APP_TZ))
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    ledger.deposit(acc.id, minutes=100)
    # Pretend last month-end snapshot was wrong
    from mytimetree.db.connection import execute

    execute(
        env["conn"],
        "INSERT INTO balance_snapshots "
        "(account_id, as_of, asset_minutes, liability_minutes, kind) "
        "VALUES (?, ?, ?, ?, ?)",
        (acc.id, "2026-07-31", 999, 0, "month_end"),
    )
    env["conn"].commit()
    report = runner.run_midnight()
    assert report.reconcile is not None
    assert report.reconcile.ok is False
