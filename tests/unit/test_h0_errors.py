"""H0.2 — habit-related domain error codes."""

import pytest

from mytimetree.domain.errors import DomainError, ErrorCode, ensure


@pytest.mark.unit
@pytest.mark.parametrize(
    "code",
    [
        ErrorCode.HABIT_NOT_MICRO,
        ErrorCode.HABIT_ALREADY_LOGGED,
        ErrorCode.CREDIT_NOT_REDEEMABLE,
        ErrorCode.HABIT_ARCHIVED,
        ErrorCode.EXCHANGE_RULE_INACTIVE,
    ],
)
def test_habit_error_codes_exist(code: ErrorCode):
    err = DomainError(code, "probe")
    assert err.code is code
    assert code.value.startswith("habit_") or code.value.startswith("credit_") or code.value.startswith(
        "exchange_"
    )


@pytest.mark.unit
def test_ensure_raises_habit_not_micro():
    with pytest.raises(DomainError) as ei:
        ensure(False, ErrorCode.HABIT_NOT_MICRO, "est_minutes too large")
    assert ei.value.code == ErrorCode.HABIT_NOT_MICRO
