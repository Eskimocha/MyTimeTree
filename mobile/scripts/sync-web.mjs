#!/usr/bin/env node
/**
 * Copy Portal static assets into Capacitor www/ and rewrite paths for file:// / capacitor.
 * Also copies Phase 1 local SQLite (sql.js) + domain adapter.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const portalSrc = path.join(root, "src/mytimetree/static/portal");
const www = path.join(root, "mobile/www");
const localSrc = path.join(root, "mobile/www-src/local");
const sqlJsDist = path.join(root, "mobile/node_modules/sql.js/dist");
/** Bust WKWebView caches for injected local scripts + app.js (was stuck on p5h1 / local-p2). */
const LOCAL_ASSET_V = "20261016r";
const iosPublic = path.join(root, "mobile/ios/App/App/public");

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  mkdirp(dest);
  for (const name of fs.readdirSync(src)) {
    if (name === ".DS_Store") continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function rewritePortalHtml(html) {
  let out = html
    .replaceAll("/static/portal/", "./")
    .replaceAll('href="/static/portal/', 'href="./')
    .replaceAll('src="/static/portal/', 'src="./');

  out = out.replace(
    /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com" \/>\s*/g,
    ""
  );
  out = out.replace(
    /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin \/>\s*/g,
    ""
  );
  out = out.replace(
    /<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+" rel="stylesheet" \/>\s*/g,
    ""
  );

  // Prevent iOS focus-zoom from sticking after unlock (inputs must also be ≥16px).
  out = out.replace(
    /<meta name="viewport" content="[^"]*"\s*\/>/,
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />'
  );

  // Order: sql.js → db → habit-seed → store → habits → bridge → lock → share → app
  const v = LOCAL_ASSET_V;
  const injectScripts = [
    '  <script src="./local/sql-wasm.js"></script>',
    `  <script src="./local/db.js?v=${v}"></script>`,
    `  <script src="./local/habit-seed.js?v=${v}"></script>`,
    `  <script src="./local/store.js?v=${v}"></script>`,
    `  <script src="./local/habits.js?v=${v}"></script>`,
    `  <script src="./local/bridge.js?v=${v}"></script>`,
    `  <script src="./local/lock.js?v=${v}"></script>`,
    '  <script src="./local/html2canvas.min.js"></script>',
    `  <script src="./local/share.js?v=${v}"></script>`,
  ].join("\n");

  // Strip any prior local inject then re-add
  out = out.replace(/\s*<link rel="stylesheet" href="\.\/local\/[^"]+"\s*\/>/g, "");
  out = out.replace(/\s*<script src="\.\/local\/[^"]+"><\/script>/g, "");
  out = out.replace(
    /\s*<script>\s*document\.documentElement\.dataset\.mode\s*=\s*["']local["']\s*;?\s*<\/script>/g,
    ""
  );

  // Early: mark local mode + pin-shell CSS before first paint
  if (!out.includes('href="./local/lock.css')) {
    if (out.includes('href="./styles.css')) {
      out = out.replace(
        /(<link rel="stylesheet" href="\.\/styles\.css[^"]*"\s*\/>)/,
        `$1\n  <script>document.documentElement.dataset.mode="local";</script>\n  <link rel="stylesheet" href="./local/lock.css?v=p4r12" />`
      );
    } else {
      out = out.replace(
        "</head>",
        `  <script>document.documentElement.dataset.mode="local";</script>\n  <link rel="stylesheet" href="./local/lock.css?v=p4r12" />\n</head>`
      );
    }
  }

  if (out.includes('<script src="./app.js')) {
    out = out.replace(
      /<script src="\.\/app\.js[^"]*"><\/script>/,
      `${injectScripts}\n  <script src="./app.js?v=${LOCAL_ASSET_V}"></script>`
    );
  } else if (out.includes("app.js")) {
    out = out.replace(
      /<script src="[^"]*app\.js[^"]*"><\/script>/,
      `${injectScripts}\n  <script src="./app.js?v=${LOCAL_ASSET_V}"></script>`
    );
  } else {
    out = out.replace("</body>", `${injectScripts}\n</body>`);
  }

  if (!out.includes('name="mytimetree-mode"')) {
    out = out.replace(
      "<head>",
      '<head>\n  <meta name="mytimetree-mode" content="local-capacitor" />'
    );
  }
  // Visible build probe for Safari Inspector / "App opens but old UI"
  const buildMeta = `<meta name="mytimetree-web-build" content="${LOCAL_ASSET_V}" />`;
  out = out.replace(
    /<meta name="mytimetree-web-build" content="[^"]*"\s*\/>\s*/g,
    ""
  );
  if (out.includes('name="mytimetree-mode"')) {
    out = out.replace(
      /(<meta name="mytimetree-mode" content="[^"]*"\s*\/>)/,
      `$1\n  ${buildMeta}`
    );
  } else {
    out = out.replace("<head>", `<head>\n  ${buildMeta}`);
  }
  return out;
}

function rewriteStaticPortalPaths(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name === ".DS_Store" || name === "local") continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      rewriteStaticPortalPaths(p);
      continue;
    }
    if (!/\.(html|js|css)$/.test(name)) continue;
    const orig = fs.readFileSync(p, "utf8");
    if (!orig.includes("/static/portal/")) continue;
    fs.writeFileSync(p, orig.replaceAll("/static/portal/", "./"));
    console.log("[sync-web] rewrote asset roots:", path.relative(www, p));
  }
}

function rewriteCssFonts(css) {
  return css
    .replace(
      /--font-display:\s*"[^"]+",\s*"[^"]+",\s*sans-serif;/,
      '--font-display: "Fredoka", "Avenir Next", "PingFang SC", sans-serif;'
    )
    .replace(
      /--font-body:\s*"[^"]+",\s*system-ui,\s*sans-serif;/,
      '--font-body: "Noto Sans SC", "PingFang SC", system-ui, sans-serif;'
    );
}

rmrf(www);
mkdirp(www);
copyDir(portalSrc, www);
copyDir(localSrc, path.join(www, "local"));

// sql.js wasm runtime
if (!fs.existsSync(path.join(sqlJsDist, "sql-wasm.js"))) {
  console.error("[sync-web] missing sql.js — run: cd mobile && npm install");
  process.exit(1);
}
fs.copyFileSync(
  path.join(sqlJsDist, "sql-wasm.js"),
  path.join(www, "local", "sql-wasm.js")
);
fs.copyFileSync(
  path.join(sqlJsDist, "sql-wasm.wasm"),
  path.join(www, "local", "sql-wasm.wasm")
);

const indexPath = path.join(www, "index.html");
let html = fs.readFileSync(indexPath, "utf8");
html = rewritePortalHtml(html);
fs.writeFileSync(indexPath, html);

const cssPath = path.join(www, "styles.css");
if (fs.existsSync(cssPath)) {
  fs.writeFileSync(cssPath, rewriteCssFonts(fs.readFileSync(cssPath, "utf8")));
}

rewriteStaticPortalPaths(www);

fs.writeFileSync(
  path.join(www, "WEB_BUILD.txt"),
  `${LOCAL_ASSET_V}\n`,
  "utf8"
);

/**
 * Mirror www → ios/App/App/public so Xcode always sees the same bytes even if
 * `npx cap sync` is skipped or only partially run. Preserve cordova stubs.
 */
function mirrorWwwToIosPublic() {
  if (!fs.existsSync(path.dirname(iosPublic))) {
    console.warn("[sync-web] ios App path missing — skip public mirror");
    return false;
  }
  const keep = new Map();
  for (const name of ["cordova.js", "cordova_plugins.js"]) {
    const p = path.join(iosPublic, name);
    if (fs.existsSync(p)) keep.set(name, fs.readFileSync(p));
  }
  rmrf(iosPublic);
  copyDir(www, iosPublic);
  for (const [name, buf] of keep) {
    fs.writeFileSync(path.join(iosPublic, name), buf);
  }
  console.log("[sync-web] mirrored www → ios/App/App/public");
  return true;
}

// Fingerprint markers Kai can grep after sync (strip-9 / swipe-delete / soft colors)
function assertMarker(base, rel, re, label) {
  const p = path.join(base, rel);
  if (!fs.existsSync(p)) {
    console.error(`[sync-web] MISSING ${path.relative(root, p)}`);
    process.exit(1);
  }
  const text = fs.readFileSync(p, "utf8");
  if (!re.test(text)) {
    console.error(`[sync-web] ${label} not found in ${path.relative(root, p)}`);
    process.exit(1);
  }
  console.log(`[sync-web] ok ${label} → ${path.relative(root, p)}`);
}

function assertBuildTree(base, tag) {
  const esc = LOCAL_ASSET_V.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assertMarker(base, "local/habits.js", /HOME_STRIP_LIMIT\s*=\s*9/, `${tag} HOME_STRIP_LIMIT=9`);
  assertMarker(base, "local/habits.js", /HABIT_COLORS_FEATURED/, `${tag} HABIT_COLORS_FEATURED`);
  assertMarker(base, "app.js", /habit-swipe-actions/, `${tag} habit-swipe-actions`);
  assertMarker(base, "app.js", /改奖励/, `${tag} 改奖励`);
  assertMarker(base, "app.js", /HABIT_IMAGE_ALIASES/, `${tag} HABIT_IMAGE_ALIASES`);
  assertMarker(base, "app.js", new RegExp(esc), `${tag} HABIT_MEDIA_V ${LOCAL_ASSET_V}`);
  assertMarker(base, "app.js", /总共 \$\{show\.length\}/, `${tag} strip 总共 N`);
  assertMarker(base, "app.js", /has-pending/, `${tag} strip remain red-dot`);
  assertMarker(base, "styles.css", /\.habit-strip-remain\.has-pending::before/, `${tag} CSS remain red-dot`);
  assertMarker(base, "index.html", /habit-strip-remain/, `${tag} habit-strip-remain`);
  assertMarker(base, "index.html", /habit-strip-total/, `${tag} habit-strip-total`);
  assertMarker(base, "app.js", /syncHabitSeedPicker/, `${tag} syncHabitSeedPicker`);
  assertMarker(base, "app.js", /habit-seed-picker/, `${tag} habit-seed-picker class`);
  assertMarker(base, "styles.css", /\.habit-seed-picker-list/, `${tag} CSS seed picker list`);
  assertMarker(base, "styles.css", /white-space:\s*nowrap/, `${tag} CSS seed picker nowrap`);
  assertMarker(base, "app.js", /26 \* 16/, `${tag} seed picker max width 26rem`);
  assertMarker(base, "index.html", /从种子习惯清单中选择/, `${tag} 从种子习惯清单中选择`);
  assertMarker(base, "index.html", /添加种子习惯/, `${tag} 添加种子习惯`);
  assertMarker(base, "index.html", /自定义习惯/, `${tag} 自定义习惯`);
  assertMarker(base, "index.html", /添加自定义习惯/, `${tag} 添加自定义习惯`);
  assertMarker(base, "index.html", /habit-seed-field/, `${tag} habit-seed-field`);
  assertMarker(base, "app.js", /pointerdown/, `${tag} seed picker pointerdown close`);
  {
    const html = fs.readFileSync(path.join(base, "index.html"), "utf8");
    if (/从种子启用|启用种子|>自定义名称<|>添加自定义</.test(html)) {
      console.error(`[sync-web] ${tag} stale seed/custom labels still in index.html`);
      process.exit(1);
    }
    console.log(`[sync-web] ok ${tag} no stale seed/custom labels`);
  }
  assertMarker(base, "app.js", /syncAppIconBadge/, `${tag} syncAppIconBadge`);
  assertMarker(base, "app.js", /capPlugin\("Badge"\)/, `${tag} Badge plugin`);
  assertMarker(base, "styles.css", /\.tab\s*\{[\s\S]*?display:\s*inline-flex/, `${tag} CSS tab inline-flex`);
  assertMarker(base, "styles.css", /\.tab-badge\s*\{[\s\S]*?line-height:\s*1/, `${tag} CSS tab-badge line-height`);
  assertMarker(base, "styles.css", /\.tab-label/, `${tag} CSS tab-label`);
  assertMarker(base, "index.html", /class="tab-label"/, `${tag} tab-label span`);
  assertMarker(base, "styles.css", /\.tab-badge\s*\{[\s\S]*?1\.15em/, `${tag} CSS tab-badge em size`);
  {
    const appJs = fs.readFileSync(path.join(base, "app.js"), "utf8");
    if (/\$\{show\.length\}\/\$\{limit\}/.test(appJs) || /还剩 \$\{pending\} ·/.test(appJs)) {
      console.error(`[sync-web] ${tag} stale strip meta slash fraction still in app.js`);
      process.exit(1);
    }
    console.log(`[sync-web] ok ${tag} no strip slash fraction`);
  }
  assertMarker(base, "app.js", /里程碑达成奖章/, `${tag} 里程碑达成奖章`);
  assertMarker(base, "app.js", /小庆祝一下吧/, `${tag} 小庆祝一下吧`);
  assertMarker(base, "index.html", /里程碑达成奖章/, `${tag} aria 里程碑达成奖章`);
  assertMarker(base, "app.js", /月记 \$\{monthLogs\} 条/, `${tag} 月记 stats`);
  assertMarker(base, "app.js", /habit-heatmap-month/, `${tag} heatmap month title`);
  assertMarker(base, "app.js", /never UI lede/, `${tag} board-copy never UI lede`);
  assertMarker(base, "index.html", /habit-board-copy"[^>]*hidden/, `${tag} board-copy hidden`);
  assertMarker(base, "local/habits.js", /month_label/, `${tag} month_label`);
  assertMarker(base, "local/habits.js", /month_logs:/, `${tag} month_logs stats`);
  {
    const appJs = fs.readFileSync(path.join(base, "app.js"), "utf8");
    if (/近记/.test(appJs) || /里程碑 \$\{achieved\}/.test(appJs)) {
      console.error(`[sync-web] ${tag} stale 近记/里程碑 stats still in app.js`);
      process.exit(1);
    }
    console.log(`[sync-web] ok ${tag} no 近记/里程碑 stats line`);
  }
  assertMarker(base, "local/habit-seed.js", /躺卧踩单车/, `${tag} 躺卧踩单车`);
  assertMarker(base, "local/habit-seed.js", /img-ca-whisper-ok-v2/, `${tag} whisper-ok-v2`);
  assertMarker(base, "local/habit-seed.js", /img-ca-toe-bike-v2/, `${tag} toe-bike-v2`);
  assertMarker(base, "local/habit-seed.js", /"id": "ca_toe_wiggle"/, `${tag} ca_toe_wiggle action`);
  assertMarker(
    base,
    "local/habit-seed.js",
    /stretch_bed[\s\S]{0,400}ca_toe_wiggle/,
    `${tag} stretch_bed→toe_wiggle`
  );
  assertMarker(base, "local/habit-seed.js", /牙齿保卫战！/, `${tag} brush incentive`);
  assertMarker(
    base,
    "local/habits.js",
    /row\.incentive_text \|\| small/,
    `${tag} incentive fallback chain`
  );
  assertMarker(base, "local/habits.js", /禁止全员同一默认句/, `${tag} no universal incentive`);
  {
    const habitsJs = fs.readFileSync(path.join(base, "local/habits.js"), "utf8");
    if (habitsJs.includes("被看见真好")) {
      console.error(`[sync-web] ${tag} stale universal incentive 被看见真好 still in habits.js`);
      process.exit(1);
    }
    console.log(`[sync-web] ok ${tag} no 被看见真好 fallback`);
  }
  assertMarker(base, "app.js", /icon-tip-star/, `${tag} tip star`);
  assertMarker(base, "app.js", /renderHabitMilestones/, `${tag} renderHabitMilestones`);
  for (const rel of [
    "habit/icon-tip-star.png",
    "habit/icon-tip-star@2x.png",
    "habit/icon-tip-seed.png",
    "habit/img-ca-high-five.png",
    "habit/img-ca-whisper-ok-v2.png",
    "habit/img-ca-toe-bike-v2.png",
    "habit/img-ca-desk-tap.png",
    "habit/img-bm-01.png",
    "habit/img-bm-03.png",
    "habit/img-bm-12.png",
  ]) {
    const p = path.join(base, rel);
    if (!fs.existsSync(p) || fs.statSync(p).size < 100) {
      console.error(`[sync-web] MISSING/empty ${path.relative(root, p)}`);
      process.exit(1);
    }
    console.log(`[sync-web] ok ${tag} ${rel}`);
  }
  assertMarker(base, "app.js", /habit-settings-swatch/, `${tag} habit-settings-swatch`);
  assertMarker(base, "app.js", /habit-heatmap-weekdays/, `${tag} habit-heatmap-weekdays`);
  assertMarker(base, "styles.css", /\.habit-swipe-actions/, `${tag} CSS .habit-swipe-actions`);
  assertMarker(base, "styles.css", /\.habit-milestones-grid/, `${tag} CSS milestones`);
  assertMarker(base, "styles.css", /\.habit-heatmap-date/, `${tag} CSS .habit-heatmap-date`);
  assertMarker(base, "index.html", /最近好习惯记录/, `${tag} 最近好习惯记录`);
  assertMarker(base, "index.html", /habit-milestones/, `${tag} habit-milestones`);
  assertMarker(base, "index.html", /改奖励/, `${tag} lede 改奖励`);
  assertMarker(base, "local/habits.js", /evaluateBoardMilestone/, `${tag} evaluateBoardMilestone`);
  assertMarker(base, "local/habit-seed.js", /board_milestones/, `${tag} board_milestones seed`);
  assertMarker(base, "index.html", new RegExp(`habits\\.js\\?v=${esc}`), `${tag} habits.js?v=${LOCAL_ASSET_V}`);
  assertMarker(
    base,
    "index.html",
    new RegExp(`mytimetree-web-build" content="${esc}"`),
    `${tag} meta web-build`
  );
}

assertBuildTree(www, "www");
const mirrored = mirrorWwwToIosPublic();
if (mirrored) assertBuildTree(iosPublic, "ios-public");

console.log("[sync-web] portal → mobile/www OK");
console.log(`[sync-web] local asset cache-bust v=${LOCAL_ASSET_V}`);
console.log(
  "[sync-web] next: npx cap sync ios (or npm run cap:sync) — public already mirrored; cap sync refreshes native plugins"
);
