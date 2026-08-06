"""Account domain types."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class Account:
    id: int
    name: str
    attributes: dict[str, Any] = field(default_factory=dict)
