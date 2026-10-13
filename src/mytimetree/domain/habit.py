"""Habit domain: micro-ability gate, templates, instances, logs (H1)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Sequence

from mytimetree.domain.errors import DomainError, ErrorCode, ensure

# Must stay aligned with db.migrate HABIT_MIGRATION_VERSION
HABIT_SCHEMA_VERSION_HINT = 8

BOARD_WEEKLY_LOG_THRESHOLD = 5  # Q9 Accepted

HABIT_CATEGORIES: frozenset[str] = frozenset(
    {
        "hygiene",
        "sleep",
        "reading",
        "chores",
        "sport_micro",
        "emotion",
        "study_micro",
        "other_micro",
    }
)

MotivationKind = Literal["approach", "avoid"]
MAX_MICRO_EST_MINUTES = 5


@dataclass(frozen=True, slots=True)
class MotivationPath:
    kind: MotivationKind
    emotion_copy: str
    celebration_key: str


@dataclass(frozen=True, slots=True)
class HabitDraft:
    """Lightweight input for Ability checks (custom enable / validation)."""

    title: str
    category: str
    est_minutes: int


@dataclass(frozen=True, slots=True)
class HabitTemplate:
    id: int | None
    slug: str
    title: str
    category: str
    ability_tier: str
    est_minutes: int
    motivation_paths: tuple[MotivationPath, ...]
    incentive_notes: dict[str, Any]
    default_minutes_hint: int | None
    prompt_hints: tuple[str, ...]
    active: bool


@dataclass(frozen=True, slots=True)
class Habit:
    id: int
    account_id: int
    template_id: int | None
    title: str
    category: str
    est_minutes: int
    archived_at: str | None
    created_at: str


@dataclass(frozen=True, slots=True)
class HabitLog:
    id: int
    account_id: int
    habit_id: int
    completed_at: str
    source: str
    day_key: str


@dataclass(frozen=True, slots=True)
class EarnedCredit:
    id: int
    account_id: int
    habit_log_id: int
    minutes: int
    status: str
    ledger_entry_id: int | None
    redeemed_at: str | None


@dataclass(frozen=True, slots=True)
class CelebrationEvent:
    id: int | None
    account_id: int
    kind: Literal["small", "board"]
    celebration_key: str
    habit_log_id: int | None
    milestone_id: str | None
    review_script_id: int | None
    offline_hint_id: int | None
    created_at: str


@dataclass(frozen=True, slots=True)
class HabitCompletion:
    log: HabitLog
    credit: EarnedCredit | None
    motivation_payload: dict[str, Any] | None = None
    celebration: CelebrationEvent | None = None


@dataclass(frozen=True, slots=True)
class BoardMilestone:
    kind: Literal["board"]
    milestone_id: str
    week_key: str
    log_count: int


EXCHANGE_CADENCES: frozenset[str] = frozenset({"daily", "streak_n"})

DEFAULT_MOTIVATION_PATHS: tuple[MotivationPath, ...] = (
    MotivationPath("approach", "又完成了一件好事", "generic-spark"),
    MotivationPath("avoid", "少留一点遗憾", "generic-spark"),
)

# H2.4: deactivate keeps existing pending credits redeemable; only blocks new earn.
INACTIVE_RULE_PENDING_POLICY = "keep_redeemable"


@dataclass(frozen=True, slots=True)
class ExchangeRule:
    id: int
    account_id: int
    habit_id: int
    minutes_per_completion: int
    cadence: str
    auto_redeem: bool
    daily_cap_minutes: int | None
    active: bool


def validate_exchange_rule_fields(
    *,
    minutes_per_completion: int,
    cadence: str,
    auto_redeem: bool,
    daily_cap_minutes: int | None,
) -> None:
    del auto_redeem  # accepted for API symmetry; bool only
    ensure(
        isinstance(minutes_per_completion, int) and minutes_per_completion > 0,
        ErrorCode.VALIDATION,
        "minutes_per_completion must be > 0",
    )
    ensure(cadence in EXCHANGE_CADENCES, ErrorCode.VALIDATION, f"bad cadence: {cadence}")
    if daily_cap_minutes is not None:
        ensure(
            isinstance(daily_cap_minutes, int) and daily_cap_minutes > 0,
            ErrorCode.VALIDATION,
            "daily_cap_minutes must be > 0 when set",
        )
        ensure(
            daily_cap_minutes >= minutes_per_completion,
            ErrorCode.VALIDATION,
            "daily_cap_minutes must cover at least one completion",
        )


def is_micro(draft: HabitDraft) -> bool:
    """Ability gate: binary, ≤5 minutes, known micro taxonomy — no skill teaching."""
    if draft.est_minutes < 0 or draft.est_minutes > MAX_MICRO_EST_MINUTES:
        return False
    if draft.category not in HABIT_CATEGORIES:
        return False
    if not draft.title.strip():
        return False
    return True


def require_micro(draft: HabitDraft) -> None:
    ensure(is_micro(draft), ErrorCode.HABIT_NOT_MICRO, "仅支持微习惯（≤5 分钟且分类合法）")


def build_motivation_payload(
    paths: Sequence[MotivationPath],
    *,
    override: dict[str, Any] | None,
) -> dict[str, Any]:
    """Channel ②: approach + avoid emotion copies; override wins over seed."""
    by_kind = {p.kind: p for p in paths}
    ensure("approach" in by_kind and "avoid" in by_kind, ErrorCode.VALIDATION, "need approach+avoid")
    approach = by_kind["approach"]
    avoid = by_kind["avoid"]
    celeb = approach.celebration_key or avoid.celebration_key
    if override:
        if "approach" in override and isinstance(override["approach"], dict):
            o = override["approach"]
            approach = MotivationPath(
                "approach",
                str(o.get("emotion_copy", approach.emotion_copy)),
                str(o.get("celebration_key", approach.celebration_key)),
            )
        if "avoid" in override and isinstance(override["avoid"], dict):
            o = override["avoid"]
            avoid = MotivationPath(
                "avoid",
                str(o.get("emotion_copy", avoid.emotion_copy)),
                str(o.get("celebration_key", avoid.celebration_key)),
            )
        celeb = str(
            (override.get("approach") or {}).get("celebration_key")
            or (override.get("avoid") or {}).get("celebration_key")
            or celeb
        )
    return {
        "approach": {
            "emotion_copy": approach.emotion_copy,
            "celebration_key": approach.celebration_key,
        },
        "avoid": {
            "emotion_copy": avoid.emotion_copy,
            "celebration_key": avoid.celebration_key,
        },
        "celebration_key": celeb,
    }


def compute_streak(day_keys: Sequence[str], *, today: str) -> int:
    """Count consecutive completed days ending on ``today``; gap → reset."""
    days = sorted({d for d in day_keys if d})
    if today not in days:
        return 0
    from datetime import date, timedelta

    cur = date.fromisoformat(today)
    streak = 0
    day_set = set(days)
    while cur.isoformat() in day_set:
        streak += 1
        cur = cur - timedelta(days=1)
    return streak


def iso_week_key(day: str) -> str:
    from datetime import date

    d = date.fromisoformat(day)
    iso = d.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def weekly_board_milestone(*, week_key: str, log_count: int) -> BoardMilestone | None:
    """Q9: fire board celebration when weekly logs reach threshold."""
    if log_count < BOARD_WEEKLY_LOG_THRESHOLD:
        return None
    return BoardMilestone(
        kind="board",
        milestone_id=f"board:week:{week_key}:{BOARD_WEEKLY_LOG_THRESHOLD}",
        week_key=week_key,
        log_count=log_count,
    )


def validate_template_dict(raw: dict[str, Any]) -> HabitTemplate:
    ensure(isinstance(raw, dict), ErrorCode.VALIDATION, "template must be object")
    slug = str(raw.get("slug", "")).strip()
    title = str(raw.get("title", "")).strip()
    category = str(raw.get("category", "")).strip()
    ability_tier = str(raw.get("ability_tier", "micro")).strip() or "micro"
    est = int(raw.get("est_minutes", 5))
    ensure(bool(slug), ErrorCode.VALIDATION, "slug required")
    ensure(bool(title), ErrorCode.VALIDATION, "title required")
    ensure(category in HABIT_CATEGORIES, ErrorCode.VALIDATION, f"bad category: {category}")
    ensure(ability_tier == "micro", ErrorCode.VALIDATION, "ability_tier must be micro")
    require_micro(HabitDraft(title=title, category=category, est_minutes=est))

    paths_raw = raw.get("motivation_paths") or []
    ensure(isinstance(paths_raw, list), ErrorCode.VALIDATION, "motivation_paths must be list")
    paths: list[MotivationPath] = []
    for item in paths_raw:
        ensure(isinstance(item, dict), ErrorCode.VALIDATION, "path must be object")
        kind = str(item.get("kind", "")).strip()
        ensure(kind in ("approach", "avoid"), ErrorCode.VALIDATION, f"bad path kind: {kind}")
        copy = str(item.get("emotion_copy", "")).strip()
        celeb = str(item.get("celebration_key", "")).strip()
        ensure(bool(copy), ErrorCode.VALIDATION, "emotion_copy required")
        ensure(bool(celeb), ErrorCode.VALIDATION, "celebration_key required")
        paths.append(MotivationPath(kind=kind, emotion_copy=copy, celebration_key=celeb))  # type: ignore[arg-type]
    kinds = {p.kind for p in paths}
    ensure("approach" in kinds, ErrorCode.VALIDATION, "approach motivation path required")
    ensure("avoid" in kinds, ErrorCode.VALIDATION, "avoid motivation path required")

    notes = raw.get("incentive_notes") or {}
    ensure(isinstance(notes, dict), ErrorCode.VALIDATION, "incentive_notes must be object")
    hints = raw.get("prompt_hints") or []
    ensure(isinstance(hints, Sequence), ErrorCode.VALIDATION, "prompt_hints must be list")
    hint_minutes = raw.get("default_minutes_hint")
    active = bool(raw.get("active", True))
    tid = raw.get("id")
    return HabitTemplate(
        id=int(tid) if tid is not None else None,
        slug=slug,
        title=title,
        category=category,
        ability_tier=ability_tier,
        est_minutes=est,
        motivation_paths=tuple(paths),
        incentive_notes=dict(notes),
        default_minutes_hint=int(hint_minutes) if hint_minutes is not None else None,
        prompt_hints=tuple(str(h) for h in hints),
        active=active,
    )
