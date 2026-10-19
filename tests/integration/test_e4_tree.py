"""E4 — magic tree stage, ornaments, interest-linked fruit."""

from __future__ import annotations

from datetime import datetime

import pytest

from mytimetree.db.connection import connect
from mytimetree.db.migrate import apply_migrations
from mytimetree.domain.monthly_fruit import (
    fruit_display_count,
    fruits_from_cumulative_interest,
)
from mytimetree.domain.ornaments import Ornaments, add_fruit, add_pest, add_woodpecker
from mytimetree.domain.time import APP_TZ, FakeClock
from mytimetree.domain.tree import TreeStage, stage_for_net_minutes
from mytimetree.jobs.runner import JobRunner
from mytimetree.services.accounts import AccountService
from mytimetree.services.ledger import LedgerService
from mytimetree.services.tree import TreeService


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
    "cum,fruits",
    [
        (0, 0),
        (99, 0),
        (100, 1),
        (199, 1),
        (200, 2),
        (350, 3),
    ],
)
def test_fruits_from_cumulative_interest(cum, fruits):
    assert fruits_from_cumulative_interest(cum) == fruits


@pytest.mark.unit
@pytest.mark.parametrize(
    "count,shown",
    [
        (0, 0),
        (1, 1),
        (10, 1),
        (11, 2),
        (21, 3),
        (91, 10),
        (100, 10),
    ],
)
def test_fruit_display_count_like_stars(count, shown):
    assert fruit_display_count(count) == shown


@pytest.mark.integration
def test_tree_service_stage_from_net_balance(env):
    accounts, ledger, tree = env["accounts"], env["ledger"], env["tree"]
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    ledger.deposit(acc.id, minutes=100)
    ledger.borrow(acc.id, minutes=30)  # asset 100, liability 30, net 70
    ledger.spend(acc.id, minutes=40)  # asset 60, liability 30, net 30 → sprout
    state = tree.get_state(acc.id)
    assert state.stage == TreeStage.SPROUT
    assert state.ornaments.pest_count == 1
    assert state.ornaments.fruit_count == 1
    assert state.ornaments.interest_fruit_count == 0
    assert state.cumulative_interest == 0


@pytest.mark.integration
def test_interest_awards_fruit_every_100_net(env):
    accounts, ledger, tree = env["accounts"], env["ledger"], env["tree"]
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    ledger.deposit(acc.id, minutes=100)

    ledger.post_interest(acc.id, minutes=99, side="asset")
    assert ledger.get_ornaments(acc.id).interest_fruit_count == 0

    ledger.post_interest(acc.id, minutes=1, side="asset")
    assert ledger.get_ornaments(acc.id).interest_fruit_count == 1
    events = ledger.list_ornament_events(acc.id)
    assert any(
        e["kind"] == "fruit" and e["delta"] == 1 and e["reason"] == "interest"
        for e in events
    )

    # liability interest reduces net: +50 asset, +30 liability → net +20 → still 1 fruit
    ledger.post_interest(acc.id, minutes=50, side="asset")
    ledger.post_interest(acc.id, minutes=30, side="liability")
    # cum net = 100+50-30 = 120 → still 1 fruit
    assert ledger.get_cumulative_interest(acc.id)["net"] == 120
    assert ledger.get_ornaments(acc.id).interest_fruit_count == 1

    ledger.post_interest(acc.id, minutes=80, side="asset")
    # cum = 200 → 2 fruits
    assert ledger.get_ornaments(acc.id).interest_fruit_count == 2
    state = tree.get_state(acc.id)
    assert state.cumulative_interest == 200
    assert state.ornaments.interest_fruit_count == 2


@pytest.mark.integration
def test_midnight_interest_can_award_fruit(env):
    accounts, ledger, tree, clock, runner = (
        env["accounts"],
        env["ledger"],
        env["tree"],
        env["clock"],
        env["runner"],
    )
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.1)
    # 0.1 * 1000 = 100 interest → 1 fruit
    ledger.deposit(acc.id, minutes=1000)
    star_before = tree.get_state(acc.id).ornaments.fruit_count
    clock.set(datetime(2026, 8, 2, 0, 0, 0, tzinfo=APP_TZ))
    report = runner.run_midnight()
    assert "interest" in report.steps
    assert report.interest_posted[acc.id]["asset"] == 100
    assert report.interest_fruit_awarded.get(acc.id) == 1
    assert tree.get_state(acc.id).ornaments.fruit_count == star_before  # 星不变
    assert tree.get_state(acc.id).ornaments.interest_fruit_count == 1


@pytest.mark.integration
def test_today_interest_preview(env):
    accounts, ledger, tree = env["accounts"], env["ledger"], env["tree"]
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.01)
    # liability rate = asset/2 = 0.005
    ledger.deposit(acc.id, minutes=200)
    ledger.borrow(acc.id, minutes=100)
    # asset 200 → floor(2); liability 100 → floor(0.5)=0
    prev = ledger.preview_today_interest(acc.id)
    assert prev["asset"] == 2
    assert prev["liability"] == 0
    assert prev["net"] == 2
    state = tree.get_state(acc.id)
    assert state.today_interest == 2
