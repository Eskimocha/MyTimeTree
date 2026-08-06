"""Account lifecycle: open, list, switch, attributes (parent app / multi-child)."""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from mytimetree.db.connection import execute
from mytimetree.domain.account import Account
from mytimetree.domain.errors import DomainError, ErrorCode, ensure
from mytimetree.domain.time import Clock, SystemClock, ensure_app_tz
from mytimetree.services.password import hash_password

CURRENT_ACCOUNT_KEY = "current_account_id"


class AccountService:
    def __init__(self, conn: sqlite3.Connection, *, clock: Clock | None = None) -> None:
        self._conn = conn
        self._clock = clock or SystemClock()

    def open_account(
        self,
        *,
        name: str,
        password: str,
        asset_interest_rate: float,
        attributes: dict[str, Any] | None = None,
    ) -> Account:
        """Open a child account.

        ``asset_interest_rate`` is a **daily** rate (e.g. 0.01 = 1%/天).
        Liability daily rate defaults to half of the asset daily rate.
        """
        cleaned = name.strip()
        ensure(bool(cleaned), ErrorCode.VALIDATION, "账户名不能为空")
        ensure(bool(password), ErrorCode.VALIDATION, "密码不能为空")
        ensure(asset_interest_rate >= 0, ErrorCode.VALIDATION, "资产日利率不能为负")

        # 负债日利率默认 = 资产日利率 × 1/2（D4）
        liability_rate = asset_interest_rate / 2.0
        attrs = dict(attributes or {})
        now = ensure_app_tz(self._clock.now()).isoformat()
        pw_hash = hash_password(password)

        try:
            cur = execute(
                self._conn,
                "INSERT INTO accounts (name, password_hash, attributes_json, created_at) "
                "VALUES (?, ?, ?, ?)",
                (cleaned, pw_hash, json.dumps(attrs, ensure_ascii=False), now),
            )
        except sqlite3.IntegrityError as exc:
            raise DomainError(ErrorCode.CONFLICT, f"账户名已存在: {cleaned}") from exc

        account_id = int(cur.lastrowid)
        execute(
            self._conn,
            "INSERT INTO settings (account_id, asset_interest_rate, liability_interest_rate) "
            "VALUES (?, ?, ?)",
            (account_id, float(asset_interest_rate), float(liability_rate)),
        )
        self._set_state(CURRENT_ACCOUNT_KEY, str(account_id))
        self._conn.commit()
        return Account(id=account_id, name=cleaned, attributes=attrs)

    def list_accounts(self) -> list[Account]:
        rows = execute(
            self._conn,
            "SELECT id, name, attributes_json FROM accounts ORDER BY id ASC",
        ).fetchall()
        return [self._row_to_account(r) for r in rows]

    def get_account(self, account_id: int) -> Account:
        row = execute(
            self._conn,
            "SELECT id, name, attributes_json FROM accounts WHERE id = ?",
            (account_id,),
        ).fetchone()
        if row is None:
            raise DomainError(ErrorCode.NOT_FOUND, f"账户不存在: {account_id}")
        return self._row_to_account(row)

    def current_account_id(self) -> int | None:
        raw = self._get_state(CURRENT_ACCOUNT_KEY)
        return int(raw) if raw is not None else None

    def require_current_account(self) -> Account:
        account_id = self.current_account_id()
        if account_id is None:
            raise DomainError(ErrorCode.FORBIDDEN, "请先开户后再使用其他功能")
        return self.get_account(account_id)

    def switch_account(self, account_id: int) -> Account:
        acc = self.get_account(account_id)
        self._set_state(CURRENT_ACCOUNT_KEY, str(acc.id))
        self._conn.commit()
        return acc

    def update_attributes(self, account_id: int, patch: dict[str, Any]) -> Account:
        acc = self.get_account(account_id)
        merged = {**acc.attributes, **patch}
        execute(
            self._conn,
            "UPDATE accounts SET attributes_json = ? WHERE id = ?",
            (json.dumps(merged, ensure_ascii=False), account_id),
        )
        self._conn.commit()
        return Account(id=acc.id, name=acc.name, attributes=merged)

    def list_ledger_for_current(self) -> list[sqlite3.Row]:
        acc = self.require_current_account()
        return execute(
            self._conn,
            "SELECT id, account_id, category, amount_minutes, summary, created_at "
            "FROM ledger_entries WHERE account_id = ? ORDER BY id ASC",
            (acc.id,),
        ).fetchall()

    def _row_to_account(self, row: sqlite3.Row) -> Account:
        attrs = json.loads(row["attributes_json"] or "{}")
        if not isinstance(attrs, dict):
            attrs = {}
        return Account(id=int(row["id"]), name=str(row["name"]), attributes=attrs)

    def _get_state(self, key: str) -> str | None:
        row = execute(
            self._conn,
            "SELECT value FROM app_state WHERE key = ?",
            (key,),
        ).fetchone()
        return None if row is None else str(row["value"])

    def _set_state(self, key: str, value: str) -> None:
        execute(
            self._conn,
            "INSERT INTO app_state (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
