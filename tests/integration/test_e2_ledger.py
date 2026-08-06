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
    # borrow: +20 liability and -20 asset (forced spend)
    bal = ledger.get_balance(acc.id)
    assert bal.asset.value == 50  # 100 - 30 - 20
    assert bal.liability.value == 20
    assert bal.net.value == 30


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
def test_borrow_writes_two_rows_same_correlation_and_one_pest(kid):
    _, ledger, acc = kid
    ledger.deposit(acc.id, minutes=100)
    entries = ledger.borrow(acc.id, minutes=25, summary="上网")
    assert len(entries) == 2
    assert {e.category for e in entries} == {
        LedgerCategory.BORROW,
        LedgerCategory.SPEND,
    }
    assert entries[0].correlation_id == entries[1].correlation_id
    assert entries[0].correlation_id

    bal = ledger.get_balance(acc.id)
    assert bal.asset.value == 75
    assert bal.liability.value == 25

    orn = ledger.get_ornaments(acc.id)
    assert orn.pest_count == 1
    assert orn.fruit_count == 1  # deposit only


@pytest.mark.integration
def test_repay_and_woodpecker_when_cleared(kid):
    _, ledger, acc = kid
    ledger.deposit(acc.id, minutes=100)
    ledger.borrow(acc.id, minutes=20)
    ledger.repay(acc.id, minutes=10, summary="家务")
    assert ledger.get_balance(acc.id).liability.value == 10
    assert ledger.get_ornaments(acc.id).woodpecker_count == 0

    ledger.repay(acc.id, minutes=10, summary="阅读")
    assert ledger.get_balance(acc.id).liability.value == 0
    assert ledger.get_ornaments(acc.id).woodpecker_count == 1


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
    e = ledger.repay_preset(acc.id, scene="做家务")
    assert e.amount_minutes == 20
    assert "做家务" in (e.summary or "")


@pytest.mark.integration
def test_deposit_and_auto_grant_add_fruit_interest_does_not(kid):
    _, ledger, acc = kid
    ledger.deposit(acc.id, minutes=10)
    ledger.auto_grant(acc.id, minutes=10)
    ledger.post_interest(acc.id, minutes=5, side="asset")
    ledger.post_interest(acc.id, minutes=2, side="liability")

    orn = ledger.get_ornaments(acc.id)
    assert orn.fruit_count == 2
    assert orn.golden_fruit_count == 0

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
