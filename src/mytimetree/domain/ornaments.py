"""Tree ornament counters (star / sun / pest / woodpecker / interest fruit).

Display names (zh): fruit_count→星, golden_fruit_count→太阳,
interest_fruit_count→果, pest_count→虫, woodpecker_count→鸟.
100 星 → 1 太阳；累积净利息每 +100 分 → +1 果。
"""

from __future__ import annotations

from dataclasses import dataclass, replace


@dataclass(frozen=True, slots=True)
class Ornaments:
    fruit_count: int = 0  # 星
    golden_fruit_count: int = 0  # 太阳
    pest_count: int = 0
    woodpecker_count: int = 0
    interest_fruit_count: int = 0  # 果（利息）


def add_fruit(orn: Ornaments, n: int = 1) -> Ornaments:
    """Add stars (display 星); every 100 stars convert to one sun (太阳)."""
    fruit = orn.fruit_count + n
    golden = orn.golden_fruit_count
    while fruit >= 100:
        fruit -= 100
        golden += 1
    return replace(orn, fruit_count=fruit, golden_fruit_count=golden)


def add_interest_fruit(orn: Ornaments, n: int = 1) -> Ornaments:
    """Add interest fruits (display 果); cumulative, never converts."""
    return replace(orn, interest_fruit_count=orn.interest_fruit_count + n)


def add_pest(orn: Ornaments, n: int = 1) -> Ornaments:
    return replace(orn, pest_count=orn.pest_count + n)


def add_woodpecker(orn: Ornaments, n: int = 1) -> Ornaments:
    return replace(orn, woodpecker_count=orn.woodpecker_count + n)


def clear_pest(orn: Ornaments) -> Ornaments:
    """负债清零时彻底消灭虫数值。"""
    return replace(orn, pest_count=0)
