#!/usr/bin/env node
/**
 * Functional smoke: load db.js + store.js under a minimal window shim + sql.js.
 */
import initSqlJs from "sql.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localDir = join(__dirname, "../www-src/local");
const sqlDist = join(__dirname, "../node_modules/sql.js/dist");

const localStorageMem = new Map();
const localStorage = {
  getItem: (k) => (localStorageMem.has(k) ? localStorageMem.get(k) : null),
  setItem: (k, v) => localStorageMem.set(k, String(v)),
  removeItem: (k) => localStorageMem.delete(k),
};

const SQL = await initSqlJs({
  locateFile: (f) => join(sqlDist, f),
});

const window = {
  crypto: globalThis.crypto,
  console,
  localStorage,
  MyTimeTreeDb: undefined,
  MyTimeTreeLocal: undefined,
};
window.window = window;
globalThis.window = window;
globalThis.localStorage = localStorage;
globalThis.initSqlJs = async () => SQL;

function runScript(file) {
  const code = readFileSync(join(localDir, file), "utf8");
  vm.runInThisContext(code, { filename: file });
}

runScript("db.js");
runScript("store.js");

const L = window.MyTimeTreeLocal;
await L.init();

async function api(path, init = {}) {
  const r = await L.handle(path, init);
  if (r.status >= 400) {
    const msg = r.body && r.body.message ? r.body.message : JSON.stringify(r.body);
    throw new Error(`${r.status} ${msg}`);
  }
  return r.body;
}

const boot0 = await api("/api/portal/bootstrap");
if (!boot0.needs_onboarding) throw new Error("expected onboarding");

const acc = await api("/api/accounts", {
  method: "POST",
  body: JSON.stringify({
    name: "小明",
    password: "pass1234",
    asset_interest_rate: 0.01,
    recovery_question: "你母亲的姓氏是？",
    recovery_answer: "测试",
  }),
});
console.log("[smoke] opened account", acc.id);

// Seed via deposit (repay path)
await api("/api/portal/deposit", {
  method: "POST",
  body: JSON.stringify({ minutes: 100, summary: "初始存入" }),
});

const home1 = await api("/api/portal/home");
console.log("[smoke] home after deposit", home1.balance, home1.tree.stage);

await api("/api/portal/spend", {
  method: "POST",
  body: JSON.stringify({ minutes: 20 }),
});
const home2 = await api("/api/portal/home");
if (home2.balance.asset !== 80) throw new Error(`asset want 80 got ${home2.balance.asset}`);
if (home2.tree.ornaments.fruit_count < 1) throw new Error("expected star after deposit");

const beforeBorrow = home2.balance;
await api("/api/portal/borrow", {
  method: "POST",
  body: JSON.stringify({ minutes: 30 }),
});
const home3 = await api("/api/portal/home");
if (home3.balance.liability !== 30) throw new Error(`liab want 30 got ${home3.balance.liability}`);
if (home3.balance.asset !== beforeBorrow.asset + 30) {
  throw new Error(
    `asset want ${beforeBorrow.asset + 30} got ${home3.balance.asset} (borrow must credit asset)`
  );
}
if (home3.balance.net !== beforeBorrow.net) {
  throw new Error(
    `net want ${beforeBorrow.net} got ${home3.balance.net} (borrow must keep net unchanged)`
  );
}
if (home3.tree.ornaments.pest_count < 1) throw new Error("expected pest");

const ledger = await api("/api/ledger?account_id=1&limit=50");
const borrowRow = (ledger.items || []).find((e) => e.category === "borrow");
if (!borrowRow) throw new Error("expected borrow ledger row");
const sameCid = (ledger.items || []).filter(
  (e) => e.correlation_id === borrowRow.correlation_id
);
if (sameCid.length !== 2) {
  throw new Error(`borrow legs want 2 got ${sameCid.length}: ${sameCid.map((e) => e.category)}`);
}
if (sameCid.some((e) => e.category === "spend")) {
  throw new Error("borrow must not write spend leg");
}
console.log("[smoke] ledger total", ledger.total, "borrow legs", sameCid.map((e) => e.category));

const week = await api("/api/analytics/weekly?account_id=1");
console.log("[smoke] weekly series days", week.series.length);

console.log("[smoke] Phase 1 local store OK");
