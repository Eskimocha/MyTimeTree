"""H2.1–H2.4 — ExchangeRule CRUD, caps, auto_redeem, deactivate policy."""

from __future__ import annotations

from datetime import datetime

import pytest

from mytimetree.db.connection import connect, execute
from mytimetree.db.migrate import apply_migrations
from mytimetree.domain.errors import DomainError, ErrorCode
from mytimetree.domain.habit import INACTIVE_RULE_PENDING_POLICY
from mytimetree.domain.time import APP_TZ, FakeClock
from mytimetree.services.accounts import AccountService
from mytimetree.services.habit import HabitService
from mytimetree.services.habit_templates import seed_templates_into_db


@pytest.fixture
def env(tmp_path):
    conn = connect(tmp_path / "h2.db")
    apply_migrations(conn)
    clock = FakeClock(datetime(2026, 10, 12, 10, 0, 0, tzinfo=APP_TZ))
    accounts = AccountService(conn, clock=clock)
    habits = HabitService(conn, accounts=accounts, clock=clock)
    seed_templates_into_db(conn)
    a = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    b = accounts.open_account(name="小红", password="p", asset_interest_rate=0.0)
    ha = habits.enable_from_template(a.id, "brush-teeth")
    yield {
        "conn": conn,
        "clock": clock,
        "habits": habits,
        "a": a,
        "b": b,
        "ha": ha,
    }
    conn.close()


@pytest.mark.integration
def test_create_get_update_list_rule(env):
    habits: HabitService = env["habits"]
    a, ha = env["a"], env["ha"]
    rule = habits.create_exchange_rule(
        a.id,
        habit_id=ha.id,
        minutes_per_completion=5,
        cadence="daily",
        auto_redeem=False,
        daily_cap_minutes=10,
    )
    assert rule.minutes_per_completion == 5
    assert rule.auto_redeem is False
    assert rule.active is True

    got = habits.get_exchange_rule(a.id, rule.id)
    assert got.id == rule.id

    updated = habits.update_exchange_rule(
        a.id,
        rule.id,
        minutes_per_completion=8,
        auto_redeem=True,
        daily_cap_minutes=16,
    )
    assert updated.minutes_per_completion == 8
    assert updated.auto_redeem is True
    assert updated.daily_cap_minutes == 16

    listed = habits.list_exchange_rules(a.id)
    assert [r.id for r in listed] == [rule.id]


@pytest.mark.integration
def test_rule_must_bind_own_account_habit(env):
    habits: HabitService = env["habits"]
    a, b, ha = env["a"], env["b"], env["ha"]
    with pytest.raises(DomainError) as ei:
        habits.create_exchange_rule(
            b.id,
            habit_id=ha.id,
            minutes_per_completion=5,
        )
    assert ei.value.code in (ErrorCode.NOT_FOUND, ErrorCode.FORBIDDEN)


@pytest.mark.integration
def test_auto_redeem_persists_roundtrip(env):
    habits: HabitService = env["habits"]
    a, ha = env["a"], env["ha"]
    rule = habits.create_exchange_rule(
        a.id,
        habit_id=ha.id,
        minutes_per_completion=3,
        auto_redeem=True,
    )
    assert habits.get_exchange_rule(a.id, rule.id).auto_redeem is True
    habits.update_exchange_rule(a.id, rule.id, auto_redeem=False)
    assert habits.get_exchange_rule(a.id, rule.id).auto_redeem is False


@pytest.mark.integration
def test_one_active_rule_per_habit_default(env):
    habits: HabitService = env["habits"]
    a, ha = env["a"], env["ha"]
    habits.create_exchange_rule(a.id, habit_id=ha.id, minutes_per_completion=5)
    with pytest.raises(DomainError) as ei:
        habits.create_exchange_rule(a.id, habit_id=ha.id, minutes_per_completion=7)
    assert ei.value.code == ErrorCode.CONFLICT


@pytest.mark.integration
def test_daily_cap_assert_exceeded(env):
    habits: HabitService = env["habits"]
    conn = env["conn"]
    a, ha = env["a"], env["ha"]
    rule = habits.create_exchange_rule(
        a.id,
        habit_id=ha.id,
        minutes_per_completion=5,
        daily_cap_minutes=5,
    )
    # Simulate already earned 5 minutes today via pending credit
    log = habits.complete_habit(a.id, ha.id)
    execute(
        conn,
        "INSERT INTO earned_credits (account_id, habit_log_id, minutes, status) "
        "VALUES (?, ?, ?, 'pending')",
        (a.id, log.id, 5),
    )
    conn.commit()
    with pytest.raises(DomainError) as ei:
        habits.assert_within_daily_cap(a.id, rule.id, additional_minutes=5)
    assert ei.value.code == ErrorCode.VALIDATION


@pytest.mark.integration
def test_deactivate_keeps_pending_redeemable_blocks_new_earn(env):
    """H2.4 policy: pending remain redeemable; inactive rule cannot earn new credits."""
    assert INACTIVE_RULE_PENDING_POLICY == "keep_redeemable"
    habits: HabitService = env["habits"]
    conn = env["conn"]
    a, ha = env["a"], env["ha"]
    rule = habits.create_exchange_rule(a.id, habit_id=ha.id, minutes_per_completion=5)
    log = habits.complete_habit(a.id, ha.id)
    execute(
        conn,
        "INSERT INTO earned_credits (account_id, habit_log_id, minutes, status) "
        "VALUES (?, ?, ?, 'pending')",
        (a.id, log.id, 5),
    )
    conn.commit()
    credit_id = int(
        execute(
            conn,
            "SELECT id FROM earned_credits WHERE habit_log_id = ?",
            (log.id,),
        ).fetchone()["id"]
    )

    habits.deactivate_exchange_rule(a.id, rule.id)
    inactive = habits.get_exchange_rule(a.id, rule.id)
    assert inactive.active is False
    assert habits.can_earn_from_rule(inactive) is False
    assert habits.can_redeem_credit(a.id, credit_id) is True
