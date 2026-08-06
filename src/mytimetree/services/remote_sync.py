"""Remote sync placeholders for future online backend (E9.2).

V1 stub: no network calls. Methods exist so portal/jobs can call sync hooks
without branching on feature flags everywhere.

SYNC_POINT markers (wire real HTTP later):
  - push_ledger: after local ledger append / midnight backup
  - pull_membership: on portal bootstrap / settings open
  - push_settings: after settings flush
  - pull_accounts: optional multi-device restore
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class SyncResult:
    ok: bool
    skipped: bool
    message: str
    detail: dict[str, Any] | None = None


class RemoteSyncClient:
    """No-op remote client. ``is_configured()`` is False until base URL + token set."""

    def __init__(self, *, base_url: str | None = None, token: str | None = None) -> None:
        self._base_url = (base_url or "").rstrip("/") or None
        self._token = token or None

    def is_configured(self) -> bool:
        return bool(self._base_url and self._token)

    def push_ledger(self, *, account_id: int, entries: list[dict[str, Any]]) -> SyncResult:
        # SYNC_POINT: push_ledger — POST {base}/v1/accounts/{id}/ledger
        return self._skipped("push_ledger", account_id=account_id, count=len(entries))

    def pull_membership(self) -> SyncResult:
        # SYNC_POINT: pull_membership — GET {base}/v1/membership
        return self._skipped("pull_membership")

    def push_settings(self, *, account_id: int, settings: dict[str, Any]) -> SyncResult:
        # SYNC_POINT: push_settings — PUT {base}/v1/accounts/{id}/settings
        return self._skipped("push_settings", account_id=account_id)

    def pull_accounts(self) -> SyncResult:
        # SYNC_POINT: pull_accounts — GET {base}/v1/accounts
        return self._skipped("pull_accounts")

    def _skipped(self, op: str, **detail: Any) -> SyncResult:
        return SyncResult(
            ok=False,
            skipped=True,
            message=f"远程同步未配置（V1 stub）: {op}",
            detail={"op": op, **detail},
        )
