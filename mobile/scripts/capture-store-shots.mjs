/**
 * Capture 3 App Store–sized screenshots from the local Capacitor www build.
 * Output: docs/app-store/screenshots/
 *
 * Usage:
 *   export PATH="$HOME/.local/node/bin:$PATH"
 *   cd mobile && npm run cap:sync && node scripts/capture-store-shots.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, "..");
const www = path.join(mobileRoot, "www");
const outDir = path.resolve(mobileRoot, "../docs/app-store/screenshots");

// iPhone 6.7" class portrait (App Store Connect common size)
const WIDTH = 1290;
const HEIGHT = 2796;

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".wasm": "application/wasm",
      ".json": "application/json",
      ".svg": "image/svg+xml",
    }[ext] || "application/octet-stream"
  );
}

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let rel = urlPath === "/" ? "/index.html" : urlPath;
    const filePath = path.normalize(path.join(www, rel));
    if (!filePath.startsWith(www)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function seedAndUnlock(page) {
  await page.waitForFunction(
    () => window.MyTimeTreeLocal && typeof window.MyTimeTreeLocal.handle === "function",
    null,
    { timeout: 30000 }
  );

  await page.evaluate(async () => {
    const L = window.MyTimeTreeLocal;
    if (typeof L.reset === "function") {
      await L.reset();
    }

    const api = async (url, init) => {
      const r = await L.handle(url, init || {});
      if (r.status >= 400) {
        throw new Error(`${url} → ${r.status} ${JSON.stringify(r.body)}`);
      }
      return r.body;
    };

    await api("/api/accounts", {
      method: "POST",
      body: JSON.stringify({
        name: "小红",
        password: "1234",
        recovery_question: "你最喜欢的一本书或电影是？",
        recovery_answer: "三体",
        asset_interest_rate: 0.01,
      }),
    });

    await api("/api/auth/unlock", {
      method: "POST",
      body: JSON.stringify({ password: "1234" }),
    });
    L.unlockSession();

    // Skip Face ID opt-in modal
    await api("/api/auth/faceid", {
      method: "PATCH",
      body: JSON.stringify({ enabled: false, optin_done: true }),
    });

    await api("/api/portal/deposit", {
      method: "POST",
      body: JSON.stringify({ minutes: 120, summary: "阅读奖励" }),
    });
    await api("/api/portal/deposit", {
      method: "POST",
      body: JSON.stringify({ minutes: 80, summary: "家务" }),
    });
    await api("/api/portal/spend", {
      method: "POST",
      body: JSON.stringify({ minutes: 30, summary: "看动画" }),
    });
    // Extra deposits so tree looks more grown for store shots
    await api("/api/portal/deposit", {
      method: "POST",
      body: JSON.stringify({ minutes: 400, summary: "累计存入" }),
    });
  });

  await page.reload({ wait_until: "networkidle" });
  await page.waitForTimeout(1000);

  // Unlock UI if lock overlay shows (sessionStorage may survive reload)
  const lockVisible = await page.locator("#app-lock").isVisible().catch(() => false);
  if (lockVisible) {
    await page.locator("#app-lock-form input[name='password']").fill("1234");
    await page.locator("#app-lock-form button[type='submit']").click();
    await page.waitForTimeout(1000);
  }
  const optin = page.locator("#faceid-optin-no");
  if (await optin.isVisible().catch(() => false)) {
    await optin.click();
    await page.waitForTimeout(500);
  }
  await page.waitForSelector("#main:not([hidden]), #tree-stage", { timeout: 20000 });
}

async function shot(page, name) {
  const file = path.join(outDir, name);
  await page.waitForTimeout(500);
  await page.screenshot({ path: file, type: "png", fullPage: false });
  console.log("[shot]", file);
  return file;
}

async function main() {
  if (!fs.existsSync(path.join(www, "index.html"))) {
    throw new Error("mobile/www missing — run: npm run cap:sync");
  }
  fs.mkdirSync(outDir, { recursive: true });

  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}/`;
  console.log("[serve]", base);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  try {
    await page.goto(base, { wait_until: "networkidle", timeout: 60000 });
    await seedAndUnlock(page);

    // 1) Home
    await page.click('.tab[data-tab="home"]');
    await page.waitForSelector("#tab-home.tab-panel.active");
    await page.waitForTimeout(600);
    await shot(page, "01-home.png");

    // 2) Ledger
    await page.click('.tab[data-tab="ledger"]');
    await page.waitForSelector("#tab-ledger.tab-panel.active");
    await page.waitForTimeout(600);
    await shot(page, "02-ledger.png");

    // 3) Analytics (or settings if analytics empty)
    await page.click('.tab[data-tab="analytics"]');
    await page.waitForSelector("#tab-analytics.tab-panel.active");
    await page.waitForTimeout(800);
    await shot(page, "03-analytics.png");

    console.log("[done] 3 screenshots →", outDir);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
