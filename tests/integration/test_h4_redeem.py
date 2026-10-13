"""H4 — manual redeem of pending EarnedCredit → habit_reward ledger."""

from __future__ import annotations

import json
from datetime import datetime

import pytest

from mytimetree.db.connection import connect
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
    conn = connect(tmp_path / "h4.db")
    apply_migrations(conn)
    clock = FakeClock(datetime(2026, 10, 13, 11, 0, 0, tzinfo=APP_TZ))
    accounts = AccountService(conn, clock=clock)
    ledger = LedgerService(conn, accounts=accounts, clock=clock)
    habits = HabitService(conn, accounts=accounts, clock=clock, ledger=ledger)
    seed_templates_into_db(conn)
    a = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    b = accounts.open_account(name="小红", password="p", asset_interest_rate=0.0)
    ha = habits.enable_from_template(a.id, "brush-teeth")
    habits.create_exchange_rule(
        a.id,
        habit_id=ha.id,
        minutes_per_completion=9,
        auto_redeem=False,
    )
    yield {
        "conn": conn,
        "clock": clock,
        "ledger": ledger,
        "habits": habits,
        "a": a,
        "b": b,
        "ha": ha,
    }
    conn.close()


@pytest.mark.integration
def test_redeem_pending_increases_balance_and_fruit(env):
    habits: HabitService = env["habits"]
    ledger: LedgerService = env["ledger"]
    a, ha = env["a"], env["ha"]
    completion = habits.complete_habit(a.id, ha.id)
    assert completion.credit is not None
    assert completion.credit.status == "pending"
    before_fruit = ledger.get_ornaments(a.id).fruit_count

    redeemed = habits.redeem(a.id, completion.credit.id)
    assert redeemed.status == "redeemed"
    assert redeemed.ledger_entry_id is not None
    assert redeemed.minutes == 9
    assert ledger.get_balance(a.id).asset.value == 9
    assert ledger.get_ornaments(a.id).fruit_count == before_fruit + 1

    entries = ledger.list_entries(a.id)
    assert len(entries) == 1
    assert entries[0].category == LedgerCategory.HABIT_REWARD
    meta = json.loads(entries[0].meta_json)
    assert meta["habit_log_id"] == completion.log.id


@pytest.mark.integration
def test_redeem_idempotent_second_fails(env):
    habits: HabitService = env["habits"]
    a, ha = env["a"], env["ha"]
    credit_id = habits.complete_habit(a.id, ha.id).credit.id
    habits.redeem(a.id, credit_id)
    with pytest.raises(DomainError) as ei:
        habits.redeem(a.id, credit_id)
    assert ei.value.code == ErrorCode.CREDIT_NOT_REDEEMABLE


@pytest.mark.integration
def test_redeem_cross_account_forbidden(env):
    habits: HabitService = env["habits"]
    a, b, ha = env["a"], env["b"], env["ha"]
    credit_id = habits.complete_habit(a.id, ha.id).credit.id
    with pytest.raises(DomainError) as ei:
        habits.redeem(b.id, credit_id)
    assert ei.value.code == ErrorCode.NOT_FOUND


@pytest.mark.integration
def test_redeem_requires_ledger(env):
    """HabitService without ledger cannot redeem."""
    conn = env["conn"]
    clock = env["clock"]
    accounts = AccountService(conn, clock=clock)
    habits_no_ledger = HabitService(conn, accounts=accounts, clock=clock)
    a, ha = env["a"], env["ha"]
    credit_id = env["habits"].complete_habit(a.id, ha.id).credit.id
    with pytest.raises(DomainError) as ei:
        habits_no_ledger.redeem(a.id, credit_id)
    assert ei.value.code == ErrorCode.INTERNAL
