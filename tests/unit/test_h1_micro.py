"""H1.2 — is_micro ability gate."""

import pytest

from mytimetree.domain.habit import HabitDraft, is_micro


@pytest.mark.unit
def test_is_micro_accepts_est_minutes_five():
    assert is_micro(HabitDraft(title="刷牙", category="hygiene", est_minutes=5)) is True


@pytest.mark.unit
def test_is_micro_rejects_est_minutes_six():
    assert is_micro(HabitDraft(title="练琴半小时", category="study_micro", est_minutes=6)) is False


@pytest.mark.unit
def test_is_micro_rejects_unknown_category():
    assert is_micro(HabitDraft(title="x", category="not_a_real_cat", est_minutes=1)) is False
