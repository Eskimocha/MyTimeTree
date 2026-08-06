"""Membership stub — V1 always reports not enabled (online entitlements later)."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from mytimetree.db.connection import execute


@dataclass(frozen=True, slots=True)
class MembershipStatus:
    enabled: bool
    code: str
    message: str
    plan: str = "none"
    expires_at: str | None = None


class MembershipService:
    """Local row reserved for future online membership; V1 never gates features."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get_status(self) -> MembershipStatus:
        row = execute(
            self._conn,
            "SELECT plan, status, expires_at FROM membership WHERE id = 1",
        ).fetchone()
        if row is None:
            return MembershipStatus(
                enabled=False,
                code="not_enabled",
                message="会员功能未启用",
                plan="none",
            )
        # V1 product rule: always treat as disabled regardless of stored plan/status
        return MembershipStatus(
            enabled=False,
            code="not_enabled",
            message="会员功能未启用",
            plan=str(row["plan"] or "none"),
            expires_at=row["expires_at"],
        )
