"""H0.3 — habit schema migration skeleton (idempotent)."""

from __future__ import annotations

import pytest

from mytimetree.db.connection import connect, execute
from mytimetree.db.migrate import HABIT_MIGRATION_VERSION, apply_migrations, get_schema_version


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "habit-h0.db"


@pytest.mark.integration
def test_habit_tables_created_by_migration(db_path):
    conn = connect(db_path)
    try:
        version = apply_migrations(conn)
        assert version >= HABIT_MIGRATION_VERSION
        assert get_schema_version(conn) == version

        tables = {
            row[0]
            for row in execute(
                conn,
                "SELECT name FROM sqlite_master WHERE type = ? ORDER BY name",
                ("table",),
            ).fetchall()
        }
        for name in (
            "habit_templates",
            "habits",
            "exchange_rules",
            "habit_logs",
            "earned_credits",
            "parent_scripts",
            "offline_celebration_hints",
            "parent_prompt_state",
        ):
            assert name in tables, f"missing table {name}"
    finally:
        conn.close()


@pytest.mark.integration
def test_habit_migration_idempotent(db_path):
    conn = connect(db_path)
    try:
        v1 = apply_migrations(conn)
        v2 = apply_migrations(conn)
        assert v1 == v2
        assert v1 >= HABIT_MIGRATION_VERSION
    finally:
        conn.close()
