"""Habit UI label keys (zh-CN) — parallel to ledger display tones."""

from __future__ import annotations

from mytimetree.domain.errors import DomainError, ErrorCode, ensure
from mytimetree.domain.habit import HABIT_CATEGORIES

HABIT_UI_LABELS: dict[str, str] = {
    # categories
    "hygiene": "卫生",
    "sleep": "睡眠",
    "reading": "阅读",
    "chores": "家务",
    "sport_micro": "微运动",
    "emotion": "情绪",
    "study_micro": "微学习",
    "other_micro": "其他微习惯",
    # screens / chrome
    "timeline": "习惯时间线",
    "daily_achievement": "今日成就",
    "record_board": "好习惯记录总表",
    "category_stats": "分类统计",
    "pending_credits": "待兑换时间",
    "small_celebration": "小庆祝",
    "board_celebration": "总表大庆祝",
}


def label_for_category(category: str) -> str:
    ensure(category in HABIT_CATEGORIES, ErrorCode.VALIDATION, f"未知习惯分类: {category}")
    return HABIT_UI_LABELS[category]
