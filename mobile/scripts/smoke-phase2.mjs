#!/usr/bin/env node
/**
 * Phase 2 smoke: unlock, recovery reset, wipe.
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
  MyTimeTreeDb: undefined,
  MyTimeTreeLocal: undefined,
};
window.window = window;
globalThis.window = window;
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
await L.init();

async function api(path, init = {}) {
  const r = await L.handle(path, init);
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
    name: "小明",
    password: "oldpass1",
    asset_interest_rate: 0.01,
    recovery_question: "你母亲的姓氏是？",
    recovery_answer: "王氏",
  }),
});

L.lockSession();
const st1 = await api("/api/auth/status");
if (!st1.locked) throw new Error("expected locked");
if (!st1.recovery_configured) throw new Error("recovery should be configured");

await api("/api/auth/recovery/reset", {
  method: "POST",
  body: JSON.stringify({ answer: "王氏", new_password: "newpass9" }),
});

L.lockSession();
await api("/api/auth/unlock", {
  method: "POST",
  body: JSON.stringify({ password: "newpass9" }),
});

await api("/api/auth/faceid", {
  method: "PATCH",
  body: JSON.stringify({ enabled: true, optin_done: true }),
});
const face = await api("/api/auth/faceid");
if (!face.enabled) throw new Error("faceid enable failed");

console.log("[smoke] Phase 2 recovery reset + faceid OK");
