/**
 * Habit domain for MyTimeTree local store (IH0–IH9).
 * Loaded after store.js; patches MyTimeTreeLocal.handle.
 */
(function (global) {
  "use strict";

  function seed() {
    return global.MyTimeTreeHabitSeed || { templates: [], scripts: [], hints: [], emotions: [] };
  }

  function install(api) {
    const {
      ensure,
      DomainError,
      getDb,
      requireCurrent,
      appendEntry,
      addFruit,
      getOrnaments,
      saveOrnaments,
      nowIso,
      todayStr,
      persist,
    } = api;

    function db() {
      return getDb();
    }

    function syncContentTables() {
      const s = seed();
      for (const t of s.templates || []) {
        db().exec(
          `INSERT INTO habit_templates (slug, title, category, default_minutes, active, sort_default, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET
             title=excluded.title,
             category=excluded.category,
             default_minutes=excluded.default_minutes,
             active=excluded.active,
             sort_default=excluded.sort_default,
             notes=excluded.notes`,
          [
            t.slug,
            t.title,
            t.category || "",
            Number(t.default_minutes) || 5,
            t.active ? 1 : 0,
            Number(t.sort_default) || 100,
            t.notes || "",
          ]
        );
      }
      for (const sc of s.scripts || []) {
        db().exec(
          `INSERT INTO parent_scripts (id, habit_slug, category, script_text, active)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             habit_slug=excluded.habit_slug,
             category=excluded.category,
             script_text=excluded.script_text,
             active=excluded.active`,
          [sc.id, sc.habit_slug || "", sc.category || "", sc.script_text, sc.active ? 1 : 0]
        );
      }
      for (const h of s.hints || []) {
        db().exec(
          `INSERT INTO offline_celebration_hints (id, title, body, image_key, categories_json, active)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title=excluded.title,
             body=excluded.body,
             image_key=excluded.image_key,
             categories_json=excluded.categories_json,
             active=excluded.active`,
          [
            h.id,
            h.title,
            h.body,
            h.image_key || "",
            JSON.stringify(h.categories || []),
            h.active ? 1 : 0,
          ]
        );
      }
      for (const e of s.emotions || []) {
        db().exec(
          `INSERT INTO emotion_copy (id, path, habit_slug, category, emotion_copy, active)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             path=excluded.path,
             habit_slug=excluded.habit_slug,
             category=excluded.category,
             emotion_copy=excluded.emotion_copy,
             active=excluded.active`,
          [
            e.id,
            e.path,
            e.habit_slug || "",
            e.category || "",
            e.emotion_copy,
            e.active ? 1 : 0,
          ]
        );
      }
    }

    function ensureStarterHabits(accountId) {
      syncContentTables();
      const existing = db().query(
        "SELECT id FROM habits WHERE account_id = ? AND archived = 0",
        [accountId]
      );
      if (existing.length) return;
      const templates = db().query(
        "SELECT * FROM habit_templates WHERE active = 1 ORDER BY sort_default ASC, id ASC LIMIT 8"
      );
      for (const t of templates) {
        enableTemplate(accountId, t);
      }
    }

    function enableTemplate(accountId, t) {
      const created = nowIso();
      db().exec(
        `INSERT INTO habits (account_id, template_id, title, category, sort_order, archived, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [
          accountId,
          t.id,
          t.title,
          t.category || "",
          Number(t.sort_default) || 100,
          created,
        ]
      );
      const habitId = Number(db().queryOne("SELECT last_insert_rowid() AS id").id);
      db().exec(
        `INSERT INTO exchange_rules (
          account_id, habit_id, minutes_per_completion, daily_cap, auto_redeem, active
        ) VALUES (?, ?, ?, 1, 1, 1)`,
        [accountId, habitId, Number(t.default_minutes) || 5]
      );
      return habitId;
    }

    function listHabits(accountId, { includeArchived = false } = {}) {
      const sql = includeArchived
        ? `SELECT h.*, r.minutes_per_completion, r.id AS rule_id, r.active AS rule_active
           FROM habits h
           LEFT JOIN exchange_rules r ON r.habit_id = h.id
           WHERE h.account_id = ?
           ORDER BY h.archived ASC, h.sort_order ASC, h.id ASC`
        : `SELECT h.*, r.minutes_per_completion, r.id AS rule_id, r.active AS rule_active
           FROM habits h
           LEFT JOIN exchange_rules r ON r.habit_id = h.id
           WHERE h.account_id = ? AND h.archived = 0
           ORDER BY h.sort_order ASC, h.id ASC`;
      return db().query(sql, [accountId]).map((r) => ({
        id: Number(r.id),
        account_id: Number(r.account_id),
        template_id: r.template_id == null ? null : Number(r.template_id),
        title: String(r.title),
        category: String(r.category || ""),
        sort_order: Number(r.sort_order),
        archived: Number(r.archived) === 1,
        minutes_per_completion: Number(r.minutes_per_completion || 5),
        rule_id: r.rule_id == null ? null : Number(r.rule_id),
        rule_active: r.rule_active == null ? true : Number(r.rule_active) === 1,
      }));
    }

    function badgeCount(accountId) {
      ensureStarterHabits(accountId);
      const day = todayStr();
      const habits = listHabits(accountId);
      if (!habits.length) return 0;
      const logged = new Set(
        db()
          .query(
            "SELECT habit_id FROM habit_logs WHERE account_id = ? AND day_key = ?",
            [accountId, day]
          )
          .map((r) => Number(r.habit_id))
      );
      return habits.filter((h) => !logged.has(h.id)).length;
    }

    function pickScript(habit) {
      const slug = habit.template_slug || "";
      const cat = habit.category || "";
      const rows = db().query(
        "SELECT * FROM parent_scripts WHERE active = 1"
      );
      const bySlug = rows.find((r) => r.habit_slug && r.habit_slug === slug);
      if (bySlug) return String(bySlug.script_text);
      const byCat = rows.find((r) => !r.habit_slug && r.category && r.category === cat);
      if (byCat) return String(byCat.script_text);
      const generic = rows.find((r) => !r.habit_slug && !r.category);
      return generic ? String(generic.script_text) : "记下来了——孩子被看见，时间也能存进树里。";
    }

    function pickHint(habit) {
      const cat = habit.category || "";
      const rows = db().query(
        "SELECT * FROM offline_celebration_hints WHERE active = 1"
      );
      const match = rows.find((r) => {
        try {
          const cats = JSON.parse(r.categories_json || "[]");
          return Array.isArray(cats) && cats.includes(cat);
        } catch {
          return false;
        }
      });
      const row = match || rows.find((r) => {
        try {
          return JSON.parse(r.categories_json || "[]").length === 0;
        } catch {
          return false;
        }
      }) || rows[0];
      if (!row) return null;
      return {
        title: String(row.title),
        body: String(row.body),
        image_key: String(row.image_key || ""),
      };
    }

    function pickEmotions(habit) {
      const slug = habit.template_slug || "";
      const cat = habit.category || "";
      const rows = db().query("SELECT * FROM emotion_copy WHERE active = 1");
      function one(path) {
        return (
          rows.find((r) => r.path === path && r.habit_slug === slug) ||
          rows.find((r) => r.path === path && !r.habit_slug && r.category === cat) ||
          rows.find((r) => r.path === path && !r.habit_slug && !r.category)
        );
      }
      const a = one("approach");
      const v = one("avoid");
      return {
        approach: { emotion_copy: a ? String(a.emotion_copy) : "被看见的感觉真好" },
        avoid: { emotion_copy: v ? String(v.emotion_copy) : "" },
      };
    }

    function templateSlugForHabit(habitId) {
      const row = db().queryOne(
        `SELECT t.slug FROM habits h
         LEFT JOIN habit_templates t ON t.id = h.template_id
         WHERE h.id = ?`,
        [habitId]
      );
      return row && row.slug ? String(row.slug) : "";
    }

    function todayItems(accountId) {
      ensureStarterHabits(accountId);
      const day = todayStr();
      const habits = listHabits(accountId);
      const logs = db().query(
        "SELECT * FROM habit_logs WHERE account_id = ? AND day_key = ?",
        [accountId, day]
      );
      const byHabit = new Map(logs.map((l) => [Number(l.habit_id), l]));
      const items = habits.map((h) => {
        const log = byHabit.get(h.id);
        return {
          habit_id: h.id,
          title: h.title,
          category: h.category,
          minutes: h.minutes_per_completion,
          done: Boolean(log),
          log_id: log ? Number(log.id) : null,
        };
      });
      return {
        day_key: day,
        badge_count: items.filter((i) => !i.done).length,
        items,
      };
    }

    function weekKeyBounds() {
      const day = todayStr();
      const d = new Date(day + "T12:00:00+08:00");
      const dow = d.getDay(); // 0 Sun
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(d);
      monday.setDate(d.getDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      // Keep Shanghai calendar day (avoid UTC toISOString day-shift)
      const fmt = (x) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(x);
      return { from: fmt(monday), to: fmt(sunday), today: day };
    }

    function completeHabit(accountId, habitId) {
      ensureStarterHabits(accountId);
      const habit = listHabits(accountId, { includeArchived: true }).find(
        (h) => h.id === habitId
      );
      ensure(habit && !habit.archived, "not_found", "习惯不存在或已归档");
      ensure(habit.rule_active !== false, "validation", "兑换规则已停用");
      const day = todayStr();
      const dup = db().queryOne(
        "SELECT id FROM habit_logs WHERE account_id = ? AND habit_id = ? AND day_key = ?",
        [accountId, habitId, day]
      );
      ensure(!dup, "conflict", "今天已经记过这个习惯了");
      const minutes = Math.max(1, Number(habit.minutes_per_completion) || 5);
      const created = nowIso();
      db().exec(
        `INSERT INTO habit_logs (account_id, habit_id, day_key, created_at, source, meta_json)
         VALUES (?, ?, ?, ?, 'parent', '{}')`,
        [accountId, habitId, day, created]
      );
      const logId = Number(db().queryOne("SELECT last_insert_rowid() AS id").id);
      const entry = appendEntry(accountId, "habit_reward", minutes, {
        summary: `好习惯 · ${habit.title}`,
        meta: { habit_id: habitId, habit_log_id: logId, day_key: day },
      });
      let orn = addFruit(getOrnaments(accountId), 1);
      saveOrnaments(accountId, orn);
      db().exec(
        `INSERT INTO ornament_events (account_id, kind, delta, reason, correlation_id, meta_json, created_at)
         VALUES (?, 'star', 1, 'habit_reward', NULL, ?, ?)`,
        [accountId, JSON.stringify({ habit_id: habitId }), created]
      );
      db().exec(
        `INSERT INTO earned_credits (account_id, habit_log_id, minutes, status, ledger_entry_id, created_at)
         VALUES (?, ?, ?, 'redeemed', ?, ?)`,
        [accountId, logId, minutes, entry.id, created]
      );

      habit.template_slug = templateSlugForHabit(habitId);
      const motivation = pickEmotions(habit);
      const scriptText = pickScript(habit);
      const hint = pickHint(habit);
      const celebration = { kind: "small", habit_id: habitId, log_id: logId };
      db().exec(
        `INSERT INTO celebration_events (account_id, kind, day_key, habit_log_id, payload_json, created_at)
         VALUES (?, 'small', ?, ?, ?, ?)`,
        [
          accountId,
          day,
          logId,
          JSON.stringify({ motivation, scriptText, hint }),
          created,
        ]
      );

      // Board celebration: week full 5 logs once
      const { from, to } = weekKeyBounds();
      const weekCount = Number(
        db().queryOne(
          `SELECT COUNT(*) AS c FROM habit_logs
           WHERE account_id = ? AND day_key >= ? AND day_key <= ?`,
          [accountId, from, to]
        ).c
      );
      let boardCelebration = null;
      if (weekCount >= 5) {
        const already = db().queryOne(
          `SELECT id FROM celebration_events
           WHERE account_id = ? AND kind = 'board' AND day_key >= ? AND day_key <= ?`,
          [accountId, from, to]
        );
        if (!already) {
          boardCelebration = { kind: "board", week_logs: weekCount };
          db().exec(
            `INSERT INTO celebration_events (account_id, kind, day_key, habit_log_id, payload_json, created_at)
             VALUES (?, 'board', ?, ?, ?, ?)`,
            [
              accountId,
              day,
              logId,
              JSON.stringify(boardCelebration),
              created,
            ]
          );
        }
      }

      persist();
      return {
        log_id: logId,
        credit: {
          id: Number(
            db().queryOne(
              "SELECT id FROM earned_credits WHERE habit_log_id = ?",
              [logId]
            ).id
          ),
          minutes,
          status: "redeemed",
          ledger_entry_id: entry.id,
        },
        minutes_credited: minutes,
        motivation_payload: motivation,
        celebration: boardCelebration || celebration,
        parent_script: { script_text: scriptText },
        offline_hint: hint,
        badge_count: badgeCount(accountId),
      };
    }

    function overview(accountId) {
      ensureStarterHabits(accountId);
      const logs = db().query(
        `SELECT l.*, h.title, h.category, c.minutes
         FROM habit_logs l
         JOIN habits h ON h.id = l.habit_id
         LEFT JOIN earned_credits c ON c.habit_log_id = l.id
         WHERE l.account_id = ?
         ORDER BY l.created_at DESC
         LIMIT 40`,
        [accountId]
      );
      const timeline = logs.map((l) => ({
        title: String(l.title),
        day_key: String(l.day_key),
        minutes: Number(l.minutes || 0),
        category: String(l.category || ""),
      }));
      const catLabels = {
        hygiene: "卫生",
        sleep: "睡眠",
        reading: "阅读",
        chores: "家务",
        kindness: "友善",
        movement: "运动",
        health: "健康",
        study: "学习",
        screen: "屏幕",
        calm: "平静",
        arts: "艺术",
        custom: "自定义",
      };
      const catMap = new Map();
      for (const l of logs) {
        const key = String(l.category || "其他");
        const cur =
          catMap.get(key) || {
            label: catLabels[key] || key || "其他",
            count: 0,
            minutes: 0,
          };
        cur.count += 1;
        cur.minutes += Number(l.minutes || 0);
        catMap.set(key, cur);
      }
      const rules = listHabits(accountId).map((h) => ({
        rule_id: h.rule_id,
        habit_id: h.id,
        title: h.title,
        minutes_per_completion: h.minutes_per_completion,
        auto_redeem: true,
      }));
      const { from, to } = weekKeyBounds();
      const weekLogs = Number(
        db().queryOne(
          `SELECT COUNT(*) AS c FROM habit_logs
           WHERE account_id = ? AND day_key >= ? AND day_key <= ?`,
          [accountId, from, to]
        ).c
      );
      return {
        timeline,
        categories: [...catMap.values()],
        rules,
        board: {
          stats: {
            total_logs: timeline.length,
            week_logs: weekLogs,
            minutes_redeemed: timeline.reduce((s, t) => s + t.minutes, 0),
          },
          entries: timeline.slice(0, 20),
        },
      };
    }

    function listTemplates() {
      syncContentTables();
      return db()
        .query(
          "SELECT * FROM habit_templates WHERE active = 1 ORDER BY sort_default ASC, id ASC"
        )
        .map((t) => ({
          id: Number(t.id),
          slug: String(t.slug),
          title: String(t.title),
          category: String(t.category || ""),
          default_minutes: Number(t.default_minutes),
          sort_default: Number(t.sort_default),
        }));
    }

    function addFromTemplate(accountId, templateId) {
      syncContentTables();
      const t = db().queryOne("SELECT * FROM habit_templates WHERE id = ?", [
        templateId,
      ]);
      ensure(t, "not_found", "模板不存在");
      const dup = db().queryOne(
        `SELECT h.id FROM habits h
         WHERE h.account_id = ? AND h.template_id = ? AND h.archived = 0`,
        [accountId, templateId]
      );
      ensure(!dup, "conflict", "已启用该习惯");
      const id = enableTemplate(accountId, t);
      persist();
      return { habit_id: id };
    }

    function addCustom(accountId, title, minutes, category) {
      const name = String(title || "").trim();
      ensure(name.length > 0 && name.length <= 32, "validation", "标题 1–32 字");
      const mins = Math.max(1, Math.floor(Number(minutes) || 5));
      const maxOrder = db().queryOne(
        "SELECT COALESCE(MAX(sort_order), 0) AS m FROM habits WHERE account_id = ?",
        [accountId]
      );
      const created = nowIso();
      db().exec(
        `INSERT INTO habits (account_id, template_id, title, category, sort_order, archived, created_at)
         VALUES (?, NULL, ?, ?, ?, 0, ?)`,
        [accountId, name, String(category || "custom"), Number(maxOrder.m) + 10, created]
      );
      const habitId = Number(db().queryOne("SELECT last_insert_rowid() AS id").id);
      db().exec(
        `INSERT INTO exchange_rules (
          account_id, habit_id, minutes_per_completion, daily_cap, auto_redeem, active
        ) VALUES (?, ?, ?, 1, 1, 1)`,
        [accountId, habitId, mins]
      );
      persist();
      return { habit_id: habitId };
    }

    function archiveHabit(accountId, habitId) {
      const h = db().queryOne(
        "SELECT id FROM habits WHERE id = ? AND account_id = ?",
        [habitId, accountId]
      );
      ensure(h, "not_found", "习惯不存在");
      db().exec("UPDATE habits SET archived = 1 WHERE id = ?", [habitId]);
      persist();
      return { archived: true };
    }

    function reorder(accountId, orderedIds) {
      ensure(Array.isArray(orderedIds) && orderedIds.length, "validation", "顺序无效");
      let i = 10;
      for (const id of orderedIds) {
        db().exec(
          "UPDATE habits SET sort_order = ? WHERE id = ? AND account_id = ?",
          [i, Number(id), accountId]
        );
        i += 10;
      }
      persist();
      return { ok: true, habits: listHabits(accountId) };
    }

    function patchRule(accountId, ruleId, minutes) {
      const mins = Math.floor(Number(minutes));
      ensure(mins > 0, "validation", "分钟必须为正");
      const row = db().queryOne(
        "SELECT id FROM exchange_rules WHERE id = ? AND account_id = ?",
        [ruleId, accountId]
      );
      ensure(row, "not_found", "规则不存在");
      db().exec(
        "UPDATE exchange_rules SET minutes_per_completion = ? WHERE id = ?",
        [mins, ruleId]
      );
      persist();
      return { rule_id: ruleId, minutes_per_completion: mins };
    }

    async function handleRoute({ path, method, body }) {
      if (!path.startsWith("/api/portal/habits") && path !== "/api/analytics/habits/weekly") {
        return null;
      }
      const acc = requireCurrent();
      ensureStarterHabits(acc.id);

      if (path === "/api/portal/habits/today" && method === "GET") {
        return { status: 200, body: todayItems(acc.id) };
      }
      if (path === "/api/portal/habits/badge" && method === "GET") {
        return { status: 200, body: { badge_count: badgeCount(acc.id) } };
      }
      if (path === "/api/portal/habits/complete" && method === "POST") {
        const habitId = Number(body.habit_id);
        ensure(habitId > 0, "validation", "habit_id 无效");
        return { status: 200, body: completeHabit(acc.id, habitId) };
      }
      if (path === "/api/portal/habits/overview" && method === "GET") {
        return { status: 200, body: overview(acc.id) };
      }
      if (path === "/api/portal/habits/board" && method === "GET") {
        const ov = overview(acc.id);
        return { status: 200, body: ov.board };
      }
      if (path === "/api/portal/habits/list" && method === "GET") {
        return {
          status: 200,
          body: {
            habits: listHabits(acc.id, { includeArchived: true }),
            templates: listTemplates(),
          },
        };
      }
      if (path === "/api/portal/habits/enable" && method === "POST") {
        return {
          status: 200,
          body: addFromTemplate(acc.id, Number(body.template_id)),
        };
      }
      if (path === "/api/portal/habits/custom" && method === "POST") {
        return {
          status: 200,
          body: addCustom(acc.id, body.title, body.minutes, body.category),
        };
      }
      if (path === "/api/portal/habits/archive" && method === "POST") {
        return {
          status: 200,
          body: archiveHabit(acc.id, Number(body.habit_id)),
        };
      }
      if (path === "/api/portal/habits/reorder" && method === "POST") {
        return { status: 200, body: reorder(acc.id, body.ordered_ids) };
      }
      if (path === "/api/portal/habits/rules" && method === "PATCH") {
        return {
          status: 200,
          body: patchRule(acc.id, Number(body.rule_id), body.minutes_per_completion),
        };
      }
      if (path === "/api/analytics/habits/weekly" && method === "GET") {
        const ov = overview(acc.id);
        return {
          status: 200,
          body: {
            week_logs: ov.board.stats.week_logs,
            categories: ov.categories,
          },
        };
      }
      return {
        status: 404,
        body: { message: `未知习惯接口 ${method} ${path}`, code: "not_found" },
      };
    }

    return {
      handleRoute,
      ensureStarterHabits,
      syncContentTables,
      badgeCount,
    };
  }

  let installed = null;

  global.MyTimeTreeHabits = {
    version: "2.0.0-ios",
    attach(api) {
      installed = install(api);
      return installed;
    },
    async tryHandle(args) {
      if (!installed) return null;
      return installed.handleRoute(args);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
