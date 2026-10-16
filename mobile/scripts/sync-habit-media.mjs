#!/usr/bin/env node
/**
 * Mirror habit PNG assets → src/mytimetree/static/portal/habit/
 *
 * Sources (first that exists wins as root):
 *   1) HABIT_MEDIA_SRC env
 *   2) /cursor/stores/self/media/habit
 *   3) /cursor/stores/<sibling>/media/habit (optional)
 *
 * Canonical keys (KEYS.md 2026-10-15): tip + 28×img-ca-* + 12×img-bm-*
 * Copies *.png only (skips _style-refs).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const dest = path.join(root, "src/mytimetree/static/portal/habit");

const candidates = [
  process.env.HABIT_MEDIA_SRC,
  "/cursor/stores/self/media/habit",
  "/cursor/stores/bc-8f9f8d0f-569a-4a4b-8ab8-f691902d7367/media/habit",
].filter(Boolean);

let src = null;
for (const c of candidates) {
  if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
    src = c;
    break;
  }
}

if (!src) {
  console.warn("[sync-habit-media] no media source — skip (hooks still use portal/habit)");
  process.exit(0);
}

fs.mkdirSync(dest, { recursive: true });
const files = fs
  .readdirSync(src)
  .filter((f) => f.endsWith(".png") && !f.startsWith("."));
let copied = 0;
for (const f of files) {
  fs.copyFileSync(path.join(src, f), path.join(dest, f));
  copied += 1;
}

const keys = new Set(
  files.map((f) => f.replace(/@2x\.png$/i, ".png").replace(/\.png$/i, ""))
);

const expectedSmall = [
  "img-ca-high-five",
  "img-ca-fist-bump",
  "img-ca-elbow-bump",
  "img-ca-shoulder-bump",
  "img-ca-hug-3s",
  "img-ca-thumbs-up",
  "img-ca-air-high-five",
  "img-ca-nod-smile",
  "img-ca-mirror-wink",
  "img-ca-fridge-star",
  "img-ca-spin-clap",
  "img-ca-victory-dance",
  "img-ca-jump-once",
  "img-ca-desk-tap",
  "img-ca-chair-shimmy",
  "img-ca-pencil-twirl",
  "img-ca-silent-clap",
  "img-ca-whisper-ok",
  "img-ca-quiet-heart",
  "img-ca-pillow-bump",
  "img-ca-blanket-squeeze",
  "img-ca-toe-wiggle",
  "img-ca-bed-shoulder",
  "img-ca-outdoor-spin",
  "img-ca-nature-point",
  "img-ca-double-high-five",
  "img-ca-cheek-soft",
  "img-ca-seated-stretch",
];
const expectedBoard = Array.from({ length: 12 }, (_, i) =>
  `img-bm-${String(i + 1).padStart(2, "0")}`
);
const tipOk = keys.has("icon-tip-seed") || keys.has("icon-tip-star");
const tipStarOk = keys.has("icon-tip-star");
const smallHave = expectedSmall.filter((k) => keys.has(k)).length;
const boardHave = expectedBoard.filter((k) => keys.has(k)).length;
const smallMissing = expectedSmall.filter((k) => !keys.has(k));
const boardMissing = expectedBoard.filter((k) => !keys.has(k));

console.log(
  `[sync-habit-media] ${copied} png → ${path.relative(root, dest)} (from ${src})`
);
console.log(
  `[sync-habit-media] tip=${tipOk ? "ok" : "missing"} tip-star=${tipStarOk ? "ok" : "missing"} small=${smallHave}/28 board=${boardHave}/12 keys=${keys.size}`
);
if (!tipOk || smallHave < 28 || boardHave < 12) {
  console.warn(
    "[sync-habit-media] media incomplete",
    { smallMissing, boardMissing }
  );
  process.exitCode = 1;
} else {
  console.log("[sync-habit-media] complete tip+28+12");
}
