"""Interest-linked fruit (果) helpers.

累积净利息（资产结息 − 负债结息）每增加 100 分 → +1 果（只增不减）。
树上挂果：从 1 起，每 +10 多挂 1 个，最多 10。
"""

from __future__ import annotations


def fruits_from_cumulative_interest(cumulative_net: int) -> int:
    """Lifetime fruits earned from cumulative net interest minutes."""
    return max(0, int(cumulative_net) // 100)


def fruit_display_count(count: int, *, cap: int = 10) -> int:
    """树上挂果数：n≥1 → min(cap, floor((n-1)/10)+1)。"""
    n = int(count)
    if n < 1:
        return 0
    return min(cap, (n - 1) // 10 + 1)


# Back-compat aliases (old monthly-avg API names)
def monthly_fruit_display_count(reward: int, *, cap: int = 10) -> int:
    return fruit_display_count(reward, cap=cap)
