"""E9 — membership stub + remote sync placeholders."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from mytimetree.api.app import create_app
from mytimetree.db.connection import connect
from mytimetree.db.migrate import apply_migrations, get_schema_version
from mytimetree.domain.time import APP_TZ, FakeClock
from mytimetree.services.accounts import AccountService
from mytimetree.services.analytics import AnalyticsService
from mytimetree.services.ledger import LedgerService
from mytimetree.services.ledger_query import LedgerQueryService
from mytimetree.services.membership import MembershipService
from mytimetree.services.persistence import PersistenceGuard
from mytimetree.services.remote_sync import RemoteSyncClient, SyncResult
from mytimetree.services.security import ConfirmTokenService
from mytimetree.services.settings import SettingsService
from mytimetree.services.tree import TreeService


@pytest.fixture
def env(tmp_path):
    conn = connect(tmp_path / "e9.db")
    apply_migrations(conn)
    clock = FakeClock(datetime(2026, 8, 12, 12, 0, 0, tzinfo=APP_TZ))
    accounts = AccountService(conn, clock=clock)
    ledger = LedgerService(conn, accounts=accounts, clock=clock)
    tree = TreeService(conn, accounts=accounts, ledger=ledger, clock=clock)
    tokens = ConfirmTokenService(conn, accounts=accounts, clock=clock)
    settings = SettingsService(conn, accounts=accounts, clock=clock, tokens=tokens)
    membership = MembershipService(conn)
    remote = RemoteSyncClient()
    app = create_app(
        conn=conn,
        backup_dir=tmp_path / "backups",
        clock=clock,
        accounts=accounts,
        ledger=ledger,
        settings=settings,
        persistence=PersistenceGuard(settings=settings),
        ledger_query=LedgerQueryService(conn, accounts=accounts),
        analytics=AnalyticsService(conn, accounts=accounts, ledger=ledger, clock=clock),
        tree=tree,
        membership=membership,
        remote_sync=remote,
    )
    yield {
        "conn": conn,
        "client": TestClient(app),
        "accounts": accounts,
        "ledger": ledger,
        "membership": membership,
        "remote": remote,
    }
    conn.close()


# --- E9.1 ---


@pytest.mark.integration
def test_schema_has_membership_table(env):
    assert get_schema_version(env["conn"]) >= 5
    row = env["conn"].execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='membership'"
    ).fetchone()
    assert row is not None


@pytest.mark.integration
def test_membership_status_returns_disabled(env):
    status = env["membership"].get_status()
    assert status.enabled is False
    assert status.code == "not_enabled"
    assert "未启用" in status.message

    r = env["client"].get("/api/membership")
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is False
    assert body["code"] == "not_enabled"
    assert "未启用" in body["message"]


@pytest.mark.integration
def test_membership_does_not_block_main_path(env):
    client = env["client"]
    boot = client.get("/api/portal/bootstrap").json()
    assert boot["needs_onboarding"] is True
    assert boot["membership"]["enabled"] is False

    acc = client.post(
        "/api/accounts",
        json={"name": "小明", "password": "p", "asset_interest_rate": 0.0},
    ).json()
    client.post("/api/portal/deposit", json={"minutes": 30})
    home = client.get("/api/portal/home").json()
    assert home["account"]["id"] == acc["id"]
    assert home["balance"]["asset"] == 30


# --- E9.2 ---


@pytest.mark.unit
def test_remote_sync_stub_is_noop_with_documented_hooks():
    src = Path("/Users/fangkai/编程/mytimetree-tdd/src/mytimetree/services/remote_sync.py")
    text = src.read_text(encoding="utf-8")
    for needle in (
        "SYNC_POINT",
        "push_ledger",
        "pull_membership",
        "V1 stub",
    ):
        assert needle in text

    client = RemoteSyncClient()
    assert client.is_configured() is False
    push = client.push_ledger(account_id=1, entries=[])
    assert isinstance(push, SyncResult)
    assert push.ok is False
    assert push.skipped is True
    pull = client.pull_membership()
    assert pull.skipped is True
    assert pull.ok is False


@pytest.mark.integration
def test_remote_sync_api_reports_unavailable(env):
    r = env["client"].post("/api/sync/push")
    assert r.status_code == 200
    body = r.json()
    assert body["skipped"] is True
    assert body["ok"] is False
