/**
 * Habit domain for MyTimeTree local store (IH0–IH9 + polish O1–O6).
 * Loaded after store.js; patches MyTimeTreeLocal.handle.
 */
(function (global) {
  "use strict";

  /**
   * Soft 12-slot palette (same hue family per slot):
   * - featured: home strip / settings top-9 / heatmap dots (brighter, kid-friendly)
   * - muted: settings rank 10+ (same hue, lower sat / slight gray)
   */
  // Featured: a bit brighter / more saturated (home strip + settings top-9 + heatmap dots)
  const HABIT_COLORS_FEATURED = [
    "#4ec98a",
    "#5eb0e8",
    "#e8a84a",
    "#8fbc5c",
    "#b08cd4",
    "#e8957e",
    "#4ec4c4",
    "#d4a66a",
    "#6eb4cc",
    "#c49a5e",
    "#7ec46e",
    "#d498b0",
  ];
  // Muted: same hue family, lower sat + slight gray (settings rank 10+)
  const HABIT_COLORS_MUTED = [
    "#7a9e8c",
    "#7e95a8",
    "#a99478",
    "#8a9478",
    "#918899",
    "#a89088",
    "#7a9898",
    "#9a8e80",
    "#84949c",
    "#968a7c",
    "#869684",
    "#9a8890",
  ];
  const HOME_STRIP_LIMIT = 9;
  const TIMELINE_LIMIT = 30;

  function seed() {
    return (
      global.MyTimeTreeHabitSeed || {
        templates: [],
        scripts: [],
        hints: [],
        celebration_actions: [],
        celebration_copy: [],
        board_milestones: [],
        emotions: [],
        micro_steps: [],
        board_copy: [],
      }
    );
  }

  function habitColor(habitId, variant) {
    // Stable by id; slots cycle every 12 (group)
    const n = Math.abs(Number(habitId) || 0);
    const slot = n % HABIT_COLORS_FEATURED.length;
    if (variant === "muted") return HABIT_COLORS_MUTED[slot];
    return HABIT_COLORS_FEATURED[slot];
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

    function contentFingerprint() {
      const s = seed();
      return [
        s.generated_at || "",
        s.version || "",
        (s.templates || []).length,
        (s.scripts || []).length,
        (s.hints || []).length,
        (s.celebration_actions || []).length,
        (s.celebration_copy || []).length,
        (s.board_milestones || []).length,
        (s.micro_steps || []).length,
        (s.board_copy || []).length,
      ].join(":");
    }

    function syncContentTables({ force = false } = {}) {
      const s = seed();
      const fp = contentFingerprint();
      if (!force) {
        const prev = db().queryOne(
          "SELECT value FROM app_state WHERE key = ?",
          ["habit_content_fp"]
        );
        const count = db().queryOne(
          "SELECT COUNT(*) AS c FROM habit_templates"
        );
        if (prev && String(prev.value) === fp && Number(count?.c || 0) > 0) {
          return false;
        }
      }

      db().exec("BEGIN");
      try {
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
            `INSERT INTO offline_celebration_hints (
               id, title, body, image_key, categories_json, env_tags_json, active
             ) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               title=excluded.title,
               body=excluded.body,
               image_key=excluded.image_key,
               categories_json=excluded.categories_json,
               env_tags_json=excluded.env_tags_json,
               active=excluded.active`,
            [
              h.id,
              h.title,
              h.body,
              h.image_key || "",
              JSON.stringify(h.categories || []),
              JSON.stringify(h.env_tags || []),
              h.active ? 1 : 0,
            ]
          );
        }
        for (const c of s.celebration_copy || []) {
          db().exec(
            `INSERT INTO celebration_copy (
               id, habit_slug, category, incentive_text, small_celebration,
               offline_hint_id, image_key, habit_env, active
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               habit_slug=excluded.habit_slug,
               category=excluded.category,
               incentive_text=excluded.incentive_text,
               small_celebration=excluded.small_celebration,
               offline_hint_id=excluded.offline_hint_id,
               image_key=excluded.image_key,
               habit_env=excluded.habit_env,
               active=excluded.active`,
            [
              c.id,
              c.habit_slug || "",
              c.category || "",
              c.incentive_text || "",
              c.small_celebration || "",
              c.offline_hint_id || "",
              c.image_key || "",
              c.habit_env || "",
              c.active ? 1 : 0,
            ]
          );
        }
        for (const ms of s.board_milestones || []) {
          db().exec(
            `INSERT INTO habit_board_milestones (
               id, level, title, body, trigger_rule, repeatable,
               offline_action_id, image_key, active
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               level=excluded.level,
               title=excluded.title,
               body=excluded.body,
               trigger_rule=excluded.trigger_rule,
               repeatable=excluded.repeatable,
               offline_action_id=excluded.offline_action_id,
               image_key=excluded.image_key,
               active=excluded.active`,
            [
              ms.id,
              Number(ms.level) || 0,
              ms.title,
              ms.body,
              ms.trigger_rule || "",
              ms.repeatable ? 1 : 0,
              ms.offline_action_id || "",
              ms.image_key || "",
              ms.active ? 1 : 0,
            ]
          );
        }
        for (const m of s.micro_steps || []) {
          db().exec(
            `INSERT INTO habit_micro_step_defaults (id, habit_slug, sort_order, step_text, active)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               habit_slug=excluded.habit_slug,
               sort_order=excluded.sort_order,
               step_text=excluded.step_text,
               active=excluded.active`,
            [
              m.id,
              m.habit_slug || "",
              Number(m.sort) || 100,
              m.step_text,
              m.active ? 1 : 0,
            ]
          );
        }
        for (const b of s.board_copy || []) {
          db().exec(
            `INSERT INTO habit_board_copy (id, slot, copy_text, active)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               slot=excluded.slot,
               copy_text=excluded.copy_text,
               active=excluded.active`,
            [b.id, b.slot, b.copy_text, b.active ? 1 : 0]
          );
        }
        db().exec(
          `INSERT INTO app_state (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          ["habit_content_fp", fp]
        );
        db().exec("COMMIT");
      } catch (err) {
        try {
          db().exec("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
      return true;
    }

    function ensureStarterHabits(accountId) {
      const existing = db().query(
        "SELECT id FROM habits WHERE account_id = ? AND archived = 0",
        [accountId]
      );
      if (existing.length) return;
      syncContentTables();
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
      materializeMicroSteps(accountId, habitId, String(t.slug || ""));
      return habitId;
    }

    function materializeMicroSteps(accountId, habitId, slug) {
      const existing = db().query(
        "SELECT id FROM habit_micro_steps WHERE account_id = ? AND habit_id = ?",
        [accountId, habitId]
      );
      if (existing.length) return;
      if (!slug) return;
      syncContentTables();
      const defaults = db().query(
        `SELECT * FROM habit_micro_step_defaults
         WHERE habit_slug = ? AND active = 1
         ORDER BY sort_order ASC, id ASC`,
        [slug]
      );
      const created = nowIso();
      for (const d of defaults) {
        db().exec(
          `INSERT INTO habit_micro_steps (
            account_id, habit_id, step_text, sort_order, source, seed_id, archived, created_at
          ) VALUES (?, ?, ?, ?, 'seed', ?, 0, ?)`,
          [
            accountId,
            habitId,
            String(d.step_text),
            Number(d.sort_order) || 100,
            String(d.id),
            created,
          ]
        );
      }
    }

    function listMicroSteps(accountId, habitId) {
      materializeMicroSteps(
        accountId,
        habitId,
        templateSlugForHabit(habitId)
      );
      return db()
        .query(
          `SELECT * FROM habit_micro_steps
           WHERE account_id = ? AND habit_id = ? AND archived = 0
           ORDER BY sort_order ASC, id ASC`,
          [accountId, habitId]
        )
        .map((r) => ({
          id: Number(r.id),
          habit_id: Number(r.habit_id),
          step_text: String(r.step_text),
          sort_order: Number(r.sort_order),
          source: String(r.source || "custom"),
          seed_id: r.seed_id ? String(r.seed_id) : null,
        }));
    }

    function addMicroStep(accountId, habitId, stepText) {
      const text = String(stepText || "").trim();
      ensure(text.length > 0 && text.length <= 64, "validation", "微步骤 1–64 字");
      const habit = db().queryOne(
        "SELECT id FROM habits WHERE id = ? AND account_id = ? AND archived = 0",
        [habitId, accountId]
      );
      ensure(habit, "not_found", "习惯不存在");
      materializeMicroSteps(accountId, habitId, templateSlugForHabit(habitId));
      const maxOrder = db().queryOne(
        `SELECT COALESCE(MAX(sort_order), 0) AS m FROM habit_micro_steps
         WHERE account_id = ? AND habit_id = ? AND archived = 0`,
        [accountId, habitId]
      );
      const created = nowIso();
      db().exec(
        `INSERT INTO habit_micro_steps (
          account_id, habit_id, step_text, sort_order, source, seed_id, archived, created_at
        ) VALUES (?, ?, ?, ?, 'custom', NULL, 0, ?)`,
        [accountId, habitId, text, Number(maxOrder.m) + 10, created]
      );
      const id = Number(db().queryOne("SELECT last_insert_rowid() AS id").id);
      persist();
      return { id, steps: listMicroSteps(accountId, habitId) };
    }

    function patchMicroStep(accountId, stepId, stepText) {
      const text = String(stepText || "").trim();
      ensure(text.length > 0 && text.length <= 64, "validation", "微步骤 1–64 字");
      const row = db().queryOne(
        "SELECT id, habit_id FROM habit_micro_steps WHERE id = ? AND account_id = ?",
        [stepId, accountId]
      );
      ensure(row, "not_found", "微步骤不存在");
      db().exec(
        "UPDATE habit_micro_steps SET step_text = ?, source = 'custom' WHERE id = ?",
        [text, stepId]
      );
      persist();
      return { id: stepId, steps: listMicroSteps(accountId, Number(row.habit_id)) };
    }

    function archiveMicroStep(accountId, stepId) {
      const row = db().queryOne(
        "SELECT id, habit_id FROM habit_micro_steps WHERE id = ? AND account_id = ?",
        [stepId, accountId]
      );
      ensure(row, "not_found", "微步骤不存在");
      db().exec("UPDATE habit_micro_steps SET archived = 1 WHERE id = ?", [stepId]);
      persist();
      return { archived: true, steps: listMicroSteps(accountId, Number(row.habit_id)) };
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
      return db().query(sql, [accountId]).map((r, idx) => {
        const id = Number(r.id);
        const on_home_strip = idx < HOME_STRIP_LIMIT && Number(r.archived) !== 1;
        return {
          id,
          account_id: Number(r.account_id),
          template_id: r.template_id == null ? null : Number(r.template_id),
          title: String(r.title),
          category: String(r.category || ""),
          sort_order: Number(r.sort_order),
          archived: Number(r.archived) === 1,
          minutes_per_completion: Number(r.minutes_per_completion || 5),
          rule_id: r.rule_id == null ? null : Number(r.rule_id),
          rule_active: r.rule_active == null ? true : Number(r.rule_active) === 1,
          strip_index: idx,
          on_home_strip,
          color: habitColor(id, on_home_strip ? "featured" : "muted"),
          color_featured: habitColor(id, "featured"),
          color_muted: habitColor(id, "muted"),
        };
      });
    }

    function badgeCount(accountId) {
      ensureStarterHabits(accountId);
      const day = todayStr();
      const habits = listHabits(accountId).slice(0, HOME_STRIP_LIMIT);
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

    function hintFromRow(row) {
      if (!row) return null;
      return {
        id: String(row.id || ""),
        title: String(row.title),
        body: String(row.body),
        image_key: String(row.image_key || ""),
      };
    }

    function pickHint(habit, hintId) {
      if (hintId) {
        const byId = db().queryOne(
          "SELECT * FROM offline_celebration_hints WHERE id = ? AND active = 1",
          [hintId]
        );
        if (byId) return hintFromRow(byId);
      }
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
      const row =
        match ||
        rows.find((r) => {
          try {
            return JSON.parse(r.categories_json || "[]").length === 0;
          } catch {
            return false;
          }
        }) ||
        rows[0];
      return hintFromRow(row);
    }

    function pickCelebration(habit) {
      const slug = habit.template_slug || "";
      const cat = habit.category || "";
      const rows = db().query("SELECT * FROM celebration_copy WHERE active = 1");
      const row =
        rows.find((r) => r.habit_slug && r.habit_slug === slug) ||
        rows.find((r) => !r.habit_slug && r.category && r.category === cat) ||
        rows.find((r) => !r.habit_slug && !r.category);
      if (!row) {
        return {
          incentive_text: "做到了，一起高兴",
          small_celebration: "做到了，一起高兴",
          offline_hint_id: "",
          image_key: "",
          habit_env: "",
        };
      }
      // Tip「激励」= incentive_text；缺省回落 small_celebration（计划表真源），禁止全员同一默认句
      const small = String(row.small_celebration || "做到了！");
      const incentive = String(row.incentive_text || small);
      return {
        incentive_text: incentive,
        small_celebration: small,
        offline_hint_id: String(row.offline_hint_id || ""),
        image_key: String(row.image_key || ""),
        habit_env: String(row.habit_env || ""),
      };
    }

    function parseTriggerRule(rule) {
      const m = String(rule || "")
        .trim()
        .match(
          /^(lifetime_logs|week_logs|month_logs|streak_days|week_categories)\s*>=\s*(\d+)$/
        );
      if (!m) return null;
      return { kind: m[1], n: Number(m[2]) };
    }

    function monthKeyBounds(day) {
      const [y, m] = String(day).split("-").map(Number);
      const last = new Date(y, m, 0).getDate();
      const ym = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
      return {
        from: `${ym}-01`,
        to: `${ym}-${String(last).padStart(2, "0")}`,
        key: ym,
      };
    }

    function streakDaysEnding(accountId, day) {
      const days = db()
        .query(
          `SELECT DISTINCT day_key FROM habit_logs
           WHERE account_id = ? AND day_key <= ?
           ORDER BY day_key DESC`,
          [accountId, day]
        )
        .map((r) => String(r.day_key));
      if (!days.length || days[0] !== day) return 0;
      let streak = 1;
      let prev = day;
      for (let i = 1; i < days.length; i++) {
        const [py, pm, pd] = prev.split("-").map(Number);
        const pdate = new Date(py, pm - 1, pd);
        pdate.setDate(pdate.getDate() - 1);
        const expectLocal = `${pdate.getFullYear()}-${String(
          pdate.getMonth() + 1
        ).padStart(2, "0")}-${String(pdate.getDate()).padStart(2, "0")}`;
        if (days[i] !== expectLocal) break;
        streak += 1;
        prev = days[i];
      }
      return streak;
    }

    function triggerMet(accountId, day, trigger) {
      if (!trigger) return false;
      if (trigger.kind === "lifetime_logs") {
        const c = Number(
          db().queryOne(
            "SELECT COUNT(*) AS c FROM habit_logs WHERE account_id = ?",
            [accountId]
          ).c
        );
        return c >= trigger.n;
      }
      if (trigger.kind === "week_logs") {
        const { from, to } = weekKeyBounds();
        const c = Number(
          db().queryOne(
            `SELECT COUNT(*) AS c FROM habit_logs
             WHERE account_id = ? AND day_key >= ? AND day_key <= ?`,
            [accountId, from, to]
          ).c
        );
        return c >= trigger.n;
      }
      if (trigger.kind === "month_logs") {
        const { from, to } = monthKeyBounds(day);
        const c = Number(
          db().queryOne(
            `SELECT COUNT(*) AS c FROM habit_logs
             WHERE account_id = ? AND day_key >= ? AND day_key <= ?`,
            [accountId, from, to]
          ).c
        );
        return c >= trigger.n;
      }
      if (trigger.kind === "streak_days") {
        return streakDaysEnding(accountId, day) >= trigger.n;
      }
      if (trigger.kind === "week_categories") {
        const { from, to } = weekKeyBounds();
        const c = Number(
          db().queryOne(
            `SELECT COUNT(DISTINCT h.category) AS c
             FROM habit_logs l
             JOIN habits h ON h.id = l.habit_id
             WHERE l.account_id = ? AND l.day_key >= ? AND l.day_key <= ?
               AND h.category != ''`,
            [accountId, from, to]
          ).c
        );
        return c >= trigger.n;
      }
      return false;
    }

    function periodKeyFor(trigger, day, repeatable) {
      if (!repeatable || !trigger) return "";
      if (trigger.kind === "week_logs" || trigger.kind === "week_categories") {
        const { from } = weekKeyBounds();
        return `w:${from}`;
      }
      if (trigger.kind === "month_logs") {
        return `m:${monthKeyBounds(day).key}`;
      }
      return "";
    }

    /** First unmet milestone that now qualifies (max one board celeb per complete). */
    function evaluateBoardMilestone(accountId, day) {
      const rows = db().query(
        `SELECT * FROM habit_board_milestones
         WHERE active = 1 ORDER BY level ASC, id ASC`
      );
      for (const ms of rows) {
        const trigger = parseTriggerRule(ms.trigger_rule);
        if (!trigger) continue;
        const periodKey = periodKeyFor(trigger, day, Number(ms.repeatable) === 1);
        const already = db().queryOne(
          `SELECT 1 AS ok FROM habit_milestone_done
           WHERE account_id = ? AND milestone_id = ? AND period_key = ?`,
          [accountId, ms.id, periodKey]
        );
        if (already) continue;
        if (!triggerMet(accountId, day, trigger)) continue;
        const achievedAt = nowIso();
        db().exec(
          `INSERT INTO habit_milestone_done
             (account_id, milestone_id, period_key, level, day_key, achieved_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            accountId,
            ms.id,
            periodKey,
            Number(ms.level) || 0,
            day,
            achievedAt,
          ]
        );
        return {
          kind: "board",
          milestone_id: String(ms.id),
          level: Number(ms.level) || 0,
          title: String(ms.title || "大庆祝"),
          body: String(ms.body || ""),
          image_key: String(ms.image_key || ""),
          offline_action_id: String(ms.offline_action_id || ""),
          trigger_rule: String(ms.trigger_rule || ""),
        };
      }
      return null;
    }

    function listMilestonesProgress(accountId) {
      const rows = db().query(
        `SELECT * FROM habit_board_milestones
         WHERE active = 1 ORDER BY level ASC, id ASC`
      );
      const done = new Set(
        db()
          .query(
            `SELECT milestone_id FROM habit_milestone_done WHERE account_id = ?`,
            [accountId]
          )
          .map((r) => String(r.milestone_id))
      );
      return rows.map((ms) => ({
        id: String(ms.id),
        level: Number(ms.level) || 0,
        title: String(ms.title),
        body: String(ms.body),
        image_key: String(ms.image_key || ""),
        achieved: done.has(String(ms.id)),
      }));
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
      // Settings sort order → first 9 only on home strip
      const habits = listHabits(accountId).slice(0, HOME_STRIP_LIMIT);
      const logs = db().query(
        "SELECT * FROM habit_logs WHERE account_id = ? AND day_key = ?",
        [accountId, day]
      );
      const byHabit = new Map(logs.map((l) => [Number(l.habit_id), l]));
      const items = habits.map((h) => {
        const log = byHabit.get(h.id);
        const slug = templateSlugForHabit(h.id);
        h.template_slug = slug;
        const micro_steps = listMicroSteps(accountId, h.id);
        const scriptText = pickScript(h);
        const celeb = pickCelebration(h);
        return {
          habit_id: h.id,
          title: h.title,
          category: h.category,
          minutes: h.minutes_per_completion,
          done: Boolean(log),
          log_id: log ? Number(log.id) : null,
          color: habitColor(h.id, "featured"),
          micro_steps,
          parent_script: { script_text: scriptText },
          incentive_text: celeb.incentive_text,
          small_celebration: celeb.small_celebration,
        };
      });
      return {
        day_key: day,
        badge_count: items.filter((i) => !i.done).length,
        strip_limit: HOME_STRIP_LIMIT,
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
      const celeb = pickCelebration(habit);
      const scriptText = pickScript(habit);
      let hint = pickHint(habit, celeb.offline_hint_id);
      // Prefer celebration_copy.image_key when hint lacks art (ca_* / KEYS alias ready)
      if (hint && celeb.image_key && !hint.image_key) {
        hint = { ...hint, image_key: celeb.image_key };
      } else if (!hint && celeb.image_key) {
        hint = {
          id: "",
          title: "线下小庆祝",
          body: "",
          image_key: celeb.image_key,
        };
      }
      const celebration = { kind: "small", habit_id: habitId, log_id: logId };
      db().exec(
        `INSERT INTO celebration_events (account_id, kind, day_key, habit_log_id, payload_json, created_at)
         VALUES (?, 'small', ?, ?, ?, ?)`,
        [
          accountId,
          day,
          logId,
          JSON.stringify({
            incentive_text: celeb.incentive_text,
            small_celebration: celeb.small_celebration,
            image_key: celeb.image_key || (hint && hint.image_key) || "",
            scriptText,
            hint,
          }),
          created,
        ]
      );

      // Board: evaluate 12 milestones (at most one overlay per complete)
      const boardCelebration = evaluateBoardMilestone(accountId, day);
      if (boardCelebration) {
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
        incentive_text: celeb.incentive_text,
        small_celebration: celeb.small_celebration,
        image_key: celeb.image_key || (hint && hint.image_key) || "",
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
         LIMIT ${TIMELINE_LIMIT}`,
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
      const monthHeat = monthHeatmap(accountId);
      const boardCopyRows = db()
        .query("SELECT * FROM habit_board_copy WHERE active = 1")
        .map((r) => ({
          id: String(r.id),
          slot: String(r.slot),
          copy_text: String(r.copy_text),
        }));
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
          entries: timeline.slice(0, TIMELINE_LIMIT),
        },
        month_heatmap: monthHeat,
        board_copy: boardCopyRows,
        milestones: listMilestonesProgress(accountId),
        legend: monthHeat.legend,
        timeline_limit: TIMELINE_LIMIT,
      };
    }

    function monthHeatmap(accountId) {
      const day = todayStr();
      const [y, m] = day.split("-").map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const habits = listHabits(accountId);
      // Heatmap dots: featured (brighter) for kid-friendly read; legend matches settings tier
      const legend = habits.map((h) => ({
        habit_id: h.id,
        title: h.title,
        color: h.color,
        on_home_strip: h.on_home_strip,
      }));
      const colorById = new Map(
        habits.map((h) => [h.id, habitColor(h.id, "featured")])
      );
      const from = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
      const to = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
      const logs = db().query(
        `SELECT habit_id, day_key FROM habit_logs
         WHERE account_id = ? AND day_key >= ? AND day_key <= ?`,
        [accountId, from, to]
      );
      const byDay = new Map();
      for (const l of logs) {
        const key = String(l.day_key);
        const hid = Number(l.habit_id);
        const arr = byDay.get(key) || [];
        arr.push({
          habit_id: hid,
          color: colorById.get(hid) || habitColor(hid, "featured"),
        });
        byDay.set(key, arr);
      }
      // Pad leading blanks so week starts Monday
      const firstDow = new Date(`${from}T12:00:00+08:00`).getDay();
      const mondayPad = firstDow === 0 ? 6 : firstDow - 1;
      const cells = [];
      for (let i = 0; i < mondayPad; i++) {
        cells.push({ day_key: null, habits: [] });
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        cells.push({ day_key: key, habits: byDay.get(key) || [] });
      }
      const weeks = [];
      for (let i = 0; i < cells.length; i += 7) {
        weeks.push(cells.slice(i, i + 7));
      }
      return {
        year: y,
        month: m,
        weeks,
        legend,
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

    async function handleRoute({ path, method, body, searchParams }) {
      if (!path.startsWith("/api/portal/habits") && path !== "/api/analytics/habits/weekly") {
        return null;
      }
      const acc = requireCurrent();
      syncContentTables();
      ensureStarterHabits(acc.id);
      const sp = searchParams || { get: () => null };

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
      if (path === "/api/portal/habits/micro-steps" && method === "GET") {
        const hid = Number(sp.get("habit_id") || body.habit_id || 0);
        ensure(hid > 0, "validation", "habit_id 无效");
        return {
          status: 200,
          body: { habit_id: hid, steps: listMicroSteps(acc.id, hid) },
        };
      }
      if (path === "/api/portal/habits/micro-steps" && method === "POST") {
        return {
          status: 200,
          body: addMicroStep(acc.id, Number(body.habit_id), body.step_text),
        };
      }
      if (path === "/api/portal/habits/micro-steps" && method === "PATCH") {
        return {
          status: 200,
          body: patchMicroStep(acc.id, Number(body.step_id), body.step_text),
        };
      }
      if (path === "/api/portal/habits/micro-steps/archive" && method === "POST") {
        return {
          status: 200,
          body: archiveMicroStep(acc.id, Number(body.step_id)),
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
