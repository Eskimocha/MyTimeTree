#!/usr/bin/env node
/**
 * Parse docs/v2/content/*.md tables → mobile/www-src/local/habit-seed.js
 *
 * Canonical tables (content Agent):
 *   habit-templates.md, micro-steps.md, maui-habits.md, parent-scripts.md,
 *   celebration-copy.md, celebration-actions.md (ca_*),
 *   habit-board-milestones.md (12), offline-celebration-hints.md (legacy och_*),
 *   habit-board-copy.md
 * emotion-copy.md is retired (no longer seeded).
 * Tip expand layers: 微习惯 · 毛伊习惯 · 家长话术（无「激励」行）.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const contentDir = path.join(root, "docs/v2/content");
const outJs = path.join(root, "mobile/www-src/local/habit-seed.js");

function splitPipeRow(line) {
  return line
    .split("|")
    .map((c) => c.trim())
    .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
}

/** All markdown tables in a file (multi-table docs pick by headers). */
function parseMdTables(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const tables = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim().startsWith("|")) {
      i += 1;
      continue;
    }
    const block = [];
    while (i < lines.length && lines[i].trim().startsWith("|")) {
      block.push(lines[i]);
      i += 1;
    }
    if (block.length < 2) continue;
    const headers = splitPipeRow(block[0]);
    const rows = [];
    for (let r = 1; r < block.length; r++) {
      const cells = splitPipeRow(block[r]);
      if (!cells.length) continue;
      if (cells.every((c) => /^[-:]+$/.test(c))) continue;
      if (cells.length < headers.length) continue;
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = cells[idx] ?? "";
      });
      rows.push(obj);
    }
    tables.push({ headers, rows });
  }
  return tables;
}

function parseMdTable(filePath, requiredHeaders = null) {
  const tables = parseMdTables(filePath);
  if (!tables.length) return [];
  if (!requiredHeaders || !requiredHeaders.length) return tables[0].rows;
  const hit = tables.find((t) =>
    requiredHeaders.every((h) => t.headers.includes(h))
  );
  return hit ? hit.rows : [];
}

function firstExisting(...names) {
  for (const name of names) {
    const p = path.join(contentDir, name);
    if (fs.existsSync(p)) return p;
  }
  return path.join(contentDir, names[0]);
}

const templates = parseMdTable(path.join(contentDir, "habit-templates.md"), [
  "slug",
  "title",
]).map((r) => ({
  slug: r.slug,
  title: r.title,
  category: r.category,
  default_minutes: Number(r.default_minutes) || 5,
  active: r.active === "1" || r.active === "true",
  sort_default: Number(r.sort_default) || 100,
  notes: r.notes || "",
}));

const scripts = parseMdTable(path.join(contentDir, "parent-scripts.md"), [
  "id",
  "script_text",
]).map((r) => ({
  id: r.id,
  habit_slug: r.habit_slug || "",
  category: r.category || "",
  script_text: r.script_text,
  active: r.active !== "0",
}));

/** New action library (ca_*) — primary offline hint source */
const celebrationActions = parseMdTable(
  path.join(contentDir, "celebration-actions.md"),
  ["id", "title", "body", "env_tags", "image_key"]
)
  .filter((r) => String(r.id || "").startsWith("ca_"))
  .map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    image_key: r.image_key || "",
    env_tags: (r.env_tags || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    active: r.active !== "0",
  }));

/** Legacy och_* hints — kept for older offline_hint_id refs */
const legacyHints = parseMdTable(
  path.join(contentDir, "offline-celebration-hints.md"),
  ["id", "title", "body"]
).map((r) => ({
  id: r.id,
  title: r.title,
  body: r.body,
  image_key: r.image_key || "",
  categories: (r.categories || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  env_tags: [],
  active: r.active !== "0",
}));

// Merge: ca_* first; och_* fill gaps (do not overwrite ca ids)
const hintById = new Map();
for (const a of celebrationActions) {
  hintById.set(a.id, {
    id: a.id,
    title: a.title,
    body: a.body,
    image_key: a.image_key,
    categories: [],
    env_tags: a.env_tags,
    active: a.active,
  });
}
for (const h of legacyHints) {
  if (hintById.has(h.id)) continue;
  hintById.set(h.id, h);
}
const hints = [...hintById.values()];

const microSteps = parseMdTable(
  firstExisting("micro-steps.md", "habit-micro-steps.md"),
  ["id", "step_text"]
).map((r) => ({
  id: r.id,
  habit_slug: r.habit_slug || "",
  sort: Number(r.sort) || 100,
  step_text: r.step_text,
  active: r.active !== "0",
}));

const mauiHabits = parseMdTable(path.join(contentDir, "maui-habits.md"), [
  "id",
  "maui_text",
]).map((r) => ({
  id: r.id,
  habit_slug: r.habit_slug || "",
  category: r.category || "",
  maui_text: r.maui_text,
  active: r.active !== "0",
}));

const celebrationCopy = parseMdTable(
  path.join(contentDir, "celebration-copy.md"),
  ["id", "incentive_text", "small_celebration", "offline_hint_id"]
).map((r) => ({
  id: r.id,
  habit_slug: r.habit_slug || "",
  category: r.category || "",
  habit_env: r.habit_env || "",
  // Kept for seed/complete payloads; tip expand does NOT show「激励」
  incentive_text: r.incentive_text || r.small_celebration || "",
  small_celebration: r.small_celebration || "",
  offline_hint_id: r.offline_hint_id || "",
  image_key: r.image_key || "",
  active: r.active !== "0",
}));

const boardMilestones = parseMdTable(
  path.join(contentDir, "habit-board-milestones.md"),
  ["level", "id", "title", "trigger_rule", "image_key"]
)
  .filter((r) => String(r.id || "").startsWith("bm_"))
  .map((r) => ({
    level: Number(r.level) || 0,
    id: r.id,
    title: r.title,
    body: r.body,
    trigger_rule: r.trigger_rule || "",
    repeatable: r.repeatable === "1" || r.repeatable === "true",
    offline_action_id: r.offline_action_id || "",
    image_key: r.image_key || "",
    active: r.active !== "0",
  }));

const boardCopy = parseMdTable(path.join(contentDir, "habit-board-copy.md"), [
  "id",
  "slot",
  "copy_text",
]).map((r) => ({
  id: r.id,
  slot: r.slot,
  copy_text: r.copy_text,
  active: r.active !== "0",
}));

const payload = {
  version: 5,
  generated_at: new Date().toISOString(),
  templates,
  scripts,
  maui_habits: mauiHabits,
  hints,
  celebration_actions: celebrationActions,
  celebration_copy: celebrationCopy,
  board_milestones: boardMilestones,
  micro_steps: microSteps,
  board_copy: boardCopy,
  // Retired: approach/avoid emotion-copy — kept empty for older readers
  emotions: [],
};

const js = `/* auto-generated by mobile/scripts/build-habit-content.mjs — do not edit */
(function (global) {
  "use strict";
  global.MyTimeTreeHabitSeed = ${JSON.stringify(payload, null, 2)};
})(typeof window !== "undefined" ? window : globalThis);
`;

fs.mkdirSync(path.dirname(outJs), { recursive: true });
fs.writeFileSync(outJs, js);
console.log(
  `[build-habit-content] templates=${templates.length} scripts=${scripts.length} maui=${mauiHabits.length} hints=${hints.length} actions=${celebrationActions.length} celebration_copy=${celebrationCopy.length} milestones=${boardMilestones.length} micro_steps=${microSteps.length} board_copy=${boardCopy.length} → ${path.relative(root, outJs)}`
);
