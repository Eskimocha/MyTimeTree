"""Input sanitization for user-facing text fields (summaries, presets)."""

from __future__ import annotations

import re

from mytimetree.domain.errors import DomainError, ErrorCode, ensure

SUMMARY_MAX_LEN = 200

_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_TAG_RE = re.compile(r"<[^>]*>")


def sanitize_summary(text: str | None, *, max_len: int = SUMMARY_MAX_LEN) -> str | None:
    """Clean ledger summary: strip tags/controls, trim, enforce length.

    Returns None for None input. Raises VALIDATION if the result would be empty
    after cleaning a non-None input that had only junk.
    """
    if text is None:
        return None
    cleaned = _TAG_RE.sub("", text)
    cleaned = _CONTROL_RE.sub("", cleaned)
    cleaned = cleaned.strip()
    ensure(bool(cleaned), ErrorCode.VALIDATION, "摘要不能为空或仅含非法字符")
    if len(cleaned) > max_len:
        cleaned = cleaned[:max_len]
    return cleaned


def sanitize_preset_label(text: str, *, max_len: int = 40) -> str:
    cleaned = sanitize_summary(text, max_len=max_len)
    assert cleaned is not None
    return cleaned
