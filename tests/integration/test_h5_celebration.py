"""H5 — celebration events on complete + board milestone idempotency."""

from __future__ import annotations

from datetime import datetime

import pytest

from mytimetree.db.connection import connect, execute
from mytimetree.db.migrate import apply_migrations
from mytimetree.domain.time import APP_TZ, FakeClock
from mytimetree.services.accounts import AccountService
from mytimetree.services.habit import HabitService
from mytimetree.services.habit_templates import seed_templates_into_db
from mytimetree.services.ledger import LedgerService


@pytest.fixture
def env(tmp_path):
    conn = connect(tmp_path / "h5.db")
    apply_migrations(conn)
    clock = FakeClock(datetime(2026, 10, 13, 12, 0, 0, tzinfo=APP_TZ))
    accounts = AccountService(conn, clock=clock)
    ledger = LedgerService(conn, accounts=accounts, clock=clock)
    habits = HabitService(conn, accounts=accounts, clock=clock, ledger=ledger)
    seed_templates_into_db(conn)
    # seed minimal parent script + offline hint for board payload
    execute(
        conn,
        "INSERT INTO parent_scripts (slug, habit_category, situation, script_text, tone) "
        "VALUES (?, ?, ?, ?, ?)",
        ("review-general", None, "review", "这周我们记下了好多好习惯！", "warm"),
    )
    execute(
        conn,
        "INSERT INTO offline_celebration_hints (slug, title, body, image_key, effort, suitable_for) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        ("high-five", "击掌", "和孩子击掌庆祝", "img-high-five", "playful", "board_milestone"),
    )
    conn.commit()
    a = accounts.open_account(name="小明", password="p", asset_interest_rate=0.0)
    ha = habits.enable_from_template(a.id, "brush-teeth")
    yield {"conn": conn, "clock": clock, "habits": habits, "a": a, "ha": ha}
    conn.close()


@pytest.mark.integration
def test_complete_returns_motivation_and_small_celebration(env):
    habits: HabitService = env["habits"]
    a, ha = env["a"], env["ha"]
    result = habits.complete_habit(a.id, ha.id)
    assert result.motivation_payload is not None
    assert "approach" in result.motivation_payload
    assert "avoid" in result.motivation_payload
    assert result.celebration is not None
    assert result.celebration.kind == "small"
    assert result.celebration.habit_log_id == result.log.id
    events = habits.list_celebration_events(a.id)
    assert any(e.kind == "small" and e.habit_log_id == result.log.id for e in events)


@pytest.mark.integration
def test_parent_override_prefers_custom_copy(env):
    habits: HabitService = env["habits"]
    a, ha = env["a"], env["ha"]
    habits.set_motivation_override(
        a.id,
        ha.id,
        {
            "approach": {"emotion_copy": "爸爸说真棒", "celebration_key": "dad"},
            "avoid": {"emotion_copy": "别忘了刷", "celebration_key": "dad"},
        },
    )
    result = habits.complete_habit(a.id, ha.id)
    assert result.motivation_payload["approach"]["emotion_copy"] == "爸爸说真棒"


@pytest.mark.integration
def test_board_milestone_idempotent(env):
    habits: HabitService = env["habits"]
    clock: FakeClock = env["clock"]
    a = env["a"]
    # five different habits across the week → board milestone at 5
    slugs = ["brush-teeth", "wash-hands", "wash-face", "rinse-cup", "pack-bag"]
    habit_ids = []
    for slug in slugs:
        habit_ids.append(habits.enable_from_template(a.id, slug).id)
    for hid in habit_ids:
        habits.complete_habit(a.id, hid)

    board1 = habits.evaluate_board_celebration(a.id)
    assert board1 is not None
    assert board1.kind == "board"
    assert board1.review_script_id is not None
    assert board1.offline_hint_id is not None

    board2 = habits.evaluate_board_celebration(a.id)
    assert board2 is None  # same milestone_id already recorded

    # next week can fire again
    clock.set(datetime(2026, 10, 20, 12, 0, 0, tzinfo=APP_TZ))
    for hid in habit_ids:
        habits.complete_habit(a.id, hid)
    board3 = habits.evaluate_board_celebration(a.id)
    assert board3 is not None
    assert board3.milestone_id != board1.milestone_id
