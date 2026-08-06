"""Monthly fruit reward tiers for fruiting stage (kid-friendly).

Given monthly average asset A (sum of daily asset balances / 30):
  tier n = floor(A / 100)
  ≥100 → 1 果
  ≥200 → 4 果
  ≥300 → 8 果
  ≥400 → 12 果
  ≥500 → 16 果
  …

Formula:
  n <= 0 → 0
  n == 1 → 1
  n >= 2 → 4 * (n - 1)
"""

from __future__ import annotations

import math


def monthly_fruit_reward_for_average(avg_asset: float) -> int:
    """Return fruits for one month from average asset minutes."""
    n = int(math.floor(avg_asset / 100.0 + 1e-12))
    if n <= 0:
        return 0
    if n == 1:
        return 1
    return 4 * (n - 1)
