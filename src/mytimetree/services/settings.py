"""Per-account settings CRUD with access isolation and rate-change confirm."""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from mytimetree.db.connection import execute
from mytimetree.domain.errors import DomainError, ErrorCode, ensure
from mytimetree.domain.sanitize import sanitize_preset_label
from mytimetree.domain.settings import AccountSettings
from mytimetree.services.accounts import AccountService
from mytimetree.services.security import AccessGuard, ConfirmTokenService
from mytimetree.domain.time import Clock, SystemClock

RATE_FIELDS = frozenset({"asset_interest_rate", "liability_interest_rate"})
ACTION_UPDATE_RATES = "update_rates"


class SettingsService:
    def __init__(
        self,
        conn: sqlite3.Connection,
        *,
        accounts: AccountService,
        clock: Clock | None = None,
        tokens: ConfirmTokenService | None = None,
    ) -> None:
        self._conn = conn
        self._accounts = accounts
        self._clock = clock or SystemClock()
        self._guard = AccessGuard(conn, accounts=accounts)
        self._tokens = tokens or ConfirmTokenService(
            conn, accounts=accounts, clock=self._clock
        )

    def get(self, account_id: int) -> AccountSettings:
        self._accounts.get_account(account_id)
        row = execute(
            self._conn,
            "SELECT account_id, daily_grant_minutes, default_spend_minutes, "
            "default_repay_minutes, asset_interest_rate, liability_interest_rate, "
            "repay_presets_json, display_colors_json FROM settings WHERE account_id = ?",
            (account_id,),
        ).fetchone()
        if row is None:
            raise DomainError(ErrorCode.NOT_FOUND, f"账户设置不存在: {account_id}")
        return self._row_to_settings(row)

    def update(
        self,
        account_id: int,
        *,
        confirm_token: str | None = None,
        **patch: Any,
    ) -> AccountSettings:
        """Update settings for the **current** account only.

        Changing interest rates requires a one-time ``confirm_token`` issued for
        action ``update_rates``.
        """
        self._guard.require_current_account(account_id)
        if not patch:
            return self.get(account_id)

        allowed = {
            "daily_grant_minutes",
            "default_spend_minutes",
            "default_repay_minutes",
            "asset_interest_rate",
            "liability_interest_rate",
            "repay_presets",
            "display_colors",
        }
        unknown = set(patch) - allowed
        ensure(not unknown, ErrorCode.VALIDATION, f"未知设置字段: {sorted(unknown)}")

        current = self.get(account_id)
        daily_grant = self._nonneg_int(
            patch.get("daily_grant_minutes", current.daily_grant_minutes),
            "daily_grant_minutes",
        )
        default_spend = self._pos_int(
            patch.get("default_spend_minutes", current.default_spend_minutes),
            "default_spend_minutes",
        )
        default_repay = self._pos_int(
            patch.get("default_repay_minutes", current.default_repay_minutes),
            "default_repay_minutes",
        )
        asset_rate = self._nonneg_float(
            patch.get("asset_interest_rate", current.asset_interest_rate),
            "asset_interest_rate",
        )
        liability_rate = self._nonneg_float(
            patch.get("liability_interest_rate", current.liability_interest_rate),
            "liability_interest_rate",
        )

        if "repay_presets" in patch:
            presets = self._normalize_presets(patch["repay_presets"])
        else:
            presets = list(current.repay_presets)

        if "display_colors" in patch:
            colors = self._normalize_colors(patch["display_colors"])
        else:
            colors = dict(current.display_colors)

        touches_rates = bool(RATE_FIELDS & set(patch))
        if touches_rates:
            ensure(
                confirm_token is not None,
                ErrorCode.FORBIDDEN,
                "修改利率需要二次确认令牌",
            )
            self._tokens.consume(
                confirm_token,  # type: ignore[arg-type]
                action=ACTION_UPDATE_RATES,
                account_id=account_id,
            )

        execute(
            self._conn,
            "UPDATE settings SET daily_grant_minutes = ?, default_spend_minutes = ?, "
            "default_repay_minutes = ?, asset_interest_rate = ?, liability_interest_rate = ?, "
            "repay_presets_json = ?, display_colors_json = ? WHERE account_id = ?",
            (
                daily_grant,
                default_spend,
                default_repay,
                float(asset_rate),
                float(liability_rate),
                json.dumps(presets, ensure_ascii=False),
                json.dumps(colors, ensure_ascii=False),
                account_id,
            ),
        )
        self._conn.commit()
        return self.get(account_id)

    def _nonneg_int(self, value: Any, field: str) -> int:
        try:
            n = int(value)
        except (TypeError, ValueError) as exc:
            raise DomainError(ErrorCode.VALIDATION, f"{field} 必须为整数") from exc
        ensure(n >= 0, ErrorCode.VALIDATION, f"{field} 不能为负")
        return n

    def _pos_int(self, value: Any, field: str) -> int:
        n = self._nonneg_int(value, field)
        ensure(n > 0, ErrorCode.VALIDATION, f"{field} 必须为正")
        return n

    def _nonneg_float(self, value: Any, field: str) -> float:
        try:
            x = float(value)
        except (TypeError, ValueError) as exc:
            raise DomainError(ErrorCode.VALIDATION, f"{field} 必须为数字") from exc
        ensure(x >= 0, ErrorCode.VALIDATION, f"{field} 不能为负")
        return x

    def _normalize_presets(self, raw: Any) -> list[str]:
        ensure(isinstance(raw, list), ErrorCode.VALIDATION, "repay_presets 必须为列表")
        out: list[str] = []
        for item in raw:
            ensure(isinstance(item, str), ErrorCode.VALIDATION, "预设文案必须为字符串")
            out.append(sanitize_preset_label(item))
        return out

    def _normalize_colors(self, raw: Any) -> dict[str, str]:
        ensure(isinstance(raw, dict), ErrorCode.VALIDATION, "display_colors 必须为对象")
        out: dict[str, str] = {}
        for k, v in raw.items():
            ensure(isinstance(k, str) and isinstance(v, str), ErrorCode.VALIDATION, "配色键值须为字符串")
            out[k] = v[:64]
        return out

    def _row_to_settings(self, row: sqlite3.Row) -> AccountSettings:
        presets = json.loads(row["repay_presets_json"] or "[]")
        if not isinstance(presets, list):
            presets = []
        colors = json.loads(row["display_colors_json"] or "{}")
        if not isinstance(colors, dict):
            colors = {}
        return AccountSettings(
            account_id=int(row["account_id"]),
            daily_grant_minutes=int(row["daily_grant_minutes"]),
            default_spend_minutes=int(row["default_spend_minutes"]),
            default_repay_minutes=int(row["default_repay_minutes"]),
            asset_interest_rate=float(row["asset_interest_rate"]),
            liability_interest_rate=float(row["liability_interest_rate"]),
            repay_presets=[str(x) for x in presets],
            display_colors={str(k): str(v) for k, v in colors.items()},
        )
