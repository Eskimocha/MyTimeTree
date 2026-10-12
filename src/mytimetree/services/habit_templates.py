"""Load and seed HabitTemplate fixtures (H1.1)."""

from __future__ import annotations

import json
import sqlite3
from functools import lru_cache
from pathlib import Path

from mytimetree.db.connection import execute
from mytimetree.domain.errors import DomainError, ErrorCode, ensure
from mytimetree.domain.habit import HabitTemplate, validate_template_dict

_SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "habit_templates.json"


@lru_cache(maxsize=1)
def load_seed_templates() -> tuple[HabitTemplate, ...]:
    ensure(_SEED_PATH.is_file(), ErrorCode.INTERNAL, f"missing seed file: {_SEED_PATH}")
    raw = json.loads(_SEED_PATH.read_text(encoding="utf-8"))
    ensure(isinstance(raw, list), ErrorCode.VALIDATION, "seed root must be list")
    templates = [validate_template_dict(item) for item in raw]
    slugs = [t.slug for t in templates]
    ensure(len(slugs) == len(set(slugs)), ErrorCode.VALIDATION, "duplicate seed slug")
    return tuple(templates)


def seed_templates_into_db(conn: sqlite3.Connection) -> int:
    """Upsert seed templates by slug. Returns count written."""
    count = 0
    for t in load_seed_templates():
        execute(
            conn,
            """
            INSERT INTO habit_templates (
                slug, title, category, ability_tier, est_minutes,
                motivation_paths_json, incentive_notes_json,
                default_minutes_hint, prompt_hints_json, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET
                title = excluded.title,
                category = excluded.category,
                ability_tier = excluded.ability_tier,
                est_minutes = excluded.est_minutes,
                motivation_paths_json = excluded.motivation_paths_json,
                incentive_notes_json = excluded.incentive_notes_json,
                default_minutes_hint = excluded.default_minutes_hint,
                prompt_hints_json = excluded.prompt_hints_json,
                active = excluded.active
            """,
            (
                t.slug,
                t.title,
                t.category,
                t.ability_tier,
                t.est_minutes,
                json.dumps(
                    [
                        {
                            "kind": p.kind,
                            "emotion_copy": p.emotion_copy,
                            "celebration_key": p.celebration_key,
                        }
                        for p in t.motivation_paths
                    ],
                    ensure_ascii=False,
                ),
                json.dumps(t.incentive_notes, ensure_ascii=False),
                t.default_minutes_hint,
                json.dumps(list(t.prompt_hints), ensure_ascii=False),
                1 if t.active else 0,
            ),
        )
        count += 1
    conn.commit()
    return count


def get_template_by_slug(conn: sqlite3.Connection, slug: str) -> HabitTemplate:
    row = execute(
        conn,
        "SELECT id, slug, title, category, ability_tier, est_minutes, "
        "motivation_paths_json, incentive_notes_json, default_minutes_hint, "
        "prompt_hints_json, active FROM habit_templates WHERE slug = ?",
        (slug,),
    ).fetchone()
    if row is None:
        raise DomainError(ErrorCode.NOT_FOUND, f"习惯种子不存在: {slug}")
    return validate_template_dict(
        {
            "id": row["id"],
            "slug": row["slug"],
            "title": row["title"],
            "category": row["category"],
            "ability_tier": row["ability_tier"],
            "est_minutes": row["est_minutes"],
            "motivation_paths": json.loads(row["motivation_paths_json"] or "[]"),
            "incentive_notes": json.loads(row["incentive_notes_json"] or "{}"),
            "default_minutes_hint": row["default_minutes_hint"],
            "prompt_hints": json.loads(row["prompt_hints_json"] or "[]"),
            "active": bool(row["active"]),
        }
    )
