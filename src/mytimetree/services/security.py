"""Access guard + one-time confirm tokens for dangerous operations."""

from __future__ import annotations

import json
import secrets
import sqlite3
from datetime import datetime, timedelta

from mytimetree.db.connection import execute
from mytimetree.domain.errors import DomainError, ErrorCode, ensure
from mytimetree.domain.time import APP_TZ, Clock, SystemClock, ensure_app_tz
from mytimetree.services.accounts import AccountService
from mytimetree.services.password import verify_password

_TOKEN_PREFIX = "confirm_token:"


class AccessGuard:
    """Parent-app account isolation: operate only on the current child account."""

    def __init__(self, conn: sqlite3.Connection, *, accounts: AccountService) -> None:
        self._conn = conn
        self._accounts = accounts

    def require_current_account(self, account_id: int) -> None:
        self._accounts.get_account(account_id)
        current = self._accounts.current_account_id()
        ensure(
            current is not None and int(current) == int(account_id),
            ErrorCode.FORBIDDEN,
            f"无权操作该账户: 目标={account_id}, 当前={current}",
        )

    def verify_password(self, account_id: int, password: str) -> None:
        row = execute(
            self._conn,
            "SELECT password_hash FROM accounts WHERE id = ?",
            (account_id,),
        ).fetchone()
        if row is None:
            raise DomainError(ErrorCode.NOT_FOUND, f"账户不存在: {account_id}")
        ok = verify_password(password, str(row["password_hash"]))
        ensure(ok, ErrorCode.FORBIDDEN, "密码错误")


class ConfirmTokenService:
    """Issue/consume one-time tokens for dangerous ops (e.g. rate changes)."""

    def __init__(
        self,
        conn: sqlite3.Connection,
        *,
        accounts: AccountService,
        clock: Clock | None = None,
        default_ttl_seconds: int = 300,
    ) -> None:
        self._conn = conn
        self._accounts = accounts
        self._clock = clock or SystemClock()
        self._default_ttl = default_ttl_seconds
        self._guard = AccessGuard(conn, accounts=accounts)

    def issue(
        self,
        *,
        action: str,
        account_id: int,
        ttl_seconds: int | None = None,
    ) -> str:
        ensure(bool(action.strip()), ErrorCode.VALIDATION, "action 不能为空")
        self._guard.require_current_account(account_id)
        ttl = self._default_ttl if ttl_seconds is None else ttl_seconds
        ensure(ttl > 0, ErrorCode.VALIDATION, "ttl 必须为正")
        now = ensure_app_tz(self._clock.now())
        expires = (now + timedelta(seconds=ttl)).isoformat()
        token = secrets.token_urlsafe(24)
        payload = json.dumps(
            {"action": action, "account_id": account_id, "expires_at": expires},
            ensure_ascii=False,
        )
        execute(
            self._conn,
            "INSERT INTO app_state (key, value) VALUES (?, ?)",
            (f"{_TOKEN_PREFIX}{token}", payload),
        )
        self._conn.commit()
        return token

    def consume(self, token: str, *, action: str, account_id: int) -> None:
        key = f"{_TOKEN_PREFIX}{token}"
        row = execute(
            self._conn,
            "SELECT value FROM app_state WHERE key = ?",
            (key,),
        ).fetchone()
        ensure(row is not None, ErrorCode.FORBIDDEN, "确认令牌无效或已使用")
        try:
            data = json.loads(str(row["value"]))
        except json.JSONDecodeError as exc:
            raise DomainError(ErrorCode.FORBIDDEN, "确认令牌损坏") from exc

        execute(self._conn, "DELETE FROM app_state WHERE key = ?", (key,))
        self._conn.commit()

        ensure(
            str(data.get("action")) == action,
            ErrorCode.FORBIDDEN,
            "确认令牌与操作不匹配",
        )
        ensure(
            int(data.get("account_id", -1)) == int(account_id),
            ErrorCode.FORBIDDEN,
            "确认令牌与账户不匹配",
        )
        expires_raw = str(data.get("expires_at", ""))
        try:
            expires_at = datetime.fromisoformat(expires_raw)
        except ValueError as exc:
            raise DomainError(ErrorCode.FORBIDDEN, "确认令牌过期时间无效") from exc
        now = ensure_app_tz(self._clock.now())
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=APP_TZ)
        ensure(now <= expires_at, ErrorCode.FORBIDDEN, "确认令牌已过期")
