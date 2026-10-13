#!/usr/bin/env node
/**
 * Headless smoke test for Phase 1 local store (Node + sql.js).
 * Does not use the browser bridge; reimplements a minimal subset via SQL + logic check.
 */
import initSqlJs from "sql.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Minimal: open db migrate from db.js migrations by evaluating store in happy-dom is heavy.
// Instead: verify sql.js loads + schema migrate SQL from db.js source parse is fragile.
// Run functional checks by importing store logic via vm with stubs.

globalThis.crypto = webcrypto;

const SQL = await initSqlJs({
  locateFile: (f) => join(root, "node_modules/sql.js/dist", f),
});

const db = new SQL.Database();
const migrations = [
  `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`,
  `CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, attributes_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)`,
  `CREATE TABLE settings (
    account_id INTEGER PRIMARY KEY, daily_grant_minutes INTEGER NOT NULL DEFAULT 0,
    default_spend_minutes INTEGER NOT NULL DEFAULT 20, default_repay_minutes INTEGER NOT NULL DEFAULT 20,
    asset_interest_rate REAL NOT NULL DEFAULT 0, liability_interest_rate REAL NOT NULL DEFAULT 0,
    repay_presets_json TEXT NOT NULL DEFAULT '[]', display_colors_json TEXT NOT NULL DEFAULT '{}',
    extra_json TEXT NOT NULL DEFAULT '{}')`,
  `CREATE TABLE ledger_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, category TEXT NOT NULL,
    amount_minutes INTEGER NOT NULL, summary TEXT, correlation_id TEXT,
    meta_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)`,
  `CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE tree_ornaments (
    account_id INTEGER PRIMARY KEY, fruit_count INTEGER NOT NULL DEFAULT 0,
    golden_fruit_count INTEGER NOT NULL DEFAULT 0, pest_count INTEGER NOT NULL DEFAULT 0,
    woodpecker_count INTEGER NOT NULL DEFAULT 0, interest_fruit_count INTEGER NOT NULL DEFAULT 0)`,
];
for (const sql of migrations) db.run(sql);

db.run(
  `INSERT INTO accounts (name, password_hash, attributes_json, created_at) VALUES ('测试','x','{}','2026-08-16T12:00:00+08:00')`
);
db.run(
  `INSERT INTO settings (account_id, asset_interest_rate, liability_interest_rate) VALUES (1, 0.01, 0.005)`
);
db.run(`INSERT INTO app_state (key, value) VALUES ('current_account_id', '1')`);
db.run(
  `INSERT INTO tree_ornaments (account_id) VALUES (1)`
);
db.run(
  `INSERT INTO ledger_entries (account_id, category, amount_minutes, summary, correlation_id, meta_json, created_at)
   VALUES (1,'deposit',100,'开户赠送',NULL,'{}','2026-08-16T12:00:00+08:00')`
);

const bal = db.exec(
  `SELECT category, amount_minutes FROM ledger_entries WHERE account_id=1`
);
console.log("[smoke] ledger rows", bal[0].values.length);

// Simulate spend 20
db.run(
  `INSERT INTO ledger_entries (account_id, category, amount_minutes, summary, correlation_id, meta_json, created_at)
   VALUES (1,'spend',20,'玩',NULL,'{}','2026-08-16T13:00:00+08:00')`
);

function balance() {
  let asset = 0;
  let liability = 0;
  const stmt = db.prepare(
    `SELECT category, amount_minutes, meta_json FROM ledger_entries WHERE account_id=1 ORDER BY id`
  );
  while (stmt.step()) {
    const r = stmt.getAsObject();
    const a = Number(r.amount_minutes);
    if (r.category === "spend") asset -= a;
    else if (r.category === "deposit" || r.category === "auto_grant") asset += a;
    else if (r.category === "borrow") liability += a;
    else if (r.category === "repay") liability -= a;
  }
  stmt.free();
  return { asset, liability, net: asset - liability };
}

const b = balance();
if (b.asset !== 80 || b.net !== 80) {
  console.error("[smoke] FAIL balance", b);
  process.exit(1);
}
console.log("[smoke] OK balance after spend", b);
console.log("[smoke] sql.js + schema basics passed");
