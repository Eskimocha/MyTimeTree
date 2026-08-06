"""E5 — per-account settings CRUD + security guards."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from mytimetree.db.connection import connect
from mytimetree.db.migrate import apply_migrations
from mytimetree.domain.errors import DomainError, ErrorCode
from mytimetree.domain.sanitize import SUMMARY_MAX_LEN, sanitize_summary
from mytimetree.domain.time import APP_TZ, FakeClock
from mytimetree.services.accounts import AccountService
from mytimetree.services.ledger import LedgerService
from mytimetree.services.security import AccessGuard, ConfirmTokenService
from mytimetree.services.settings import SettingsService


@pytest.fixture
def env(tmp_path):
    conn = connect(tmp_path / "e5.db")
    apply_migrations(conn)
    clock = FakeClock(datetime(2026, 8, 5, 12, 0, 0, tzinfo=APP_TZ))
    accounts = AccountService(conn, clock=clock)
    guard = AccessGuard(conn, accounts=accounts)
    tokens = ConfirmTokenService(conn, accounts=accounts, clock=clock)
    settings = SettingsService(conn, accounts=accounts, clock=clock, tokens=tokens)
    ledger = LedgerService(conn, accounts=accounts, clock=clock)
    yield {
        "conn": conn,
        "clock": clock,
        "accounts": accounts,
        "settings": settings,
        "guard": guard,
        "tokens": tokens,
        "ledger": ledger,
    }
    conn.close()


# --- E5.1 ---


@pytest.mark.integration
def test_settings_crud_and_isolation_across_accounts(env):
    accounts, settings = env["accounts"], env["settings"]
    a = accounts.open_account(name="小明", password="pa", asset_interest_rate=0.01)
    b = accounts.open_account(name="小红", password="pb", asset_interest_rate=0.02)

    sa = settings.get(a.id)
    assert sa.daily_grant_minutes == 0
    assert sa.default_spend_minutes == 20
    assert sa.asset_interest_rate == pytest.approx(0.01)
    assert sa.liability_interest_rate == pytest.approx(0.005)

    accounts.switch_account(a.id)
    settings.update(
        a.id,
        daily_grant_minutes=30,
        default_spend_minutes=15,
        default_repay_minutes=25,
        repay_presets=["做家务", "阅读"],
    )
    sa2 = settings.get(a.id)
    assert sa2.daily_grant_minutes == 30
    assert sa2.default_spend_minutes == 15
    assert sa2.default_repay_minutes == 25
    assert sa2.repay_presets == ["做家务", "阅读"]

    # 小红设置未被污染
    sb = settings.get(b.id)
    assert sb.daily_grant_minutes == 0
    assert sb.default_spend_minutes == 20
    assert sb.asset_interest_rate == pytest.approx(0.02)


@pytest.mark.integration
def test_settings_update_rejects_negative_rates_and_minutes(env):
    accounts, settings = env["accounts"], env["settings"]
    a = accounts.open_account(name="小明", password="pa", asset_interest_rate=0.01)
    with pytest.raises(DomainError) as ei:
        settings.update(a.id, daily_grant_minutes=-1)
    assert ei.value.code == ErrorCode.VALIDATION
    with pytest.raises(DomainError) as ei2:
        settings.update(a.id, asset_interest_rate=-0.1)
    assert ei2.value.code == ErrorCode.VALIDATION


# --- E5.2 ---


@pytest.mark.integration
def test_verify_password_and_wrong_password(env):
    accounts, guard = env["accounts"], env["guard"]
    a = accounts.open_account(name="小明", password="secret-ok", asset_interest_rate=0.0)
    guard.verify_password(a.id, "secret-ok")
    with pytest.raises(DomainError) as ei:
        guard.verify_password(a.id, "wrong")
    assert ei.value.code == ErrorCode.FORBIDDEN


@pytest.mark.integration
def test_access_guard_forbids_cross_account(env):
    accounts, guard, settings = env["accounts"], env["guard"], env["settings"]
    a = accounts.open_account(name="小明", password="pa", asset_interest_rate=0.0)
    b = accounts.open_account(name="小红", password="pb", asset_interest_rate=0.0)
    accounts.switch_account(a.id)

    guard.require_current_account(a.id)
    with pytest.raises(DomainError) as ei:
        guard.require_current_account(b.id)
    assert ei.value.code == ErrorCode.FORBIDDEN

    # 设置更新也走守卫：只能改当前账户
    with pytest.raises(DomainError) as ei2:
        settings.update(b.id, daily_grant_minutes=5)
    assert ei2.value.code == ErrorCode.FORBIDDEN


# --- E5.3 ---


@pytest.mark.integration
def test_confirm_token_required_for_rate_change(env):
    accounts, settings, tokens = env["accounts"], env["settings"], env["tokens"]
    a = accounts.open_account(name="小明", password="pa", asset_interest_rate=0.01)
    accounts.switch_account(a.id)

    with pytest.raises(DomainError) as ei:
        settings.update(a.id, asset_interest_rate=0.02)
    assert ei.value.code == ErrorCode.FORBIDDEN
    assert "确认" in ei.value.message or "confirm" in ei.value.message.lower()

    token = tokens.issue(action="update_rates", account_id=a.id)
    settings.update(a.id, asset_interest_rate=0.02, confirm_token=token)
    assert settings.get(a.id).asset_interest_rate == pytest.approx(0.02)
    # 默认负债日利率不自动改（显式传才改）；未传则保持原值
    assert settings.get(a.id).liability_interest_rate == pytest.approx(0.005)

    # token 一次性
    with pytest.raises(DomainError) as ei2:
        settings.update(a.id, asset_interest_rate=0.03, confirm_token=token)
    assert ei2.value.code == ErrorCode.FORBIDDEN


@pytest.mark.integration
def test_confirm_token_expires(env):
    accounts, tokens, clock = env["accounts"], env["tokens"], env["clock"]
    a = accounts.open_account(name="小明", password="pa", asset_interest_rate=0.01)
    accounts.switch_account(a.id)
    token = tokens.issue(action="update_rates", account_id=a.id, ttl_seconds=60)
    clock.set(clock.now() + timedelta(seconds=61))
    with pytest.raises(DomainError) as ei:
        tokens.consume(token, action="update_rates", account_id=a.id)
    assert ei.value.code == ErrorCode.FORBIDDEN


@pytest.mark.integration
def test_confirm_token_wrong_action_or_account(env):
    accounts, tokens = env["accounts"], env["tokens"]
    a = accounts.open_account(name="小明", password="pa", asset_interest_rate=0.0)
    b = accounts.open_account(name="小红", password="pb", asset_interest_rate=0.0)
    accounts.switch_account(a.id)
    token = tokens.issue(action="update_rates", account_id=a.id)
    with pytest.raises(DomainError):
        tokens.consume(token, action="other", account_id=a.id)
    token2 = tokens.issue(action="update_rates", account_id=a.id)
    with pytest.raises(DomainError):
        tokens.consume(token2, action="update_rates", account_id=b.id)


# --- E5.4 ---


@pytest.mark.unit
def test_sanitize_summary_strips_control_and_limits_length():
    assert sanitize_summary(None) is None
    assert sanitize_summary("  正常摘要  ") == "正常摘要"
    assert sanitize_summary("a\x00b") == "ab"
    assert sanitize_summary("x" * (SUMMARY_MAX_LEN + 50)) == "x" * SUMMARY_MAX_LEN
    # 脚本标签被剥离
    assert "<" not in (sanitize_summary("<script>alert(1)</script>你好") or "")
    assert "你好" in (sanitize_summary("<script>alert(1)</script>你好") or "")


@pytest.mark.unit
def test_sanitize_rejects_only_empty_after_clean():
    with pytest.raises(DomainError) as ei:
        sanitize_summary("\x00\x01  ")
    assert ei.value.code == ErrorCode.VALIDATION


@pytest.mark.integration
def test_ledger_sanitizes_summary_on_write(env):
    accounts, ledger = env["accounts"], env["ledger"]
    a = accounts.open_account(name="小明", password="pa", asset_interest_rate=0.0)
    ledger.deposit(a.id, minutes=50, summary="<b>奖励</b>\x00  ")
    entries = ledger.list_entries(a.id)
    assert entries[0].summary == "奖励"
    long = "果" * (SUMMARY_MAX_LEN + 10)
    ledger.deposit(a.id, minutes=10, summary=long)
    assert len(ledger.list_entries(a.id)[-1].summary or "") == SUMMARY_MAX_LEN
