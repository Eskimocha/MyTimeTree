"""Per-account settings domain type."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class AccountSettings:
    account_id: int
    daily_grant_minutes: int = 0
    default_spend_minutes: int = 20
    default_repay_minutes: int = 20
    asset_interest_rate: float = 0.0
    liability_interest_rate: float = 0.0
    repay_presets: list[str] = field(default_factory=list)
    display_colors: dict[str, str] = field(default_factory=dict)
