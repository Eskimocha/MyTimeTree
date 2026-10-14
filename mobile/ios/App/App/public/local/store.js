/**
 * Local domain + API adapter (Phase 1).
 * Mirrors FastAPI /api/* responses using MyTimeTreeDb (sql.js).
 */
(function (global) {
  "use strict";

  const STATE_MIDNIGHT = "job_last_midnight_date";
  const STATE_GRANT = "job_last_grant_date";
  const MAX_CATCHUP_DAYS = 366;

  const STAGE_TABLE = [
    [0, 20, "seed"],
    [20, 50, "sprout"],
    [50, 100, "break_soil"],
    [100, 150, "germinate"],
    [150, 200, "sapling"],
    [200, 250, "young"],
    [250, 300, "tall"],
    [300, 400, "big"],
    [400, 500, "giant"],
    [500, null, "fruiting"],
  ];

  let dbApi = null;
  let initPromise = null;
  /** Phase 2: in-memory session unlock (mirrored to sessionStorage for reload). */
  let sessionUnlocked = false;
  const UNLOCK_KEY = "mytimetree.unlocked";

  function readUnlockFlag() {
    try {
      return sessionStorage.getItem(UNLOCK_KEY) === "1";
    } catch {
      return false;
    }
  }

  function writeUnlockFlag(on) {
    try {
      if (on) sessionStorage.setItem(UNLOCK_KEY, "1");
      else sessionStorage.removeItem(UNLOCK_KEY);
    } catch {
      /* private mode */
    }
  }

  function setSessionUnlocked(on) {
    sessionUnlocked = Boolean(on);
    writeUnlockFlag(sessionUnlocked);
  }

  const AUTH_OPEN_PATHS = new Set([
    "/health",
    "/api/health",
    "/api/auth/status",
    "/api/auth/unlock",
    "/api/auth/lock",
    "/api/auth/faceid",
    "/api/auth/recovery",
    "/api/auth/recovery/reset",
    "/api/auth/recovery/setup",
    "/api/auth/password",
    "/api/auth/wipe",
    "/api/portal/bootstrap",
  ]);

  const RECOVERY_PRESETS = [
    "你母亲的姓名是？",
    "你就读的小学叫什么？",
    "你喜欢的一本书是？",
    "你喜欢的一部电影是？",
  ];

  class DomainError extends Error {
    constructor(code, message, status) {
      super(message);
      this.code = code;
      this.status = status || statusFor(code);
    }
  }

  function statusFor(code) {
    return (
      {
        validation: 400,
        not_found: 404,
        conflict: 409,
        forbidden: 403,
        invalid_balance: 400,
        internal: 500,
      }[code] || 500
    );
  }

  function ensure(cond, code, message) {
    if (!cond) throw new DomainError(code, message);
  }

  function shanghaiNowParts(d) {
    const date = d || new Date();
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
    );
    // en-CA hour can be "24" at midnight in some engines — normalize
    let hour = parts.hour === "24" ? "00" : parts.hour;
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
      dateStr: `${parts.year}-${parts.month}-${parts.day}`,
      iso: `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}+08:00`,
    };
  }

  function nowIso() {
    return shanghaiNowParts().iso;
  }

  function todayStr() {
    return shanghaiNowParts().dateStr;
  }

  function addDays(dateStr, n) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const utc = Date.UTC(y, m - 1, d) + n * 86400000;
    const dt = new Date(utc);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

  function daysBetweenInclusive(start, end) {
    const out = [];
    if (!start || !end || String(start) > String(end)) return out;
    let cur = String(start);
    const stop = String(end);
    // Hard cap: prevent runaway loops if dates are malformed (e.g. NaN-NaN-NaN)
    for (let i = 0; i < 400; i++) {
      out.push(cur);
      if (cur >= stop) break;
      const next = addDays(cur, 1);
      if (!next || next === cur || next < cur) break;
      cur = next;
    }
    return out;
  }

  function atShanghai(dateStr, hour) {
    return `${dateStr}T${String(hour).padStart(2, "0")}:00:00+08:00`;
  }

  function uuid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function bytesToHex(buf) {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function hexToBytes(hex) {
    const s = String(hex);
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(s.substr(i * 2, 2), 16);
    }
    return out;
  }

  function timingSafeEqualHex(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  async function hashPassword(password, iterations) {
    const iter = iterations || 200000;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
      keyMaterial,
      256
    );
    return `pbkdf2_sha256$${iter}$${bytesToHex(salt)}$${bytesToHex(bits)}`;
  }

  async function verifyPasswordHash(password, passwordHash) {
    try {
      const parts = String(passwordHash).split("$");
      if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
      const iterations = Number(parts[1]);
      const salt = hexToBytes(parts[2]);
      const expectedHex = parts[3];
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
      );
      const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        keyMaterial,
        256
      );
      return timingSafeEqualHex(bytesToHex(bits), expectedHex);
    } catch {
      return false;
    }
  }

  /** True if password matches app parent password or any account. */
  async function verifyParentPassword(password) {
    const parentHash = getState("parent_password_hash");
    if (parentHash && (await verifyPasswordHash(password, parentHash))) {
      return currentAccountId() || (listAccounts()[0] && listAccounts()[0].id) || 0;
    }
    const rows = dbApi.query("SELECT id, password_hash FROM accounts ORDER BY id ASC");
    for (const row of rows) {
      if (await verifyPasswordHash(password, String(row.password_hash || ""))) {
        // Migrate legacy per-account password → app-level parent password
        if (!parentHash) {
          setState("parent_password_hash", String(row.password_hash));
          dbApi.persist();
        }
        return Number(row.id);
      }
    }
    return null;
  }

  function normalizeRecoveryAnswer(answer) {
    return String(answer || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function getRecoveryQuestion() {
    const q = getState("recovery_question");
    return q ? String(q) : null;
  }

  function isFaceIdEnabled() {
    const v = getState("faceid_enabled");
    // Default OFF until parent opts in after unlock
    if (v == null) return false;
    return v === "1" || v === "true";
  }

  function setFaceIdEnabled(enabled) {
    setState("faceid_enabled", enabled ? "1" : "0");
    dbApi.persist();
  }

  function isFaceIdOptinDone() {
    return getState("faceid_optin_done") === "1";
  }

  function setFaceIdOptinDone() {
    setState("faceid_optin_done", "1");
    dbApi.persist();
  }

  function authStatus() {
    const accounts = listAccounts();
    return {
      locked: accounts.length > 0 && !sessionUnlocked,
      unlocked: sessionUnlocked,
      has_accounts: accounts.length > 0,
      faceid_enabled: isFaceIdEnabled(),
      faceid_optin_done: isFaceIdOptinDone(),
      recovery_configured: Boolean(getRecoveryQuestion()),
      phase: 4,
    };
  }

  async function setParentPassword(password) {
    const hash = await hashPassword(password);
    setState("parent_password_hash", hash);
    const rows = dbApi.query("SELECT id FROM accounts");
    for (const row of rows) {
      dbApi.exec("UPDATE accounts SET password_hash = ? WHERE id = ?", [
        hash,
        Number(row.id),
      ]);
    }
    dbApi.persist();
  }

  async function setupRecovery(question, answer) {
    const q = String(question || "").trim();
    const a = normalizeRecoveryAnswer(answer);
    ensure(q.length >= 4, "validation", "请填写安全问题");
    ensure(a.length >= 2, "validation", "安全问题答案至少 2 个字");
    setState("recovery_question", q);
    setState("recovery_answer_hash", await hashPassword(a));
    dbApi.persist();
  }

  async function resetPasswordWithRecovery(answer, newPassword) {
    const q = getRecoveryQuestion();
    ensure(q, "validation", "尚未设置安全问题，请清除数据后重新开户");
    const answerHash = getState("recovery_answer_hash");
    ensure(answerHash, "validation", "安全问题数据不完整");
    const ok = await verifyPasswordHash(
      normalizeRecoveryAnswer(answer),
      answerHash
    );
    ensure(ok, "forbidden", "安全问题答案不正确");
    const pwd = String(newPassword || "");
    ensure(pwd.length >= 4, "validation", "新密码至少 4 位");
    await setParentPassword(pwd);
    setSessionUnlocked(true);
    return { unlocked: true, reset: true };
  }

  async function wipeLocalData() {
    const Db = global.MyTimeTreeDb;
    try {
      localStorage.removeItem(Db.STORAGE_KEY);
    } catch {
      /* ignore */
    }
    writeUnlockFlag(false);
    dbApi = null;
    initPromise = null;
    sessionUnlocked = false;
    await ensureDb();
    return { wiped: true };
  }

  function requireUnlocked(path, method) {
    if (sessionUnlocked) return;
    if (AUTH_OPEN_PATHS.has(path)) return;
    if (path === "/api/accounts" && method === "POST" && listAccounts().length === 0) {
      return;
    }
    throw new DomainError("forbidden", "请先解锁（家长密码或 Face ID）", 403);
  }

  function dailyInterestMinutes(principal, rate) {
    if (principal <= 0 || rate <= 0) return 0;
    return Math.floor(principal * rate + 1e-12);
  }

  function stageForNet(net) {
    const minutes = Math.max(0, net);
    for (const [low, high, stage] of STAGE_TABLE) {
      if (high == null) {
        if (minutes >= low) return stage;
      } else if (minutes >= low && minutes < high) {
        return stage;
      }
    }
    return "seed";
  }

  function effects(category, amount, side) {
    switch (category) {
      case "spend":
        return [-amount, 0];
      case "deposit":
      case "auto_grant":
      case "habit_reward":
        return [amount, 0];
      case "borrow":
        return [0, amount];
      case "repay":
        return [0, -amount];
      case "auto_interest":
        return side === "liability" ? [0, amount] : [amount, 0];
      default:
        return [0, 0];
    }
  }

  function displayFor(category, side) {
    const zh = {
      income: "#E53935",
      expense: "#43A047",
      liability_up: "#FB8C00",
      liability_down: "#1E88E5",
      neutral: "#757575",
    };
    let tone = "neutral";
    if (
      category === "deposit" ||
      category === "auto_grant" ||
      category === "habit_reward"
    ) {
      tone = "income";
    } else if (category === "spend") tone = "expense";
    else if (category === "borrow") tone = "liability_up";
    else if (category === "repay") tone = "liability_down";
    else if (category === "auto_interest") {
      tone = side === "liability" ? "liability_up" : "income";
    }
    return { tone, color: zh[tone] };
  }

  function parseBody(init) {
    if (!init || init.body == null || init.body === "") return {};
    if (typeof init.body === "string") {
      try {
        return JSON.parse(init.body);
      } catch {
        throw new DomainError("validation", "请求体 JSON 无效");
      }
    }
    return init.body;
  }

  function getState(key) {
    const row = dbApi.queryOne("SELECT value FROM app_state WHERE key = ?", [key]);
    return row ? String(row.value) : null;
  }

  function setState(key, value) {
    dbApi.exec(
      "INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value]
    );
  }

  function listAccounts() {
    return dbApi
      .query("SELECT id, name, attributes_json FROM accounts ORDER BY id ASC")
      .map((r) => ({
        id: Number(r.id),
        name: String(r.name),
        attributes: JSON.parse(r.attributes_json || "{}"),
      }));
  }

  function getAccount(id) {
    const row = dbApi.queryOne(
      "SELECT id, name, attributes_json FROM accounts WHERE id = ?",
      [id]
    );
    ensure(row, "not_found", `账户不存在: ${id}`);
    return {
      id: Number(row.id),
      name: String(row.name),
      attributes: JSON.parse(row.attributes_json || "{}"),
    };
  }

  function currentAccountId() {
    const v = getState("current_account_id");
    return v == null ? null : Number(v);
  }

  function requireCurrent() {
    const id = currentAccountId();
    ensure(id != null, "forbidden", "未选择当前账户");
    return getAccount(id);
  }

  function ensureOrnaments(accountId) {
    dbApi.exec(
      "INSERT OR IGNORE INTO tree_ornaments (account_id, fruit_count, golden_fruit_count, pest_count, woodpecker_count, interest_fruit_count) VALUES (?, 0, 0, 0, 0, 0)",
      [accountId]
    );
  }

  function getOrnaments(accountId) {
    ensureOrnaments(accountId);
    const row = dbApi.queryOne(
      "SELECT fruit_count, golden_fruit_count, pest_count, woodpecker_count, interest_fruit_count FROM tree_ornaments WHERE account_id = ?",
      [accountId]
    );
    return {
      fruit_count: Number(row.fruit_count),
      golden_fruit_count: Number(row.golden_fruit_count),
      pest_count: Number(row.pest_count),
      woodpecker_count: Number(row.woodpecker_count),
      interest_fruit_count: Number(row.interest_fruit_count || 0),
    };
  }

  function saveOrnaments(accountId, orn) {
    dbApi.exec(
      `UPDATE tree_ornaments SET fruit_count=?, golden_fruit_count=?, pest_count=?, woodpecker_count=?, interest_fruit_count=? WHERE account_id=?`,
      [
        orn.fruit_count,
        orn.golden_fruit_count,
        orn.pest_count,
        orn.woodpecker_count,
        orn.interest_fruit_count,
        accountId,
      ]
    );
  }

  function addFruit(orn, n) {
    let fruit = orn.fruit_count + (n || 1);
    let golden = orn.golden_fruit_count;
    while (fruit >= 100) {
      fruit -= 100;
      golden += 1;
    }
    return { ...orn, fruit_count: fruit, golden_fruit_count: golden };
  }

  function listEntries(accountId) {
    return dbApi.query(
      `SELECT id, account_id, category, amount_minutes, summary, correlation_id, created_at, meta_json
       FROM ledger_entries WHERE account_id = ? ORDER BY id ASC`,
      [accountId]
    );
  }

  function getBalance(accountId) {
    getAccount(accountId);
    let asset = 0;
    let liability = 0;
    for (const e of listEntries(accountId)) {
      const meta = JSON.parse(e.meta_json || "{}");
      const [da, dl] = effects(String(e.category), Number(e.amount_minutes), meta.side);
      asset += da;
      liability += dl;
    }
    return { asset, liability, net: asset - liability };
  }

  function getCumulativeInterest(accountId) {
    let assetI = 0;
    let liabI = 0;
    for (const e of listEntries(accountId)) {
      if (e.category !== "auto_interest") continue;
      const meta = JSON.parse(e.meta_json || "{}");
      if (meta.side === "liability") liabI += Number(e.amount_minutes);
      else assetI += Number(e.amount_minutes);
    }
    return { asset: assetI, liability: liabI, net: assetI - liabI };
  }

  function getSettings(accountId) {
    const row = dbApi.queryOne(
      `SELECT account_id, daily_grant_minutes, default_spend_minutes, default_repay_minutes,
              asset_interest_rate, liability_interest_rate, repay_presets_json, display_colors_json
       FROM settings WHERE account_id = ?`,
      [accountId]
    );
    ensure(row, "not_found", `账户设置不存在: ${accountId}`);
    return {
      account_id: Number(row.account_id),
      daily_grant_minutes: Number(row.daily_grant_minutes),
      default_spend_minutes: Number(row.default_spend_minutes),
      default_repay_minutes: Number(row.default_repay_minutes),
      asset_interest_rate: Number(row.asset_interest_rate),
      liability_interest_rate: Number(row.liability_interest_rate),
      repay_presets: JSON.parse(row.repay_presets_json || "[]"),
      display_colors: JSON.parse(row.display_colors_json || "{}"),
    };
  }

  function previewTodayInterest(accountId) {
    const s = getSettings(accountId);
    const bal = getBalance(accountId);
    const assetI = dailyInterestMinutes(bal.asset, s.asset_interest_rate);
    const liabI = dailyInterestMinutes(bal.liability, s.liability_interest_rate);
    return { asset: assetI, liability: liabI, net: assetI - liabI };
  }

  function syncInterestFruits(accountId) {
    const before = getOrnaments(accountId);
    const cum = getCumulativeInterest(accountId).net;
    const target = Math.max(0, Math.floor(cum / 100));
    if (target <= before.interest_fruit_count) return before;
    const delta = target - before.interest_fruit_count;
    const orn = {
      ...before,
      interest_fruit_count: before.interest_fruit_count + delta,
    };
    saveOrnaments(accountId, orn);
    dbApi.exec(
      `INSERT INTO ornament_events (account_id, kind, delta, reason, correlation_id, meta_json, created_at)
       VALUES (?, 'interest_fruit', ?, 'interest', NULL, ?, ?)`,
      [accountId, delta, JSON.stringify({ cumulative_interest_net: cum }), nowIso()]
    );
    return orn;
  }

  function appendEntry(accountId, category, amount, opts) {
    opts = opts || {};
    const created = opts.at || nowIso();
    const meta = opts.meta || {};
    dbApi.exec(
      `INSERT INTO ledger_entries (account_id, category, amount_minutes, summary, correlation_id, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        accountId,
        category,
        amount,
        opts.summary || null,
        opts.correlation_id || null,
        JSON.stringify(meta),
        created,
      ]
    );
    const row = dbApi.queryOne("SELECT last_insert_rowid() AS id");
    return {
      id: Number(row.id),
      account_id: accountId,
      category,
      amount_minutes: amount,
      summary: opts.summary || null,
      correlation_id: opts.correlation_id || null,
      created_at: created,
      meta,
    };
  }

  function spend(accountId, minutes, summary) {
    const settings = getSettings(accountId);
    const amount = minutes == null ? settings.default_spend_minutes : Number(minutes);
    ensure(amount > 0, "validation", "支出分钟必须为正");
    const bal = getBalance(accountId);
    ensure(
      bal.asset >= amount,
      "validation",
      `时间资产不足: 现有 ${bal.asset}，需要 ${amount}`
    );
    return appendEntry(accountId, "spend", amount, { summary: summary || null });
  }

  function borrow(accountId, minutes, summary) {
    const amount = Number(minutes);
    ensure(amount > 0, "validation", "借用分钟必须为正");
    const cid = uuid();
    const rows = [
      appendEntry(accountId, "borrow", amount, { summary, correlation_id: cid }),
      appendEntry(accountId, "deposit", amount, { summary, correlation_id: cid }),
      appendEntry(accountId, "spend", amount, { summary, correlation_id: cid }),
    ];
    const orn = getOrnaments(accountId);
    orn.pest_count += 1;
    saveOrnaments(accountId, orn);
    dbApi.exec(
      `INSERT INTO ornament_events (account_id, kind, delta, reason, correlation_id, meta_json, created_at)
       VALUES (?, 'pest', 1, 'borrow', ?, '{}', ?)`,
      [accountId, cid, nowIso()]
    );
    return rows;
  }

  function repay(accountId, minutes, summary) {
    const amount = Number(minutes);
    ensure(amount > 0, "validation", "存入分钟必须为正");
    const bal = getBalance(accountId);
    const liabilityPart = Math.min(amount, bal.liability);
    const assetPart = amount - liabilityPart;
    const wasPositive = bal.liability > 0;
    const cid = uuid();
    const entries = [];
    if (liabilityPart > 0) {
      entries.push(
        appendEntry(accountId, "repay", liabilityPart, {
          summary,
          correlation_id: cid,
        })
      );
    }
    if (assetPart > 0) {
      entries.push(
        appendEntry(accountId, "deposit", assetPart, {
          summary,
          correlation_id: cid,
        })
      );
    }
    let orn = addFruit(getOrnaments(accountId), 1);
    if (wasPositive && liabilityPart > 0) {
      const newBal = getBalance(accountId);
      if (newBal.liability === 0) {
        const pestBefore = orn.pest_count;
        orn.woodpecker_count += 1;
        orn.pest_count = 0;
        if (pestBefore > 0) {
          dbApi.exec(
            `INSERT INTO ornament_events (account_id, kind, delta, reason, correlation_id, meta_json, created_at)
             VALUES (?, 'pest', ?, 'deposit', ?, '{}', ?)`,
            [accountId, -pestBefore, cid, nowIso()]
          );
        }
        dbApi.exec(
          `INSERT INTO ornament_events (account_id, kind, delta, reason, correlation_id, meta_json, created_at)
           VALUES (?, 'woodpecker', 1, 'deposit', ?, '{}', ?)`,
          [accountId, cid, nowIso()]
        );
      }
    }
    saveOrnaments(accountId, orn);
    dbApi.exec(
      `INSERT INTO ornament_events (account_id, kind, delta, reason, correlation_id, meta_json, created_at)
       VALUES (?, 'star', 1, 'deposit', ?, '{}', ?)`,
      [accountId, cid, nowIso()]
    );
    return entries;
  }

  function postInterest(accountId, minutes, side, atIso) {
    ensure(minutes > 0, "validation", "结息分钟必须为正");
    const meta = { side };
    if (atIso) meta.settlement_date = String(atIso).slice(0, 10);
    const entry = appendEntry(accountId, "auto_interest", minutes, {
      summary: `结息-${side}`,
      meta,
      at: atIso || nowIso(),
    });
    syncInterestFruits(accountId);
    return entry;
  }

  function autoGrant(accountId, minutes, atIso) {
    ensure(minutes > 0, "validation", "派发分钟必须为正");
    return appendEntry(accountId, "auto_grant", minutes, {
      summary: "自动派发",
      at: atIso || nowIso(),
    });
  }

  function recordDailySnapshot(accountId, dayStr) {
    const bal = getBalance(accountId);
    dbApi.exec(
      `INSERT INTO balance_snapshots (account_id, as_of, asset_minutes, liability_minutes, kind)
       VALUES (?, ?, ?, ?, 'daily')
       ON CONFLICT(account_id, as_of, kind) DO UPDATE SET
         asset_minutes=excluded.asset_minutes,
         liability_minutes=excluded.liability_minutes`,
      [accountId, dayStr, bal.asset, bal.liability]
    );
  }

  function runMidnight(dayStr) {
    const at = atShanghai(dayStr, 0);
    for (const acc of listAccounts()) {
      const s = getSettings(acc.id);
      const bal = getBalance(acc.id);
      const assetI = dailyInterestMinutes(bal.asset, s.asset_interest_rate);
      const liabI = dailyInterestMinutes(bal.liability, s.liability_interest_rate);
      if (assetI > 0) postInterest(acc.id, assetI, "asset", at);
      if (liabI > 0) postInterest(acc.id, liabI, "liability", at);
      recordDailySnapshot(acc.id, dayStr);
    }
    setState(STATE_MIDNIGHT, dayStr);
  }

  function runAutoGrant(dayStr) {
    const at = atShanghai(dayStr, 1);
    for (const acc of listAccounts()) {
      const s = getSettings(acc.id);
      if (s.daily_grant_minutes > 0) {
        autoGrant(acc.id, s.daily_grant_minutes, at);
      }
    }
    setState(STATE_GRANT, dayStr);
  }

  function firstDueDate() {
    const row = dbApi.queryOne("SELECT MIN(created_at) AS m FROM accounts");
    if (!row || row.m == null) return null;
    return String(row.m).slice(0, 10);
  }

  function missedDates(stateKey, through) {
    if (!through) return [];
    const last = getState(stateKey);
    let start = last ? addDays(String(last).slice(0, 10), 1) : firstDueDate();
    if (!start || start > through) return [];
    const earliest = addDays(through, -(MAX_CATCHUP_DAYS - 1));
    if (start < earliest) start = earliest;
    return daysBetweenInclusive(start, through);
  }

  let lastCatchUpAt = 0;
  let lastCatchUpDay = "";

  function catchUp() {
    const parts = shanghaiNowParts();
    const today = parts.dateStr;
    // Same calendar day: skip repeat catch-up within a few seconds (tab switches).
    if (today === lastCatchUpDay && Date.now() - lastCatchUpAt < 5000) {
      return { events: [], midnight_dates: [], grant_dates: [], skipped: true };
    }
    const events = [];
    const midnightDays = missedDates(STATE_MIDNIGHT, today);
    for (const day of midnightDays) {
      runMidnight(day);
      events.push(`midnight:${day}`);
    }
    const grantThrough = parts.hour >= 1 ? today : addDays(today, -1);
    const grantDays = missedDates(STATE_GRANT, grantThrough);
    for (const day of grantDays) {
      runAutoGrant(day);
      events.push(`auto_grant:${day}`);
    }
    if (events.length) dbApi.persist();
    lastCatchUpAt = Date.now();
    lastCatchUpDay = today;
    return { events, midnight_dates: midnightDays, grant_dates: grantDays };
  }

  function homeState(accountId) {
    const bal = getBalance(accountId);
    const orn = getOrnaments(accountId);
    const cum = getCumulativeInterest(accountId);
    const todayI = previewTodayInterest(accountId);
    return {
      account: getAccount(accountId),
      balance: {
        asset: bal.asset,
        liability: bal.liability,
        net: bal.net,
        cumulative_interest: cum.net,
        today_interest: todayI.net,
      },
      tree: {
        stage: stageForNet(bal.net),
        ornaments: {
          fruit_count: orn.fruit_count,
          golden_fruit_count: orn.golden_fruit_count,
          pest_count: orn.pest_count,
          woodpecker_count: orn.woodpecker_count,
          interest_fruit_count: orn.interest_fruit_count,
          monthly_fruit_count: orn.interest_fruit_count,
        },
      },
    };
  }

  async function openAccount(body) {
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    const assetRate = Number(body.asset_interest_rate || 0);
    const recoveryQuestion = String(body.recovery_question || "").trim();
    const recoveryAnswer = String(body.recovery_answer || "");
    ensure(name.length > 0, "validation", "账户名不能为空");
    ensure(assetRate >= 0, "validation", "利率不能为负");
    const isFirst = listAccounts().length === 0;
    if (isFirst) {
      ensure(password.length >= 4, "validation", "密码至少 4 位");
      ensure(recoveryQuestion.length >= 4, "validation", "请设置安全问题（忘记密码时用）");
      ensure(
        normalizeRecoveryAnswer(recoveryAnswer).length >= 2,
        "validation",
        "请填写安全问题答案"
      );
    } else {
      // Parent password is app-wide; additional children only need an unlocked session.
      ensure(sessionUnlocked, "forbidden", "请先解锁后再添加孩子");
    }
    const exists = dbApi.queryOne("SELECT id FROM accounts WHERE name = ?", [name]);
    ensure(!exists, "conflict", `账户名已存在: ${name}`);
    let hash;
    if (isFirst) {
      hash = await hashPassword(password);
    } else {
      hash = getState("parent_password_hash");
      if (!hash) {
        const row = dbApi.queryOne(
          "SELECT password_hash FROM accounts ORDER BY id ASC LIMIT 1"
        );
        hash = row ? String(row.password_hash) : "";
      }
      ensure(Boolean(hash), "forbidden", "尚未设置家长密码，请先完成开户");
    }
    const created = nowIso();
    dbApi.exec(
      `INSERT INTO accounts (name, password_hash, attributes_json, created_at) VALUES (?, ?, '{}', ?)`,
      [name, hash, created]
    );
    const id = Number(dbApi.queryOne("SELECT last_insert_rowid() AS id").id);
    const liabRate = assetRate / 2;
    dbApi.exec(
      `INSERT INTO settings (
        account_id, daily_grant_minutes, default_spend_minutes, default_repay_minutes,
        asset_interest_rate, liability_interest_rate, repay_presets_json, display_colors_json, extra_json
      ) VALUES (?, 0, 20, 20, ?, ?, '[]', '{}', '{}')`,
      [id, assetRate, liabRate]
    );
    setState("current_account_id", String(id));
    ensureOrnaments(id);
    if (isFirst) {
      setState("parent_password_hash", hash);
      await setupRecovery(recoveryQuestion, recoveryAnswer);
      setFaceIdEnabled(false);
    } else if (!getState("parent_password_hash")) {
      setState("parent_password_hash", hash);
    }
    sessionUnlocked = true;
    writeUnlockFlag(true);
    ensureHabitsAttached();
    try {
      if (global.MyTimeTreeHabits && global.MyTimeTreeHabits._installed) {
        global.MyTimeTreeHabits._installed.ensureStarterHabits(id);
      }
    } catch (err) {
      console.warn("[habits] ensureStarterHabits", err);
    }
    dbApi.persist();
    return { id, name, attributes: {} };
  }

  function ensureHabitsAttached() {
    if (!global.MyTimeTreeHabits) return;
    if (global.MyTimeTreeHabits._installed) return;
    global.MyTimeTreeHabits._installed = global.MyTimeTreeHabits.attach({
      ensure,
      DomainError,
      getDb: () => dbApi,
      requireCurrent,
      appendEntry,
      addFruit,
      getOrnaments,
      saveOrnaments,
      nowIso,
      todayStr,
      persist: () => dbApi.persist(),
    });
  }

  async function deleteAccount(accountId, password) {
    const id = Number(accountId);
    ensure(Number.isFinite(id) && id > 0, "validation", "账户无效");
    ensure(Boolean(password), "validation", "请输入家长密码");
    const acc = dbApi.queryOne(
      "SELECT id, name FROM accounts WHERE id = ?",
      [id]
    );
    ensure(acc, "not_found", `账户不存在: ${id}`);
    const okId = await verifyParentPassword(password);
    ensure(okId, "forbidden", "家长密码不正确");

    const wasCurrent = currentAccountId() === id;
    // Explicit cascade — safer if PRAGMA foreign_keys was off on older DBs
    dbApi.exec("DELETE FROM celebration_events WHERE account_id = ?", [id]);
    dbApi.exec("DELETE FROM earned_credits WHERE account_id = ?", [id]);
    dbApi.exec("DELETE FROM habit_logs WHERE account_id = ?", [id]);
    dbApi.exec("DELETE FROM exchange_rules WHERE account_id = ?", [id]);
    dbApi.exec("DELETE FROM habits WHERE account_id = ?", [id]);
    dbApi.exec("DELETE FROM ornament_events WHERE account_id = ?", [id]);
    dbApi.exec("DELETE FROM tree_ornaments WHERE account_id = ?", [id]);
    dbApi.exec("DELETE FROM balance_snapshots WHERE account_id = ?", [id]);
    dbApi.exec("DELETE FROM ledger_entries WHERE account_id = ?", [id]);
    dbApi.exec("DELETE FROM settings WHERE account_id = ?", [id]);
    dbApi.exec("DELETE FROM accounts WHERE id = ?", [id]);

    const remaining = listAccounts();
    if (!remaining.length) {
      dbApi.exec("DELETE FROM app_state WHERE key = ?", ["current_account_id"]);
      sessionUnlocked = true;
      writeUnlockFlag(true);
      dbApi.persist();
      return {
        deleted_id: id,
        deleted_name: String(acc.name),
        remaining: [],
        current_account_id: null,
      };
    }
    if (wasCurrent) {
      setState("current_account_id", String(remaining[0].id));
    }
    dbApi.persist();
    return {
      deleted_id: id,
      deleted_name: String(acc.name),
      remaining: remaining.map((a) => ({ id: a.id, name: a.name })),
      current_account_id: currentAccountId(),
    };
  }

  function queryLedger(accountId, opts) {
    getAccount(accountId);
    const limit = Math.min(200, Math.max(1, Number(opts.limit || 20)));
    const offset = Math.max(0, Number(opts.offset || 0));
    const category = opts.category || null;
    let where = "account_id = ?";
    const params = [accountId];
    if (category) {
      where += " AND category = ?";
      params.push(category);
    }
    const total = Number(
      dbApi.queryOne(`SELECT COUNT(*) AS c FROM ledger_entries WHERE ${where}`, params).c
    );
    const rows = dbApi.query(
      `SELECT id, account_id, category, amount_minutes, summary, correlation_id, created_at, meta_json
       FROM ledger_entries WHERE ${where}
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const items = rows.map((r) => {
      const meta = JSON.parse(r.meta_json || "{}");
      const [da, dl] = effects(String(r.category), Number(r.amount_minutes), meta.side);
      const display = displayFor(String(r.category), meta.side);
      return {
        id: Number(r.id),
        account_id: Number(r.account_id),
        category: String(r.category),
        amount_minutes: Number(r.amount_minutes),
        summary: r.summary,
        correlation_id: r.correlation_id,
        created_at: r.created_at,
        signed_asset_effect: da,
        signed_liability_effect: dl,
        display,
      };
    });
    return {
      total,
      limit,
      offset,
      has_more: offset + items.length < total,
      items,
    };
  }

  function analyticsTrend(accountId, granularity) {
    getAccount(accountId);
    const parts = shanghaiNowParts();
    const today = parts.dateStr;
    let start;
    let end;
    if (granularity === "week") {
      // Monday-start week (weekday: Mon=0 in our calc via UTC date)
      const [y, m, d] = today.split("-").map(Number);
      const utc = new Date(Date.UTC(y, m - 1, d));
      const wd = (utc.getUTCDay() + 6) % 7; // Mon=0
      start = addDays(today, -wd);
      end = addDays(start, 6);
    } else {
      start = `${today.slice(0, 8)}01`;
      const y = Number(today.slice(0, 4));
      const m = Number(today.slice(5, 7));
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      end = `${today.slice(0, 8)}${String(last).padStart(2, "0")}`;
    }

    const settings = getSettings(accountId);
    const rows = listEntries(accountId);
    let entryCount = 0;
    let assetIn = 0;
    let assetOut = 0;
    let interest = 0;
    let liabIn = 0;
    let liabOut = 0;
    let endAsset = 0;
    let endLiab = 0;
    let runningA = 0;
    let runningL = 0;
    const balanceByDay = {};
    const interestByDay = {};
    let lastDate = null;

    function flush(day) {
      if (day) balanceByDay[day] = [runningA, runningL];
    }

    for (const r of rows) {
      const created = String(r.created_at).slice(0, 10);
      const cat = String(r.category);
      const amount = Number(r.amount_minutes);
      const meta = JSON.parse(r.meta_json || "{}");
      const [da, dl] = effects(cat, amount, meta.side);
      if (lastDate != null && created !== lastDate) flush(lastDate);
      lastDate = created;
      runningA += da;
      runningL += dl;
      if (created <= end) {
        endAsset += da;
        endLiab += dl;
      }
      if (created >= start && created <= end) {
        entryCount += 1;
        if (cat === "deposit" || cat === "auto_grant") assetIn += amount;
        if (cat === "spend") assetOut += amount;
        if (cat === "borrow") liabIn += amount;
        if (cat === "repay") liabOut += amount;
        if (cat === "auto_interest") {
          interest += meta.side === "liability" ? -amount : amount;
          interestByDay[created] = (interestByDay[created] || 0) + (meta.side === "liability" ? -amount : amount);
        }
      }
    }
    flush(lastDate);

    // Build series with carry-forward + projected interest for future days
    const series = [];
    let curA = 0;
    let curL = 0;
    // seed from day before start
    const before = addDays(start, -1);
    // find latest balance on or before before
    const allDays = Object.keys(balanceByDay).sort();
    for (const day of allDays) {
      if (day <= before) {
        curA = balanceByDay[day][0];
        curL = balanceByDay[day][1];
      }
    }
    for (const day of daysBetweenInclusive(start, end)) {
      if (balanceByDay[day]) {
        curA = balanceByDay[day][0];
        curL = balanceByDay[day][1];
      }
      let interestNet = interestByDay[day];
      if (interestNet == null) {
        // No posted interest: preview daily accrual from carried balance
        interestNet =
          dailyInterestMinutes(curA, settings.asset_interest_rate) -
          dailyInterestMinutes(curL, settings.liability_interest_rate);
      }
      series.push({
        date: day,
        asset: curA,
        liability: curL,
        net: curA - curL,
        interest_net: interestNet,
      });
    }

    return {
      account_id: accountId,
      granularity,
      period_start: start,
      period_end: end,
      entry_count: entryCount,
      asset_in_minutes: assetIn,
      asset_out_minutes: assetOut,
      interest_minutes: interest,
      liability_in_minutes: liabIn,
      liability_out_minutes: liabOut,
      ending_asset: endAsset,
      ending_liability: endLiab,
      ending_net: endAsset - endLiab,
      series,
    };
  }

  function patchSettings(body) {
    const accountId = Number(body.account_id);
    ensure(currentAccountId() === accountId, "forbidden", "只能修改当前账户设置");
    const cur = getSettings(accountId);
    const next = {
      daily_grant_minutes:
        body.daily_grant_minutes != null
          ? Number(body.daily_grant_minutes)
          : cur.daily_grant_minutes,
      default_spend_minutes:
        body.default_spend_minutes != null
          ? Number(body.default_spend_minutes)
          : cur.default_spend_minutes,
      default_repay_minutes:
        body.default_repay_minutes != null
          ? Number(body.default_repay_minutes)
          : cur.default_repay_minutes,
      asset_interest_rate:
        body.asset_interest_rate != null
          ? Number(body.asset_interest_rate)
          : cur.asset_interest_rate,
      liability_interest_rate:
        body.liability_interest_rate != null
          ? Number(body.liability_interest_rate)
          : cur.liability_interest_rate,
    };
    ensure(next.daily_grant_minutes >= 0, "validation", "daily_grant_minutes 无效");
    ensure(next.default_spend_minutes > 0, "validation", "default_spend_minutes 无效");
    ensure(next.default_repay_minutes > 0, "validation", "default_repay_minutes 无效");
    ensure(next.asset_interest_rate >= 0, "validation", "asset_interest_rate 无效");
    ensure(next.liability_interest_rate >= 0, "validation", "liability_interest_rate 无效");
    // Phase 1 local: allow rate change without confirm_token (single-device offline)
    dbApi.exec(
      `UPDATE settings SET daily_grant_minutes=?, default_spend_minutes=?, default_repay_minutes=?,
        asset_interest_rate=?, liability_interest_rate=? WHERE account_id=?`,
      [
        next.daily_grant_minutes,
        next.default_spend_minutes,
        next.default_repay_minutes,
        next.asset_interest_rate,
        next.liability_interest_rate,
        accountId,
      ]
    );
    dbApi.persist();
    return { account_id: accountId, ...next };
  }

  async function ensureDb() {
    if (dbApi) return dbApi;
    if (!initPromise) {
      const Db = (global.MyTimeTreeDb || (typeof MyTimeTreeDb !== "undefined" ? MyTimeTreeDb : null));
      if (!Db) {
        throw new Error("MyTimeTreeDb 未加载");
      }
      initPromise = Db.open()
        .then((api) => {
          dbApi = api;
          return api;
        })
        .catch((err) => {
          initPromise = null;
          throw err;
        });
    }
    return initPromise;
  }

  /**
   * Import desktop `.local-data/mytimetree.db` (raw SQLite bytes).
   * Replaces all local data; locks session so user re-unlocks with imported password.
   */
  async function importSqliteBytes(bytes, opts) {
    opts = opts || {};
    ensure(opts.confirm === true, "validation", "请确认覆盖本机全部数据");
    await ensureDb();
    if (opts.password) {
      const okId = await verifyParentPassword(String(opts.password));
      ensure(okId, "forbidden", "家长密码不正确");
    }
    const Db = global.MyTimeTreeDb;
    ensure(Db && typeof Db.replaceFromBytes === "function", "internal", "导入能力未就绪");

    try {
      if (dbApi && dbApi.db && typeof dbApi.db.close === "function") {
        dbApi.db.close();
      }
    } catch (err) {
      console.warn("[import] close old db", err);
    }

    const result = await Db.replaceFromBytes(bytes);
    dbApi = result.api;
    initPromise = Promise.resolve(dbApi);
    setSessionUnlocked(false);
    writeUnlockFlag(false);

    const accounts = listAccounts();
    return {
      ok: true,
      account_count: result.accountCount,
      accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
      schema_version: result.schemaVersion,
      bytes: result.bytes,
      message: "导入成功。请使用电脑端家长密码重新解锁。",
    };
  }

  /**
   * Force-restore whole DB from iCloud Documents (overwrites local).
   */
  async function restoreFromICloud(opts) {
    opts = opts || {};
    ensure(opts.confirm === true, "validation", "请确认用 iCloud 覆盖本机数据");
    await ensureDb();
    if (listAccounts().length > 0) {
      ensure(Boolean(opts.password), "validation", "请输入家长密码以确认覆盖");
      const okId = await verifyParentPassword(String(opts.password));
      ensure(okId, "forbidden", "家长密码不正确");
    }
    const Db = global.MyTimeTreeDb;
    ensure(Db && typeof Db.restoreFromICloud === "function", "internal", "恢复能力未就绪");

    try {
      if (dbApi && dbApi.db && typeof dbApi.db.close === "function") {
        dbApi.db.close();
      }
    } catch (err) {
      console.warn("[restore] close old db", err);
    }

    const result = await Db.restoreFromICloud();
    dbApi = result.api;
    initPromise = Promise.resolve(dbApi);
    setSessionUnlocked(false);
    writeUnlockFlag(false);

    const accounts = listAccounts();
    return {
      ok: true,
      account_count: result.accountCount,
      accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
      schema_version: result.schemaVersion,
      bytes: result.bytes,
      source: "icloud-restore",
      message: "已从 iCloud 恢复。请用恢复库中的家长密码重新解锁。",
    };
  }

  async function handle(url, init) {
    await ensureDb();
    const u = new URL(url, "https://mytimetree.local");
    const path = u.pathname;
    const method = (init.method || "GET").toUpperCase();
    const body = method === "GET" || method === "HEAD" ? {} : parseBody(init);

    try {
      if (path === "/health" || path === "/api/health") {
        return {
          status: 200,
          body: {
            status: "ok",
            mode: "local",
            phase: 4,
            schema_version: dbApi.getSchemaVersion(),
            locked: listAccounts().length > 0 && !sessionUnlocked,
          },
        };
      }

      requireUnlocked(path, method);

      // catch-up on any portal read/write after bootstrap path family
      if (path.startsWith("/api/") && sessionUnlocked) {
        catchUp();
      }

      if (path === "/api/auth/status" && method === "GET") {
        return { status: 200, body: authStatus() };
      }

      if (path === "/api/auth/unlock" && method === "POST") {
        const password = String(body.password || "");
        ensure(password.length > 0, "validation", "请输入家长密码");
        const matchedId = await verifyParentPassword(password);
        ensure(matchedId != null, "forbidden", "密码不正确");
        sessionUnlocked = true;
        writeUnlockFlag(true);
        return {
          status: 200,
          body: {
            unlocked: true,
            matched_account_id: matchedId,
            faceid_enabled: isFaceIdEnabled(),
            faceid_optin_done: isFaceIdOptinDone(),
            recovery_configured: Boolean(getRecoveryQuestion()),
          },
        };
      }

      if (path === "/api/auth/lock" && method === "POST") {
        setSessionUnlocked(false);
        return { status: 200, body: { locked: true } };
      }

      if (path === "/api/auth/faceid" && method === "GET") {
        return {
          status: 200,
          body: {
            enabled: isFaceIdEnabled(),
            optin_done: isFaceIdOptinDone(),
          },
        };
      }

      if (path === "/api/auth/faceid" && method === "PATCH") {
        const enabled = Boolean(body.enabled);
        setFaceIdEnabled(enabled);
        if (body.optin_done) setFaceIdOptinDone();
        return {
          status: 200,
          body: { enabled, optin_done: isFaceIdOptinDone() },
        };
      }

      if (path === "/api/auth/recovery" && method === "GET") {
        const q = getRecoveryQuestion();
        return {
          status: 200,
          body: {
            configured: Boolean(q),
            question: q,
            presets: RECOVERY_PRESETS,
          },
        };
      }

      if (path === "/api/auth/recovery/reset" && method === "POST") {
        const result = await resetPasswordWithRecovery(
          body.answer,
          body.new_password
        );
        return { status: 200, body: result };
      }

      if (path === "/api/auth/wipe" && method === "POST") {
        ensure(
          body.confirm === true || body.confirm === "true",
          "validation",
          "请确认清除本地数据"
        );
        const result = await wipeLocalData();
        return { status: 200, body: result };
      }

      if (path === "/api/auth/recovery/setup" && method === "POST") {
        ensure(sessionUnlocked, "forbidden", "请先解锁");
        await setupRecovery(body.question, body.answer);
        return {
          status: 200,
          body: { configured: true, question: getRecoveryQuestion() },
        };
      }

      if (path === "/api/auth/password" && method === "PATCH") {
        ensure(sessionUnlocked, "forbidden", "请先解锁");
        const current = String(body.current_password || "");
        const next = String(body.new_password || "");
        ensure(next.length >= 4, "validation", "新密码至少 4 位");
        const matched = await verifyParentPassword(current);
        ensure(matched != null, "forbidden", "当前密码不正确");
        await setParentPassword(next);
        return { status: 200, body: { updated: true } };
      }

      if (path === "/api/portal/bootstrap" && method === "GET") {
        const accounts = listAccounts();
        return {
          status: 200,
          body: {
            needs_onboarding: accounts.length === 0,
            accounts: sessionUnlocked ? accounts : accounts.map((a) => ({ id: a.id, name: a.name })),
            current_account_id: sessionUnlocked ? currentAccountId() : null,
            membership: {
              enabled: false,
              code: "not_enabled",
              message: "会员功能未启用",
              plan: "none",
            },
            local: { phase: 4, store: "sql.js+icloud-file" },
            auth: authStatus(),
          },
        };
      }

      if (path === "/api/accounts" && method === "POST") {
        const acc = await openAccount(body);
        return { status: 200, body: acc };
      }

      if (path === "/api/accounts/switch" && method === "POST") {
        const acc = getAccount(Number(body.account_id));
        setState("current_account_id", String(acc.id));
        dbApi.persist();
        return { status: 200, body: { id: acc.id, name: acc.name } };
      }

      if (path === "/api/accounts/delete" && method === "POST") {
        const result = await deleteAccount(body.account_id, body.password);
        return { status: 200, body: result };
      }

      if (path === "/api/portal/home" && method === "GET") {
        const acc = requireCurrent();
        return { status: 200, body: homeState(acc.id) };
      }

      if (path === "/api/portal/spend" && method === "POST") {
        const acc = requireCurrent();
        const entry = spend(acc.id, body.minutes, body.summary);
        dbApi.persist();
        return { status: 200, body: { id: entry.id, category: entry.category } };
      }

      if (path === "/api/portal/borrow" && method === "POST") {
        const acc = requireCurrent();
        const entries = borrow(acc.id, body.minutes, body.summary);
        dbApi.persist();
        return {
          status: 200,
          body: {
            ids: entries.map((e) => e.id),
            count: entries.length,
            categories: entries.map((e) => e.category),
          },
        };
      }

      if (
        (path === "/api/portal/repay" || path === "/api/portal/deposit") &&
        method === "POST"
      ) {
        const acc = requireCurrent();
        const entries = repay(
          acc.id,
          body.minutes,
          body.summary || (path.endsWith("deposit") ? "存入" : "存入")
        );
        dbApi.persist();
        return {
          status: 200,
          body: {
            ids: entries.map((e) => e.id),
            count: entries.length,
            categories: entries.map((e) => e.category),
          },
        };
      }

      if (path === "/api/settings" && method === "GET") {
        const accountId = Number(u.searchParams.get("account_id"));
        return { status: 200, body: getSettings(accountId) };
      }

      if (path === "/api/settings" && method === "PATCH") {
        return { status: 200, body: patchSettings(body) };
      }

      if (path === "/api/ledger" && method === "GET") {
        const accountId = Number(u.searchParams.get("account_id"));
        return {
          status: 200,
          body: queryLedger(accountId, {
            category: u.searchParams.get("category"),
            limit: u.searchParams.get("limit"),
            offset: u.searchParams.get("offset"),
          }),
        };
      }

      if (path === "/api/analytics/weekly" && method === "GET") {
        const accountId = Number(u.searchParams.get("account_id"));
        return { status: 200, body: analyticsTrend(accountId, "week") };
      }

      if (path === "/api/analytics/monthly" && method === "GET") {
        const accountId = Number(u.searchParams.get("account_id"));
        return { status: 200, body: analyticsTrend(accountId, "month") };
      }

      if (path === "/api/membership" && method === "GET") {
        return {
          status: 200,
          body: {
            enabled: false,
            code: "not_enabled",
            message: "会员功能未启用",
            plan: "none",
          },
        };
      }

      if (path === "/api/persistence/status" && method === "GET") {
        let sync = dbApi.getSyncMeta ? dbApi.getSyncMeta() : {};
        try {
          if (global.MyTimeTreeDb && typeof global.MyTimeTreeDb.status === "function") {
            sync = await global.MyTimeTreeDb.status();
          }
        } catch (err) {
          sync = {
            ...sync,
            lastError: String(err && err.message ? err.message : err),
          };
        }
        return {
          status: 200,
          body: {
            can_close: true,
            dirty: false,
            mode: "local",
            phase: 3,
            sync,
          },
        };
      }

      if (
        (path === "/api/persistence/flush" ||
          path === "/api/persistence/discard" ||
          path === "/api/sync/flush") &&
        method === "POST"
      ) {
        if (typeof dbApi.persistNow === "function") {
          await dbApi.persistNow();
        } else {
          dbApi.persist();
        }
        const sync = dbApi.getSyncMeta ? dbApi.getSyncMeta() : {};
        return {
          status: 200,
          body: { flushed: true, can_close: true, sync },
        };
      }

      if (path === "/api/backups" && method === "GET") {
        return { status: 200, body: { items: [] } };
      }

      if (path === "/api/import/sqlite" && method === "POST") {
        ensure(body.confirm === true, "validation", "请确认覆盖本机全部数据");
        let bytes;
        if (body.base64) {
          const binary = atob(String(body.base64));
          bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        } else {
          ensure(false, "validation", "缺少 base64 数据库内容");
        }
        const result = await importSqliteBytes(bytes, {
          confirm: true,
          password: body.password,
        });
        return { status: 200, body: result };
      }

      if (path === "/api/sync/restore" && method === "POST") {
        const result = await restoreFromICloud({
          confirm: body.confirm === true,
          password: body.password,
        });
        return { status: 200, body: result };
      }

      ensureHabitsAttached();
      if (global.MyTimeTreeHabits && typeof global.MyTimeTreeHabits.tryHandle === "function") {
        const habitRes = await global.MyTimeTreeHabits.tryHandle({
          path,
          method,
          body,
          u,
        });
        if (habitRes) return habitRes;
      }

      return {
        status: 501,
        body: {
          message: `本地尚未实现: ${method} ${path}`,
          code: "LOCAL_NOT_IMPLEMENTED",
          phase: 4,
        },
      };
    } catch (err) {
      if (err instanceof DomainError) {
        return {
          status: err.status,
          body: { code: err.code, message: err.message },
        };
      }
      console.error("[MyTimeTreeLocal]", err);
      return {
        status: 500,
        body: {
          code: "internal",
          message: err && err.message ? err.message : String(err),
        },
      };
    }
  }

  global.MyTimeTreeLocal = {
    version: "4.1.0-icloud-restore",
    handle,
    importSqliteBytes,
    restoreFromICloud,
    async init() {
      await ensureDb();
      sessionUnlocked = readUnlockFlag();
      ensureHabitsAttached();
      // Defer habit content seed so onboarding / unlock paints first (was making cold start feel stuck).
      const deferSeed = () => {
        try {
          if (global.MyTimeTreeHabits && global.MyTimeTreeHabits._installed) {
            global.MyTimeTreeHabits._installed.syncContentTables();
          }
        } catch (err) {
          console.warn("[habits] syncContentTables", err);
        }
      };
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(deferSeed, { timeout: 1500 });
      } else {
        setTimeout(deferSeed, 0);
      }
      if (sessionUnlocked) catchUp();
      return {
        ok: true,
        phase: 4,
        schema_version: dbApi.getSchemaVersion(),
        sync: dbApi.getSyncMeta ? dbApi.getSyncMeta() : null,
        ...authStatus(),
      };
    },
    async flushPersist() {
      await ensureDb();
      if (typeof dbApi.persistNow === "function") return dbApi.persistNow();
      dbApi.persist();
    },
    isUnlocked() {
      return sessionUnlocked;
    },
    lockSession() {
      setSessionUnlocked(false);
    },
    unlockSession() {
      setSessionUnlocked(true);
    },
    /** Dev helper: wipe local DB (Safari/WebView console) */
    async reset() {
      const Db = global.MyTimeTreeDb;
      localStorage.removeItem(Db.STORAGE_KEY);
      writeUnlockFlag(false);
      dbApi = null;
      initPromise = null;
      sessionUnlocked = false;
      await ensureDb();
      return { ok: true };
    },
  };
})(window);
