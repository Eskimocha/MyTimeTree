"""Schema migrations for local SQLite."""

from __future__ import annotations

import sqlite3

from mytimetree.db.connection import execute

# Incremental migrations: (version, sql statements)
MIGRATIONS: list[tuple[int, list[str]]] = [
    (
        1,
        [
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                attributes_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS settings (
                account_id INTEGER PRIMARY KEY,
                daily_grant_minutes INTEGER NOT NULL DEFAULT 0,
                default_spend_minutes INTEGER NOT NULL DEFAULT 20,
                default_repay_minutes INTEGER NOT NULL DEFAULT 20,
                asset_interest_rate REAL NOT NULL DEFAULT 0,
                liability_interest_rate REAL NOT NULL DEFAULT 0,
                repay_presets_json TEXT NOT NULL DEFAULT '[]',
                display_colors_json TEXT NOT NULL DEFAULT '{}',
                extra_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS ledger_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                category TEXT NOT NULL,
                amount_minutes INTEGER NOT NULL,
                summary TEXT,
                correlation_id TEXT,
                meta_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
            )
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_ledger_account_created
            ON ledger_entries(account_id, created_at)
            """,
        ],
    ),
    (
        2,
        [
            """
            CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """,
        ],
    ),
    (
        3,
        [
            """
            CREATE TABLE IF NOT EXISTS tree_ornaments (
                account_id INTEGER PRIMARY KEY,
                fruit_count INTEGER NOT NULL DEFAULT 0,
                golden_fruit_count INTEGER NOT NULL DEFAULT 0,
                pest_count INTEGER NOT NULL DEFAULT 0,
                woodpecker_count INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
            )
            """,
        ],
    ),
    (
        4,
        [
            """
            CREATE TABLE IF NOT EXISTS balance_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                as_of TEXT NOT NULL,
                asset_minutes INTEGER NOT NULL,
                liability_minutes INTEGER NOT NULL,
                kind TEXT NOT NULL,
                UNIQUE(account_id, as_of, kind),
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
            )
            """,
        ],
    ),
    (
        5,
        [
            """
            CREATE TABLE IF NOT EXISTS membership (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                plan TEXT NOT NULL DEFAULT 'none',
                status TEXT NOT NULL DEFAULT 'not_enabled',
                expires_at TEXT,
                remote_customer_id TEXT,
                meta_json TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """,
            """
            INSERT OR IGNORE INTO membership (id, plan, status) VALUES (1, 'none', 'not_enabled')
            """,
        ],
    ),
]


def get_schema_version(conn: sqlite3.Connection) -> int:
    row = execute(
        conn,
        "SELECT name FROM sqlite_master WHERE type = ? AND name = ?",
        ("table", "schema_migrations"),
    ).fetchone()
    if row is None:
        return 0
    ver = execute(conn, "SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations").fetchone()
    return int(ver["v"] if ver is not None else 0)


def apply_migrations(conn: sqlite3.Connection) -> int:
    current = get_schema_version(conn)
    # bootstrap migrations table may not exist yet — handled inside first migration
    for version, statements in MIGRATIONS:
        if version <= current:
            continue
        for sql in statements:
            execute(conn, sql)
        # record after statements; schema_migrations created in v1 first statement
        execute(
            conn,
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))",
            (version,),
        )
        conn.commit()
        current = version
    return current
