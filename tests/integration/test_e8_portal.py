"""E8 — mobile-first portal UI + account shell APIs."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from mytimetree.api.app import create_app
from mytimetree.db.connection import connect
from mytimetree.db.migrate import apply_migrations
from mytimetree.domain.time import APP_TZ, FakeClock
from mytimetree.services.accounts import AccountService
from mytimetree.services.analytics import AnalyticsService
from mytimetree.services.ledger import LedgerService
from mytimetree.services.ledger_query import LedgerQueryService
from mytimetree.services.persistence import PersistenceGuard
from mytimetree.services.security import ConfirmTokenService
from mytimetree.services.settings import SettingsService
from mytimetree.services.tree import TreeService

CHECKLIST = Path("/Users/fangkai/编程/mytimetree-tdd/docs/portal-design-checklist.md")
STATIC = Path("/Users/fangkai/编程/mytimetree-tdd/src/mytimetree/static/portal")


@pytest.fixture
def env(tmp_path):
    conn = connect(tmp_path / "e8.db")
    apply_migrations(conn)
    clock = FakeClock(datetime(2026, 8, 12, 12, 0, 0, tzinfo=APP_TZ))
    accounts = AccountService(conn, clock=clock)
    ledger = LedgerService(conn, accounts=accounts, clock=clock)
    tree = TreeService(conn, accounts=accounts, ledger=ledger, clock=clock)
    tokens = ConfirmTokenService(conn, accounts=accounts, clock=clock)
    settings = SettingsService(conn, accounts=accounts, clock=clock, tokens=tokens)
    query = LedgerQueryService(conn, accounts=accounts)
    analytics = AnalyticsService(conn, accounts=accounts, ledger=ledger, clock=clock)
    persistence = PersistenceGuard(settings=settings)
    app = create_app(
        conn=conn,
        backup_dir=tmp_path / "backups",
        clock=clock,
        accounts=accounts,
        ledger=ledger,
        settings=settings,
        persistence=persistence,
        ledger_query=query,
        analytics=analytics,
        tree=tree,
    )
    client = TestClient(app)
    yield {
        "conn": conn,
        "client": client,
        "accounts": accounts,
        "ledger": ledger,
        "clock": clock,
    }
    conn.close()


# --- E8.1 ---


@pytest.mark.unit
def test_design_checklist_covers_mobile_brand_rules():
    text = CHECKLIST.read_text(encoding="utf-8")
    for needle in (
        "移动优先",
        "品牌",
        "浅色",
        "主屏一屏",
        "进账红",
        "支出绿",
        "账户切换",
        "首启开户",
    ):
        assert needle in text


@pytest.mark.integration
def test_portal_static_assets_served(env):
    client = env["client"]
    r = client.get("/")
    assert r.status_code == 200
    assert "MyTimeTree" in r.text
    assert 'id="app"' in r.text or 'id="portal"' in r.text

    css = client.get("/static/portal/styles.css")
    assert css.status_code == 200
    assert "--brand" in css.text or "--leaf" in css.text

    js = client.get("/static/portal/app.js")
    assert js.status_code == 200
    assert "openAccount" in js.text or "open_account" in js.text


# --- E8.2 / E8.6 ---


@pytest.mark.integration
def test_bootstrap_forces_onboarding_when_no_accounts(env):
    r = env["client"].get("/api/portal/bootstrap")
    assert r.status_code == 200
    body = r.json()
    assert body["needs_onboarding"] is True
    assert body["accounts"] == []
    assert body["current_account_id"] is None


@pytest.mark.integration
def test_open_and_switch_accounts(env):
    client = env["client"]
    r = client.post(
        "/api/accounts",
        json={"name": "小明", "password": "pass", "asset_interest_rate": 0.01},
    )
    assert r.status_code == 200
    a = r.json()
    assert a["name"] == "小明"

    r2 = client.post(
        "/api/accounts",
        json={"name": "小红", "password": "pass", "asset_interest_rate": 0.0},
    )
    b = r2.json()
    boot = client.get("/api/portal/bootstrap").json()
    assert boot["needs_onboarding"] is False
    assert len(boot["accounts"]) == 2
    assert boot["current_account_id"] == b["id"]

    sw = client.post("/api/accounts/switch", json={"account_id": a["id"]})
    assert sw.status_code == 200
    assert client.get("/api/portal/bootstrap").json()["current_account_id"] == a["id"]


# --- E8.3 ---


@pytest.mark.integration
def test_home_shows_balance_tree_and_actions(env):
    client = env["client"]
    acc = client.post(
        "/api/accounts",
        json={"name": "小明", "password": "p", "asset_interest_rate": 0.0},
    ).json()
    client.post("/api/portal/deposit", json={"minutes": 120, "summary": "奖励"})
    home = client.get("/api/portal/home").json()
    assert home["account"]["id"] == acc["id"]
    assert home["balance"]["asset"] == 120
    assert home["tree"]["stage"] in (
        "germinate",
        "sapling",
        "young",
        "tall",
        "big",
        "giant",
        "fruiting",
        "sprout",
        "break_soil",
        "seed",
    )
    assert "ornaments" in home["tree"]

    spend = client.post("/api/portal/spend", json={"minutes": 20, "summary": "上网"})
    assert spend.status_code == 200
    assert client.get("/api/portal/home").json()["balance"]["asset"] == 100

    borrow = client.post("/api/portal/borrow", json={"minutes": 10, "summary": "借玩"})
    assert borrow.status_code == 200
    home2 = client.get("/api/portal/home").json()
    assert home2["balance"]["liability"] == 10
    assert home2["tree"]["ornaments"]["pest_count"] >= 1

    repay = client.post("/api/portal/repay", json={"minutes": 10, "summary": "家务"})
    assert repay.status_code == 200
    assert client.get("/api/portal/home").json()["balance"]["liability"] == 0


# --- E8.4 / E8.5 ---


@pytest.mark.integration
def test_portal_ledger_settings_analytics_tabs_data(env):
    client = env["client"]
    client.post(
        "/api/accounts",
        json={"name": "小明", "password": "p", "asset_interest_rate": 0.0},
    )
    client.post("/api/portal/deposit", json={"minutes": 80})
    client.post("/api/portal/spend", json={"minutes": 15, "summary": "视频"})

    boot = client.get("/api/portal/bootstrap").json()
    aid = boot["current_account_id"]
    led = client.get(f"/api/ledger?account_id={aid}").json()
    assert led["total"] >= 2
    assert "display" in led["items"][0]

    st = client.get(f"/api/settings?account_id={aid}").json()
    assert "daily_grant_minutes" in st
    up = client.patch(
        "/api/settings",
        json={"account_id": aid, "daily_grant_minutes": 25},
    )
    assert up.status_code == 200
    assert up.json()["daily_grant_minutes"] == 25

    week = client.get(f"/api/analytics/weekly?account_id={aid}").json()
    assert "ending_asset" in week
    month = client.get(f"/api/analytics/monthly?account_id={aid}").json()
    assert month["granularity"] == "month"


@pytest.mark.unit
def test_portal_markup_has_shell_tabs_and_onboarding():
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    for needle in (
        "account-shell",
        "tab-home",
        "tab-ledger",
        "tab-settings",
        "tab-analytics",
        "onboarding",
        "btn-spend",
        "btn-borrow",
        "btn-repay",
    ):
        assert needle in html
