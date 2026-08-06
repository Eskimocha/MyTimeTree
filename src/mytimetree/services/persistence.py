"""In-memory draft buffer: dirty detection + flush before close (E6.4)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from mytimetree.domain.errors import DomainError, ErrorCode, ensure
from mytimetree.domain.settings import AccountSettings
from mytimetree.services.settings import SettingsService


@dataclass(frozen=True, slots=True)
class FlushResult:
    flushed: bool
    account_id: int | None = None
    settings: AccountSettings | None = None


@dataclass
class PersistenceGuard:
    """Tracks unsaved settings drafts for the portal close-check hook."""

    settings: SettingsService
    _draft_account_id: int | None = field(default=None, init=False, repr=False)
    _draft_patch: dict[str, Any] = field(default_factory=dict, init=False, repr=False)
    _confirm_token: str | None = field(default=None, init=False, repr=False)

    def is_dirty(self) -> bool:
        return bool(self._draft_patch) and self._draft_account_id is not None

    def can_close(self) -> bool:
        return not self.is_dirty()

    def set_draft(
        self,
        account_id: int,
        *,
        confirm_token: str | None = None,
        **patch: Any,
    ) -> None:
        ensure(bool(patch), ErrorCode.VALIDATION, "草稿不能为空")
        if self._draft_account_id is not None and self._draft_account_id != account_id:
            raise DomainError(
                ErrorCode.CONFLICT,
                "已有其他账户未保存草稿，请先 flush 或 discard",
            )
        self._draft_account_id = account_id
        self._draft_patch.update(patch)
        if confirm_token is not None:
            self._confirm_token = confirm_token

    def discard(self) -> None:
        self._draft_account_id = None
        self._draft_patch.clear()
        self._confirm_token = None

    def flush(self) -> FlushResult:
        if not self.is_dirty():
            return FlushResult(flushed=False)
        assert self._draft_account_id is not None
        account_id = self._draft_account_id
        patch = dict(self._draft_patch)
        token = self._confirm_token
        updated = self.settings.update(account_id, confirm_token=token, **patch)
        self.discard()
        return FlushResult(flushed=True, account_id=account_id, settings=updated)

    def status(self) -> dict[str, Any]:
        return {
            "dirty": self.is_dirty(),
            "can_close": self.can_close(),
            "draft_account_id": self._draft_account_id,
            "draft_fields": sorted(self._draft_patch.keys()),
        }
