"""H3 — complete → EarnedCredit; day boundary; auto_redeem atomic ledger."""

from __future__ import annotations

from datetime import datetime

import pytest

from mytimetree.db.connection import connect, execute
from mytimetree.db.migrate import apply_migrations
from mytimetree.domain.errors import DomainError, ErrorCode
from mytimetree.domain.ledger import LedgerCategory
from mytimetree.domain.time import APP_TZ, FakeClock
from mytimetree.services.accounts import AccountService
from mytimetree.services.habit import HabitService
from mytimetree.services.habit_templates import seed_templates_into_db
from mytimetree.services.ledger import LedgerService


@pytest.fixture
def env(tmp_path):
    conn = connect(tmp_path / "h3.db")
    apply_migrations(conn)
    clock = FakeClock(datetime(2026, 10, 12, 12, 0, 0, tzinfo=APP_TZ))
    accounts = AccountService(conn, clock=clock)
    ledger = LedgerService(conn, accounts=accounts, clock=clock)
    habits = HabitService(conn, accounts=accounts, clock=clock, ledger=ledger)
    seed_templates_into_db(conn)
    a = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    ha = habits.enable_from_template(a.id, "brush-teeth")
    yield {
        "conn": conn,
        "clock": clock,
        "accounts": accounts,
        "ledger": ledger,
        "habits": habits,
        "a": a,
        "ha": ha,
    }
    conn.close()


@pytest.mark.integration
def test_complete_without_rule_log_only_no_credit(env):
    habits: HabitService = env["habits"]
    a, ha = env["a"], env["ha"]
    result = habits.complete_habit(a.id, ha.id)
    assert result.log.habit_id == ha.id
    assert result.credit is None


@pytest.mark.integration
def test_complete_with_rule_creates_pending_credit(env):
    habits: HabitService = env["habits"]
    a, ha = env["a"], env["ha"]
    habits.create_exchange_rule(
        a.id,
        habit_id=ha.id,
        minutes_per_completion=7,
        auto_redeem=False,
    )
    result = habits.complete_habit(a.id, ha.id)
    assert result.credit is not None
    assert result.credit.minutes == 7
    assert result.credit.status == "pending"
    assert result.credit.ledger_entry_id is None


@pytest.mark.integration
def test_auto_redeem_writes_ledger_and_balance(env):
    habits: HabitService = env["habits"]
    ledger: LedgerService = env["ledger"]
    a, ha = env["a"], env["ha"]
    habits.create_exchange_rule(
        a.id,
        habit_id=ha.id,
        minutes_per_completion=6,
        auto_redeem=True,
    )
    result = habits.complete_habit(a.id, ha.id)
    assert result.credit is not None
    assert result.credit.status == "redeemed"
    assert result.credit.ledger_entry_id is not None
    assert ledger.get_balance(a.id).asset.value == 6
    entries = ledger.list_entries(a.id)
    assert len(entries) == 1
    assert entries[0].category == LedgerCategory.HABIT_REWARD
    meta = entries[0].meta_json
    assert str(result.log.id) in meta or "habit_log_id" in meta


@pytest.mark.integration
def test_same_habit_same_day_idempotent_reject(env):
    habits: HabitService = env["habits"]
    a, ha = env["a"], env["ha"]
    habits.create_exchange_rule(a.id, habit_id=ha.id, minutes_per_completion=5)
    habits.complete_habit(a.id, ha.id)
    with pytest.raises(DomainError) as ei:
        habits.complete_habit(a.id, ha.id)
    assert ei.value.code == ErrorCode.HABIT_ALREADY_LOGGED


@pytest.mark.integration
def test_rule_daily_cap_exceeded_on_second_completion_same_habit(env):
    habits: HabitService = env["habits"]
    a = env["a"]
    ha = habits.enable_from_template(a.id, "brush-teeth")
    hb = habits.enable_from_template(a.id, "wash-hands")
    rule_a = habits.create_exchange_rule(
        a.id,
        habit_id=ha.id,
        minutes_per_completion=4,
        daily_cap_minutes=5,
    )
    habits.create_exchange_rule(
        a.id,
        habit_id=hb.id,
        minutes_per_completion=4,
        daily_cap_minutes=5,
    )
    habits.complete_habit(a.id, ha.id)
    with pytest.raises(DomainError) as ei:
        habits.assert_within_daily_cap(a.id, rule_a.id, additional_minutes=2)
    assert ei.value.code == ErrorCode.VALIDATION


@pytest.mark.integration
def test_shanghai_day_boundary_allows_next_day(env):
    habits: HabitService = env["habits"]
    clock: FakeClock = env["clock"]
    a, ha = env["a"], env["ha"]
    habits.create_exchange_rule(a.id, habit_id=ha.id, minutes_per_completion=3)
    clock.set(datetime(2026, 10, 12, 23, 59, 0, tzinfo=APP_TZ))
    r1 = habits.complete_habit(a.id, ha.id)
    assert r1.log.day_key == "2026-10-12"
    clock.set(datetime(2026, 10, 13, 0, 1, 0, tzinfo=APP_TZ))
    r2 = habits.complete_habit(a.id, ha.id)
    assert r2.log.day_key == "2026-10-13"
    assert r2.log.id != r1.log.id


@pytest.mark.integration
def test_inactive_rule_logs_without_credit(env):
    habits: HabitService = env["habits"]
    a, ha = env["a"], env["ha"]
    rule = habits.create_exchange_rule(a.id, habit_id=ha.id, minutes_per_completion=5)
    habits.deactivate_exchange_rule(a.id, rule.id)
    result = habits.complete_habit(a.id, ha.id)
    assert result.log.id > 0
    assert result.credit is None
