"""H1.1 — HabitTemplate seed load + validation."""

from __future__ import annotations

import pytest

from mytimetree.domain.errors import DomainError, ErrorCode
from mytimetree.domain.habit import HABIT_CATEGORIES, validate_template_dict
from mytimetree.services.habit_templates import load_seed_templates


@pytest.mark.unit
def test_seed_has_at_least_30_unique_slugs():
    templates = load_seed_templates()
    assert len(templates) >= 30
    slugs = [t.slug for t in templates]
    assert len(slugs) == len(set(slugs))


@pytest.mark.unit
def test_seed_covers_all_categories_at_least_twice():
    templates = load_seed_templates()
    for cat in HABIT_CATEGORIES:
        count = sum(1 for t in templates if t.category == cat)
        assert count >= 2, f"category {cat} only {count}"


@pytest.mark.unit
def test_each_seed_has_approach_and_avoid():
    for t in load_seed_templates():
        kinds = {p.kind for p in t.motivation_paths}
        assert "approach" in kinds
        assert "avoid" in kinds
        assert t.ability_tier == "micro"
        assert t.est_minutes <= 5


@pytest.mark.unit
def test_validate_template_rejects_missing_motivation_path():
    raw = {
        "slug": "bad-brush",
        "title": "刷牙",
        "category": "hygiene",
        "est_minutes": 2,
        "motivation_paths": [{"kind": "approach", "emotion_copy": "清新", "celebration_key": "sparkle"}],
        "incentive_notes": {"small": "x", "board": "y", "offline": "z"},
    }
    with pytest.raises(DomainError) as ei:
        validate_template_dict(raw)
    assert ei.value.code == ErrorCode.VALIDATION
