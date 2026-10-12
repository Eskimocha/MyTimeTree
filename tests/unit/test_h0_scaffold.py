"""H0.1 — habit package paths importable; LedgerCategory.HABIT_REWARD locked (Q1)."""

import pytest

from mytimetree.domain import habit as habit_domain
from mytimetree.domain.ledger import LedgerCategory
from mytimetree.services import habit as habit_service


@pytest.mark.unit
def test_habit_domain_and_service_modules_import():
    assert habit_domain is not None
    assert habit_service is not None
    assert hasattr(habit_domain, "HABIT_SCHEMA_VERSION_HINT")


@pytest.mark.unit
def test_ledger_category_habit_reward_locked_by_q1():
    assert LedgerCategory.HABIT_REWARD.value == "habit_reward"
