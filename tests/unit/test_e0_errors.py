"""E0.4 — DomainError."""

import pytest

from mytimetree.domain.errors import DomainError, ErrorCode, ensure


@pytest.mark.unit
def test_domain_error_has_code_and_message():
    err = DomainError(ErrorCode.NOT_FOUND, "account missing")
    assert err.code == ErrorCode.NOT_FOUND
    assert "account missing" in str(err)


@pytest.mark.unit
def test_ensure_raises_on_false():
    with pytest.raises(DomainError) as ei:
        ensure(False, ErrorCode.VALIDATION, "bad")
    assert ei.value.code == ErrorCode.VALIDATION


@pytest.mark.unit
def test_ensure_passes_on_true():
    ensure(True, ErrorCode.VALIDATION, "ok")
