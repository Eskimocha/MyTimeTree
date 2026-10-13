"""H6 habit read models: timeline, category agg, daily achievement, board."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Any

from mytimetree.db.connection import execute
from mytimetree.domain.habit import (
    BoardMilestone,
    HabitLog,
    iso_week_key,
    weekly_board_milestone,
)
from mytimetree.domain.habit_display import label_for_category
from mytimetree.domain.time import Clock, SystemClock, ensure_app_tz
from mytimetree.services.accounts import AccountService
from mytimetree.services.habit import HabitService


@dataclass(frozen=True, slots=True)
class TimelinePage:
    items: list[HabitLog]
    total: int
    limit: int
    offset: int


@dataclass(frozen=True, slots=True)
class CategoryAgg:
    category: str
    label: str
    count: int
    minutes: int


@dataclass(frozen=True, slots=True)
class DailyAchievement:
    account_id: int
    day_key: str
    completed_habit_ids: list[int]
    minutes_earned: int
    minutes_redeemed: int
    minutes_pending: int


@dataclass(frozen=True, slots=True)
class BoardEntry:
    habit_log_id: int
    habit_id: int
    habit_title: str
    category: str
    day_key: str
    completed_at: str
    minutes: int
    credit_status: str | None


@dataclass(frozen=True, slots=True)
class HabitRecordBoard:
    account_id: int
    range_from: str
    range_to: str
    entries: list[BoardEntry]
    stats: dict[str, Any]


class HabitQueryService:
    def __init__(
        self,
        conn: sqlite3.Connection,
        *,
        accounts: AccountService,
        habits: HabitService,
        clock: Clock | None = None,
    ) -> None:
        self._conn = conn
        self._accounts = accounts
        self._habits = habits
        self._clock = clock or SystemClock()

    def timeline(
        self,
        account_id: int,
        *,
        limit: int = 20,
        offset: int = 0,
    ) -> TimelinePage:
        self._accounts.get_account(account_id)
        limit = max(1, min(int(limit), 100))
        offset = max(0, int(offset))
        total_row = execute(
            self._conn,
            "SELECT COUNT(*) AS c FROM habit_logs "
            "WHERE account_id = ? AND voided_at IS NULL",
            (account_id,),
        ).fetchone()
        total = int(total_row["c"]) if total_row else 0
        rows = execute(
            self._conn,
            "SELECT id, account_id, habit_id, completed_at, source, day_key "
            "FROM habit_logs WHERE account_id = ? AND voided_at IS NULL "
            "ORDER BY completed_at DESC, id DESC LIMIT ? OFFSET ?",
            (account_id, limit, offset),
        ).fetchall()
        items = [
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
        return TimelinePage(items=items, total=total, limit=limit, offset=offset)

    def aggregate_by_category(self, account_id: int) -> list[CategoryAgg]:
        self._accounts.get_account(account_id)
        rows = execute(
            self._conn,
            """
            SELECT h.category AS category,
                   COUNT(l.id) AS cnt,
                   COALESCE(SUM(c.minutes), 0) AS minutes
            FROM habit_logs l
            JOIN habits h ON h.id = l.habit_id
            LEFT JOIN earned_credits c ON c.habit_log_id = l.id
                AND c.status IN ('pending', 'redeemed')
            WHERE l.account_id = ? AND l.voided_at IS NULL
            GROUP BY h.category
            ORDER BY h.category ASC
            """,
            (account_id,),
        ).fetchall()
        return [
            CategoryAgg(
                category=str(r["category"]),
                label=label_for_category(str(r["category"])),
                count=int(r["cnt"]),
                minutes=int(r["minutes"]),
            )
            for r in rows
        ]

    def daily_achievement(self, account_id: int, day_key: str) -> DailyAchievement:
        self._accounts.get_account(account_id)
        rows = execute(
            self._conn,
            """
            SELECT l.habit_id AS habit_id,
                   c.minutes AS minutes,
                   c.status AS status
            FROM habit_logs l
            LEFT JOIN earned_credits c ON c.habit_log_id = l.id
            WHERE l.account_id = ? AND l.day_key = ? AND l.voided_at IS NULL
            ORDER BY l.id ASC
            """,
            (account_id, day_key),
        ).fetchall()
        habit_ids = [int(r["habit_id"]) for r in rows]
        earned = 0
        redeemed = 0
        pending = 0
        for r in rows:
            mins = int(r["minutes"] or 0)
            status = r["status"]
            if status is None:
                continue
            earned += mins
            if status == "redeemed":
                redeemed += mins
            elif status == "pending":
                pending += mins
        return DailyAchievement(
            account_id=account_id,
            day_key=day_key,
            completed_habit_ids=habit_ids,
            minutes_earned=earned,
            minutes_redeemed=redeemed,
            minutes_pending=pending,
        )

    def record_board(
        self,
        account_id: int,
        *,
        range_from: str,
        range_to: str,
    ) -> HabitRecordBoard:
        self._accounts.get_account(account_id)
        rows = execute(
            self._conn,
            """
            SELECT l.id AS habit_log_id, l.habit_id, h.title, h.category,
                   l.day_key, l.completed_at,
                   c.minutes AS minutes, c.status AS credit_status
            FROM habit_logs l
            JOIN habits h ON h.id = l.habit_id
            LEFT JOIN earned_credits c ON c.habit_log_id = l.id
            WHERE l.account_id = ?
              AND l.voided_at IS NULL
              AND l.day_key >= ?
              AND l.day_key <= ?
            ORDER BY l.completed_at DESC, l.id DESC
            """,
            (account_id, range_from, range_to),
        ).fetchall()
        entries = [
            BoardEntry(
                habit_log_id=int(r["habit_log_id"]),
                habit_id=int(r["habit_id"]),
                habit_title=str(r["title"]),
                category=str(r["category"]),
                day_key=str(r["day_key"]),
                completed_at=str(r["completed_at"]),
                minutes=int(r["minutes"] or 0),
                credit_status=str(r["credit_status"]) if r["credit_status"] is not None else None,
            )
            for r in rows
        ]
        redeemed = sum(e.minutes for e in entries if e.credit_status == "redeemed")
        pending = sum(e.minutes for e in entries if e.credit_status == "pending")
        by_cat: dict[str, int] = {}
        for e in entries:
            by_cat[e.category] = by_cat.get(e.category, 0) + 1
        return HabitRecordBoard(
            account_id=account_id,
            range_from=range_from,
            range_to=range_to,
            entries=entries,
            stats={
                "total_logs": len(entries),
                "by_category": by_cat,
                "minutes_redeemed": redeemed,
                "minutes_pending": pending,
            },
        )

    def pending_board_milestones(self, account_id: int) -> list[BoardMilestone]:
        """Milestones that would fire but are not yet recorded (H6.6 / H5.5)."""
        self._accounts.get_account(account_id)
        today = ensure_app_tz(self._clock.now()).date().isoformat()
        week_key = iso_week_key(today)
        rows = execute(
            self._conn,
            "SELECT day_key FROM habit_logs WHERE account_id = ? AND voided_at IS NULL",
            (account_id,),
        ).fetchall()
        count = sum(1 for r in rows if iso_week_key(str(r["day_key"])) == week_key)
        milestone = weekly_board_milestone(week_key=week_key, log_count=count)
        if milestone is None:
            return []
        existing = execute(
            self._conn,
            "SELECT id FROM celebration_events WHERE account_id = ? AND milestone_id = ?",
            (account_id, milestone.milestone_id),
        ).fetchone()
        if existing is not None:
            return []
        return [milestone]
