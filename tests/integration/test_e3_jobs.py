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
    assert any(e.startswith("midnight:") for e in events)

    clock.set(datetime(2026, 8, 5, 1, 0, 0, tzinfo=APP_TZ))
    events2 = runner.tick()
    assert any(e.startswith("auto_grant:") for e in events2)
    assert ledger.get_balance(acc.id).asset.value == 10

    events3 = runner.tick()
    assert events3 == []
    assert ledger.get_balance(acc.id).asset.value == 10


@pytest.mark.integration
def test_catch_up_settles_missed_days_when_service_was_down(env):
    """Offline / missed 0:00 window: catch_up compounds one day of interest per missed day."""
    accounts, ledger, runner, clock = (
        env["accounts"],
        env["ledger"],
        env["runner"],
        env["clock"],
    )
    # Open on Aug 1 noon; never run midnight; come back Aug 4 afternoon
    clock.set(datetime(2026, 8, 1, 12, 0, 0, tzinfo=APP_TZ))
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.01)
    ledger.deposit(acc.id, minutes=1000)
    before = ledger.get_balance(acc.id).asset.value

    clock.set(datetime(2026, 8, 4, 15, 0, 0, tzinfo=APP_TZ))
    report = runner.catch_up()
    # Due midnight days: Aug 1,2,3,4 (4 days); grant: Aug 1,2,3 (hour<1 so not today? hour=15 >=1 so through Aug 4)
    assert report.midnight_dates == [
        "2026-08-01",
        "2026-08-02",
        "2026-08-03",
        "2026-08-04",
    ]
    assert "2026-08-04" in report.grant_dates

    # Compounding 1%/day for 4 days on asset (liability 0)
    expected = before
    for _ in range(4):
        expected += daily_interest_minutes(expected, 0.01)
    # auto_grant default may also add — check settings default
    after = ledger.get_balance(acc.id).asset.value
    # Interest only portion: count auto_interest entries
    interest_entries = [
        e
        for e in ledger.list_entries(acc.id)
        if e.category == LedgerCategory.AUTO_INTEREST
    ]
    assert len(interest_entries) == 4  # asset side only each day
    assert sum(e.amount_minutes for e in interest_entries) == expected - before

    # Idempotent
    again = runner.catch_up()
    assert again.events == []
    assert ledger.get_balance(acc.id).asset.value == after


@pytest.mark.integration
def test_catch_up_after_hour_zero_missed_still_posts_today(env):
    """If process was down all of hour==0, afternoon start still settles today's midnight."""
    accounts, ledger, runner, clock = (
        env["accounts"],
        env["ledger"],
        env["runner"],
        env["clock"],
    )
    clock.set(datetime(2026, 8, 5, 0, 0, 0, tzinfo=APP_TZ))
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.01)
    ledger.deposit(acc.id, minutes=500)
    # Pretend yesterday already settled
    env["conn"].execute(
        "INSERT INTO app_state (key, value) VALUES (?, ?)",
        ("job_last_midnight_date", "2026-08-04"),
    )
    env["conn"].commit()

    clock.set(datetime(2026, 8, 5, 10, 0, 0, tzinfo=APP_TZ))
    report = runner.catch_up()
    assert report.midnight_dates == ["2026-08-05"]
    asset_interest = [
        e
        for e in ledger.list_entries(acc.id)
        if e.category == LedgerCategory.AUTO_INTEREST
    ]
    assert len(asset_interest) == 1
    assert asset_interest[0].amount_minutes == daily_interest_minutes(500, 0.01)


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
