"""H5 — motivation payload, streak, board milestone (pure)."""

from __future__ import annotations

import pytest

from mytimetree.domain.habit import (
    MotivationPath,
    build_motivation_payload,
    compute_streak,
    weekly_board_milestone,
)


@pytest.mark.unit
def test_build_motivation_picks_approach_and_avoid():
    paths = (
        MotivationPath("avoid", "少牙痛", "teeth"),
        MotivationPath("approach", "口气清新", "teeth"),
    )
    payload = build_motivation_payload(paths, override=None)
    assert payload["approach"]["emotion_copy"] == "口气清新"
    assert payload["avoid"]["emotion_copy"] == "少牙痛"
    assert payload["celebration_key"] == "teeth"


@pytest.mark.unit
def test_override_wins_over_seed_paths():
    paths = (
        MotivationPath("avoid", "种子避害", "a"),
        MotivationPath("approach", "种子趋利", "a"),
    )
    override = {
        "approach": {"emotion_copy": "家长夸奖", "celebration_key": "custom"},
        "avoid": {"emotion_copy": "家长提醒", "celebration_key": "custom"},
    }
    payload = build_motivation_payload(paths, override=override)
    assert payload["approach"]["emotion_copy"] == "家长夸奖"
    assert payload["avoid"]["emotion_copy"] == "家长提醒"
    assert payload["celebration_key"] == "custom"


@pytest.mark.unit
def test_streak_counts_consecutive_days_ending_today():
    days = ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"]
    assert compute_streak(days, today="2026-10-13") == 4


@pytest.mark.unit
def test_streak_resets_on_gap():
    days = ["2026-10-10", "2026-10-12", "2026-10-13"]
    assert compute_streak(days, today="2026-10-13") == 2


@pytest.mark.unit
def test_streak_zero_if_today_missing():
    days = ["2026-10-11", "2026-10-12"]
    assert compute_streak(days, today="2026-10-13") == 0


@pytest.mark.unit
def test_weekly_board_milestone_at_five():
    m = weekly_board_milestone(week_key="2026-W42", log_count=5)
    assert m is not None
    assert m.milestone_id == "board:week:2026-W42:5"
    assert m.kind == "board"
    assert weekly_board_milestone(week_key="2026-W42", log_count=4) is None
