"""Display theme for ledger rows — Chinese accounting: income red / expense green."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from mytimetree.domain.ledger import LedgerCategory


class DisplayTone(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"
    LIABILITY_UP = "liability_up"
    LIABILITY_DOWN = "liability_down"
    NEUTRAL = "neutral"


@dataclass(frozen=True, slots=True)
class DisplayTheme:
    locale: str
    income_color: str
    expense_color: str
    liability_up_color: str
    liability_down_color: str
    neutral_color: str = "#757575"

    def color_for(self, tone: DisplayTone) -> str:
        return {
            DisplayTone.INCOME: self.income_color,
            DisplayTone.EXPENSE: self.expense_color,
            DisplayTone.LIABILITY_UP: self.liability_up_color,
            DisplayTone.LIABILITY_DOWN: self.liability_down_color,
            DisplayTone.NEUTRAL: self.neutral_color,
        }[tone]


# 中文财务习惯：进账红、支出绿
ZH_CN_THEME = DisplayTheme(
    locale="zh-CN",
    income_color="#E53935",
    expense_color="#43A047",
    liability_up_color="#FB8C00",
    liability_down_color="#1E88E5",
)

# 预留西方习惯：进账绿、支出红
EN_US_THEME = DisplayTheme(
    locale="en-US",
    income_color="#43A047",
    expense_color="#E53935",
    liability_up_color="#FB8C00",
    liability_down_color="#1E88E5",
)


def theme_for_locale(locale: str) -> DisplayTheme:
    key = (locale or "zh-CN").replace("_", "-").lower()
    if key.startswith("zh"):
        return ZH_CN_THEME
    if key.startswith("en"):
        return EN_US_THEME
    return ZH_CN_THEME


def display_tone_for_category(
    category: LedgerCategory,
    *,
    side: str | None = None,
) -> DisplayTone:
    if category in (LedgerCategory.DEPOSIT, LedgerCategory.AUTO_GRANT):
        return DisplayTone.INCOME
    if category == LedgerCategory.SPEND:
        return DisplayTone.EXPENSE
    if category == LedgerCategory.BORROW:
        return DisplayTone.LIABILITY_UP
    if category == LedgerCategory.REPAY:
        return DisplayTone.LIABILITY_DOWN
    if category == LedgerCategory.AUTO_INTEREST:
        if side == "liability":
            return DisplayTone.LIABILITY_UP
        return DisplayTone.INCOME
    return DisplayTone.NEUTRAL
