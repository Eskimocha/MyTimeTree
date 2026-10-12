"""Habit domain: micro-ability gate, templates, instances, logs (H1)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Sequence

from mytimetree.domain.errors import DomainError, ErrorCode, ensure

# Must stay aligned with db.migrate HABIT_MIGRATION_VERSION
HABIT_SCHEMA_VERSION_HINT = 7

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
