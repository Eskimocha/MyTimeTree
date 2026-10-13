"""H9 — parent scripts & offline celebration hints seed loader."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from mytimetree.db.connection import execute
from mytimetree.domain.errors import DomainError, ErrorCode, ensure

_DATA = Path(__file__).resolve().parent.parent / "data"
_SCRIPTS = _DATA / "parent_scripts.json"
_HINTS = _DATA / "offline_celebration_hints.json"


@dataclass(frozen=True, slots=True)
class ParentScript:
    id: int | None
    slug: str
    habit_category: str | None
    situation: str
    script_text: str
    tone: str


@dataclass(frozen=True, slots=True)
class OfflineCelebrationHint:
    id: int | None
    slug: str
    title: str
    body: str
    image_key: str | None
    effort: str
    suitable_for: str


@lru_cache(maxsize=1)
def load_seed_scripts() -> tuple[ParentScript, ...]:
    ensure(_SCRIPTS.is_file(), ErrorCode.INTERNAL, f"missing {_SCRIPTS}")
    raw = json.loads(_SCRIPTS.read_text(encoding="utf-8"))
    ensure(isinstance(raw, list) and len(raw) >= 12, ErrorCode.VALIDATION, "need ≥12 scripts")
    out: list[ParentScript] = []
    for item in raw:
        out.append(
            ParentScript(
                id=None,
                slug=str(item["slug"]),
                habit_category=item.get("habit_category"),
                situation=str(item["situation"]),
                script_text=str(item["script_text"]),
                tone=str(item.get("tone") or "warm"),
            )
        )
    return tuple(out)


@lru_cache(maxsize=1)
def load_seed_hints() -> tuple[OfflineCelebrationHint, ...]:
    ensure(_HINTS.is_file(), ErrorCode.INTERNAL, f"missing {_HINTS}")
    raw = json.loads(_HINTS.read_text(encoding="utf-8"))
    ensure(isinstance(raw, list) and len(raw) >= 8, ErrorCode.VALIDATION, "need ≥8 hints")
    with_img = sum(1 for i in raw if i.get("image_key"))
    ensure(with_img >= 4, ErrorCode.VALIDATION, "need ≥4 hints with image_key")
    out: list[OfflineCelebrationHint] = []
    for item in raw:
        out.append(
            OfflineCelebrationHint(
                id=None,
                slug=str(item["slug"]),
                title=str(item["title"]),
                body=str(item["body"]),
                image_key=item.get("image_key"),
                effort=str(item.get("effort") or "playful"),
                suitable_for=str(item.get("suitable_for") or "after_log"),
            )
        )
    return tuple(out)


def seed_parent_guidance_into_db(conn: sqlite3.Connection) -> tuple[int, int]:
    sc = 0
    for s in load_seed_scripts():
        execute(
            conn,
            """
            INSERT INTO parent_scripts (slug, habit_category, situation, script_text, tone)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET
                habit_category = excluded.habit_category,
                situation = excluded.situation,
                script_text = excluded.script_text,
                tone = excluded.tone
            """,
            (s.slug, s.habit_category, s.situation, s.script_text, s.tone),
        )
        sc += 1
    hc = 0
    for h in load_seed_hints():
        execute(
            conn,
            """
            INSERT INTO offline_celebration_hints
                (slug, title, body, image_key, effort, suitable_for)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET
                title = excluded.title,
                body = excluded.body,
                image_key = excluded.image_key,
                effort = excluded.effort,
                suitable_for = excluded.suitable_for
            """,
            (h.slug, h.title, h.body, h.image_key, h.effort, h.suitable_for),
        )
        hc += 1
    conn.commit()
    return sc, hc


def pick_script(
    conn: sqlite3.Connection,
    *,
    situation: str,
    category: str | None = None,
) -> ParentScript | None:
    if category:
        row = execute(
            conn,
            "SELECT id, slug, habit_category, situation, script_text, tone "
            "FROM parent_scripts WHERE situation = ? AND habit_category = ? "
            "ORDER BY id ASC LIMIT 1",
            (situation, category),
        ).fetchone()
        if row is not None:
            return _row_script(row)
    row = execute(
        conn,
        "SELECT id, slug, habit_category, situation, script_text, tone "
        "FROM parent_scripts WHERE situation = ? AND habit_category IS NULL "
        "ORDER BY id ASC LIMIT 1",
        (situation,),
    ).fetchone()
    if row is None:
        row = execute(
            conn,
            "SELECT id, slug, habit_category, situation, script_text, tone "
            "FROM parent_scripts WHERE situation = ? ORDER BY id ASC LIMIT 1",
            (situation,),
        ).fetchone()
    return _row_script(row) if row is not None else None


def pick_hint(
    conn: sqlite3.Connection,
    *,
    suitable_for: str = "after_log",
) -> OfflineCelebrationHint | None:
    row = execute(
        conn,
        "SELECT id, slug, title, body, image_key, effort, suitable_for "
        "FROM offline_celebration_hints WHERE suitable_for = ? "
        "ORDER BY id ASC LIMIT 1",
        (suitable_for,),
    ).fetchone()
    if row is None:
        row = execute(
            conn,
            "SELECT id, slug, title, body, image_key, effort, suitable_for "
            "FROM offline_celebration_hints ORDER BY id ASC LIMIT 1",
        ).fetchone()
    return _row_hint(row) if row is not None else None


def _row_script(row: sqlite3.Row) -> ParentScript:
    return ParentScript(
        id=int(row["id"]),
        slug=str(row["slug"]),
        habit_category=str(row["habit_category"]) if row["habit_category"] is not None else None,
        situation=str(row["situation"]),
        script_text=str(row["script_text"]),
        tone=str(row["tone"]),
    )


def _row_hint(row: sqlite3.Row) -> OfflineCelebrationHint:
    return OfflineCelebrationHint(
        id=int(row["id"]),
        slug=str(row["slug"]),
        title=str(row["title"]),
        body=str(row["body"]),
        image_key=str(row["image_key"]) if row["image_key"] is not None else None,
        effort=str(row["effort"]),
        suitable_for=str(row["suitable_for"]),
    )
