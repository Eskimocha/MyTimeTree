"""Daily interest math — principals accrue separately (D4).

Rates are **daily** rates (not annual), so kids can compute:
interest_today ≈ principal × daily_rate
(e.g. 100 分钟 × 1% = 1 分钟).
"""

from __future__ import annotations

import math


def daily_interest_minutes(principal: int, daily_rate: float) -> int:
    """Whole minutes for one day: floor(principal * daily_rate)."""
    if principal <= 0 or daily_rate <= 0:
        return 0
    return int(math.floor(principal * daily_rate + 1e-12))
