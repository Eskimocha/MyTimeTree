"""Tree ornament counters (fruit / golden / pest / woodpecker)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Ornaments:
    fruit_count: int = 0
    golden_fruit_count: int = 0
    pest_count: int = 0
    woodpecker_count: int = 0


def add_fruit(orn: Ornaments, n: int = 1) -> Ornaments:
    fruit = orn.fruit_count + n
    golden = orn.golden_fruit_count
    while fruit >= 100:
        fruit -= 100
        golden += 1
    return Ornaments(
        fruit_count=fruit,
        golden_fruit_count=golden,
        pest_count=orn.pest_count,
        woodpecker_count=orn.woodpecker_count,
    )


def add_pest(orn: Ornaments, n: int = 1) -> Ornaments:
    return Ornaments(
        fruit_count=orn.fruit_count,
        golden_fruit_count=orn.golden_fruit_count,
        pest_count=orn.pest_count + n,
        woodpecker_count=orn.woodpecker_count,
    )


def add_woodpecker(orn: Ornaments, n: int = 1) -> Ornaments:
    return Ornaments(
        fruit_count=orn.fruit_count,
        golden_fruit_count=orn.golden_fruit_count,
        pest_count=orn.pest_count,
        woodpecker_count=orn.woodpecker_count + n,
    )
