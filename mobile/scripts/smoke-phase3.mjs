#!/usr/bin/env node
/**
 * Phase 3 smoke: schema migrations + persistence status/flush (localStorage backend).
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
  MyTimeTreeDb: undefined,
  MyTimeTreeLocal: undefined,
};
window.window = window;
globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = localStorage;
globalThis.sessionStorage = sessionStorage;
globalThis.initSqlJs = async () => SQL;

function runScript(file) {
  vm.runInThisContext(readFileSync(join(localDir, file), "utf8"), {
    filename: file,
  });
}

runScript("db.js");
runScript("store.js");

const L = window.MyTimeTreeLocal;
const init = await L.init();
if (init.phase < 3) {
  console.error("[smoke:phase3] FAIL expected phase >= 3", init);
  process.exit(1);
}
if (init.schema_version < 7) {
  console.error("[smoke:phase3] FAIL schema_version", init.schema_version);
  process.exit(1);
}

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
    name: "同步测",
    password: "pass1234",
    asset_interest_rate: 0.01,
    recovery_question: "测试问题？",
    recovery_answer: "答案",
  }),
});

const st = await api("/api/persistence/status");
if (!st.sync || st.sync.backend !== "localStorage") {
  console.error("[smoke:phase3] FAIL sync meta", st);
  process.exit(1);
}

const flushed = await api("/api/sync/flush", { method: "POST", body: "{}" });
if (!flushed.flushed) {
  console.error("[smoke:phase3] FAIL flush", flushed);
  process.exit(1);
}

const key = window.MyTimeTreeDb.STORAGE_KEY;
if (!localStorage.getItem(key)) {
  console.error("[smoke:phase3] FAIL no persisted blob");
  process.exit(1);
}

console.log("[smoke:phase3] OK", {
  phase: init.phase,
  schema_version: init.schema_version,
  backend: st.sync.backend,
  bytes: localStorage.getItem(key).length,
});
