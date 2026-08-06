"""Backup artifacts for daily / month-end reconcile jobs."""

from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from mytimetree.db.connection import execute
from mytimetree.domain.backup import BackupArtifact, BackupKind
from mytimetree.domain.errors import DomainError, ErrorCode, ensure
from mytimetree.domain.time import ensure_app_tz
from mytimetree.services.accounts import AccountService
from mytimetree.services.ledger import LedgerService

_SAFE_NAME = re.compile(r"^backup_[\w.-]+\.json$")


@dataclass(frozen=True, slots=True)
class BackupResult:
    path: Path
    kind: BackupKind = "daily"


def create_daily_backup(
    conn: sqlite3.Connection,
    *,
    accounts: AccountService,
    ledger: LedgerService,
    backup_dir: Path,
    now: datetime,
    kind: BackupKind = "daily",
    extra: dict[str, Any] | None = None,
) -> BackupResult:
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = ensure_app_tz(now).strftime("%Y%m%d_%H%M%S")
    suffix = "" if kind == "daily" else f"_{kind}"
    path = backup_dir / f"backup_{stamp}{suffix}.json"

    account_rows = execute(
        conn,
        "SELECT id, name, attributes_json, created_at FROM accounts ORDER BY id",
    ).fetchall()
    settings_rows = execute(conn, "SELECT * FROM settings").fetchall()
    ledger_rows = execute(
        conn,
        "SELECT id, account_id, category, amount_minutes, summary, correlation_id, "
        "meta_json, created_at FROM ledger_entries ORDER BY id",
    ).fetchall()

    balances: dict[str, dict[str, int]] = {}
    for acc in accounts.list_accounts():
        bal = ledger.get_balance(acc.id)
        balances[str(acc.id)] = {
            "asset": bal.asset.value,
            "liability": bal.liability.value,
            "net": bal.net.value,
        }

    payload: dict[str, Any] = {
        "kind": kind,
        "created_at": ensure_app_tz(now).isoformat(),
        "accounts": [dict(r) for r in account_rows],
        "settings": [dict(r) for r in settings_rows],
        "ledger_entries": [dict(r) for r in ledger_rows],
        "balances": balances,
    }
    if extra:
        payload["extra"] = extra
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return BackupResult(path=path, kind=kind)


class BackupService:
    """List / safely read backup JSON files under an external directory."""

    def __init__(self, *, backup_dir: Path) -> None:
        self._dir = Path(backup_dir)

    @property
    def backup_dir(self) -> Path:
        return self._dir

    def list_artifacts(self) -> list[BackupArtifact]:
        if not self._dir.exists():
            return []
        items: list[BackupArtifact] = []
        for path in sorted(self._dir.glob("backup_*.json")):
            kind: BackupKind = "daily"
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                raw_kind = data.get("kind", "daily")
                if raw_kind in ("daily", "monthly_reconcile"):
                    kind = raw_kind
                created = data.get("created_at")
                created_at = datetime.fromisoformat(created) if created else None
            except (OSError, json.JSONDecodeError, ValueError):
                created_at = None
            items.append(
                BackupArtifact(path=path, kind=kind, created_at=created_at, filename=path.name)
            )
        return items

    def resolve_path(self, filename: str) -> Path:
        ensure(
            bool(filename) and "/" not in filename and "\\" not in filename,
            ErrorCode.FORBIDDEN,
            "非法备份文件名",
        )
        ensure(".." not in filename, ErrorCode.FORBIDDEN, "非法备份文件名")
        ensure(_SAFE_NAME.match(filename) is not None, ErrorCode.FORBIDDEN, "非法备份文件名")
        path = (self._dir / filename).resolve()
        root = self._dir.resolve()
        ensure(str(path).startswith(str(root)), ErrorCode.FORBIDDEN, "非法备份路径")
        ensure(path.is_file(), ErrorCode.NOT_FOUND, f"备份不存在: {filename}")
        return path

    def read_artifact(self, filename: str) -> dict[str, Any]:
        path = self.resolve_path(filename)
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise DomainError(ErrorCode.INTERNAL, "备份文件损坏") from exc
