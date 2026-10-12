"""Habit application service: enable, archive, complete (H1; redeem later)."""

from __future__ import annotations

import sqlite3

from mytimetree.db.connection import execute
from mytimetree.domain.errors import DomainError, ErrorCode, ensure
from mytimetree.domain.habit import (
    HABIT_SCHEMA_VERSION_HINT,
    Habit,
    HabitDraft,
    HabitLog,
    require_micro,
)
from mytimetree.domain.time import Clock, SystemClock, ensure_app_tz
from mytimetree.services.accounts import AccountService
from mytimetree.services.habit_templates import get_template_by_slug


def scaffold_ok() -> bool:
    return HABIT_SCHEMA_VERSION_HINT >= 6


class HabitService:
    def __init__(
        self,
        conn: sqlite3.Connection,
        *,
        accounts: AccountService,
        clock: Clock | None = None,
    ) -> None:
        self._conn = conn
        self._accounts = accounts
        self._clock = clock or SystemClock()

    def enable_from_template(self, account_id: int, template_slug: str) -> Habit:
        self._accounts.get_account(account_id)
        tmpl = get_template_by_slug(self._conn, template_slug)
        ensure(tmpl.active, ErrorCode.VALIDATION, f"种子未启用: {template_slug}")
        require_micro(
            HabitDraft(title=tmpl.title, category=tmpl.category, est_minutes=tmpl.est_minutes)
        )
        now = ensure_app_tz(self._clock.now()).isoformat()
        cur = execute(
            self._conn,
            "INSERT INTO habits (account_id, template_id, title, category, est_minutes, "
            "archived_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)",
            (account_id, tmpl.id, tmpl.title, tmpl.category, tmpl.est_minutes, now),
        )
        self._conn.commit()
        return self.get_habit(account_id, int(cur.lastrowid))

    def enable_custom(
        self,
        account_id: int,
        *,
        title: str,
        category: str,
        est_minutes: int,
    ) -> Habit:
        self._accounts.get_account(account_id)
        cleaned = title.strip()
        draft = HabitDraft(title=cleaned, category=category, est_minutes=est_minutes)
        require_micro(draft)
        now = ensure_app_tz(self._clock.now()).isoformat()
        cur = execute(
            self._conn,
            "INSERT INTO habits (account_id, template_id, title, category, est_minutes, "
            "archived_at, created_at) VALUES (?, NULL, ?, ?, ?, NULL, ?)",
            (account_id, cleaned, category, est_minutes, now),
        )
        self._conn.commit()
        return self.get_habit(account_id, int(cur.lastrowid))

    def list_habits(self, account_id: int, *, include_archived: bool = False) -> list[Habit]:
        self._accounts.get_account(account_id)
        if include_archived:
            rows = execute(
                self._conn,
                "SELECT id, account_id, template_id, title, category, est_minutes, "
                "archived_at, created_at FROM habits WHERE account_id = ? ORDER BY id ASC",
                (account_id,),
            ).fetchall()
        else:
            rows = execute(
                self._conn,
                "SELECT id, account_id, template_id, title, category, est_minutes, "
                "archived_at, created_at FROM habits WHERE account_id = ? "
                "AND archived_at IS NULL ORDER BY id ASC",
                (account_id,),
            ).fetchall()
        return [self._row_to_habit(r) for r in rows]

    def get_habit(self, account_id: int, habit_id: int) -> Habit:
        self._accounts.get_account(account_id)
        row = execute(
            self._conn,
            "SELECT id, account_id, template_id, title, category, est_minutes, "
            "archived_at, created_at FROM habits WHERE id = ? AND account_id = ?",
            (habit_id, account_id),
        ).fetchone()
        if row is None:
            raise DomainError(ErrorCode.NOT_FOUND, f"习惯不存在: {habit_id}")
        return self._row_to_habit(row)

    def archive_habit(self, account_id: int, habit_id: int) -> Habit:
        habit = self.get_habit(account_id, habit_id)
        if habit.archived_at is not None:
            return habit
        now = ensure_app_tz(self._clock.now()).isoformat()
        execute(
            self._conn,
            "UPDATE habits SET archived_at = ? WHERE id = ? AND account_id = ?",
            (now, habit_id, account_id),
        )
        self._conn.commit()
        return self.get_habit(account_id, habit_id)

    def complete_habit(
        self,
        account_id: int,
        habit_id: int,
        *,
        source: str = "parent",
    ) -> HabitLog:
        """Record completion (H1.4 gate + H3 precursor). No credit/redeem yet."""
        habit = self.get_habit(account_id, habit_id)
        ensure(
            habit.archived_at is None,
            ErrorCode.HABIT_ARCHIVED,
            "已归档习惯不可再记录",
        )
        now = ensure_app_tz(self._clock.now())
        day_key = now.date().isoformat()
        completed_at = now.isoformat()
        try:
            cur = execute(
                self._conn,
                "INSERT INTO habit_logs (account_id, habit_id, completed_at, source, day_key) "
                "VALUES (?, ?, ?, ?, ?)",
                (account_id, habit_id, completed_at, source, day_key),
            )
        except sqlite3.IntegrityError as exc:
            raise DomainError(
                ErrorCode.HABIT_ALREADY_LOGGED,
                f"今日已记录该习惯: {day_key}",
            ) from exc
        self._conn.commit()
        return HabitLog(
            id=int(cur.lastrowid),
            account_id=account_id,
            habit_id=habit_id,
            completed_at=completed_at,
            source=source,
            day_key=day_key,
        )

    def list_logs(
        self,
        account_id: int,
        *,
        habit_id: int | None = None,
    ) -> list[HabitLog]:
        self._accounts.get_account(account_id)
        if habit_id is None:
            rows = execute(
                self._conn,
                "SELECT id, account_id, habit_id, completed_at, source, day_key "
                "FROM habit_logs WHERE account_id = ? AND voided_at IS NULL "
                "ORDER BY id ASC",
                (account_id,),
            ).fetchall()
        else:
            rows = execute(
                self._conn,
                "SELECT id, account_id, habit_id, completed_at, source, day_key "
                "FROM habit_logs WHERE account_id = ? AND habit_id = ? "
                "AND voided_at IS NULL ORDER BY id ASC",
                (account_id, habit_id),
            ).fetchall()
        return [
            HabitLog(
                id=int(r["id"]),
                account_id=int(r["account_id"]),
                habit_id=int(r["habit_id"]),
                completed_at=str(r["completed_at"]),
                source=str(r["source"]),
                day_key=str(r["day_key"]),
            )
            for r in rows
        ]

    @staticmethod
    def _row_to_habit(row: sqlite3.Row) -> Habit:
        return Habit(
            id=int(row["id"]),
            account_id=int(row["account_id"]),
            template_id=int(row["template_id"]) if row["template_id"] is not None else None,
            title=str(row["title"]),
            category=str(row["category"]),
            est_minutes=int(row["est_minutes"]),
            archived_at=str(row["archived_at"]) if row["archived_at"] is not None else None,
            created_at=str(row["created_at"]),
        )
