"""E4 — magic tree stage, ornaments, monthly fruiting reward."""

from __future__ import annotations

from datetime import datetime

import pytest

from mytimetree.db.connection import connect
from mytimetree.db.migrate import apply_migrations
from mytimetree.domain.monthly_fruit import monthly_fruit_reward_for_average
from mytimetree.domain.ornaments import Ornaments, add_fruit, add_pest, add_woodpecker
from mytimetree.domain.time import APP_TZ, FakeClock
from mytimetree.domain.tree import TreeStage, stage_for_net_minutes
from mytimetree.jobs.runner import JobRunner
from mytimetree.services.accounts import AccountService
from mytimetree.services.ledger import LedgerService
from mytimetree.services.tree import TreeService, monthly_asset_average


@pytest.fixture
def env(tmp_path):
    conn = connect(tmp_path / "e4.db")
    apply_migrations(conn)
    clock = FakeClock(datetime(2026, 8, 1, 0, 0, 0, tzinfo=APP_TZ))
    accounts = AccountService(conn, clock=clock)
    ledger = LedgerService(conn, accounts=accounts, clock=clock)
    tree = TreeService(conn, accounts=accounts, ledger=ledger, clock=clock)
    runner = JobRunner(
        conn,
        accounts=accounts,
        ledger=ledger,
        clock=clock,
        backup_dir=tmp_path / "backups",
        tree=tree,
    )
    yield {
        "conn": conn,
        "clock": clock,
        "accounts": accounts,
        "ledger": ledger,
        "tree": tree,
        "runner": runner,
    }
    conn.close()


@pytest.mark.unit
def test_stage_boundaries_and_debt_downgrade():
    assert stage_for_net_minutes(19) == TreeStage.SEED
    assert stage_for_net_minutes(20) == TreeStage.SPROUT
    assert stage_for_net_minutes(350) == TreeStage.BIG
    assert stage_for_net_minutes(499) == TreeStage.GIANT
    assert stage_for_net_minutes(500) == TreeStage.FRUITING


@pytest.mark.unit
def test_ornament_state_machine_pure():
    orn = Ornaments()
    orn = add_fruit(orn, 99)
    orn = add_fruit(orn)
    assert orn.fruit_count == 0 and orn.golden_fruit_count == 1
    orn = add_pest(orn)
    orn = add_woodpecker(orn)
    assert orn.pest_count == 1 and orn.woodpecker_count == 1


@pytest.mark.unit
@pytest.mark.parametrize(
    "avg,fruits",
    [
        (0, 0),
        (99, 0),
        (100, 1),
        (199, 1),
        (200, 4),
        (299, 4),
        (300, 8),
        (400, 12),
        (500, 16),
        (600, 20),
    ],
)
def test_monthly_fruit_tier_table(avg, fruits):
    assert monthly_fruit_reward_for_average(avg) == fruits


@pytest.mark.unit
def test_monthly_average_divides_by_30():
    days = {f"2026-08-{d:02d}": 1000 for d in range(1, 16)}
    assert monthly_asset_average(days) == 500.0
    assert monthly_asset_average({}) == 0.0


@pytest.mark.integration
def test_tree_service_stage_from_net_balance(env):
    accounts, ledger, tree = env["accounts"], env["ledger"], env["tree"]
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    ledger.deposit(acc.id, minutes=100)
    ledger.borrow(acc.id, minutes=30)  # asset 70, liability 30, net 40 → sprout
    state = tree.get_state(acc.id)
    assert state.stage == TreeStage.SPROUT
    assert state.ornaments.pest_count == 1
    assert state.ornaments.fruit_count == 1


@pytest.mark.integration
def test_monthly_fruit_awarded_when_fruiting_tiered(env):
    accounts, ledger, tree, clock, runner = (
        env["accounts"],
        env["ledger"],
        env["tree"],
        env["clock"],
        env["runner"],
    )
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    ledger.deposit(acc.id, minutes=600)
    assert tree.get_state(acc.id).stage == TreeStage.FRUITING
    # asset=600 all month → avg 600 → n=6 → 4*(6-1)=20 fruits
    fruit_before = tree.get_state(acc.id).ornaments.fruit_count
    golden_before = tree.get_state(acc.id).ornaments.golden_fruit_count

    for day in range(1, 31):
        clock.set(datetime(2026, 8, day, 0, 0, 0, tzinfo=APP_TZ))
        tree.record_daily_asset_snapshot(acc.id)

    clock.set(datetime(2026, 8, 31, 0, 0, 0, tzinfo=APP_TZ))
    report = runner.run_midnight()
    assert "monthly_fruit" in report.steps
    expected = monthly_fruit_reward_for_average(600)  # 20
    assert expected == 20
    assert report.monthly_fruit_awarded.get(acc.id) == expected
    orn = tree.get_state(acc.id).ornaments
    total_fruit_units = (
        (orn.golden_fruit_count - golden_before) * 100
        + orn.fruit_count
        - fruit_before
    )
    assert total_fruit_units == expected


@pytest.mark.integration
def test_monthly_fruit_skipped_if_not_fruiting_or_avg_low(env):
    accounts, ledger, tree, clock, runner = (
        env["accounts"],
        env["ledger"],
        env["tree"],
        env["clock"],
        env["runner"],
    )
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    ledger.deposit(acc.id, minutes=100)
    for day in range(1, 31):
        clock.set(datetime(2026, 8, day, 0, 0, 0, tzinfo=APP_TZ))
        tree.record_daily_asset_snapshot(acc.id)
    clock.set(datetime(2026, 8, 31, 0, 0, 0, tzinfo=APP_TZ))
    fruit_before = tree.get_state(acc.id).ornaments.fruit_count
    report = runner.run_midnight()
    assert report.monthly_fruit_awarded.get(acc.id, 0) == 0
    assert tree.get_state(acc.id).ornaments.fruit_count == fruit_before

    acc2 = accounts.open_account(name="小红", password="p", asset_interest_rate=0.0)
    ledger.deposit(acc2.id, minutes=600)
    clock.set(datetime(2026, 9, 1, 0, 0, 0, tzinfo=APP_TZ))
    tree.record_daily_asset_snapshot(acc2.id)
    clock.set(datetime(2026, 9, 30, 0, 0, 0, tzinfo=APP_TZ))
    before2 = tree.get_state(acc2.id).ornaments.fruit_count
    report2 = runner.run_midnight()
    assert report2.monthly_fruit_awarded.get(acc2.id, 0) == 0
    assert tree.get_state(acc2.id).ornaments.fruit_count == before2


@pytest.mark.integration
def test_monthly_fruit_awarded_at_most_once_per_month(env):
    accounts, ledger, tree, clock, runner = (
        env["accounts"],
        env["ledger"],
        env["tree"],
        env["clock"],
        env["runner"],
    )
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    ledger.deposit(acc.id, minutes=600)
    for day in range(1, 31):
        clock.set(datetime(2026, 8, day, 0, 0, 0, tzinfo=APP_TZ))
        tree.record_daily_asset_snapshot(acc.id)
    clock.set(datetime(2026, 8, 31, 0, 0, 0, tzinfo=APP_TZ))
    runner.run_midnight()
    mid = tree.get_state(acc.id).ornaments.fruit_count
    runner.run_midnight()
    assert tree.get_state(acc.id).ornaments.fruit_count == mid
