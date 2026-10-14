#!/usr/bin/env node
/**
 * Habit IH0–IH9 smoke: schema v8, seed, auto-redeem habit_reward, no double log.
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
  MyTimeTreeHabits: undefined,
  MyTimeTreeHabitSeed: undefined,
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
runScript("habit-seed.js");
runScript("store.js");
runScript("habits.js");

const L = window.MyTimeTreeLocal;
const init = await L.init();
console.log("[smoke-habits] init schema", init.schema_version);
if (Number(init.schema_version) < 8) {
  throw new Error(`expected schema_version >= 8, got ${init.schema_version}`);
}

const seed = window.MyTimeTreeHabitSeed;
if (!seed || !seed.templates || seed.templates.length < 50) {
  throw new Error(
    `habit seed too small: templates=${seed?.templates?.length ?? 0}`
  );
}
console.log(
  `[smoke-habits] seed templates=${seed.templates.length} scripts=${seed.scripts.length} hints=${seed.hints.length}`
);

async function api(path, initOpts = {}) {
  const r = await L.handle(path, initOpts);
  if (r.status >= 400) {
    const msg = r.body?.message || JSON.stringify(r.body);
    const err = new Error(`${r.status} ${path}: ${msg}`);
    err.status = r.status;
    err.body = r.body;
    throw err;
  }
  return r.body;
}

const acc = await api("/api/accounts", {
  method: "POST",
  body: JSON.stringify({
    name: "习惯测",
    password: "pass1234",
    asset_interest_rate: 0.01,
    recovery_question: "你母亲的姓氏是？",
    recovery_answer: "测试",
  }),
});
console.log("[smoke-habits] account", acc.id);

const today = await api("/api/portal/habits/today");
console.log(
  `[smoke-habits] today items=${today.items.length} badge=${today.badge_count}`
);
if (!today.items.length) throw new Error("starter habits missing");
if (today.badge_count !== today.items.length) {
  throw new Error("badge should equal pending count at start");
}

const first = today.items[0];
const beforeHome = await api("/api/portal/home");
const assetBefore = Number(beforeHome.balance.asset);

const done = await api("/api/portal/habits/complete", {
  method: "POST",
  body: JSON.stringify({ habit_id: first.habit_id }),
});
console.log(
  `[smoke-habits] complete minutes=${done.minutes_credited} celeb=${done.celebration?.kind}`
);
if (done.minutes_credited <= 0) throw new Error("minutes_credited expected");
if (!done.parent_script?.script_text) throw new Error("parent_script missing");
if (done.credit?.status !== "redeemed") throw new Error("credit not auto-redeemed");
if (!done.small_celebration && !done.incentive_text) {
  throw new Error("celebration copy missing on complete");
}
if (done.offline_hint && done.offline_hint.image_key === undefined) {
  throw new Error("offline_hint missing image_key field");
}
console.log(
  `[smoke-habits] celeb_copy small=${done.small_celebration || ""} hint=${done.offline_hint?.title || "-"} img=${done.offline_hint?.image_key || ""}`
);

const afterHome = await api("/api/portal/home");
const assetAfter = Number(afterHome.balance.asset);
if (assetAfter !== assetBefore + done.minutes_credited) {
  throw new Error(
    `asset not increased: before=${assetBefore} after=${assetAfter} credited=${done.minutes_credited}`
  );
}

let conflictOk = false;
try {
  await api("/api/portal/habits/complete", {
    method: "POST",
    body: JSON.stringify({ habit_id: first.habit_id }),
  });
} catch (err) {
  if (err.status === 409 || /已经记过/.test(err.message)) conflictOk = true;
  else throw err;
}
if (!conflictOk) throw new Error("expected conflict on double complete");

const custom = await api("/api/portal/habits/custom", {
  method: "POST",
  body: JSON.stringify({ title: "练字一行", minutes: 7 }),
});
const list = await api("/api/portal/habits/list");
const customs = (list.habits || []).filter((h) => h.id === custom.habit_id);
if (!customs.length) throw new Error("custom habit not listed");

const ordered = (list.habits || []).filter((h) => !h.archived).map((h) => h.id);
const swapped = [...ordered];
if (swapped.length >= 2) {
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  await api("/api/portal/habits/reorder", {
    method: "POST",
    body: JSON.stringify({ ordered_ids: swapped }),
  });
  const today2 = await api("/api/portal/habits/today");
  const ids2 = today2.items.map((i) => i.habit_id);
  if (ids2[0] !== swapped[0]) {
    throw new Error(
      `reorder not reflected on today strip: want ${swapped[0]} got ${ids2[0]}`
    );
  }
}

const overview = await api("/api/portal/habits/overview");
if (!overview.timeline?.length) throw new Error("overview timeline empty");
if (!overview.month_heatmap?.weeks?.length) {
  throw new Error("month_heatmap missing");
}
console.log(
  `[smoke-habits] overview week=${overview.board?.stats?.week_logs} cats=${overview.categories?.length} heatWeeks=${overview.month_heatmap.weeks.length}`
);

const todayFull = await api("/api/portal/habits/today");
const tipItem = todayFull.items?.[0];
if (!tipItem) throw new Error("today empty after complete");
if (!Array.isArray(tipItem.micro_steps)) throw new Error("micro_steps missing on today item");
if (!tipItem.parent_script?.script_text) throw new Error("parent_script missing on today item");
console.log(
  `[smoke-habits] today tip micro=${tipItem.micro_steps.length} color=${tipItem.color}`
);

const msAdd = await api("/api/portal/habits/micro-steps", {
  method: "POST",
  body: JSON.stringify({ habit_id: tipItem.habit_id, step_text: "先准备好水杯" }),
});
if (!msAdd.steps?.some((s) => s.step_text === "先准备好水杯")) {
  throw new Error("custom micro-step not saved");
}

const ledger = await api(`/api/ledger?account_id=${acc.id}&limit=50`);
const habitEntry = (ledger.items || []).find((e) => e.category === "habit_reward");
if (!habitEntry) throw new Error("ledger missing habit_reward entry");

console.log("[smoke-habits] OK");
