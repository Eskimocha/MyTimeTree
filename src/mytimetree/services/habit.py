"""Habit application service stub (H0). Real complete/redeem in H3–H4."""

from __future__ import annotations

from mytimetree.domain.habit import HABIT_SCHEMA_VERSION_HINT


def scaffold_ok() -> bool:
    """Probe used by H0 import/smoke tests."""
    return HABIT_SCHEMA_VERSION_HINT >= 6
