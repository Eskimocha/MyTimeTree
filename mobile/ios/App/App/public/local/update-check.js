/**
 * Soft in-app update prompt (native only).
 * - iOS: App Store lookup (country=cn) vs local marketing version
 * - Android: remote version.json vs local versionCode (App.getInfo().build)
 * Soft modal only — never force-upgrade; offline/errors stay silent.
 * Same calendar day: at most one prompt (localStorage).
 */
(function () {
  "use strict";

  /** Kai: set to HTTPS URL of version.json on the same host as the APK download page. */
  const ANDROID_VERSION_JSON_URL = "";

  const IOS_BUNDLE_ID = "com.mytimetree.app";
  const IOS_LOOKUP_URL =
    "https://itunes.apple.com/lookup?bundleId=" +
    encodeURIComponent(IOS_BUNDLE_ID) +
    "&country=cn";

  const PROMPT_DAY_KEY = "mtt.updatePrompt.ymd";
  const FETCH_MS = 8000;
  const START_DELAY_MS = 2200;
  const RETRY_WHEN_BUSY_MS = 4000;

  let scheduled = false;
  let inFlight = false;
  /** True after a successful platform check (update or not); network failures stay false for a later resume retry. */
  let settled = false;
  let modalEl = null;

  function platform() {
    try {
      const Cap = window.Capacitor;
      if (!Cap || typeof Cap.getPlatform !== "function") return "web";
      return Cap.getPlatform();
    } catch {
      return "web";
    }
  }

  function isNative() {
    try {
      return !!(
        window.Capacitor &&
        window.Capacitor.isNativePlatform &&
        window.Capacitor.isNativePlatform()
      );
    } catch {
      return false;
    }
  }

  function appPlugin() {
    try {
      const Cap = window.Capacitor;
      if (!Cap) return null;
      if (typeof Cap.registerPlugin === "function") {
        return Cap.registerPlugin("App");
      }
      return (Cap.Plugins && Cap.Plugins.App) || null;
    } catch {
      return null;
    }
  }

  function todayYmd() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function alreadyPromptedToday() {
    try {
      return localStorage.getItem(PROMPT_DAY_KEY) === todayYmd();
    } catch {
      return false;
    }
  }

  function markPromptedToday() {
    try {
      localStorage.setItem(PROMPT_DAY_KEY, todayYmd());
    } catch {
      /* ignore quota */
    }
  }

  function cmpSemver(a, b) {
    const pa = String(a || "0")
      .split(/[^\d]+/)
      .filter(Boolean)
      .map((n) => parseInt(n, 10) || 0);
    const pb = String(b || "0")
      .split(/[^\d]+/)
      .filter(Boolean)
      .map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d > 0) return 1;
      if (d < 0) return -1;
    }
    return 0;
  }

  async function fetchJson(url) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl
      ? setTimeout(() => {
          try {
            ctrl.abort();
          } catch {
            /* ignore */
          }
        }, FETCH_MS)
      : null;
    try {
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function openExternal(url) {
    if (!url) return;
    try {
      const Cap = window.Capacitor;
      const Browser =
        Cap && Cap.Plugins && Cap.Plugins.Browser
          ? Cap.Plugins.Browser
          : null;
      if (Browser && typeof Browser.open === "function") {
        Browser.open({ url }).catch(() => {
          windowOpen(url);
        });
        return;
      }
    } catch {
      /* fall through */
    }
    windowOpen(url);
  }

  function windowOpen(url) {
    try {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.warn("[update-check] openExternal failed", err);
    }
  }

  function canShowPrompt() {
    if (document.documentElement.classList.contains("is-locked")) return false;
    const lock = document.getElementById("app-lock");
    if (lock && !lock.hidden) return false;
    const main = document.getElementById("main");
    if (main && main.hidden) return false;
    const onboarding = document.getElementById("onboarding");
    if (onboarding && !onboarding.hidden) return false;
    const celeb = document.getElementById("habit-celeb-overlay");
    if (celeb && !celeb.hidden) return false;
    const board = document.getElementById("habit-board-mask");
    if (board && !board.hidden) return false;
    const customize = document.getElementById("habit-customize-modal");
    if (customize && !customize.hidden) return false;
    const keypad = document.getElementById("keypad-modal");
    if (keypad && !keypad.hidden) return false;
    const account = document.getElementById("account-modal");
    if (account && !account.hidden) return false;
    if (modalEl && !modalEl.hidden) return false;
    return true;
  }

  function ensureModal() {
    if (modalEl) return modalEl;
    const el = document.createElement("div");
    el.id = "update-soft-prompt";
    el.className = "update-soft-prompt";
    el.hidden = true;
    el.innerHTML = `
      <div class="update-soft-prompt-backdrop" data-update-dismiss></div>
      <div class="update-soft-prompt-sheet" role="dialog" aria-modal="true" aria-labelledby="update-soft-title">
        <h2 id="update-soft-title">发现新版本</h2>
        <p class="update-soft-prompt-body" id="update-soft-body"></p>
        <div class="update-soft-prompt-actions">
          <button type="button" class="btn" data-update-dismiss>稍后</button>
          <button type="button" class="btn primary" id="update-soft-go">去更新</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.closest && t.closest("[data-update-dismiss]")) {
        hideModal();
      }
    });
    const go = el.querySelector("#update-soft-go");
    if (go) {
      go.addEventListener("click", () => {
        const url = el.dataset.updateUrl || "";
        hideModal();
        openExternal(url);
      });
    }
    modalEl = el;
    return el;
  }

  function hideModal() {
    if (!modalEl) return;
    modalEl.hidden = true;
    modalEl.dataset.updateUrl = "";
  }

  function showSoftPrompt({ storeVersion, notes, url }) {
    if (!url) {
      console.info("[update-check] update available but no URL; skip prompt");
      return;
    }
    if (!canShowPrompt()) {
      console.info("[update-check] UI busy; retry prompt later");
      setTimeout(() => {
        if (!alreadyPromptedToday()) showSoftPrompt({ storeVersion, notes, url });
      }, RETRY_WHEN_BUSY_MS);
      return;
    }
    const el = ensureModal();
    const body = el.querySelector("#update-soft-body");
    const bits = [];
    if (storeVersion) bits.push(`最新版本 ${storeVersion}`);
    if (notes) bits.push(String(notes).trim());
    if (!bits.length) bits.push("有新版本可用，建议更新以获得更好体验。");
    if (body) body.textContent = bits.join(" · ");
    el.dataset.updateUrl = url;
    markPromptedToday();
    el.hidden = false;
    console.info("[update-check] soft prompt shown", { storeVersion, url });
  }

  async function getLocalInfo() {
    const App = appPlugin();
    if (!App || typeof App.getInfo !== "function") {
      throw new Error("App.getInfo unavailable");
    }
    return App.getInfo();
  }

  async function checkIos() {
    const info = await getLocalInfo();
    const localVer = info && info.version;
    if (!localVer) {
      console.info("[update-check] iOS: no local version");
      return;
    }
    const data = await fetchJson(IOS_LOOKUP_URL);
    const result =
      data && Array.isArray(data.results) && data.results.length
        ? data.results[0]
        : null;
    if (!result) {
      console.info("[update-check] iOS: lookup empty (app may be unlisted)");
      return;
    }
    const remoteVer = result.version;
    const url =
      result.trackViewUrl ||
      (result.trackId
        ? `https://apps.apple.com/cn/app/id${result.trackId}`
        : "");
    console.info("[update-check] iOS compare", {
      local: localVer,
      remote: remoteVer,
    });
    if (cmpSemver(remoteVer, localVer) > 0) {
      showSoftPrompt({
        storeVersion: remoteVer,
        notes: "",
        url,
      });
    }
  }

  async function checkAndroid() {
    const url = String(ANDROID_VERSION_JSON_URL || "").trim();
    if (!url) {
      console.info(
        "[update-check] Android: ANDROID_VERSION_JSON_URL empty — skip (set constant + host version.json)"
      );
      return;
    }
    const info = await getLocalInfo();
    const localCode = parseInt(String(info && info.build), 10);
    if (!Number.isFinite(localCode)) {
      console.info("[update-check] Android: invalid local build", info);
      return;
    }
    const remote = await fetchJson(url);
    const remoteCode = parseInt(String(remote && remote.androidVersionCode), 10);
    const downloadUrl =
      remote && remote.androidDownloadUrl
        ? String(remote.androidDownloadUrl).trim()
        : "";
    const notes = remote && remote.notes ? String(remote.notes) : "";
    const storeVersion =
      remote && remote.androidVersionName
        ? String(remote.androidVersionName)
        : remote && remote.versionName
          ? String(remote.versionName)
          : String(remoteCode);
    console.info("[update-check] Android compare", {
      localCode,
      remoteCode,
      downloadUrl: downloadUrl ? "(set)" : "(missing)",
    });
    if (!Number.isFinite(remoteCode)) {
      console.info("[update-check] Android: bad androidVersionCode");
      return;
    }
    if (remoteCode > localCode) {
      showSoftPrompt({
        storeVersion,
        notes,
        url: downloadUrl,
      });
    }
  }

  async function runCheck() {
    if (!isNative()) return;
    if (settled || inFlight) return;
    if (alreadyPromptedToday()) {
      settled = true;
      console.info("[update-check] already prompted today; skip");
      return;
    }
    const p = platform();
    inFlight = true;
    try {
      if (p === "ios") {
        await checkIos();
        settled = true;
      } else if (p === "android") {
        await checkAndroid();
        settled = true;
      } else {
        console.info("[update-check] skip platform", p);
        settled = true;
      }
    } catch (err) {
      console.info("[update-check] silent skip", err && err.message ? err.message : err);
    } finally {
      inFlight = false;
    }
  }

  function schedule() {
    if (!isNative()) return;
    if (scheduled) return;
    scheduled = true;
    const kick = () => {
      if (settled || alreadyPromptedToday()) return;
      if (!canShowPrompt()) {
        setTimeout(kick, RETRY_WHEN_BUSY_MS);
        return;
      }
      runCheck();
    };
    setTimeout(kick, START_DELAY_MS);

    // After unlock / when lock class clears, try again if check not settled.
    try {
      const obs = new MutationObserver(() => {
        if (settled || alreadyPromptedToday()) {
          obs.disconnect();
          return;
        }
        if (canShowPrompt()) {
          setTimeout(() => {
            if (!settled && !alreadyPromptedToday() && canShowPrompt()) runCheck();
          }, 800);
        }
      });
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    } catch {
      /* ignore */
    }

    try {
      const App = appPlugin();
      if (App && typeof App.addListener === "function") {
        App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) return;
          if (settled || alreadyPromptedToday()) return;
          setTimeout(() => {
            if (!settled && canShowPrompt()) runCheck();
          }, 1200);
        });
      }
    } catch {
      /* ignore */
    }
  }

  window.__mytimetreeUpdateCheck = {
    runCheck,
    showSoftPrompt,
    ANDROID_VERSION_JSON_URL,
    IOS_LOOKUP_URL,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule);
  } else {
    schedule();
  }
})();
