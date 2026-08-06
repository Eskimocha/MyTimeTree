"""E0.2 — Clock (Asia/Shanghai) and Minutes invariants."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from mytimetree.domain.errors import DomainError, ErrorCode
from mytimetree.domain.money_time import Balance, Minutes
from mytimetree.domain.time import APP_TZ, FakeClock, SystemClock, ensure_app_tz


@pytest.mark.unit
def test_app_tz_is_utc_plus_8():
    sample = datetime(2026, 8, 5, 12, 0, 0, tzinfo=APP_TZ)
    assert sample.utcoffset() == timedelta(hours=8)
    assert APP_TZ.key == "Asia/Shanghai"


@pytest.mark.unit
def test_fake_clock_returns_fixed_shanghai_time():
    fixed = datetime(2026, 8, 5, 0, 0, 0, tzinfo=APP_TZ)
    clock = FakeClock(fixed)
    assert clock.now() == fixed
    assert clock.now().tzinfo == APP_TZ


@pytest.mark.unit
def test_fake_clock_advance():
    clock = FakeClock(datetime(2026, 8, 5, 0, 0, 0, tzinfo=APP_TZ))
    clock.advance(hours=1)
    assert clock.now().hour == 1


@pytest.mark.unit
def test_ensure_app_tz_converts_naive_as_shanghai():
    naive = datetime(2026, 8, 5, 12, 0, 0)
    aware = ensure_app_tz(naive)
    assert aware.tzinfo == APP_TZ
    assert aware.hour == 12


@pytest.mark.unit
def test_ensure_app_tz_converts_other_zone_to_shanghai():
    utc = datetime(2026, 8, 5, 0, 0, 0, tzinfo=timezone.utc)
    local = ensure_app_tz(utc)
    assert local.tzinfo == APP_TZ
    assert local.hour == 8


@pytest.mark.unit
def test_system_clock_is_timezone_aware_shanghai():
    now = SystemClock().now()
    assert now.tzinfo is not None
    assert now.utcoffset() == timedelta(hours=8)


@pytest.mark.unit
def test_minutes_reject_non_int():
    with pytest.raises(TypeError):
        Minutes(1.5)  # type: ignore[arg-type]


@pytest.mark.unit
def test_minutes_add_sub():
    assert (Minutes(10) + Minutes(5)).value == 15
    assert (Minutes(10) - Minutes(3)).value == 7


@pytest.mark.unit
def test_balance_rejects_negative_asset_or_liability():
    with pytest.raises(DomainError) as ei:
        Balance(asset=Minutes(-1), liability=Minutes(0))
    assert ei.value.code == ErrorCode.INVALID_BALANCE

    with pytest.raises(DomainError) as ei2:
        Balance(asset=Minutes(0), liability=Minutes(-1))
    assert ei2.value.code == ErrorCode.INVALID_BALANCE


@pytest.mark.unit
def test_balance_net_can_be_computed():
    b = Balance(asset=Minutes(100), liability=Minutes(30))
    assert b.net.value == 70
