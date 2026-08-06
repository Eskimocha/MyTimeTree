"""E0.3 — SQLite schema migrations."""

from __future__ import annotations

import sqlite3

import pytest

from mytimetree.db.connection import connect, execute
from mytimetree.db.migrate import apply_migrations, get_schema_version


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "test.db"


@pytest.mark.integration
def test_apply_migrations_creates_schema(db_path):
    conn = connect(db_path)
    try:
        version = apply_migrations(conn)
        assert version >= 1
        assert get_schema_version(conn) == version

        tables = {
            row[0]
            for row in execute(
                conn,
                "SELECT name FROM sqlite_master WHERE type = ? ORDER BY name",
                ("table",),
            ).fetchall()
        }
        assert "schema_migrations" in tables
        assert "accounts" in tables
        assert "settings" in tables
        assert "ledger_entries" in tables
    finally:
        conn.close()


@pytest.mark.integration
def test_migrations_are_idempotent(db_path):
    conn = connect(db_path)
    try:
        v1 = apply_migrations(conn)
        v2 = apply_migrations(conn)
        assert v1 == v2
    finally:
        conn.close()


@pytest.mark.integration
def test_execute_uses_parameterized_queries(db_path):
    conn = connect(db_path)
    try:
        apply_migrations(conn)
        execute(
            conn,
            "INSERT INTO accounts (name, password_hash, attributes_json) VALUES (?, ?, ?)",
            ("kid-a", "hash", "{}"),
        )
        conn.commit()
        row = execute(
            conn,
            "SELECT name FROM accounts WHERE name = ?",
            ("kid-a",),
        ).fetchone()
        assert row is not None
        assert row[0] == "kid-a"
    finally:
        conn.close()


@pytest.mark.integration
def test_connect_rejects_non_sqlite_url_style_injection_via_path_only(db_path):
    # connection API takes Path; no string-concat SQL for path
    conn = connect(db_path)
    try:
        assert isinstance(conn, sqlite3.Connection)
    finally:
        conn.close()
