"""Production / local entrypoint for MyTimeTree portal."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI

from mytimetree.api.app import create_app
from mytimetree.db.connection import connect
from mytimetree.db.migrate import apply_migrations
from mytimetree.services.accounts import AccountService
from mytimetree.services.analytics import AnalyticsService
from mytimetree.services.ledger import LedgerService
from mytimetree.services.ledger_query import LedgerQueryService
from mytimetree.services.membership import MembershipService
from mytimetree.services.persistence import PersistenceGuard
from mytimetree.services.remote_sync import RemoteSyncClient
from mytimetree.services.security import ConfirmTokenService
from mytimetree.services.settings import SettingsService
from mytimetree.services.tree import TreeService


def build_app() -> FastAPI:
    """Wire SQLite + services for a single-process deploy (PORT from env)."""
    data_dir = Path(os.getenv("MYTIMETREE_DATA_DIR", "/tmp/mytimetree"))
    data_dir.mkdir(parents=True, exist_ok=True)
    db_path = data_dir / "mytimetree.db"
    backup_dir = data_dir / "backups"

    conn = connect(db_path)
    apply_migrations(conn)

    accounts = AccountService(conn)
    ledger = LedgerService(conn, accounts=accounts)
    tree = TreeService(conn, accounts=accounts, ledger=ledger)
    tokens = ConfirmTokenService(conn, accounts=accounts)
    settings = SettingsService(conn, accounts=accounts, tokens=tokens)
    persistence = PersistenceGuard(settings=settings)
    ledger_query = LedgerQueryService(conn, accounts=accounts)
    analytics = AnalyticsService(conn, accounts=accounts, ledger=ledger)
    membership = MembershipService(conn)
    remote_sync = RemoteSyncClient(
        base_url=os.getenv("REMOTE_SYNC_BASE_URL"),
        token=os.getenv("REMOTE_SYNC_TOKEN"),
    )

    # Honor PORT for platforms that inspect the app module (uvicorn still uses CLI PORT).
    _ = int(os.getenv("PORT", "8000"))

    return create_app(
        conn=conn,
        backup_dir=backup_dir,
        accounts=accounts,
        ledger=ledger,
        settings=settings,
        persistence=persistence,
        ledger_query=ledger_query,
        analytics=analytics,
        tree=tree,
        membership=membership,
        remote_sync=remote_sync,
    )


app: FastAPI = build_app()
