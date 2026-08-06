"""Minutes as integer time-currency; keep domain math testable."""

from __future__ import annotations

from dataclasses import dataclass

from mytimetree.domain.errors import DomainError, ErrorCode


@dataclass(frozen=True, slots=True)
class Minutes:
    value: int

    def __post_init__(self) -> None:
        if not isinstance(self.value, int):
            raise TypeError("Minutes.value must be int")
        if isinstance(self.value, bool):
            raise TypeError("Minutes.value must be int, not bool")

    def __add__(self, other: Minutes) -> Minutes:
        return Minutes(self.value + other.value)

    def __sub__(self, other: Minutes) -> Minutes:
        return Minutes(self.value - other.value)


@dataclass(frozen=True, slots=True)
class Balance:
    asset: Minutes
    liability: Minutes

    def __post_init__(self) -> None:
        if self.asset.value < 0 or self.liability.value < 0:
            raise DomainError(
                ErrorCode.INVALID_BALANCE,
                "asset and liability minutes must be >= 0",
            )

    @property
    def net(self) -> Minutes:
        return Minutes(self.asset.value - self.liability.value)
