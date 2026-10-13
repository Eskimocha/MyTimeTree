"""Habit application service: enable, archive, complete (H1; redeem later)."""

from __future__ import annotations

import json
import sqlite3
from typing import TYPE_CHECKING, Any

from mytimetree.db.connection import execute
from mytimetree.domain.errors import DomainError, ErrorCode, ensure
from mytimetree.domain.habit import (
    DEFAULT_MOTIVATION_PATHS,
    HABIT_SCHEMA_VERSION_HINT,
    CelebrationEvent,
    EarnedCredit,
    ExchangeRule,
    Habit,
    HabitCompletion,
    HabitDraft,
    HabitLog,
    MotivationPath,
    build_motivation_payload,
    compute_streak,
    iso_week_key,
    require_micro,
    validate_exchange_rule_fields,
    weekly_board_milestone,
)
from mytimetree.domain.time import Clock, SystemClock, ensure_app_tz
from mytimetree.services.accounts import AccountService
from mytimetree.services.habit_templates import get_template_by_slug

if TYPE_CHECKING:
    from mytimetree.services.ledger import LedgerService


STARTER_TEMPLATE_SLUGS: tuple[str, ...] = (
    "brush-teeth",
    "bedtime-on-time",
    "read-one-page",
)


def scaffold_ok() -> bool:
    return HABIT_SCHEMA_VERSION_HINT >= 6


class HabitService:
    def __init__(
        self,
        conn: sqlite3.Connection,
        *,
        accounts: AccountService,
        clock: Clock | None = None,
        ledger: LedgerService | None = None,
    ) -> None:
        self._conn = conn
        self._accounts = accounts
        self._clock = clock or SystemClock()
        self._ledger = ledger

    def today_key(self) -> str:
        return ensure_app_tz(self._clock.now()).date().isoformat()

    def ensure_starter_habits(self, account_id: int) -> list[Habit]:
        """Enable a few seed habits + default exchange rules when account has none."""
        existing = self.list_habits(account_id)
        if existing:
            return existing
        created: list[Habit] = []
        for slug in STARTER_TEMPLATE_SLUGS:
            try:
                h = self.enable_from_template(account_id, slug)
                self.create_exchange_rule(
                    account_id,
                    habit_id=h.id,
                    minutes_per_completion=5,
                    auto_redeem=False,
                )
                created.append(h)
            except DomainError:
                continue
        return created

    def badge_count(self, account_id: int) -> int:
        """Q10: count of active habits not yet logged today."""
        today = self.today_key()
        habits = self.list_habits(account_id)
        if not habits:
            return 0
        logged = {
            log.habit_id
            for log in self.list_logs(account_id)
            if log.day_key == today
        }
        return sum(1 for h in habits if h.id not in logged)

    def today_checklist(self, account_id: int) -> dict[str, Any]:
        today = self.today_key()
        habits = self.list_habits(account_id)
        logs_today = {log.habit_id: log for log in self.list_logs(account_id) if log.day_key == today}
        pending = {c.habit_log_id: c for c in self.list_pending_credits(account_id)}
        items = []
        for h in habits:
            log = logs_today.get(h.id)
            credit = pending.get(log.id) if log is not None else None
            items.append(
                {
                    "habit_id": h.id,
                    "title": h.title,
                    "category": h.category,
                    "done": log is not None,
                    "log_id": log.id if log is not None else None,
                    "pending_credit_id": credit.id if credit is not None else None,
                    "pending_minutes": credit.minutes if credit is not None else None,
                }
            )
        return {
            "day_key": today,
            "badge_count": self.badge_count(account_id),
            "items": items,
            "pending_credits": [
                {"id": c.id, "minutes": c.minutes, "habit_log_id": c.habit_log_id}
                for c in self.list_pending_credits(account_id)
            ],
        }

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
    ) -> HabitCompletion:
        """Record completion; optional EarnedCredit + auto_redeem (H3)."""
        habit = self.get_habit(account_id, habit_id)
        ensure(
            habit.archived_at is None,
            ErrorCode.HABIT_ARCHIVED,
            "已归档习惯不可再记录",
        )
        rule = self.active_rule_for_habit(account_id, habit_id)
        if rule is not None and self.can_earn_from_rule(rule):
            self.assert_within_daily_cap(
                account_id,
                rule.id,
                additional_minutes=rule.minutes_per_completion,
            )
            if rule.auto_redeem:
                ensure(
                    self._ledger is not None,
                    ErrorCode.INTERNAL,
                    "auto_redeem 需要 LedgerService",
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
            log_id = int(cur.lastrowid)
            log = HabitLog(
                id=log_id,
                account_id=account_id,
                habit_id=habit_id,
                completed_at=completed_at,
                source=source,
                day_key=day_key,
            )
            credit: EarnedCredit | None = None
            if rule is not None and self.can_earn_from_rule(rule):
                credit = self._insert_pending_credit(
                    account_id,
                    habit_log_id=log_id,
                    minutes=rule.minutes_per_completion,
                )
                if rule.auto_redeem:
                    assert self._ledger is not None
                    entry = self._ledger.habit_reward(
                        account_id,
                        rule.minutes_per_completion,
                        habit_log_id=log_id,
                        commit=False,
                    )
                    redeemed_at = ensure_app_tz(self._clock.now()).isoformat()
                    execute(
                        self._conn,
                        "UPDATE earned_credits SET status = ?, ledger_entry_id = ?, "
                        "redeemed_at = ? WHERE id = ?",
                        ("redeemed", entry.id, redeemed_at, credit.id),
                    )
                    credit = self.get_credit(account_id, credit.id)

            motivation = self._motivation_for_habit(account_id, habit)
            celeb_key = str(motivation.get("celebration_key") or "generic-spark")
            celebration = self._record_celebration(
                account_id,
                kind="small",
                celebration_key=celeb_key,
                habit_log_id=log_id,
                milestone_id=None,
                review_script_id=None,
                offline_hint_id=None,
                created_at=completed_at,
            )
            self._conn.commit()
        except sqlite3.IntegrityError as exc:
            self._conn.rollback()
            raise DomainError(
                ErrorCode.HABIT_ALREADY_LOGGED,
                f"今日已记录该习惯: {day_key}",
            ) from exc
        except Exception:
            self._conn.rollback()
            raise
        return HabitCompletion(
            log=log,
            credit=credit,
            motivation_payload=motivation,
            celebration=celebration,
        )

    def get_credit(self, account_id: int, credit_id: int) -> EarnedCredit:
        self._accounts.get_account(account_id)
        row = execute(
            self._conn,
            "SELECT id, account_id, habit_log_id, minutes, status, ledger_entry_id, redeemed_at "
            "FROM earned_credits WHERE id = ? AND account_id = ?",
            (credit_id, account_id),
        ).fetchone()
        if row is None:
            raise DomainError(ErrorCode.NOT_FOUND, f"积分不存在: {credit_id}")
        return self._row_to_credit(row)

    def _insert_pending_credit(
        self,
        account_id: int,
        *,
        habit_log_id: int,
        minutes: int,
    ) -> EarnedCredit:
        cur = execute(
            self._conn,
            "INSERT INTO earned_credits (account_id, habit_log_id, minutes, status) "
            "VALUES (?, ?, ?, 'pending')",
            (account_id, habit_log_id, minutes),
        )
        return self.get_credit(account_id, int(cur.lastrowid))

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

    def create_exchange_rule(
        self,
        account_id: int,
        *,
        habit_id: int,
        minutes_per_completion: int,
        cadence: str = "daily",
        auto_redeem: bool = False,
        daily_cap_minutes: int | None = None,
    ) -> ExchangeRule:
        habit = self.get_habit(account_id, habit_id)
        ensure(habit.archived_at is None, ErrorCode.VALIDATION, "已归档习惯不可设兑换规则")
        validate_exchange_rule_fields(
            minutes_per_completion=minutes_per_completion,
            cadence=cadence,
            auto_redeem=auto_redeem,
            daily_cap_minutes=daily_cap_minutes,
        )
        existing = execute(
            self._conn,
            "SELECT id FROM exchange_rules WHERE account_id = ? AND habit_id = ? "
            "AND active = 1",
            (account_id, habit_id),
        ).fetchone()
        ensure(
            existing is None,
            ErrorCode.CONFLICT,
            "该习惯已有启用中的兑换规则（每习惯默认仅一条）",
        )
        cur = execute(
            self._conn,
            "INSERT INTO exchange_rules ("
            "account_id, habit_id, minutes_per_completion, cadence, auto_redeem, "
            "daily_cap_minutes, active) VALUES (?, ?, ?, ?, ?, ?, 1)",
            (
                account_id,
                habit_id,
                minutes_per_completion,
                cadence,
                1 if auto_redeem else 0,
                daily_cap_minutes,
            ),
        )
        self._conn.commit()
        return self.get_exchange_rule(account_id, int(cur.lastrowid))

    def get_exchange_rule(self, account_id: int, rule_id: int) -> ExchangeRule:
        self._accounts.get_account(account_id)
        row = execute(
            self._conn,
            "SELECT id, account_id, habit_id, minutes_per_completion, cadence, "
            "auto_redeem, daily_cap_minutes, active FROM exchange_rules "
            "WHERE id = ? AND account_id = ?",
            (rule_id, account_id),
        ).fetchone()
        if row is None:
            raise DomainError(ErrorCode.NOT_FOUND, f"兑换规则不存在: {rule_id}")
        return self._row_to_rule(row)

    def list_exchange_rules(
        self,
        account_id: int,
        *,
        active_only: bool = False,
    ) -> list[ExchangeRule]:
        self._accounts.get_account(account_id)
        if active_only:
            rows = execute(
                self._conn,
                "SELECT id, account_id, habit_id, minutes_per_completion, cadence, "
                "auto_redeem, daily_cap_minutes, active FROM exchange_rules "
                "WHERE account_id = ? AND active = 1 ORDER BY id ASC",
                (account_id,),
            ).fetchall()
        else:
            rows = execute(
                self._conn,
                "SELECT id, account_id, habit_id, minutes_per_completion, cadence, "
                "auto_redeem, daily_cap_minutes, active FROM exchange_rules "
                "WHERE account_id = ? ORDER BY id ASC",
                (account_id,),
            ).fetchall()
        return [self._row_to_rule(r) for r in rows]

    def update_exchange_rule(
        self,
        account_id: int,
        rule_id: int,
        *,
        minutes_per_completion: int | None = None,
        cadence: str | None = None,
        auto_redeem: bool | None = None,
        daily_cap_minutes: int | None | object = ...,
    ) -> ExchangeRule:
        rule = self.get_exchange_rule(account_id, rule_id)
        minutes = (
            minutes_per_completion
            if minutes_per_completion is not None
            else rule.minutes_per_completion
        )
        cad = cadence if cadence is not None else rule.cadence
        auto = auto_redeem if auto_redeem is not None else rule.auto_redeem
        if daily_cap_minutes is ...:
            cap = rule.daily_cap_minutes
        else:
            cap = daily_cap_minutes  # type: ignore[assignment]
        validate_exchange_rule_fields(
            minutes_per_completion=minutes,
            cadence=cad,
            auto_redeem=auto,
            daily_cap_minutes=cap,
        )
        execute(
            self._conn,
            "UPDATE exchange_rules SET minutes_per_completion = ?, cadence = ?, "
            "auto_redeem = ?, daily_cap_minutes = ? WHERE id = ? AND account_id = ?",
            (minutes, cad, 1 if auto else 0, cap, rule_id, account_id),
        )
        self._conn.commit()
        return self.get_exchange_rule(account_id, rule_id)

    def deactivate_exchange_rule(self, account_id: int, rule_id: int) -> ExchangeRule:
        self.get_exchange_rule(account_id, rule_id)
        execute(
            self._conn,
            "UPDATE exchange_rules SET active = 0 WHERE id = ? AND account_id = ?",
            (rule_id, account_id),
        )
        self._conn.commit()
        return self.get_exchange_rule(account_id, rule_id)

    @staticmethod
    def can_earn_from_rule(rule: ExchangeRule) -> bool:
        return rule.active

    def can_redeem_credit(self, account_id: int, credit_id: int) -> bool:
        """Pending credits stay redeemable after rule deactivate (H2.4 keep_redeemable)."""
        self._accounts.get_account(account_id)
        row = execute(
            self._conn,
            "SELECT status FROM earned_credits WHERE id = ? AND account_id = ?",
            (credit_id, account_id),
        ).fetchone()
        if row is None:
            raise DomainError(ErrorCode.NOT_FOUND, f"积分不存在: {credit_id}")
        return str(row["status"]) == "pending"

    def redeem(self, account_id: int, credit_id: int) -> EarnedCredit:
        """H4: pending credit → habit_reward ledger; idempotent fail on second call."""
        ensure(
            self._ledger is not None,
            ErrorCode.INTERNAL,
            "redeem 需要 LedgerService",
        )
        credit = self.get_credit(account_id, credit_id)
        ensure(
            credit.status == "pending",
            ErrorCode.CREDIT_NOT_REDEEMABLE,
            f"积分不可兑换: status={credit.status}",
        )
        try:
            entry = self._ledger.habit_reward(
                account_id,
                credit.minutes,
                habit_log_id=credit.habit_log_id,
                commit=False,
            )
            redeemed_at = ensure_app_tz(self._clock.now()).isoformat()
            cur = execute(
                self._conn,
                "UPDATE earned_credits SET status = ?, ledger_entry_id = ?, "
                "redeemed_at = ? WHERE id = ? AND account_id = ? AND status = ?",
                ("redeemed", entry.id, redeemed_at, credit_id, account_id, "pending"),
            )
            ensure(
                cur.rowcount == 1,
                ErrorCode.CREDIT_NOT_REDEEMABLE,
                "积分兑换未生效（可能已兑换）",
            )
            self._conn.commit()
        except Exception:
            self._conn.rollback()
            raise
        return self.get_credit(account_id, credit_id)

    def list_pending_credits(self, account_id: int) -> list[EarnedCredit]:
        self._accounts.get_account(account_id)
        rows = execute(
            self._conn,
            "SELECT id, account_id, habit_log_id, minutes, status, ledger_entry_id, redeemed_at "
            "FROM earned_credits WHERE account_id = ? AND status = 'pending' ORDER BY id ASC",
            (account_id,),
        ).fetchall()
        return [self._row_to_credit(r) for r in rows]

    def set_motivation_override(
        self,
        account_id: int,
        habit_id: int,
        override: dict[str, Any],
    ) -> Habit:
        self.get_habit(account_id, habit_id)
        execute(
            self._conn,
            "UPDATE habits SET motivation_override_json = ? WHERE id = ? AND account_id = ?",
            (json.dumps(override, ensure_ascii=False), habit_id, account_id),
        )
        self._conn.commit()
        return self.get_habit(account_id, habit_id)

    def streak_for_habit(self, account_id: int, habit_id: int) -> int:
        self.get_habit(account_id, habit_id)
        rows = execute(
            self._conn,
            "SELECT day_key FROM habit_logs WHERE account_id = ? AND habit_id = ? "
            "AND voided_at IS NULL",
            (account_id, habit_id),
        ).fetchall()
        today = ensure_app_tz(self._clock.now()).date().isoformat()
        return compute_streak([str(r["day_key"]) for r in rows], today=today)

    def list_celebration_events(self, account_id: int) -> list[CelebrationEvent]:
        self._accounts.get_account(account_id)
        rows = execute(
            self._conn,
            "SELECT id, account_id, kind, celebration_key, habit_log_id, milestone_id, "
            "review_script_id, offline_hint_id, created_at FROM celebration_events "
            "WHERE account_id = ? ORDER BY id ASC",
            (account_id,),
        ).fetchall()
        return [self._row_to_celebration(r) for r in rows]

    def evaluate_board_celebration(self, account_id: int) -> CelebrationEvent | None:
        """H5.5–H5.6: Q9 weekly ≥5 logs → board event once per milestone_id."""
        self._accounts.get_account(account_id)
        today = ensure_app_tz(self._clock.now()).date().isoformat()
        week_key = iso_week_key(today)
        # ISO week date range approx via day_key prefix match on week numbers is awkward;
        # count logs whose iso week equals week_key.
        rows = execute(
            self._conn,
            "SELECT day_key FROM habit_logs WHERE account_id = ? AND voided_at IS NULL",
            (account_id,),
        ).fetchall()
        count = sum(1 for r in rows if iso_week_key(str(r["day_key"])) == week_key)
        milestone = weekly_board_milestone(week_key=week_key, log_count=count)
        if milestone is None:
            return None
        existing = execute(
            self._conn,
            "SELECT id FROM celebration_events WHERE account_id = ? AND milestone_id = ?",
            (account_id, milestone.milestone_id),
        ).fetchone()
        if existing is not None:
            return None
        script_id = self._pick_review_script_id()
        hint_id = self._pick_offline_hint_id()
        created_at = ensure_app_tz(self._clock.now()).isoformat()
        event = self._record_celebration(
            account_id,
            kind="board",
            celebration_key="board-weekly",
            habit_log_id=None,
            milestone_id=milestone.milestone_id,
            review_script_id=script_id,
            offline_hint_id=hint_id,
            created_at=created_at,
        )
        self._conn.commit()
        return event

    def assert_within_daily_cap(
        self,
        account_id: int,
        rule_id: int,
        *,
        additional_minutes: int,
    ) -> None:
        rule = self.get_exchange_rule(account_id, rule_id)
        if rule.daily_cap_minutes is None:
            return
        day_key = ensure_app_tz(self._clock.now()).date().isoformat()
        row = execute(
            self._conn,
            """
            SELECT COALESCE(SUM(c.minutes), 0) AS total
            FROM earned_credits c
            JOIN habit_logs l ON l.id = c.habit_log_id
            WHERE c.account_id = ?
              AND l.habit_id = ?
              AND l.day_key = ?
              AND c.status IN ('pending', 'redeemed')
            """,
            (account_id, rule.habit_id, day_key),
        ).fetchone()
        total = int(row["total"]) if row is not None else 0
        ensure(
            total + additional_minutes <= rule.daily_cap_minutes,
            ErrorCode.VALIDATION,
            f"超过日上限 {rule.daily_cap_minutes} 分钟",
        )

    def active_rule_for_habit(self, account_id: int, habit_id: int) -> ExchangeRule | None:
        self.get_habit(account_id, habit_id)
        row = execute(
            self._conn,
            "SELECT id, account_id, habit_id, minutes_per_completion, cadence, "
            "auto_redeem, daily_cap_minutes, active FROM exchange_rules "
            "WHERE account_id = ? AND habit_id = ? AND active = 1",
            (account_id, habit_id),
        ).fetchone()
        return self._row_to_rule(row) if row is not None else None

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

    def _motivation_for_habit(self, account_id: int, habit: Habit) -> dict[str, Any]:
        paths: tuple[MotivationPath, ...] = DEFAULT_MOTIVATION_PATHS
        if habit.template_id is not None:
            row = execute(
                self._conn,
                "SELECT motivation_paths_json FROM habit_templates WHERE id = ?",
                (habit.template_id,),
            ).fetchone()
            if row is not None:
                raw_paths = json.loads(row["motivation_paths_json"] or "[]")
                parsed = [
                    MotivationPath(
                        kind=str(p["kind"]),  # type: ignore[arg-type]
                        emotion_copy=str(p["emotion_copy"]),
                        celebration_key=str(p["celebration_key"]),
                    )
                    for p in raw_paths
                    if isinstance(p, dict)
                ]
                if parsed:
                    paths = tuple(parsed)
        override_row = execute(
            self._conn,
            "SELECT motivation_override_json FROM habits WHERE id = ? AND account_id = ?",
            (habit.id, account_id),
        ).fetchone()
        override = None
        if override_row is not None and override_row["motivation_override_json"]:
            override = json.loads(override_row["motivation_override_json"])
        return build_motivation_payload(paths, override=override)

    def _record_celebration(
        self,
        account_id: int,
        *,
        kind: str,
        celebration_key: str,
        habit_log_id: int | None,
        milestone_id: str | None,
        review_script_id: int | None,
        offline_hint_id: int | None,
        created_at: str,
    ) -> CelebrationEvent:
        cur = execute(
            self._conn,
            "INSERT INTO celebration_events ("
            "account_id, kind, celebration_key, habit_log_id, milestone_id, "
            "review_script_id, offline_hint_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                account_id,
                kind,
                celebration_key,
                habit_log_id,
                milestone_id,
                review_script_id,
                offline_hint_id,
                created_at,
            ),
        )
        return CelebrationEvent(
            id=int(cur.lastrowid),
            account_id=account_id,
            kind=kind,  # type: ignore[arg-type]
            celebration_key=celebration_key,
            habit_log_id=habit_log_id,
            milestone_id=milestone_id,
            review_script_id=review_script_id,
            offline_hint_id=offline_hint_id,
            created_at=created_at,
        )

    def _pick_review_script_id(self) -> int | None:
        row = execute(
            self._conn,
            "SELECT id FROM parent_scripts WHERE situation = ? ORDER BY id ASC LIMIT 1",
            ("review",),
        ).fetchone()
        return int(row["id"]) if row is not None else None

    def _pick_offline_hint_id(self) -> int | None:
        row = execute(
            self._conn,
            "SELECT id FROM offline_celebration_hints "
            "WHERE suitable_for IN ('board_milestone', 'weekly_review', 'after_log') "
            "ORDER BY id ASC LIMIT 1",
        ).fetchone()
        return int(row["id"]) if row is not None else None

    @staticmethod
    def _row_to_celebration(row: sqlite3.Row) -> CelebrationEvent:
        return CelebrationEvent(
            id=int(row["id"]),
            account_id=int(row["account_id"]),
            kind=str(row["kind"]),  # type: ignore[arg-type]
            celebration_key=str(row["celebration_key"]),
            habit_log_id=int(row["habit_log_id"]) if row["habit_log_id"] is not None else None,
            milestone_id=str(row["milestone_id"]) if row["milestone_id"] is not None else None,
            review_script_id=(
                int(row["review_script_id"]) if row["review_script_id"] is not None else None
            ),
            offline_hint_id=(
                int(row["offline_hint_id"]) if row["offline_hint_id"] is not None else None
            ),
            created_at=str(row["created_at"]),
        )

    @staticmethod
    def _row_to_credit(row: sqlite3.Row) -> EarnedCredit:
        return EarnedCredit(
            id=int(row["id"]),
            account_id=int(row["account_id"]),
            habit_log_id=int(row["habit_log_id"]),
            minutes=int(row["minutes"]),
            status=str(row["status"]),
            ledger_entry_id=(
                int(row["ledger_entry_id"]) if row["ledger_entry_id"] is not None else None
            ),
            redeemed_at=str(row["redeemed_at"]) if row["redeemed_at"] is not None else None,
        )

    @staticmethod
    def _row_to_rule(row: sqlite3.Row) -> ExchangeRule:
        return ExchangeRule(
            id=int(row["id"]),
            account_id=int(row["account_id"]),
            habit_id=int(row["habit_id"]),
            minutes_per_completion=int(row["minutes_per_completion"]),
            cadence=str(row["cadence"]),
            auto_redeem=bool(row["auto_redeem"]),
            daily_cap_minutes=(
                int(row["daily_cap_minutes"]) if row["daily_cap_minutes"] is not None else None
            ),
            active=bool(row["active"]),
        )
