"""E7 — ledger query, display colors, trend analytics."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from mytimetree.api.app import create_app
from mytimetree.db.connection import connect
from mytimetree.db.migrate import apply_migrations
from mytimetree.domain.display import (
    DisplayTone,
    ZH_CN_THEME,
    display_tone_for_category,
    theme_for_locale,
)
from mytimetree.domain.ledger import LedgerCategory
from mytimetree.domain.time import APP_TZ, FakeClock
from mytimetree.services.accounts import AccountService
from mytimetree.services.analytics import AnalyticsService
from mytimetree.services.ledger import LedgerService
from mytimetree.services.ledger_query import LedgerQueryService
from mytimetree.services.persistence import PersistenceGuard
from mytimetree.services.settings import SettingsService
from mytimetree.services.security import ConfirmTokenService


@pytest.fixture
def env(tmp_path):
    conn = connect(tmp_path / "e7.db")
    apply_migrations(conn)
    clock = FakeClock(datetime(2026, 8, 10, 12, 0, 0, tzinfo=APP_TZ))
    accounts = AccountService(conn, clock=clock)
    ledger = LedgerService(conn, accounts=accounts, clock=clock)
    tokens = ConfirmTokenService(conn, accounts=accounts, clock=clock)
    settings = SettingsService(conn, accounts=accounts, clock=clock, tokens=tokens)
    query = LedgerQueryService(conn, accounts=accounts)
    analytics = AnalyticsService(conn, accounts=accounts, ledger=ledger, clock=clock)
    yield {
        "conn": conn,
        "clock": clock,
        "accounts": accounts,
        "ledger": ledger,
        "settings": settings,
        "query": query,
        "analytics": analytics,
        "tmp_path": tmp_path,
    }
    conn.close()


def _seed_two_accounts(env):
    accounts, ledger, clock = env["accounts"], env["ledger"], env["clock"]
    a = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    b = accounts.open_account(name="小红", password="p", asset_interest_rate=0.0)
    clock.set(datetime(2026, 8, 1, 10, 0, 0, tzinfo=APP_TZ))
    ledger.deposit(a.id, minutes=100, summary="a1")
    clock.set(datetime(2026, 8, 2, 10, 0, 0, tzinfo=APP_TZ))
    ledger.spend(a.id, minutes=20, summary="a2")
    clock.set(datetime(2026, 8, 3, 10, 0, 0, tzinfo=APP_TZ))
    ledger.deposit(b.id, minutes=50, summary="b1")
    clock.set(datetime(2026, 8, 4, 10, 0, 0, tzinfo=APP_TZ))
    ledger.auto_grant(a.id, minutes=10, summary="a3")
    return a, b


# --- E7.1 ---


@pytest.mark.integration
def test_ledger_query_filter_by_account_and_category(env):
    query = env["query"]
    a, b = _seed_two_accounts(env)

    page_a = query.query(account_id=a.id)
    assert page_a.total == 3
    assert all(e.entry.account_id == a.id for e in page_a.items)

    page_spend = query.query(account_id=a.id, category=LedgerCategory.SPEND)
    assert page_spend.total == 1
    assert page_spend.items[0].entry.summary == "a2"

    page_b = query.query(account_id=b.id)
    assert page_b.total == 1
    assert page_b.items[0].entry.summary == "b1"


@pytest.mark.integration
def test_ledger_query_pagination_newest_first(env):
    query = env["query"]
    a, _ = _seed_two_accounts(env)

    p1 = query.query(account_id=a.id, limit=2, offset=0)
    assert p1.total == 3
    assert len(p1.items) == 2
    assert p1.items[0].entry.summary == "a3"  # newest
    assert p1.items[1].entry.summary == "a2"

    p2 = query.query(account_id=a.id, limit=2, offset=2)
    assert len(p2.items) == 1
    assert p2.items[0].entry.summary == "a1"
    assert p2.has_more is False


@pytest.mark.integration
def test_ledger_query_api(env):
    a, _ = _seed_two_accounts(env)
    app = create_app(
        conn=env["conn"],
        backup_dir=env["tmp_path"] / "backups",
        clock=env["clock"],
        accounts=env["accounts"],
        ledger=env["ledger"],
        settings=env["settings"],
        persistence=PersistenceGuard(settings=env["settings"]),
        ledger_query=env["query"],
        analytics=env["analytics"],
    )
    client = TestClient(app)
    r = client.get(f"/api/ledger?account_id={a.id}&limit=2")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    assert body["items"][0]["summary"] == "a3"
    assert "display" in body["items"][0]

    r2 = client.get(f"/api/ledger?account_id={a.id}&category=spend")
    assert r2.json()["total"] == 1


# --- E7.2 ---


@pytest.mark.unit
def test_zh_cn_income_red_expense_green():
    theme = theme_for_locale("zh-CN")
    assert theme.income_color == ZH_CN_THEME.income_color
    assert theme.expense_color == ZH_CN_THEME.expense_color
    assert theme.income_color.lower() in ("#e53935", "#f44336", "#d32f2f", "#c62828")
    assert theme.expense_color.lower() in ("#43a047", "#4caf50", "#388e3c", "#2e7d32")

    assert display_tone_for_category(LedgerCategory.DEPOSIT) == DisplayTone.INCOME
    assert display_tone_for_category(LedgerCategory.AUTO_GRANT) == DisplayTone.INCOME
    assert display_tone_for_category(LedgerCategory.SPEND) == DisplayTone.EXPENSE
    assert display_tone_for_category(LedgerCategory.BORROW) == DisplayTone.LIABILITY_UP
    assert display_tone_for_category(LedgerCategory.REPAY) == DisplayTone.LIABILITY_DOWN
    # 结息：资产侧视为进账色；负债侧另标
    assert display_tone_for_category(LedgerCategory.AUTO_INTEREST, side="asset") == DisplayTone.INCOME
    assert (
        display_tone_for_category(LedgerCategory.AUTO_INTEREST, side="liability")
        == DisplayTone.LIABILITY_UP
    )

    row = theme.color_for(DisplayTone.INCOME)
    assert row == theme.income_color
    assert theme.color_for(DisplayTone.EXPENSE) == theme.expense_color


@pytest.mark.unit
def test_en_locale_uses_western_convention_reserved():
    """非中文预留：进账绿/支出红（与中文相反），不阻塞主路径。"""
    en = theme_for_locale("en-US")
    zh = theme_for_locale("zh-CN")
    assert en.income_color != zh.income_color
    assert en.expense_color != zh.expense_color


# --- E7.3 ---


@pytest.mark.integration
def test_weekly_and_monthly_trends_fixed_dataset(env):
    accounts, ledger, clock, analytics = (
        env["accounts"],
        env["ledger"],
        env["clock"],
        env["analytics"],
    )
    a = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)

    # Week of Aug 3–9 2026 (Mon–Sun): deposits/spend/interest on known days
    clock.set(datetime(2026, 8, 3, 9, 0, 0, tzinfo=APP_TZ))  # Mon
    ledger.deposit(a.id, minutes=100)
    clock.set(datetime(2026, 8, 5, 9, 0, 0, tzinfo=APP_TZ))  # Wed
    ledger.spend(a.id, minutes=30)
    clock.set(datetime(2026, 8, 7, 9, 0, 0, tzinfo=APP_TZ))  # Fri
    ledger.post_interest(a.id, minutes=5, side="asset")
    clock.set(datetime(2026, 8, 10, 9, 0, 0, tzinfo=APP_TZ))  # next Mon — outside week
    ledger.deposit(a.id, minutes=40)

    clock.set(datetime(2026, 8, 9, 12, 0, 0, tzinfo=APP_TZ))
    week = analytics.weekly_trend(account_id=a.id, as_of=clock.now())
    assert week.period_start == "2026-08-03"
    assert week.period_end == "2026-08-09"
    assert week.entry_count == 3
    assert week.asset_in_minutes == 105  # 100 deposit + 5 interest
    assert week.asset_out_minutes == 30
    assert week.interest_minutes == 5
    assert week.ending_asset == 75  # 100-30+5
    assert week.ending_liability == 0
    assert len(week.series) == 7
    by_day = {p.date: p for p in week.series}
    assert by_day["2026-08-03"].asset == 100
    assert by_day["2026-08-05"].asset == 70
    assert by_day["2026-08-05"].net == 70
    assert by_day["2026-08-07"].asset == 75
    assert by_day["2026-08-07"].interest_net == 5
    assert by_day["2026-08-09"].asset == 75  # carry forward

    clock.set(datetime(2026, 8, 31, 12, 0, 0, tzinfo=APP_TZ))
    month = analytics.monthly_trend(account_id=a.id, as_of=clock.now())
    assert month.period_start == "2026-08-01"
    assert month.period_end == "2026-08-31"
    assert month.entry_count == 4
    assert month.asset_in_minutes == 145  # 100+5+40
    assert month.asset_out_minutes == 30
    assert month.interest_minutes == 5
    assert month.ending_asset == 115
    assert month.ending_liability == 0
    assert len(month.series) == 31
    assert month.series[-1].asset == 115
    assert month.series[-1].net == 115


@pytest.mark.integration
def test_analytics_api(env):
    accounts, ledger, clock = env["accounts"], env["ledger"], env["clock"]
    a = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    # Aug 10 2026 is Monday — deposit same ISO week as query as_of
    clock.set(datetime(2026, 8, 10, 10, 0, 0, tzinfo=APP_TZ))
    ledger.deposit(a.id, minutes=60)
    clock.set(datetime(2026, 8, 12, 12, 0, 0, tzinfo=APP_TZ))

    app = create_app(
        conn=env["conn"],
        backup_dir=env["tmp_path"] / "backups",
        clock=clock,
        accounts=accounts,
        ledger=ledger,
        settings=env["settings"],
        persistence=PersistenceGuard(settings=env["settings"]),
        ledger_query=env["query"],
        analytics=env["analytics"],
    )
    client = TestClient(app)
    rw = client.get(f"/api/analytics/weekly?account_id={a.id}")
    assert rw.status_code == 200
    assert rw.json()["entry_count"] == 1
    assert rw.json()["ending_asset"] == 60
    assert "series" in rw.json()
    assert len(rw.json()["series"]) == 7

    rm = client.get(f"/api/analytics/monthly?account_id={a.id}")
    assert rm.status_code == 200
    assert rm.json()["period_start"].startswith("2026-08")
    assert len(rm.json()["series"]) >= 28

    ev = client.get(f"/api/ornament-events?account_id={a.id}")
    assert ev.status_code == 200
    assert any(i["kind"] == "star" for i in ev.json()["items"])
