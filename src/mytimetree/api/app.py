"""FastAPI application factory for MyTimeTree portal APIs + static SPA."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from mytimetree.domain.errors import DomainError, ErrorCode
from mytimetree.domain.time import Clock, SystemClock
from mytimetree.services.accounts import AccountService
from mytimetree.services.analytics import AnalyticsService
from mytimetree.services.backup import BackupService
from mytimetree.services.ledger import LedgerService
from mytimetree.services.ledger_query import LedgerQueryService
from mytimetree.services.membership import MembershipService
from mytimetree.services.persistence import PersistenceGuard
from mytimetree.services.remote_sync import RemoteSyncClient
from mytimetree.services.settings import SettingsService
from mytimetree.services.tree import TreeService

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
PORTAL_DIR = STATIC_DIR / "portal"


class OpenAccountBody(BaseModel):
    name: str
    password: str
    asset_interest_rate: float = 0.0


class SwitchAccountBody(BaseModel):
    account_id: int


class MinutesBody(BaseModel):
    minutes: int = Field(gt=0)
    summary: str | None = None


class SettingsPatchBody(BaseModel):
    account_id: int
    daily_grant_minutes: int | None = None
    default_spend_minutes: int | None = None
    default_repay_minutes: int | None = None
    asset_interest_rate: float | None = None
    liability_interest_rate: float | None = None
    confirm_token: str | None = None


def _http_status(code: ErrorCode) -> int:
    return {
        ErrorCode.VALIDATION: 400,
        ErrorCode.NOT_FOUND: 404,
        ErrorCode.CONFLICT: 409,
        ErrorCode.FORBIDDEN: 403,
        ErrorCode.INVALID_BALANCE: 400,
        ErrorCode.INTERNAL: 500,
    }.get(code, 500)


def _require(svc: Any, name: str) -> Any:
    if svc is None:
        raise HTTPException(status_code=503, detail=f"{name} 未配置")
    return svc


def create_app(
    *,
    conn: sqlite3.Connection | None = None,
    backup_dir: Path | str = "backups",
    clock: Clock | None = None,
    accounts: AccountService | None = None,
    ledger: LedgerService | None = None,
    settings: SettingsService | None = None,
    persistence: PersistenceGuard | None = None,
    backups: BackupService | None = None,
    ledger_query: LedgerQueryService | None = None,
    analytics: AnalyticsService | None = None,
    tree: TreeService | None = None,
    membership: MembershipService | None = None,
    remote_sync: RemoteSyncClient | None = None,
) -> FastAPI:
    """Build API app. Tests inject services; production wires DB later."""
    clock = clock or SystemClock()
    backup_dir_path = Path(backup_dir)
    backup_svc = backups or BackupService(backup_dir=backup_dir_path)
    remote_svc = remote_sync or RemoteSyncClient()

    app = FastAPI(title="MyTimeTree", version="0.1.0")
    app.state.conn = conn
    app.state.clock = clock
    app.state.accounts = accounts
    app.state.ledger = ledger
    app.state.settings = settings
    app.state.persistence = persistence
    app.state.backups = backup_svc
    app.state.ledger_query = ledger_query
    app.state.analytics = analytics
    app.state.tree = tree
    app.state.membership = membership
    app.state.remote_sync = remote_svc

    if STATIC_DIR.is_dir():
        app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    @app.exception_handler(DomainError)
    async def domain_error_handler(_request: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=_http_status(exc.code),
            content={"code": exc.code.value, "message": exc.message},
        )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/")
    def portal_index() -> FileResponse:
        index = PORTAL_DIR / "index.html"
        if not index.is_file():
            raise HTTPException(status_code=404, detail="portal 未安装")
        return FileResponse(index)

    # --- accounts / bootstrap ---

    @app.get("/api/portal/bootstrap")
    def portal_bootstrap() -> dict[str, Any]:
        acc_svc = _require(app.state.accounts, "accounts")
        items = [{"id": a.id, "name": a.name, "attributes": a.attributes} for a in acc_svc.list_accounts()]
        current = acc_svc.current_account_id()
        membership_payload = {
            "enabled": False,
            "code": "not_enabled",
            "message": "会员功能未启用",
        }
        if app.state.membership is not None:
            st = app.state.membership.get_status()
            membership_payload = {
                "enabled": st.enabled,
                "code": st.code,
                "message": st.message,
                "plan": st.plan,
            }
        # SYNC_POINT: pull_membership — optional refresh from remote (V1 no-op)
        app.state.remote_sync.pull_membership()
        return {
            "needs_onboarding": len(items) == 0,
            "accounts": items,
            "current_account_id": current,
            "membership": membership_payload,
        }

    @app.get("/api/membership")
    def membership_status() -> dict[str, Any]:
        svc = app.state.membership
        if svc is None:
            return {
                "enabled": False,
                "code": "not_enabled",
                "message": "会员功能未启用",
                "plan": "none",
            }
        st = svc.get_status()
        return {
            "enabled": st.enabled,
            "code": st.code,
            "message": st.message,
            "plan": st.plan,
            "expires_at": st.expires_at,
        }

    @app.post("/api/sync/push")
    def sync_push() -> dict[str, Any]:
        """V1 stub: never blocks; reports skipped until remote is configured."""
        remote = app.state.remote_sync
        result = remote.push_ledger(account_id=0, entries=[])
        return {
            "ok": result.ok,
            "skipped": result.skipped,
            "message": result.message,
            "detail": result.detail,
        }

    @app.post("/api/accounts")
    def open_account(body: OpenAccountBody) -> dict[str, Any]:
        acc_svc = _require(app.state.accounts, "accounts")
        acc = acc_svc.open_account(
            name=body.name,
            password=body.password,
            asset_interest_rate=body.asset_interest_rate,
        )
        return {"id": acc.id, "name": acc.name, "attributes": acc.attributes}

    @app.post("/api/accounts/switch")
    def switch_account(body: SwitchAccountBody) -> dict[str, Any]:
        acc_svc = _require(app.state.accounts, "accounts")
        acc = acc_svc.switch_account(body.account_id)
        return {"id": acc.id, "name": acc.name}

    @app.get("/api/portal/home")
    def portal_home() -> dict[str, Any]:
        acc_svc = _require(app.state.accounts, "accounts")
        tree_svc = _require(app.state.tree, "tree")
        acc = acc_svc.require_current_account()
        state = tree_svc.get_state(acc.id)
        o = state.ornaments
        return {
            "account": {"id": acc.id, "name": acc.name},
            "balance": {
                "asset": state.asset_minutes,
                "liability": state.liability_minutes,
                "net": state.net_minutes,
                "cumulative_interest": state.cumulative_interest,
                "today_interest": state.today_interest,
            },
            "tree": {
                "stage": state.stage.value,
                "ornaments": {
                    "fruit_count": o.fruit_count,
                    "golden_fruit_count": o.golden_fruit_count,
                    "pest_count": o.pest_count,
                    "woodpecker_count": o.woodpecker_count,
                    "interest_fruit_count": o.interest_fruit_count,
                    # alias for older clients
                    "monthly_fruit_count": o.interest_fruit_count,
                },
            },
        }

    @app.post("/api/portal/deposit")
    def portal_deposit(body: MinutesBody) -> dict[str, Any]:
        """存入：优先还负债，超额进资产（底层与 repay 相同）。"""
        acc_svc = _require(app.state.accounts, "accounts")
        ledger_svc = _require(app.state.ledger, "ledger")
        acc = acc_svc.require_current_account()
        entries = ledger_svc.deposit(
            acc.id, minutes=body.minutes, summary=body.summary or "存入"
        )
        return {
            "ids": [e.id for e in entries],
            "count": len(entries),
            "categories": [e.category.value for e in entries],
        }

    @app.post("/api/portal/spend")
    def portal_spend(body: MinutesBody) -> dict[str, Any]:
        acc_svc = _require(app.state.accounts, "accounts")
        ledger_svc = _require(app.state.ledger, "ledger")
        acc = acc_svc.require_current_account()
        entry = ledger_svc.spend(acc.id, minutes=body.minutes, summary=body.summary)
        return {"id": entry.id, "category": entry.category.value}

    @app.post("/api/portal/borrow")
    def portal_borrow(body: MinutesBody) -> dict[str, Any]:
        acc_svc = _require(app.state.accounts, "accounts")
        ledger_svc = _require(app.state.ledger, "ledger")
        acc = acc_svc.require_current_account()
        entries = ledger_svc.borrow(acc.id, minutes=body.minutes, summary=body.summary)
        return {
            "ids": [e.id for e in entries],
            "count": len(entries),
            "categories": [e.category.value for e in entries],
        }

    @app.post("/api/portal/repay")
    def portal_repay(body: MinutesBody) -> dict[str, Any]:
        """与存入同义：优先还负债，超额进资产。"""
        acc_svc = _require(app.state.accounts, "accounts")
        ledger_svc = _require(app.state.ledger, "ledger")
        acc = acc_svc.require_current_account()
        entries = ledger_svc.repay(
            acc.id, minutes=body.minutes, summary=body.summary or "存入"
        )
        return {
            "ids": [e.id for e in entries],
            "count": len(entries),
            "categories": [e.category.value for e in entries],
        }

    @app.get("/api/settings")
    def get_settings(account_id: int) -> dict[str, Any]:
        settings_svc = _require(app.state.settings, "settings")
        s = settings_svc.get(account_id)
        return {
            "account_id": s.account_id,
            "daily_grant_minutes": s.daily_grant_minutes,
            "default_spend_minutes": s.default_spend_minutes,
            "default_repay_minutes": s.default_repay_minutes,
            "asset_interest_rate": s.asset_interest_rate,
            "liability_interest_rate": s.liability_interest_rate,
            "repay_presets": s.repay_presets,
            "display_colors": s.display_colors,
        }

    @app.patch("/api/settings")
    def patch_settings(body: SettingsPatchBody) -> dict[str, Any]:
        settings_svc = _require(app.state.settings, "settings")
        patch: dict[str, Any] = {}
        for key in (
            "daily_grant_minutes",
            "default_spend_minutes",
            "default_repay_minutes",
            "asset_interest_rate",
            "liability_interest_rate",
        ):
            val = getattr(body, key)
            if val is not None:
                patch[key] = val
        updated = settings_svc.update(
            body.account_id, confirm_token=body.confirm_token, **patch
        )
        return {
            "account_id": updated.account_id,
            "daily_grant_minutes": updated.daily_grant_minutes,
            "default_spend_minutes": updated.default_spend_minutes,
            "default_repay_minutes": updated.default_repay_minutes,
            "asset_interest_rate": updated.asset_interest_rate,
            "liability_interest_rate": updated.liability_interest_rate,
        }

    # --- backups / persistence / ledger / analytics (E6–E7) ---

    @app.get("/api/backups")
    def list_backups() -> dict[str, Any]:
        items = []
        for art in backup_svc.list_artifacts():
            items.append(
                {
                    "filename": art.filename,
                    "kind": art.kind,
                    "created_at": art.created_at.isoformat() if art.created_at else None,
                    "download_url": f"/api/backups/{art.filename}",
                }
            )
        return {"items": items}

    @app.get("/api/backups/{filename}")
    def download_backup(filename: str) -> JSONResponse:
        try:
            data = backup_svc.read_artifact(filename)
        except DomainError as exc:
            raise HTTPException(
                status_code=_http_status(exc.code),
                detail=exc.message,
            ) from exc
        return JSONResponse(content=data)

    @app.get("/api/persistence/status")
    def persistence_status() -> dict[str, Any]:
        guard = _require(app.state.persistence, "persistence")
        return guard.status()

    @app.post("/api/persistence/flush")
    def persistence_flush() -> dict[str, Any]:
        guard = _require(app.state.persistence, "persistence")
        result = guard.flush()
        return {
            "flushed": result.flushed,
            "account_id": result.account_id,
            "can_close": guard.can_close(),
        }

    @app.post("/api/persistence/discard")
    def persistence_discard() -> dict[str, Any]:
        guard = _require(app.state.persistence, "persistence")
        guard.discard()
        return guard.status()

    @app.get("/api/ledger")
    def list_ledger(
        account_id: int,
        category: str | None = None,
        limit: int = 20,
        offset: int = 0,
        locale: str = "zh-CN",
    ) -> dict[str, Any]:
        svc = _require(app.state.ledger_query, "ledger_query")
        page = svc.query(
            account_id=account_id,
            category=category,
            limit=limit,
            offset=offset,
            locale=locale,
        )
        return {
            "total": page.total,
            "limit": page.limit,
            "offset": page.offset,
            "has_more": page.has_more,
            "items": [
                {
                    "id": it.entry.id,
                    "account_id": it.entry.account_id,
                    "category": it.entry.category.value,
                    "amount_minutes": it.entry.amount_minutes,
                    "summary": it.entry.summary,
                    "correlation_id": it.entry.correlation_id,
                    "created_at": it.entry.created_at,
                    "signed_asset_effect": it.signed_asset_effect,
                    "signed_liability_effect": it.signed_liability_effect,
                    "display": {
                        "tone": it.tone.value,
                        "color": it.color,
                    },
                }
                for it in page.items
            ],
        }

    @app.get("/api/analytics/weekly")
    def analytics_weekly(account_id: int) -> dict[str, Any]:
        svc = _require(app.state.analytics, "analytics")
        return _trend_dict(svc.weekly_trend(account_id=account_id))

    @app.get("/api/analytics/monthly")
    def analytics_monthly(account_id: int) -> dict[str, Any]:
        svc = _require(app.state.analytics, "analytics")
        return _trend_dict(svc.monthly_trend(account_id=account_id))

    @app.get("/api/ornament-events")
    def ornament_events(account_id: int, limit: int = 200) -> dict[str, Any]:
        """挂件审计日志（星/太阳/虫/鸟）；门户不展示，供排查用。"""
        ledger_svc = _require(app.state.ledger, "ledger")
        items = ledger_svc.list_ornament_events(account_id, limit=min(limit, 500))
        return {"items": items, "total": len(items)}

    return app


def _trend_dict(report: Any) -> dict[str, Any]:
    return {
        "account_id": report.account_id,
        "granularity": report.granularity,
        "period_start": report.period_start,
        "period_end": report.period_end,
        "entry_count": report.entry_count,
        "asset_in_minutes": report.asset_in_minutes,
        "asset_out_minutes": report.asset_out_minutes,
        "interest_minutes": report.interest_minutes,
        "liability_in_minutes": report.liability_in_minutes,
        "liability_out_minutes": report.liability_out_minutes,
        "ending_asset": report.ending_asset,
        "ending_liability": report.ending_liability,
        "ending_net": report.ending_net,
        "series": [
            {
                "date": p.date,
                "asset": p.asset,
                "liability": p.liability,
                "net": p.net,
                "interest_net": p.interest_net,
            }
            for p in report.series
        ],
    }
