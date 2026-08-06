"""Growth stages — driven by NET assets (asset - liability)."""

from __future__ import annotations

from enum import Enum


class TreeStage(str, Enum):
    SEED = "seed"
    SPROUT = "sprout"
    BREAK_SOIL = "break_soil"
    GERMINATE = "germinate"
    SAPLING = "sapling"
    YOUNG = "young"
    TALL = "tall"
    BIG = "big"
    GIANT = "giant"
    FRUITING = "fruiting"


_STAGE_TABLE: list[tuple[int, int | None, TreeStage]] = [
    (0, 20, TreeStage.SEED),
    (20, 50, TreeStage.SPROUT),
    (50, 100, TreeStage.BREAK_SOIL),
    (100, 150, TreeStage.GERMINATE),
    (150, 200, TreeStage.SAPLING),
    (200, 250, TreeStage.YOUNG),
    (250, 300, TreeStage.TALL),
    (300, 400, TreeStage.BIG),
    (400, 500, TreeStage.GIANT),
    (500, None, TreeStage.FRUITING),
]


def stage_for_net_minutes(net_minutes: int) -> TreeStage:
    """Map net worth (asset - liability) to growth stage. Negative net → seed."""
    minutes = max(0, net_minutes)
    for low, high, stage in _STAGE_TABLE:
        if high is None:
            if minutes >= low:
                return stage
        elif low <= minutes < high:
            return stage
    raise RuntimeError("unreachable stage mapping")


def stage_for_minutes(minutes: int) -> TreeStage:
    """Alias: callers should pass net minutes."""
    return stage_for_net_minutes(minutes)
