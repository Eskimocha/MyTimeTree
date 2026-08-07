"""E2 — immutable ledger, balances, spend/borrow/repay/deposit, ornaments."""

from __future__ import annotations

from datetime import datetime

import pytest

from mytimetree.db.connection import connect, execute
from mytimetree.db.migrate import apply_migrations
from mytimetree.domain.errors import DomainError, ErrorCode
from mytimetree.domain.ledger import LedgerCategory
from mytimetree.domain.time import APP_TZ, FakeClock
from mytimetree.services.accounts import AccountService
from mytimetree.services.ledger import LedgerService


@pytest.fixture
def conn(tmp_path):
    c = connect(tmp_path / "e2.db")
    apply_migrations(c)
    yield c
    c.close()


@pytest.fixture
def clock():
    return FakeClock(datetime(2026, 8, 5, 12, 0, 0, tzinfo=APP_TZ))


@pytest.fixture
def services(conn, clock):
    accounts = AccountService(conn, clock=clock)
    ledger = LedgerService(conn, accounts=accounts, clock=clock)
    return accounts, ledger


@pytest.fixture
def kid(services):
    accounts, ledger = services
    acc = accounts.open_account(name="小明", password="p1", asset_interest_rate=0.05)
    return accounts, ledger, acc


@pytest.mark.integration
def test_ledger_append_only_rejects_update_delete(kid):
    _, ledger, acc = kid
    ledger.deposit(acc.id, minutes=10, summary="seed")
    entry_id = ledger.list_entries(acc.id)[0].id

    with pytest.raises(DomainError) as ei:
        ledger.update_entry(entry_id, summary="hack")
    assert ei.value.code == ErrorCode.FORBIDDEN

    with pytest.raises(DomainError) as ei2:
        ledger.delete_entry(entry_id)
    assert ei2.value.code == ErrorCode.FORBIDDEN


@pytest.mark.integration
def test_balance_recomputed_from_ledger(kid):
    _, ledger, acc = kid
    ledger.deposit(acc.id, minutes=100, summary="in")
    ledger.spend(acc.id, minutes=30, summary="out")
    ledger.borrow(acc.id, minutes=20, summary="loan")
    # borrow: +20 liability, +20 asset, then spend 20 → asset unchanged by borrow
    bal = ledger.get_balance(acc.id)
    assert bal.asset.value == 70  # 100 - 30
    assert bal.liability.value == 20
    assert bal.net.value == 50


@pytest.mark.integration
def test_spend_default_and_manual(kid, conn):
    accounts, ledger, acc = kid
    execute(
        conn,
        "UPDATE settings SET default_spend_minutes = ? WHERE account_id = ?",
        (20, acc.id),
    )
    conn.commit()
    ledger.deposit(acc.id, minutes=100)

    e1 = ledger.spend(acc.id)  # default 20
    assert e1.amount_minutes == 20
    assert e1.category == LedgerCategory.SPEND

    e2 = ledger.spend(acc.id, minutes=15, summary="画画")
    assert e2.amount_minutes == 15
    assert e2.summary == "画画"
    assert ledger.get_balance(acc.id).asset.value == 65


@pytest.mark.integration
def test_spend_insufficient_asset(kid):
    _, ledger, acc = kid
    ledger.deposit(acc.id, minutes=5)
    with pytest.raises(DomainError) as ei:
        ledger.spend(acc.id, minutes=10)
    assert ei.value.code == ErrorCode.VALIDATION


@pytest.mark.integration
def test_borrow_writes_three_rows_same_correlation_and_one_pest(kid):
    _, ledger, acc = kid
    ledger.deposit(acc.id, minutes=100)
    entries = ledger.borrow(acc.id, minutes=25, summary="上网")
    assert len(entries) == 3
    assert [e.category for e in entries] == [
        LedgerCategory.BORROW,
        LedgerCategory.DEPOSIT,
        LedgerCategory.SPEND,
    ]
    assert entries[0].correlation_id == entries[1].correlation_id == entries[2].correlation_id
    assert entries[0].correlation_id

    bal = ledger.get_balance(acc.id)
    assert bal.asset.value == 100  # borrow credits then spends; net asset unchanged
    assert bal.liability.value == 25

    orn = ledger.get_ornaments(acc.id)
    assert orn.pest_count == 1
    assert orn.fruit_count == 1  # parent deposit only (borrow's deposit leg has no fruit)


@pytest.mark.integration
def test_borrow_without_prior_asset(kid):
    _, ledger, acc = kid
    entries = ledger.borrow(acc.id, minutes=15, summary="先借")
    assert len(entries) == 3
    bal = ledger.get_balance(acc.id)
    assert bal.asset.value == 0
    assert bal.liability.value == 15


@pytest.mark.integration
def test_repay_and_woodpecker_when_cleared(kid):
    _, ledger, acc = kid
    ledger.deposit(acc.id, minutes=100)
    ledger.borrow(acc.id, minutes=20)
    rows = ledger.repay(acc.id, minutes=10, summary="家务")
    assert len(rows) == 1
    assert rows[0].category == LedgerCategory.REPAY
    assert ledger.get_balance(acc.id).liability.value == 10
    assert ledger.get_ornaments(acc.id).woodpecker_count == 0

    ledger.repay(acc.id, minutes=10, summary="阅读")
    assert ledger.get_balance(acc.id).liability.value == 0
    assert ledger.get_ornaments(acc.id).woodpecker_count == 1
    assert ledger.get_ornaments(acc.id).pest_count == 0  # 负债清零消灭虫


@pytest.mark.integration
def test_repay_excess_becomes_asset(kid):
    _, ledger, acc = kid
    ledger.borrow(acc.id, minutes=10)
    rows = ledger.repay(acc.id, minutes=30, summary="存入超额")
    assert [e.category for e in rows] == [
        LedgerCategory.REPAY,
        LedgerCategory.DEPOSIT,
    ]
    assert rows[0].amount_minutes == 10
    assert rows[1].amount_minutes == 20
    assert rows[0].correlation_id == rows[1].correlation_id
    bal = ledger.get_balance(acc.id)
    assert bal.liability.value == 0
    assert bal.asset.value == 20
    assert ledger.get_ornaments(acc.id).woodpecker_count == 1
    assert ledger.get_ornaments(acc.id).fruit_count == 1  # 存入奖励 1 星


@pytest.mark.integration
def test_repay_with_zero_liability_only_deposits(kid):
    _, ledger, acc = kid
    rows = ledger.repay(acc.id, minutes=15, summary="无债存入")
    assert len(rows) == 1
    assert rows[0].category == LedgerCategory.DEPOSIT
    assert rows[0].amount_minutes == 15
    assert ledger.get_balance(acc.id).asset.value == 15
    assert ledger.get_balance(acc.id).liability.value == 0
    assert ledger.get_ornaments(acc.id).woodpecker_count == 0
    assert ledger.get_ornaments(acc.id).fruit_count == 1  # 存入奖励星


@pytest.mark.integration
def test_repay_preset_uses_default_repay_minutes(kid, conn):
    _, ledger, acc = kid
    execute(
        conn,
        "UPDATE settings SET default_repay_minutes = ? WHERE account_id = ?",
        (20, acc.id),
    )
    conn.commit()
    ledger.deposit(acc.id, minutes=100)
    ledger.borrow(acc.id, minutes=40)
    rows = ledger.repay_preset(acc.id, scene="做家务")
    assert len(rows) == 1
    assert rows[0].amount_minutes == 20
    assert "做家务" in (rows[0].summary or "")


@pytest.mark.integration
def test_ornament_events_audit_star_sun_pest_bird(kid):
    _, ledger, acc = kid
    ledger.deposit(acc.id, minutes=10)
    events = ledger.list_ornament_events(acc.id)
    assert any(e["kind"] == "star" and e["delta"] == 1 and e["reason"] == "deposit" for e in events)

    ledger.borrow(acc.id, minutes=5)
    events = ledger.list_ornament_events(acc.id)
    assert any(e["kind"] == "pest" and e["delta"] == 1 for e in events)

    ledger.repay(acc.id, minutes=5)
    events = ledger.list_ornament_events(acc.id)
    assert any(e["kind"] == "woodpecker" and e["delta"] == 1 for e in events)
    assert any(e["kind"] == "pest" and e["delta"] == -1 for e in events)
    assert ledger.get_ornaments(acc.id).pest_count == 0

    # 98 more stars → 2+98=100 → convert to sun
    for _ in range(98):
        ledger.deposit(acc.id, minutes=1)
    orn = ledger.get_ornaments(acc.id)
    assert orn.golden_fruit_count >= 1
    events = ledger.list_ornament_events(acc.id)
    assert any(e["kind"] == "sun" and e["reason"] == "star_conversion" for e in events)

    # 果入审计：累积净利息满 100 → +1 果
    ledger.post_interest(acc.id, minutes=100, side="asset")
    events = ledger.list_ornament_events(acc.id)
    assert any(e["kind"] == "fruit" and e["delta"] == 1 and e["reason"] == "interest" for e in events)
    assert ledger.get_ornaments(acc.id).interest_fruit_count == 1


@pytest.mark.integration
def test_deposit_adds_star_auto_grant_and_interest_do_not(kid):
    _, ledger, acc = kid
    ledger.deposit(acc.id, minutes=10)
    ledger.auto_grant(acc.id, minutes=10)
    ledger.post_interest(acc.id, minutes=5, side="asset")
    ledger.post_interest(acc.id, minutes=2, side="liability")

    orn = ledger.get_ornaments(acc.id)
    assert orn.fruit_count == 1  # 仅手动存入发星
    assert orn.golden_fruit_count == 0
    assert orn.interest_fruit_count == 0  # 净利息 3 < 100，不发果
    events = ledger.list_ornament_events(acc.id)
    assert all(e["reason"] != "auto_grant" for e in events)

    bal = ledger.get_balance(acc.id)
    assert bal.asset.value == 25  # 10+10+5
    assert bal.liability.value == 2


@pytest.mark.integration
def test_hundred_fruits_convert_to_golden(kid):
    _, ledger, acc = kid
    for _ in range(100):
        ledger.deposit(acc.id, minutes=1)
    orn = ledger.get_ornaments(acc.id)
    assert orn.fruit_count == 0
    assert orn.golden_fruit_count == 1
    # one more deposit
    ledger.deposit(acc.id, minutes=1)
    orn2 = ledger.get_ornaments(acc.id)
    assert orn2.fruit_count == 1
    assert orn2.golden_fruit_count == 1
