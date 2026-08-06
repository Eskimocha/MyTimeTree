"""Application clock — schedules use Asia/Shanghai (UTC+8). See decision D7."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone, tzinfo
from typing import Protocol
from zoneinfo import ZoneInfo

APP_TZ: tzinfo = ZoneInfo("Asia/Shanghai")


class Clock(Protocol):
    def now(self) -> datetime:
        """Return timezone-aware datetime in APP_TZ."""
        ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(APP_TZ)


class FakeClock:
    def __init__(self, current: datetime) -> None:
        self._current = ensure_app_tz(current)

    def now(self) -> datetime:
        return self._current

    def advance(self, *, hours: int = 0, minutes: int = 0, days: int = 0) -> None:
        self._current = self._current + timedelta(days=days, hours=hours, minutes=minutes)

    def set(self, current: datetime) -> None:
        self._current = ensure_app_tz(current)


def ensure_app_tz(dt: datetime) -> datetime:
    """Normalize to Asia/Shanghai. Naive datetimes are interpreted as Shanghai local."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=APP_TZ)
    return dt.astimezone(APP_TZ)


# re-export for tests that mention UTC offset without ZoneInfo
UTC = timezone.utc
