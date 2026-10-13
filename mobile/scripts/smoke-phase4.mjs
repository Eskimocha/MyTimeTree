#!/usr/bin/env node
/**
 * Phase 4 smoke: export sqlite bytes → importSqliteBytes → accounts preserved.
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
const sessionStorageMem = new Map();
const localStorage = {
  getItem: (k) => (localStorageMem.has(k) ? localStorageMem.get(k) : null),
  setItem: (k, v) => localStorageMem.set(k, String(v)),
  removeItem: (k) => localStorageMem.delete(k),
};
const sessionStorage = {
  getItem: (k) => (sessionStorageMem.has(k) ? sessionStorageMem.get(k) : null),
  setItem: (k, v) => sessionStorageMem.set(k, String(v)),
  removeItem: (k) => sessionStorageMem.delete(k),
};

const SQL = await initSqlJs({
  locateFile: (f) => join(sqlDist, f),
});

const window = {
  crypto: globalThis.crypto,
  console,
  localStorage,
  sessionStorage,
  document: {
    visibilityState: "visible",
    addEventListener() {},
  },
  addEventListener() {},
  atob: globalThis.atob.bind(globalThis),
  btoa: globalThis.btoa.bind(globalThis),
  MyTimeTreeDb: undefined,
  MyTimeTreeLocal: undefined,
};
window.window = window;
globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = localStorage;
globalThis.sessionStorage = sessionStorage;
globalThis.atob = window.atob;
globalThis.btoa = window.btoa;
globalThis.initSqlJs = async () => SQL;

function runScript(file) {
  vm.runInThisContext(readFileSync(join(localDir, file), "utf8"), {
    filename: file,
  });
}

runScript("db.js");
runScript("store.js");

const L = window.MyTimeTreeLocal;
await L.init();

async function api(path, initOpts = {}) {
  const r = await L.handle(path, initOpts);
  if (r.status >= 400) {
    const msg =
      r.body && r.body.message ? r.body.message : JSON.stringify(r.body);
    throw new Error(`${r.status} ${msg}`);
  }
  return r.body;
}

await api("/api/accounts", {
  method: "POST",
  body: JSON.stringify({
    name: "导入源",
    password: "pass1234",
    asset_interest_rate: 0.01,
    recovery_question: "测试问题？",
    recovery_answer: "答案",
  }),
});

await api("/api/portal/deposit", {
  method: "POST",
  body: JSON.stringify({ minutes: 50, summary: "seed" }),
});

const exported = window.MyTimeTreeLocal;
// Force persist then grab bytes from localStorage blob
await L.flushPersist();
const b64 = localStorage.getItem(window.MyTimeTreeDb.STORAGE_KEY);
if (!b64) {
  console.error("[smoke:phase4] FAIL no persisted db");
  process.exit(1);
}
const binary = Buffer.from(b64, "base64");

// Wipe and re-init empty-ish by reset then import
await L.reset();
await api("/api/accounts", {
  method: "POST",
  body: JSON.stringify({
    name: "将被覆盖",
    password: "otherpass",
    asset_interest_rate: 0.02,
    recovery_question: "你母亲的姓氏是？",
    recovery_answer: "测试",
  }),
});

const imported = await L.importSqliteBytes(binary, {
  confirm: true,
  password: "otherpass",
});

if (!imported.ok || imported.account_count < 1) {
  console.error("[smoke:phase4] FAIL import", imported);
  process.exit(1);
}

L.unlockSession();
const home = await api("/api/portal/home");
if (!home.account || home.account.name !== "导入源") {
  console.error("[smoke:phase4] FAIL account after import", home.account);
  process.exit(1);
}
if (Number(home.balance.asset) < 50) {
  console.error("[smoke:phase4] FAIL balance", home.balance);
  process.exit(1);
}

console.log("[smoke:phase4] OK", {
  account_count: imported.account_count,
  schema_version: imported.schema_version,
  asset: home.balance.asset,
  name: home.account.name,
});
process.exit(0);