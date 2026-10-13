"""H7 — portal habit API + markup contracts."""

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
from mytimetree.services.habit import HabitService
from mytimetree.services.habit_query import HabitQueryService
from mytimetree.services.habit_templates import seed_templates_into_db
from mytimetree.services.ledger import LedgerService
from mytimetree.services.tree import TreeService

_REPO = Path(__file__).resolve().parents[2]
CHECKLIST = _REPO / "docs" / "v2" / "habit-portal-design-checklist.md"
STATIC = _REPO / "src" / "mytimetree" / "static" / "portal"


@pytest.fixture
def env(tmp_path):
    conn = connect(tmp_path / "h7.db")
    apply_migrations(conn)
    seed_templates_into_db(conn)
    clock = FakeClock(datetime(2026, 10, 13, 16, 0, 0, tzinfo=APP_TZ))
    accounts = AccountService(conn, clock=clock)
    ledger = LedgerService(conn, accounts=accounts, clock=clock)
    tree = TreeService(conn, accounts=accounts, ledger=ledger, clock=clock)
    habits = HabitService(conn, accounts=accounts, clock=clock, ledger=ledger)
    habit_query = HabitQueryService(conn, accounts=accounts, habits=habits, clock=clock)
    app = create_app(
        conn=conn,
        backup_dir=tmp_path / "backups",
        clock=clock,
        accounts=accounts,
        ledger=ledger,
        tree=tree,
        habits=habits,
        habit_query=habit_query,
    )
    client = TestClient(app)
    accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    yield {"client": client, "conn": conn}
    conn.close()


@pytest.mark.unit
def test_habit_design_checklist_exists():
    text = CHECKLIST.read_text(encoding="utf-8")
    for needle in ("习惯 Tab", "小庆祝", "好习惯总表", "小红点", "移动优先"):
        assert needle in text


@pytest.mark.unit
def test_portal_markup_has_habits_tab():
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    assert 'data-tab="habits"' in html
    assert 'id="habit-badge"' in html
    assert 'id="tab-habits"' in html
    assert "好习惯总表" in html
    js = (STATIC / "app.js").read_text(encoding="utf-8")
    assert "refreshHabits" in js
    assert "/api/portal/habits/complete" in js


@pytest.mark.integration
def test_today_auto_seeds_and_complete_redeem_flow(env):
    client = env["client"]
    today = client.get("/api/portal/habits/today").json()
    assert today["badge_count"] >= 1
    assert len(today["items"]) >= 3
    habit_id = today["items"][0]["habit_id"]

    done = client.post("/api/portal/habits/complete", json={"habit_id": habit_id}).json()
    assert done["log_id"] > 0
    assert done["motivation_payload"]["approach"]
    assert done["celebration"]["kind"] == "small"
    assert done["badge_count"] == today["badge_count"] - 1

    if done["credit"] and done["credit"]["status"] == "pending":
        redeemed = client.post(
            f"/api/portal/habits/credits/{done['credit']['id']}/redeem"
        ).json()
        assert redeemed["status"] == "redeemed"

    board = client.get("/api/portal/habits/board").json()
    assert board["stats"]["total_logs"] >= 1
    badge = client.get("/api/portal/habits/badge").json()
    assert "badge_count" in badge
