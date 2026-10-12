"""H1.3–H1.4 — enable habits per account, archive blocks new logs."""

from __future__ import annotations

from datetime import datetime

import pytest

from mytimetree.db.connection import connect
from mytimetree.db.migrate import apply_migrations
from mytimetree.domain.errors import DomainError, ErrorCode
from mytimetree.domain.time import APP_TZ, FakeClock
from mytimetree.services.accounts import AccountService
from mytimetree.services.habit import HabitService
from mytimetree.services.habit_templates import seed_templates_into_db


@pytest.fixture
def env(tmp_path):
    conn = connect(tmp_path / "h1.db")
    apply_migrations(conn)
    clock = FakeClock(datetime(2026, 10, 12, 9, 0, 0, tzinfo=APP_TZ))
    accounts = AccountService(conn, clock=clock)
    habits = HabitService(conn, accounts=accounts, clock=clock)
    seed_templates_into_db(conn)
    a = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    b = accounts.open_account(name="小红", password="p", asset_interest_rate=0.0)
    yield {
        "conn": conn,
        "clock": clock,
        "accounts": accounts,
        "habits": habits,
        "a": a,
        "b": b,
    }
    conn.close()


@pytest.mark.integration
def test_enable_from_template_isolates_accounts(env):
    habits: HabitService = env["habits"]
    a, b = env["a"], env["b"]
    ha = habits.enable_from_template(a.id, "brush-teeth")
    hb = habits.enable_from_template(b.id, "brush-teeth")
    assert ha.account_id == a.id
    assert hb.account_id == b.id
    assert {h.id for h in habits.list_habits(a.id)} == {ha.id}
    assert {h.id for h in habits.list_habits(b.id)} == {hb.id}


@pytest.mark.integration
def test_custom_non_micro_rejected(env):
    habits: HabitService = env["habits"]
    a = env["a"]
    with pytest.raises(DomainError) as ei:
        habits.enable_custom(
            a.id,
            title="学完整首钢琴曲",
            category="study_micro",
            est_minutes=30,
        )
    assert ei.value.code == ErrorCode.HABIT_NOT_MICRO


@pytest.mark.integration
def test_custom_micro_enabled(env):
    habits: HabitService = env["habits"]
    a = env["a"]
    h = habits.enable_custom(
        a.id,
        title="收书包",
        category="chores",
        est_minutes=3,
    )
    assert h.title == "收书包"
    assert h.template_id is None


@pytest.mark.integration
def test_archive_keeps_history_blocks_new_log(env):
    habits: HabitService = env["habits"]
    clock: FakeClock = env["clock"]
    a = env["a"]
    h = habits.enable_from_template(a.id, "brush-teeth")
    log = habits.complete_habit(a.id, h.id)
    assert log.habit_id == h.id

    habits.archive_habit(a.id, h.id)
    logs_after = habits.list_logs(a.id, habit_id=h.id)
    assert len(logs_after) == 1
    assert logs_after[0].id == log.id

    clock.advance(days=1)
    with pytest.raises(DomainError) as ei:
        habits.complete_habit(a.id, h.id)
    assert ei.value.code == ErrorCode.HABIT_ARCHIVED
