"""H2 — ExchangeRule field validation (pure)."""

import pytest

from mytimetree.domain.errors import DomainError, ErrorCode
from mytimetree.domain.habit import validate_exchange_rule_fields


@pytest.mark.unit
def test_minutes_must_be_positive():
    with pytest.raises(DomainError) as ei:
        validate_exchange_rule_fields(
            minutes_per_completion=0,
            cadence="daily",
            auto_redeem=False,
            daily_cap_minutes=None,
        )
    assert ei.value.code == ErrorCode.VALIDATION


@pytest.mark.unit
def test_daily_cap_must_cover_one_completion():
    with pytest.raises(DomainError) as ei:
        validate_exchange_rule_fields(
            minutes_per_completion=10,
            cadence="daily",
            auto_redeem=False,
            daily_cap_minutes=5,
        )
    assert ei.value.code == ErrorCode.VALIDATION


@pytest.mark.unit
def test_valid_rule_fields_ok():
    validate_exchange_rule_fields(
        minutes_per_completion=5,
        cadence="daily",
        auto_redeem=True,
        daily_cap_minutes=5,
    )


@pytest.mark.unit
def test_bad_cadence_rejected():
    with pytest.raises(DomainError) as ei:
        validate_exchange_rule_fields(
            minutes_per_completion=5,
            cadence="weekly",
            auto_redeem=False,
            daily_cap_minutes=None,
        )
    assert ei.value.code == ErrorCode.VALIDATION
