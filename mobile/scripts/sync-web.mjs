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
const LOCAL_ASSET_V = "20261015e";
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
  assertMarker(base, "app.js", /habit-settings-swatch/, `${tag} habit-settings-swatch`);
  assertMarker(base, "app.js", /habit-heatmap-weekdays/, `${tag} habit-heatmap-weekdays`);
  assertMarker(base, "styles.css", /\.habit-swipe-actions/, `${tag} CSS .habit-swipe-actions`);
  assertMarker(base, "styles.css", /\.habit-heatmap-date/, `${tag} CSS .habit-heatmap-date`);
  assertMarker(base, "index.html", /最近好习惯记录/, `${tag} 最近好习惯记录`);
  assertMarker(base, "index.html", /改奖励/, `${tag} lede 改奖励`);
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
