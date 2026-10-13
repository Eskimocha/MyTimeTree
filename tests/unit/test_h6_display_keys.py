"""H6.4 — habit display label keys exist."""

import pytest

from mytimetree.domain.habit import HABIT_CATEGORIES
from mytimetree.domain.habit_display import HABIT_UI_LABELS, label_for_category


@pytest.mark.unit
def test_every_category_has_zh_label():
    for cat in HABIT_CATEGORIES:
        assert cat in HABIT_UI_LABELS
        assert HABIT_UI_LABELS[cat]
        assert label_for_category(cat) == HABIT_UI_LABELS[cat]


@pytest.mark.unit
def test_required_ui_keys_present():
    for key in (
        "timeline",
        "daily_achievement",
        "record_board",
        "category_stats",
        "pending_credits",
        "small_celebration",
        "board_celebration",
    ):
        assert key in HABIT_UI_LABELS
