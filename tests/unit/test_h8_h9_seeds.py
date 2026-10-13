"""H8.1 / H9.3–H9.4 seed size and fields."""

import pytest

from mytimetree.domain.habit import HABIT_CATEGORIES
from mytimetree.services.habit_templates import load_seed_templates
from mytimetree.services.parent_guidance import load_seed_hints, load_seed_scripts


@pytest.mark.unit
def test_habit_seeds_at_least_50_with_incentive():
    templates = load_seed_templates()
    assert len(templates) >= 50
    for cat in HABIT_CATEGORIES:
        assert sum(1 for t in templates if t.category == cat) >= 2
    for t in templates:
        assert "small" in t.incentive_notes
        assert "approach" in {p.kind for p in t.motivation_paths}
        assert "avoid" in {p.kind for p in t.motivation_paths}


@pytest.mark.unit
def test_parent_scripts_and_hints_thresholds():
    scripts = load_seed_scripts()
    hints = load_seed_hints()
    assert len(scripts) >= 12
    assert len(hints) >= 8
    assert sum(1 for h in hints if h.image_key) >= 4
    situations = {s.situation for s in scripts}
    assert {"before_habit", "after_log", "review"} <= situations
