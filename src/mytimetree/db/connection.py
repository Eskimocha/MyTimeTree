"""SQLite connection helpers — always use parameterized queries."""

from __future__ import annotations

import sqlite3
from pathlib import Path


def connect(db_path: Path | str) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # check_same_thread=False: FastAPI runs sync routes in a threadpool
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def execute(
    conn: sqlite3.Connection,
    sql: str,
    params: tuple | list | dict | None = None,
) -> sqlite3.Cursor:
    """Run SQL with bound parameters only (never f-string values into SQL)."""
    if params is None:
        return conn.execute(sql)
    return conn.execute(sql, params)
