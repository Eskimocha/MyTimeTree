/**
 * Local SQLite (sql.js).
 * Native (Capacitor): persist whole DB file via ICloudDb plugin (local + iCloud Documents).
 * Web fallback: localStorage.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "mytimetree.sqlite.v1";
  const MIGRATIONS = [
    {
      version: 1,
      sql: [
        `CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          attributes_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS settings (
          account_id INTEGER PRIMARY KEY,
          daily_grant_minutes INTEGER NOT NULL DEFAULT 0,
          default_spend_minutes INTEGER NOT NULL DEFAULT 20,
          default_repay_minutes INTEGER NOT NULL DEFAULT 20,
          asset_interest_rate REAL NOT NULL DEFAULT 0,
          liability_interest_rate REAL NOT NULL DEFAULT 0,
          repay_presets_json TEXT NOT NULL DEFAULT '[]',
          display_colors_json TEXT NOT NULL DEFAULT '{}',
          extra_json TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS ledger_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          category TEXT NOT NULL,
          amount_minutes INTEGER NOT NULL,
          summary TEXT,
          correlation_id TEXT,
          meta_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS idx_ledger_account_created
          ON ledger_entries(account_id, created_at)`,
      ],
    },
    {
      version: 2,
      sql: [
        `CREATE TABLE IF NOT EXISTS app_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`,
      ],
    },
    {
      version: 3,
      sql: [
        `CREATE TABLE IF NOT EXISTS tree_ornaments (
          account_id INTEGER PRIMARY KEY,
          fruit_count INTEGER NOT NULL DEFAULT 0,
          golden_fruit_count INTEGER NOT NULL DEFAULT 0,
          pest_count INTEGER NOT NULL DEFAULT 0,
          woodpecker_count INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )`,
      ],
    },
    {
      version: 4,
      sql: [
        `CREATE TABLE IF NOT EXISTS balance_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          as_of TEXT NOT NULL,
          asset_minutes INTEGER NOT NULL,
          liability_minutes INTEGER NOT NULL,
          kind TEXT NOT NULL,
          UNIQUE(account_id, as_of, kind),
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )`,
      ],
    },
    {
      version: 5,
      sql: [
        `CREATE TABLE IF NOT EXISTS membership (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          plan TEXT NOT NULL DEFAULT 'none',
          status TEXT NOT NULL DEFAULT 'not_enabled',
          expires_at TEXT,
          remote_customer_id TEXT,
          meta_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL
        )`,
        `INSERT OR IGNORE INTO membership (id, plan, status, updated_at)
         VALUES (1, 'none', 'not_enabled', datetime('now'))`,
      ],
    },
    {
      version: 6,
      sql: [
        `CREATE TABLE IF NOT EXISTS ornament_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          kind TEXT NOT NULL,
          delta INTEGER NOT NULL,
          reason TEXT,
          correlation_id TEXT,
          meta_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS idx_ornament_events_account_created
          ON ornament_events(account_id, created_at)`,
      ],
    },
    {
      version: 7,
      sql: [
        `ALTER TABLE tree_ornaments
         ADD COLUMN interest_fruit_count INTEGER NOT NULL DEFAULT 0`,
      ],
    },
    {
      version: 8,
      sql: [
        `CREATE TABLE IF NOT EXISTS habit_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT '',
          default_minutes INTEGER NOT NULL DEFAULT 5,
          active INTEGER NOT NULL DEFAULT 1,
          sort_default INTEGER NOT NULL DEFAULT 100,
          notes TEXT NOT NULL DEFAULT ''
        )`,
        `CREATE TABLE IF NOT EXISTS habits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          template_id INTEGER,
          title TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL DEFAULT 100,
          archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS idx_habits_account_sort
          ON habits(account_id, archived, sort_order)`,
        `CREATE TABLE IF NOT EXISTS exchange_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          habit_id INTEGER NOT NULL,
          minutes_per_completion INTEGER NOT NULL DEFAULT 5,
          daily_cap INTEGER NOT NULL DEFAULT 1,
          auto_redeem INTEGER NOT NULL DEFAULT 1,
          active INTEGER NOT NULL DEFAULT 1,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
          FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_rules_habit
          ON exchange_rules(habit_id)`,
        `CREATE TABLE IF NOT EXISTS habit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          habit_id INTEGER NOT NULL,
          day_key TEXT NOT NULL,
          created_at TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'parent',
          meta_json TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
          FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_habit_logs_account_habit_day
          ON habit_logs(account_id, habit_id, day_key)`,
        `CREATE TABLE IF NOT EXISTS earned_credits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          habit_log_id INTEGER NOT NULL UNIQUE,
          minutes INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'redeemed',
          ledger_entry_id INTEGER,
          created_at TEXT NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
          FOREIGN KEY (habit_log_id) REFERENCES habit_logs(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS parent_scripts (
          id TEXT PRIMARY KEY,
          habit_slug TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT '',
          script_text TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1
        )`,
        `CREATE TABLE IF NOT EXISTS offline_celebration_hints (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          image_key TEXT NOT NULL DEFAULT '',
          categories_json TEXT NOT NULL DEFAULT '[]',
          active INTEGER NOT NULL DEFAULT 1
        )`,
        `CREATE TABLE IF NOT EXISTS emotion_copy (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL,
          habit_slug TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT '',
          emotion_copy TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1
        )`,
        `CREATE TABLE IF NOT EXISTS celebration_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          kind TEXT NOT NULL,
          day_key TEXT NOT NULL,
          habit_log_id INTEGER,
          payload_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS idx_celebration_account_day
          ON celebration_events(account_id, day_key)`,
      ],
    },
    {
      version: 9,
      sql: [
        `CREATE TABLE IF NOT EXISTS habit_micro_step_defaults (
          id TEXT PRIMARY KEY,
          habit_slug TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 100,
          step_text TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1
        )`,
        `CREATE INDEX IF NOT EXISTS idx_micro_defaults_slug
          ON habit_micro_step_defaults(habit_slug, sort_order)`,
        `CREATE TABLE IF NOT EXISTS habit_micro_steps (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          habit_id INTEGER NOT NULL,
          step_text TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 100,
          source TEXT NOT NULL DEFAULT 'custom',
          seed_id TEXT,
          archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
          FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS idx_micro_steps_habit
          ON habit_micro_steps(account_id, habit_id, archived, sort_order)`,
        `CREATE TABLE IF NOT EXISTS habit_board_copy (
          id TEXT PRIMARY KEY,
          slot TEXT NOT NULL,
          copy_text TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1
        )`,
      ],
    },
    {
      version: 10,
      sql: [
        `CREATE TABLE IF NOT EXISTS celebration_copy (
          id TEXT PRIMARY KEY,
          habit_slug TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT '',
          incentive_text TEXT NOT NULL DEFAULT '',
          small_celebration TEXT NOT NULL DEFAULT '',
          offline_hint_id TEXT NOT NULL DEFAULT '',
          active INTEGER NOT NULL DEFAULT 1
        )`,
        `CREATE INDEX IF NOT EXISTS idx_celebration_copy_slug
          ON celebration_copy(habit_slug, category)`,
      ],
    },
    {
      version: 11,
      sql: [
        `ALTER TABLE celebration_copy ADD COLUMN image_key TEXT NOT NULL DEFAULT ''`,
        `ALTER TABLE celebration_copy ADD COLUMN habit_env TEXT NOT NULL DEFAULT ''`,
        `ALTER TABLE offline_celebration_hints ADD COLUMN env_tags_json TEXT NOT NULL DEFAULT '[]'`,
        `CREATE TABLE IF NOT EXISTS habit_board_milestones (
          id TEXT PRIMARY KEY,
          level INTEGER NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          trigger_rule TEXT NOT NULL DEFAULT '',
          repeatable INTEGER NOT NULL DEFAULT 0,
          offline_action_id TEXT NOT NULL DEFAULT '',
          image_key TEXT NOT NULL DEFAULT '',
          active INTEGER NOT NULL DEFAULT 1
        )`,
        `CREATE INDEX IF NOT EXISTS idx_board_milestones_level
          ON habit_board_milestones(active, level)`,
        `CREATE TABLE IF NOT EXISTS habit_milestone_done (
          account_id INTEGER NOT NULL,
          milestone_id TEXT NOT NULL,
          period_key TEXT NOT NULL DEFAULT '',
          level INTEGER NOT NULL DEFAULT 0,
          day_key TEXT NOT NULL,
          achieved_at TEXT NOT NULL,
          PRIMARY KEY (account_id, milestone_id, period_key),
          FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )`,
      ],
    },
    {
      version: 12,
      sql: [
        `CREATE TABLE IF NOT EXISTS maui_habits (
          id TEXT PRIMARY KEY,
          habit_slug TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT '',
          maui_text TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1
        )`,
        `CREATE INDEX IF NOT EXISTS idx_maui_habits_slug
          ON maui_habits(habit_slug, category, active)`,
      ],
    },
  ];

  let lastSyncMeta = {
    backend: "localStorage",
    iCloudAvailable: false,
    lastSave: null,
    lastLoadSource: null,
    lastError: null,
  };

  function plugin(name) {
    try {
      const Cap = global.Capacitor;
      if (!Cap) return null;
      if (typeof Cap.registerPlugin === "function") return Cap.registerPlugin(name);
      return (Cap.Plugins && Cap.Plugins[name]) || null;
    } catch {
      return null;
    }
  }

  function isNative() {
    try {
      return Boolean(
        global.Capacitor &&
          global.Capacitor.isNativePlatform &&
          global.Capacitor.isNativePlatform()
      );
    } catch {
      return false;
    }
  }

  function b64FromBytes(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function bytesFromB64(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function nativeLoad() {
    const ICloudDb = plugin("ICloudDb");
    if (!ICloudDb || typeof ICloudDb.load !== "function") return null;
    const res = await ICloudDb.load();
    lastSyncMeta.backend = "icloud-file";
    lastSyncMeta.iCloudAvailable = Boolean(res && res.iCloudAvailable);
    lastSyncMeta.lastLoadSource = res && res.source;
    if (res && typeof res.data === "string" && res.data.length) {
      return res.data;
    }
    return "";
  }

  async function nativeSave(b64) {
    const ICloudDb = plugin("ICloudDb");
    if (!ICloudDb || typeof ICloudDb.save !== "function") {
      throw new Error("ICloudDb 插件未就绪（save）");
    }
    const res = await ICloudDb.save({ base64: b64 });
    if (!res || res.ok === false || res.local !== true) {
      throw new Error(
        (res && res.iCloudReason) || "原生保存未确认写入本机"
      );
    }
    lastSyncMeta.backend = "icloud-file";
    lastSyncMeta.iCloudAvailable = Boolean(res.iCloudAvailable);
    lastSyncMeta.lastSave = {
      at: res.lastWriteAt || new Date().toISOString(),
      iCloud: Boolean(res.iCloud),
      bytes: res.bytes,
    };
    lastSyncMeta.lastError = res.iCloud ? null : res.iCloudReason || null;
    return res;
  }

  async function nativeStatus() {
    const ICloudDb = plugin("ICloudDb");
    if (!ICloudDb || typeof ICloudDb.status !== "function") {
      return { ...lastSyncMeta, plugin: false };
    }
    const st = await ICloudDb.status();
    lastSyncMeta.iCloudAvailable = Boolean(st && st.iCloudAvailable);
    return {
      ...lastSyncMeta,
      plugin: true,
      ...(st || {}),
      iCloudAvailable: Boolean(st && st.iCloudAvailable),
      localExists: Boolean(st && st.localExists),
      iCloudExists: Boolean(st && st.iCloudExists),
    };
  }

  function createApi(db) {
    let persistTimer = 0;
    let persistChain = Promise.resolve();

    function persistNow() {
      const data = db.export();
      const b64 = b64FromBytes(data);
      if (isNative()) {
        persistChain = persistChain.then(() => nativeSave(b64)).catch((err) => {
          console.error("[MyTimeTree DB] native persist failed", err);
          lastSyncMeta.lastError = String(err && err.message ? err.message : err);
          try {
            localStorage.setItem(STORAGE_KEY, b64);
          } catch (_) {
            /* ignore */
          }
          // Rethrow so /api/sync/flush and callers can surface failure.
          throw err;
        });
        return persistChain;
      }
      try {
        localStorage.setItem(STORAGE_KEY, b64);
        lastSyncMeta.backend = "localStorage";
        lastSyncMeta.lastSave = { at: new Date().toISOString(), iCloud: false };
      } catch (err) {
        console.error("[MyTimeTree DB] persist failed", err);
        lastSyncMeta.lastError = String(err && err.message ? err.message : err);
      }
      return Promise.resolve();
    }

    function persist() {
      // Debounce iCloud writes; still flush soon after mutations
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        Promise.resolve(persistNow()).catch(() => {
          /* lastError already set */
        });
      }, 200);
    }

    function exec(sql, params) {
      db.run(sql, params || []);
    }

    function query(sql, params) {
      const stmt = db.prepare(sql);
      try {
        if (params && params.length) stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        return rows;
      } finally {
        stmt.free();
      }
    }

    function queryOne(sql, params) {
      const rows = query(sql, params);
      return rows.length ? rows[0] : null;
    }

    function getSchemaVersion() {
      const table = queryOne(
        "SELECT name FROM sqlite_master WHERE type = ? AND name = ?",
        ["table", "schema_migrations"]
      );
      if (!table) return 0;
      const row = queryOne("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations");
      return row ? Number(row.v) : 0;
    }

    function migrate() {
      let current = getSchemaVersion();
      for (const m of MIGRATIONS) {
        if (m.version <= current) continue;
        for (const sql of m.sql) {
          try {
            exec(sql);
          } catch (err) {
            if (!String(err && err.message).includes("duplicate column")) throw err;
          }
        }
        exec(
          "INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))",
          [m.version]
        );
        current = m.version;
      }
      persist();
      return current;
    }

    // Flush immediately when app backgrounds / page hides
    function flushOnLeave() {
      clearTimeout(persistTimer);
      return Promise.resolve(persistNow()).catch(() => {
        /* lastError already set */
      });
    }
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushOnLeave();
      });
    }
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("pagehide", flushOnLeave);
    }

    return {
      db,
      exec,
      query,
      queryOne,
      persist,
      persistNow,
      flushOnLeave,
      migrate,
      getSchemaVersion,
      getSyncMeta: () => ({ ...lastSyncMeta }),
    };
  }

  async function getSqlJs() {
    if (typeof initSqlJs !== "function") {
      throw new Error("sql.js 未加载（initSqlJs 缺失）");
    }
    return initSqlJs({
      locateFile: (file) => `./local/${file}`,
    });
  }

  function peekImportedDb(SQL, bytes) {
    const db = new SQL.Database(bytes);
    try {
      const table = db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'"
      );
      if (!table.length || !table[0].values.length) {
        throw new Error("不是有效的 MyTimeTree 数据库（缺少 accounts 表）");
      }
      let accountCount = 0;
      const cnt = db.exec("SELECT COUNT(*) FROM accounts");
      if (cnt.length && cnt[0].values.length) {
        accountCount = Number(cnt[0].values[0][0] || 0);
      }
      if (accountCount < 1) {
        throw new Error("导入库中没有账户数据");
      }
      return { accountCount };
    } finally {
      db.close();
    }
  }

  async function openLocalDb() {
    const SQL = await getSqlJs();

    let saved = null;
    if (isNative()) {
      try {
        saved = await nativeLoad();
      } catch (err) {
        console.warn("[MyTimeTree DB] native load failed, try localStorage", err);
        lastSyncMeta.lastError = String(err && err.message ? err.message : err);
      }
      // One-time migrate from localStorage → native file
      if ((saved == null || saved === "") && localStorage.getItem(STORAGE_KEY)) {
        saved = localStorage.getItem(STORAGE_KEY);
        lastSyncMeta.lastLoadSource = "localStorage-migrate";
        try {
          await nativeSave(saved);
          console.info("[MyTimeTree DB] migrated localStorage → native/iCloud file");
        } catch (err) {
          console.warn("[MyTimeTree DB] migrate save failed", err);
        }
      }
    } else {
      saved = localStorage.getItem(STORAGE_KEY);
      lastSyncMeta.backend = "localStorage";
      lastSyncMeta.lastLoadSource = saved ? "localStorage" : "empty";
    }

    let db;
    if (saved) {
      db = new SQL.Database(bytesFromB64(saved));
    } else {
      db = new SQL.Database();
    }
    const api = createApi(db);
    api.exec("PRAGMA foreign_keys = ON");
    api.migrate();
    return api;
  }

  /**
   * Replace in-memory DB with raw SQLite bytes (e.g. desktop .local-data/mytimetree.db).
   * Caller must persist and rebind store references.
   */
  async function replaceFromBytes(bytes) {
    const SQL = await getSqlJs();
    const raw =
      bytes instanceof Uint8Array
        ? bytes
        : bytes instanceof ArrayBuffer
          ? new Uint8Array(bytes)
          : null;
    if (!raw || !raw.length) {
      throw new Error("导入文件为空");
    }
    const peek = peekImportedDb(SQL, raw);
    const db = new SQL.Database(raw);
    const api = createApi(db);
    api.exec("PRAGMA foreign_keys = ON");
    const schemaVersion = api.migrate();
    // migrate() already schedules persist; force flush so native file is replaced
    if (typeof api.persistNow === "function") {
      await api.persistNow();
    }
    lastSyncMeta.lastLoadSource = "import-sqlite";
    lastSyncMeta.lastError = null;
    return {
      api,
      accountCount: peek.accountCount,
      schemaVersion,
      bytes: raw.length,
    };
  }

  async function restoreFromICloud() {
    const ICloudDb = plugin("ICloudDb");
    if (!ICloudDb || typeof ICloudDb.restoreFromICloud !== "function") {
      throw new Error("ICloudDb 插件未就绪（请 Clean Build 后重新 Run）");
    }
    const res = await ICloudDb.restoreFromICloud();
    if (!res || typeof res.data !== "string" || !res.data.length) {
      throw new Error("iCloud 中没有可恢复的数据库");
    }
    const out = await replaceFromBytes(bytesFromB64(res.data));
    lastSyncMeta.lastLoadSource = "icloud-restore";
    lastSyncMeta.iCloudAvailable = true;
    lastSyncMeta.lastSave = {
      at: res.lastWriteAt || new Date().toISOString(),
      iCloud: true,
      bytes: res.bytes,
    };
    lastSyncMeta.lastError = null;
    return { ...out, source: "icloud-restore" };
  }

  global.MyTimeTreeDb = {
    open: openLocalDb,
    replaceFromBytes,
    restoreFromICloud,
    STORAGE_KEY,
    status: nativeStatus,
    getSyncMeta: () => ({ ...lastSyncMeta }),
  };
})(window);
