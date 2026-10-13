"""H8 backup/analytics + H9 parent guidance / snooze."""

from __future__ import annotations

import json
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from mytimetree.api.app import create_app
from mytimetree.db.connection import connect
from mytimetree.db.migrate import apply_migrations
from mytimetree.domain.time import APP_TZ, FakeClock
from mytimetree.services.accounts import AccountService
from mytimetree.services.analytics import AnalyticsService
from mytimetree.services.backup import create_daily_backup
from mytimetree.services.habit import HabitService
from mytimetree.services.habit_query import HabitQueryService
from mytimetree.services.habit_templates import seed_templates_into_db
from mytimetree.services.ledger import LedgerService
from mytimetree.services.parent_guidance import seed_parent_guidance_into_db
from mytimetree.services.tree import TreeService


@pytest.fixture
def env(tmp_path):
    conn = connect(tmp_path / "h89.db")
    apply_migrations(conn)
    seed_templates_into_db(conn)
    seed_parent_guidance_into_db(conn)
    clock = FakeClock(datetime(2026, 10, 13, 18, 0, 0, tzinfo=APP_TZ))
    accounts = AccountService(conn, clock=clock)
    ledger = LedgerService(conn, accounts=accounts, clock=clock)
    tree = TreeService(conn, accounts=accounts, ledger=ledger, clock=clock)
    habits = HabitService(conn, accounts=accounts, clock=clock, ledger=ledger)
    habit_query = HabitQueryService(conn, accounts=accounts, habits=habits, clock=clock)
    analytics = AnalyticsService(conn, accounts=accounts, ledger=ledger, clock=clock)
    app = create_app(
        conn=conn,
        backup_dir=tmp_path / "backups",
        clock=clock,
        accounts=accounts,
        ledger=ledger,
        tree=tree,
        habits=habits,
        habit_query=habit_query,
        analytics=analytics,
    )
    client = TestClient(app)
    a = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    yield {
        "conn": conn,
        "client": client,
        "clock": clock,
        "accounts": accounts,
        "ledger": ledger,
        "habits": habits,
        "analytics": analytics,
        "a": a,
        "backup_dir": tmp_path / "backups",
    }
    conn.close()


@pytest.mark.integration
def test_complete_returns_parent_guidance(env):
    client = env["client"]
    today = client.get("/api/portal/habits/today").json()
    hid = today["items"][0]["habit_id"]
    res = client.post("/api/portal/habits/complete", json={"habit_id": hid}).json()
    assert res["parent_motivation_payload"]["message"]
    assert res["parent_script"]["script_text"]
    assert res["offline_hint"]["title"]
    # image_key may be null on some hints — body always present
    assert res["offline_hint"]["body"]


@pytest.mark.integration
def test_snooze_clears_badge_then_expires(env):
    habits: HabitService = env["habits"]
    clock: FakeClock = env["clock"]
    a = env["a"]
    habits.ensure_starter_habits(a.id)
    assert habits.badge_count(a.id) >= 1
    habits.snooze_badge(a.id, minutes=30)
    assert habits.badge_count(a.id) == 0
    clock.advance(minutes=31)
    assert habits.badge_count(a.id) >= 1


@pytest.mark.integration
def test_backup_includes_habit_tables(env):
    habits: HabitService = env["habits"]
    a = env["a"]
    habits.ensure_starter_habits(a.id)
    habits.complete_habit(a.id, habits.list_habits(a.id)[0].id)
    result = create_daily_backup(
        env["conn"],
        accounts=env["accounts"],
        ledger=env["ledger"],
        backup_dir=env["backup_dir"],
        now=env["clock"].now(),
    )
    data = json.loads(result.path.read_text(encoding="utf-8"))
    assert len(data["habits"]) >= 1
    assert len(data["habit_logs"]) >= 1
    assert len(data["parent_scripts"]) >= 12
    assert len(data["offline_celebration_hints"]) >= 8


@pytest.mark.integration
def test_weekly_habit_analytics_and_child_stub(env):
    client = env["client"]
    a = env["a"]
    client.get("/api/portal/habits/today")
    stats = client.get(f"/api/analytics/habits/weekly?account_id={a.id}").json()
    assert stats["enabled_habits"] >= 1
    assert "completion_rate" in stats
    stub = client.post("/api/portal/habits/child-complete", json={"habit_id": 1}).json()
    assert stub["skipped"] is True
    assert stub["code"] == "child_entry_not_enabled"
