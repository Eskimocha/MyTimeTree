"""Portal habit overview: timeline/category/rules + hint assets."""

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
from mytimetree.services.parent_guidance import seed_parent_guidance_into_db
from mytimetree.services.tree import TreeService

STATIC = Path(__file__).resolve().parents[2] / "src" / "mytimetree" / "static" / "portal"


@pytest.fixture
def env(tmp_path):
    conn = connect(tmp_path / "h7o.db")
    apply_migrations(conn)
    seed_templates_into_db(conn)
    seed_parent_guidance_into_db(conn)
    clock = FakeClock(datetime(2026, 10, 13, 19, 0, 0, tzinfo=APP_TZ))
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
    yield {"client": client}
    conn.close()


@pytest.mark.unit
def test_portal_has_timeline_rules_buttons_and_hint_svgs():
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    assert 'id="btn-habit-timeline"' in html
    assert 'id="btn-habit-rules"' in html
    js = (STATIC / "app.js").read_text(encoding="utf-8")
    assert "/api/portal/habits/overview" in js
    assert (STATIC / "hints" / "img-high-five.svg").is_file()


@pytest.mark.integration
def test_overview_and_rule_patch(env):
    client = env["client"]
    client.get("/api/portal/habits/today")
    overview = client.get("/api/portal/habits/overview").json()
    assert "timeline" in overview
    assert "categories" in overview
    assert len(overview["rules"]) >= 1
    rule_id = overview["rules"][0]["rule_id"]
    patched = client.patch(
        "/api/portal/habits/rules",
        json={"rule_id": rule_id, "minutes_per_completion": 8},
    ).json()
    assert patched["minutes_per_completion"] == 8
    svg = client.get("/static/portal/hints/img-high-five.svg")
    assert svg.status_code == 200
    assert "svg" in svg.text
