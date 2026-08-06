"""E6 — backup artifacts, download API, reconcile, persistence flush."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from mytimetree.api.app import create_app
from mytimetree.db.connection import connect, execute
from mytimetree.db.migrate import apply_migrations
from mytimetree.domain.errors import DomainError, ErrorCode
from mytimetree.domain.time import APP_TZ, FakeClock
from mytimetree.jobs.runner import JobRunner
from mytimetree.services.accounts import AccountService
from mytimetree.services.backup import BackupService, create_daily_backup
from mytimetree.services.ledger import LedgerService
from mytimetree.services.persistence import PersistenceGuard
from mytimetree.services.reconcile import reconcile_accounts, save_month_end_snapshots
from mytimetree.services.settings import SettingsService
from mytimetree.services.security import ConfirmTokenService


@pytest.fixture
def env(tmp_path):
    conn = connect(tmp_path / "e6.db")
    apply_migrations(conn)
    clock = FakeClock(datetime(2026, 8, 15, 0, 0, 0, tzinfo=APP_TZ))
    accounts = AccountService(conn, clock=clock)
    ledger = LedgerService(conn, accounts=accounts, clock=clock)
    tokens = ConfirmTokenService(conn, accounts=accounts, clock=clock)
    settings = SettingsService(conn, accounts=accounts, clock=clock, tokens=tokens)
    backup_dir = tmp_path / "backups"
    backups = BackupService(backup_dir=backup_dir)
    runner = JobRunner(
        conn,
        accounts=accounts,
        ledger=ledger,
        clock=clock,
        backup_dir=backup_dir,
    )
    persistence = PersistenceGuard(settings=settings)
    yield {
        "conn": conn,
        "clock": clock,
        "accounts": accounts,
        "ledger": ledger,
        "settings": settings,
        "tokens": tokens,
        "backups": backups,
        "backup_dir": backup_dir,
        "runner": runner,
        "persistence": persistence,
        "tmp_path": tmp_path,
    }
    conn.close()


# --- E6.1 ---


@pytest.mark.integration
def test_daily_backup_artifact_parseable_and_listable(env):
    accounts, ledger, backups, clock = (
        env["accounts"],
        env["ledger"],
        env["backups"],
        env["clock"],
    )
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.01)
    ledger.deposit(acc.id, minutes=50)

    result = create_daily_backup(
        env["conn"],
        accounts=accounts,
        ledger=ledger,
        backup_dir=env["backup_dir"],
        now=clock.now(),
        kind="daily",
    )
    assert result.path.exists()
    data = json.loads(result.path.read_text(encoding="utf-8"))
    assert data["kind"] == "daily"
    assert data["balances"][str(acc.id)]["asset"] == 50
    assert len(data["settings"]) == 1
    assert len(data["ledger_entries"]) >= 1

    listed = backups.list_artifacts()
    assert len(listed) == 1
    assert listed[0].path == result.path
    assert listed[0].kind == "daily"
    loaded = backups.read_artifact(result.path.name)
    assert loaded["balances"][str(acc.id)]["asset"] == 50


@pytest.mark.integration
def test_backup_rejects_path_traversal(env):
    with pytest.raises(DomainError) as ei:
        env["backups"].read_artifact("../secret.json")
    assert ei.value.code == ErrorCode.FORBIDDEN


# --- E6.2 ---


@pytest.mark.integration
def test_backup_download_api(env):
    accounts, ledger, clock = env["accounts"], env["ledger"], env["clock"]
    accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    create_daily_backup(
        env["conn"],
        accounts=accounts,
        ledger=ledger,
        backup_dir=env["backup_dir"],
        now=clock.now(),
    )
    app = create_app(
        conn=env["conn"],
        backup_dir=env["backup_dir"],
        clock=clock,
        accounts=accounts,
        ledger=ledger,
        settings=env["settings"],
        persistence=env["persistence"],
    )
    client = TestClient(app)
    r = client.get("/api/backups")
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["download_url"].startswith("/api/backups/")
    assert item["filename"].endswith(".json")

    dl = client.get(item["download_url"])
    assert dl.status_code == 200
    assert dl.headers["content-type"].startswith("application/json")
    payload = dl.json()
    assert "ledger_entries" in payload
    assert "balances" in payload

    bad = client.get("/api/backups/..%2Fetc%2Fpasswd")
    assert bad.status_code in (400, 403, 404)


# --- E6.3 ---


@pytest.mark.integration
def test_month_end_reconcile_ok_with_prior_snapshot(env):
    accounts, ledger, clock, conn = (
        env["accounts"],
        env["ledger"],
        env["clock"],
        env["conn"],
    )
    clock.set(datetime(2026, 7, 31, 0, 0, 0, tzinfo=APP_TZ))
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    ledger.deposit(acc.id, minutes=100)
    save_month_end_snapshots(conn, ledger=ledger, now=clock.now())

    clock.set(datetime(2026, 8, 10, 12, 0, 0, tzinfo=APP_TZ))
    ledger.deposit(acc.id, minutes=20)
    ledger.spend(acc.id, minutes=10)

    clock.set(datetime(2026, 8, 31, 0, 0, 0, tzinfo=APP_TZ))
    report = reconcile_accounts(conn, ledger=ledger, now=clock.now())
    assert report.ok is True
    assert any("ok" in d for d in report.details)


@pytest.mark.integration
def test_month_end_reconcile_fails_on_artificial_diff(env):
    accounts, ledger, clock, conn = (
        env["accounts"],
        env["ledger"],
        env["clock"],
        env["conn"],
    )
    clock.set(datetime(2026, 8, 31, 0, 0, 0, tzinfo=APP_TZ))
    acc = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    ledger.deposit(acc.id, minutes=80)
    execute(
        conn,
        "INSERT INTO balance_snapshots "
        "(account_id, as_of, asset_minutes, liability_minutes, kind) "
        "VALUES (?, ?, ?, ?, ?)",
        (acc.id, "2026-07-31", 1, 0, "month_end"),
    )
    conn.commit()
    report = reconcile_accounts(conn, ledger=ledger, now=clock.now())
    assert report.ok is False
    assert any("expected" in d for d in report.details)


@pytest.mark.integration
def test_month_end_writes_reconcile_backup_kind(env):
    accounts, ledger, runner, clock, backups = (
        env["accounts"],
        env["ledger"],
        env["runner"],
        env["clock"],
        env["backups"],
    )
    clock.set(datetime(2026, 8, 31, 0, 0, 0, tzinfo=APP_TZ))
    accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    report = runner.run_midnight()
    assert "reconcile" in report.steps
    assert report.reconcile is not None
    kinds = {a.kind for a in backups.list_artifacts()}
    assert "daily" in kinds
    assert "monthly_reconcile" in kinds


# --- E6.4 ---


@pytest.mark.integration
def test_persistence_dirty_flush_and_can_close(env):
    accounts, settings, persistence, tokens = (
        env["accounts"],
        env["settings"],
        env["persistence"],
        env["tokens"],
    )
    a = accounts.open_account(name="小明", password="p", asset_interest_rate=0.01)
    accounts.switch_account(a.id)

    assert persistence.can_close() is True
    assert persistence.is_dirty() is False

    persistence.set_draft(a.id, daily_grant_minutes=40)
    assert persistence.is_dirty() is True
    assert persistence.can_close() is False
    # 尚未 flush：DB 仍为旧值
    assert settings.get(a.id).daily_grant_minutes == 0

    status = persistence.flush()
    assert status.flushed is True
    assert persistence.is_dirty() is False
    assert persistence.can_close() is True
    assert settings.get(a.id).daily_grant_minutes == 40


@pytest.mark.integration
def test_persistence_discard_clears_dirty_without_write(env):
    accounts, settings, persistence = (
        env["accounts"],
        env["settings"],
        env["persistence"],
    )
    a = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    accounts.switch_account(a.id)
    persistence.set_draft(a.id, default_spend_minutes=9)
    persistence.discard()
    assert persistence.is_dirty() is False
    assert settings.get(a.id).default_spend_minutes == 20


@pytest.mark.integration
def test_persistence_api_status_and_flush(env):
    accounts = env["accounts"]
    a = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    accounts.switch_account(a.id)
    app = create_app(
        conn=env["conn"],
        backup_dir=env["backup_dir"],
        clock=env["clock"],
        accounts=accounts,
        ledger=env["ledger"],
        settings=env["settings"],
        persistence=env["persistence"],
    )
    client = TestClient(app)

    r0 = client.get("/api/persistence/status")
    assert r0.status_code == 200
    assert r0.json()["dirty"] is False
    assert r0.json()["can_close"] is True

    env["persistence"].set_draft(a.id, daily_grant_minutes=12)
    r1 = client.get("/api/persistence/status")
    assert r1.json()["dirty"] is True
    assert r1.json()["can_close"] is False

    r2 = client.post("/api/persistence/flush")
    assert r2.status_code == 200
    assert r2.json()["flushed"] is True
    assert env["settings"].get(a.id).daily_grant_minutes == 12
