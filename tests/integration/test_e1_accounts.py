"""E1 — time accounts: open, list, switch, attributes."""

from __future__ import annotations

import pytest

from mytimetree.db.connection import connect, execute
from mytimetree.db.migrate import apply_migrations
from mytimetree.domain.errors import DomainError, ErrorCode
from mytimetree.domain.time import APP_TZ, FakeClock
from datetime import datetime

from mytimetree.services.accounts import AccountService
from mytimetree.services.password import hash_password, verify_password


@pytest.fixture
def conn(tmp_path):
    path = tmp_path / "e1.db"
    c = connect(path)
    apply_migrations(c)
    yield c
    c.close()


@pytest.fixture
def clock():
    return FakeClock(datetime(2026, 8, 5, 12, 0, 0, tzinfo=APP_TZ))


@pytest.fixture
def accounts(conn, clock):
    return AccountService(conn, clock=clock)


@pytest.mark.unit
def test_password_hash_roundtrip():
    h = hash_password("secret-1")
    assert h != "secret-1"
    assert verify_password("secret-1", h)
    assert not verify_password("wrong", h)


@pytest.mark.integration
def test_open_first_account_creates_settings(accounts, conn):
    acc = accounts.open_account(
        name="小明",
        password="pass1234",
        asset_interest_rate=0.05,
    )
    assert acc.id > 0
    assert acc.name == "小明"
    assert accounts.current_account_id() == acc.id

    row = execute(
        conn,
        "SELECT asset_interest_rate, liability_interest_rate FROM settings WHERE account_id = ?",
        (acc.id,),
    ).fetchone()
    assert row is not None
    assert row["asset_interest_rate"] == pytest.approx(0.05)
    assert row["liability_interest_rate"] == pytest.approx(0.025)


@pytest.mark.integration
def test_open_account_rejects_blank_name_or_password(accounts):
    with pytest.raises(DomainError) as ei:
        accounts.open_account(name="  ", password="x", asset_interest_rate=0.01)
    assert ei.value.code == ErrorCode.VALIDATION

    with pytest.raises(DomainError) as ei2:
        accounts.open_account(name="a", password="", asset_interest_rate=0.01)
    assert ei2.value.code == ErrorCode.VALIDATION


@pytest.mark.integration
def test_open_account_rejects_duplicate_name(accounts):
    accounts.open_account(name="小明", password="p1", asset_interest_rate=0.01)
    with pytest.raises(DomainError) as ei:
        accounts.open_account(name="小明", password="p2", asset_interest_rate=0.02)
    assert ei.value.code == ErrorCode.CONFLICT


@pytest.mark.integration
def test_require_account_blocks_when_empty(accounts):
    with pytest.raises(DomainError) as ei:
        accounts.require_current_account()
    assert ei.value.code == ErrorCode.FORBIDDEN
    assert "开户" in ei.value.message or "account" in ei.value.message.lower()


@pytest.mark.integration
def test_add_and_list_multiple_accounts(accounts):
    a = accounts.open_account(name="小明", password="p1", asset_interest_rate=0.01)
    b = accounts.open_account(name="小红", password="p2", asset_interest_rate=0.02)
    listed = accounts.list_accounts()
    names = {x.name for x in listed}
    assert names == {"小明", "小红"}
    assert {a.id, b.id} == {x.id for x in listed}


@pytest.mark.integration
def test_switch_current_account(accounts):
    a = accounts.open_account(name="小明", password="p1", asset_interest_rate=0.01)
    b = accounts.open_account(name="小红", password="p2", asset_interest_rate=0.02)
    # latest open becomes current by default
    assert accounts.current_account_id() == b.id
    accounts.switch_account(a.id)
    assert accounts.current_account_id() == a.id
    cur = accounts.require_current_account()
    assert cur.name == "小明"


@pytest.mark.integration
def test_switch_unknown_account_fails(accounts):
    accounts.open_account(name="小明", password="p1", asset_interest_rate=0.01)
    with pytest.raises(DomainError) as ei:
        accounts.switch_account(99999)
    assert ei.value.code == ErrorCode.NOT_FOUND


@pytest.mark.integration
def test_ledger_isolation_by_current_account(accounts, conn):
    a = accounts.open_account(name="小明", password="p1", asset_interest_rate=0.01)
    b = accounts.open_account(name="小红", password="p2", asset_interest_rate=0.02)
    execute(
        conn,
        "INSERT INTO ledger_entries (account_id, category, amount_minutes, summary, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (a.id, "deposit", 30, "a-only", "2026-08-05T12:00:00+08:00"),
    )
    execute(
        conn,
        "INSERT INTO ledger_entries (account_id, category, amount_minutes, summary, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (b.id, "deposit", 50, "b-only", "2026-08-05T12:00:00+08:00"),
    )
    conn.commit()

    accounts.switch_account(a.id)
    rows_a = accounts.list_ledger_for_current()
    assert [r["summary"] for r in rows_a] == ["a-only"]

    accounts.switch_account(b.id)
    rows_b = accounts.list_ledger_for_current()
    assert [r["summary"] for r in rows_b] == ["b-only"]


@pytest.mark.integration
def test_attributes_preserve_unknown_fields(accounts):
    acc = accounts.open_account(
        name="小明",
        password="p1",
        asset_interest_rate=0.01,
        attributes={"nickname": "明明", "custom_flag": True},
    )
    accounts.update_attributes(acc.id, {"nickname": "阿明", "extra": 1})
    loaded = accounts.get_account(acc.id)
    assert loaded.attributes["nickname"] == "阿明"
    assert loaded.attributes["custom_flag"] is True
    assert loaded.attributes["extra"] == 1


@pytest.mark.integration
def test_current_account_persists_across_service_instances(conn, clock):
    s1 = AccountService(conn, clock=clock)
    acc = s1.open_account(name="小明", password="p1", asset_interest_rate=0.01)
    s2 = AccountService(conn, clock=clock)
    assert s2.current_account_id() == acc.id
