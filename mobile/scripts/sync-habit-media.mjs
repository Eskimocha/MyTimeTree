#!/usr/bin/env node
/**
 * Mirror habit PNG assets → src/mytimetree/static/portal/habit/
 *
 * Sources (first that exists wins as root):
 *   1) HABIT_MEDIA_SRC env
 *   2) /cursor/stores/self/media/habit
 *   3) /cursor/stores/<sibling>/media/habit (optional)
 *
 * Copies *.png only (skips _style-refs). Safe to run when media incomplete.
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
  "img-high-five",
  "img-pillow-bump",
  "img-shoulder-bump",
  "img-spin-clap",
  "img-fridge-sticker",
  "img-hug",
  "img-dance",
  "img-nod-smile",
  "img-thumbs-up",
  "img-fist-bump",
  "img-soft-clap",
  "img-star-sticker",
  "img-cheek-pat",
  "img-ear-whisper",
  "img-blanket-tuck",
  "img-forehead-touch",
  "img-moon-goodnight",
  "img-water-cheers",
  "img-book-bookmark",
  "img-drawing-show",
  "img-stretch-smile",
  "img-deep-breath",
  "img-seed-sprout",
  "img-heart-hands",
];
const expectedBoard = Array.from({ length: 12 }, (_, i) =>
  `mark-celeb-board-${String(i + 1).padStart(2, "0")}`
);
const tipOk = keys.has("icon-tip-seed");
const smallHave = expectedSmall.filter((k) => keys.has(k)).length;
const boardHave = expectedBoard.filter((k) => keys.has(k)).length;

console.log(
  `[sync-habit-media] ${copied} png → ${path.relative(root, dest)} (from ${src})`
);
console.log(
  `[sync-habit-media] tip=${tipOk ? "ok" : "missing"} small=${smallHave}/24 board=${boardHave}/12 keys=${keys.size}`
);
if (smallHave < 24 || boardHave < 12) {
  console.warn(
    "[sync-habit-media] media incomplete — schema/UI hooks ready; re-run when store delivers PNGs"
  );
}
