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

  // Order: sql.js → db → store → bridge → lock → html2canvas → share → app
  const injectScripts = [
    '  <script src="./local/sql-wasm.js"></script>',
    '  <script src="./local/db.js?v=p4r2"></script>',
    '  <script src="./local/store.js?v=p4r2"></script>',
    '  <script src="./local/bridge.js?v=p4r2"></script>',
    '  <script src="./local/lock.js?v=p4r9"></script>',
    '  <script src="./local/html2canvas.min.js"></script>',
    '  <script src="./local/share.js?v=p4s3"></script>',
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
      `${injectScripts}\n  <script src="./app.js?v=local-p2"></script>`
    );
  } else if (out.includes("app.js")) {
    out = out.replace(
      /<script src="[^"]*app\.js[^"]*"><\/script>/,
      `${injectScripts}\n  <script src="./app.js?v=local-p2"></script>`
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

console.log("[sync-web] portal → mobile/www OK");
console.log("[sync-web] local SQLite + Phase 2 lock bridge injected");
