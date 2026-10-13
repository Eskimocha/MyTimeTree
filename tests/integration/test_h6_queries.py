"""H6 — timeline, category agg, daily achievement, record board."""

from __future__ import annotations

from datetime import datetime

import pytest

from mytimetree.db.connection import connect
from mytimetree.db.migrate import apply_migrations
from mytimetree.domain.time import APP_TZ, FakeClock
from mytimetree.services.accounts import AccountService
from mytimetree.services.habit import HabitService
from mytimetree.services.habit_query import HabitQueryService
from mytimetree.services.habit_templates import seed_templates_into_db
from mytimetree.services.ledger import LedgerService


@pytest.fixture
def env(tmp_path):
    conn = connect(tmp_path / "h6.db")
    apply_migrations(conn)
    clock = FakeClock(datetime(2026, 10, 13, 15, 0, 0, tzinfo=APP_TZ))
    accounts = AccountService(conn, clock=clock)
    ledger = LedgerService(conn, accounts=accounts, clock=clock)
    habits = HabitService(conn, accounts=accounts, clock=clock, ledger=ledger)
    query = HabitQueryService(conn, accounts=accounts, habits=habits, clock=clock)
    seed_templates_into_db(conn)
    a = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    b = accounts.open_account(name="小红", password="p", asset_interest_rate=0.0)
    brush = habits.enable_from_template(a.id, "brush-teeth")
    read = habits.enable_from_template(a.id, "read-one-page")
    habits.create_exchange_rule(a.id, habit_id=brush.id, minutes_per_completion=5, auto_redeem=False)
    habits.create_exchange_rule(a.id, habit_id=read.id, minutes_per_completion=3, auto_redeem=True)
    yield {
        "conn": conn,
        "clock": clock,
        "habits": habits,
        "query": query,
        "ledger": ledger,
        "a": a,
        "b": b,
        "brush": brush,
        "read": read,
    }
    conn.close()


@pytest.mark.integration
def test_timeline_desc_paginated_and_isolated(env):
    habits: HabitService = env["habits"]
    query: HabitQueryService = env["query"]
    clock: FakeClock = env["clock"]
    a, b, brush, read = env["a"], env["b"], env["brush"], env["read"]

    habits.complete_habit(a.id, brush.id)
    clock.advance(minutes=10)
    habits.complete_habit(a.id, read.id)
    hb = habits.enable_from_template(b.id, "brush-teeth")
    habits.complete_habit(b.id, hb.id)

    page = query.timeline(a.id, limit=1, offset=0)
    assert page.total == 2
    assert len(page.items) == 1
    assert page.items[0].habit_id == read.id  # newest first

    page2 = query.timeline(a.id, limit=10, offset=1)
    assert len(page2.items) == 1
    assert page2.items[0].habit_id == brush.id

    assert query.timeline(b.id).total == 1


@pytest.mark.integration
def test_category_aggregation(env):
    habits: HabitService = env["habits"]
    query: HabitQueryService = env["query"]
    a, brush, read = env["a"], env["brush"], env["read"]
    habits.complete_habit(a.id, brush.id)
    habits.complete_habit(a.id, read.id)
    agg = {row.category: row for row in query.aggregate_by_category(a.id)}
    assert agg["hygiene"].count == 1
    assert agg["hygiene"].minutes == 5  # pending still counts earned
    assert agg["reading"].count == 1
    assert agg["reading"].minutes == 3  # auto-redeemed


@pytest.mark.integration
def test_daily_achievement(env):
    habits: HabitService = env["habits"]
    query: HabitQueryService = env["query"]
    a, brush, read = env["a"], env["brush"], env["read"]
    habits.complete_habit(a.id, brush.id)
    habits.complete_habit(a.id, read.id)
    day = query.daily_achievement(a.id, "2026-10-13")
    assert len(day.completed_habit_ids) == 2
    assert day.minutes_earned == 8
    assert day.minutes_redeemed == 3
    assert day.minutes_pending == 5


@pytest.mark.integration
def test_record_board_range_and_milestones(env):
    habits: HabitService = env["habits"]
    query: HabitQueryService = env["query"]
    clock: FakeClock = env["clock"]
    a = env["a"]
    slugs = ["brush-teeth", "wash-hands", "wash-face", "rinse-cup", "pack-bag"]
    # brush already enabled
    ids = [env["brush"].id]
    for slug in slugs[1:]:
        ids.append(habits.enable_from_template(a.id, slug).id)
    for hid in ids:
        habits.complete_habit(a.id, hid)

    board = query.record_board(a.id, range_from="2026-10-13", range_to="2026-10-13")
    assert board.stats["total_logs"] == 5
    assert len(board.entries) == 5
    assert board.stats["minutes_redeemed"] >= 0
    # pending milestones before evaluate
    pending = query.pending_board_milestones(a.id)
    assert any(m.milestone_id.startswith("board:week:") for m in pending)
    fired = habits.evaluate_board_celebration(a.id)
    assert fired is not None
    assert query.pending_board_milestones(a.id) == []
