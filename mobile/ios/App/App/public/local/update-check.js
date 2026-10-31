/**
 * Soft in-app update prompt (native only).
 * - iOS: App Store lookup (country=cn) vs local marketing version
 * - Android: remote version.json vs local versionCode (App.getInfo().build)
 * Soft modal only — never force-upgrade.
 * Auto: offline/errors stay silent; same calendar day at most one prompt.
 * Manual (设置 → 检查更新): always re-check; toast for latest / failure.
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
  const TOAST_MS = 2800;

  let scheduled = false;
  let inFlight = false;
  /** True after a successful auto check (update or not); network failures stay false for a later resume retry. */
  let settled = false;
  let modalEl = null;
  let toastTimer = null;

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

  /**
   * Parse marketing version into numeric parts.
   * Do NOT use filter(Boolean) — it drops "0" and turns "1.0.0" into [1].
   * @returns {number[]|null}
   */
  function parseSemverParts(v) {
    const s = String(v == null ? "" : v)
      .trim()
      .replace(/^[vV]/, "");
    if (!s) return null;
    const raw = s.split(/[^\d]+/).filter((p) => p !== "");
    if (!raw.length) return null;
    const parts = raw.map((n) => parseInt(n, 10));
    if (parts.some((n) => !Number.isFinite(n))) return null;
    return parts;
  }

  /**
   * @returns {number|null} 1 if a>b, -1 if a<b, 0 if equal, null if either invalid
   */
  function cmpSemver(a, b) {
    const pa = parseSemverParts(a);
    const pb = parseSemverParts(b);
    if (!pa || !pb) return null;
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

  /** Build an itms-apps:// deep link that iOS hands to the App Store app (not Safari). */
  function appStoreDeepLink(trackId, trackViewUrl) {
    const fromId = String(trackId == null ? "" : trackId).replace(/\D/g, "");
    if (fromId) {
      return `itms-apps://apps.apple.com/cn/app/id${fromId}`;
    }
    const m = String(trackViewUrl || "").match(/\/id(\d+)/);
    if (m && m[1]) {
      return `itms-apps://apps.apple.com/cn/app/id${m[1]}`;
    }
    return "";
  }

  function openExternal(url) {
    if (!url) return;
    try {
      if (/^(itms-apps|itms|market):/i.test(url)) {
        window.location.href = url;
        return;
      }
    } catch (err) {
      console.warn("[update-check] scheme open failed", err);
    }
    try {
      const Cap = window.Capacitor;
      const Browser =
        Cap && Cap.Plugins && Cap.Plugins.Browser ? Cap.Plugins.Browser : null;
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

  function showToast(msg) {
    let el = document.getElementById("update-check-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "update-check-toast";
      el.className = "share-toast update-check-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, TOAST_MS);
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

  function showSoftPrompt({ storeVersion, notes, url }, opts) {
    const force = !!(opts && opts.force);
    if (!url) {
      console.info("[update-check] update available but no URL; skip prompt");
      return false;
    }
    if (!force && !canShowPrompt()) {
      console.info("[update-check] UI busy; retry prompt later");
      setTimeout(() => {
        if (!alreadyPromptedToday()) showSoftPrompt({ storeVersion, notes, url });
      }, RETRY_WHEN_BUSY_MS);
      return false;
    }
    if (document.documentElement.classList.contains("is-locked")) return false;
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
    return true;
  }

  async function getLocalInfo() {
    const App = appPlugin();
    if (!App || typeof App.getInfo !== "function") {
      throw new Error("App.getInfo unavailable");
    }
    return App.getInfo();
  }

  /**
   * @returns {Promise<{kind:string, storeVersion?:string, localVersion?:string, url?:string, notes?:string, message?:string}>}
   */
  async function checkIos() {
    const info = await getLocalInfo();
    const localVer = info && info.version != null ? String(info.version).trim() : "";
    const localBuild = info && info.build != null ? String(info.build).trim() : "";
    const localId = info && info.id != null ? String(info.id).trim() : "";
    if (!localVer) {
      return { kind: "error", message: "暂时无法检查" };
    }
    if (localId && localId !== IOS_BUNDLE_ID) {
      console.info("[update-check] iOS: bundle id mismatch", { localId });
      return { kind: "error", message: "暂时无法检查" };
    }

    const data = await fetchJson(IOS_LOOKUP_URL);
    const resultCount = data && typeof data.resultCount === "number" ? data.resultCount : 0;
    const result =
      data && Array.isArray(data.results) && data.results.length
        ? data.results[0]
        : null;
    if (!resultCount || !result) {
      console.info("[update-check] iOS: lookup empty");
      return { kind: "error", message: "暂时无法检查" };
    }
    if (result.bundleId && result.bundleId !== IOS_BUNDLE_ID) {
      return { kind: "error", message: "暂时无法检查" };
    }

    const remoteVer = result.version != null ? String(result.version).trim() : "";
    const deepLink = appStoreDeepLink(result.trackId, result.trackViewUrl);
    if (!remoteVer || !deepLink) {
      return { kind: "error", message: "暂时无法检查" };
    }

    const cmp = cmpSemver(remoteVer, localVer);
    console.info("[update-check] iOS compare", {
      localVersion: localVer,
      localBuild,
      remoteVersion: remoteVer,
      cmp,
      deepLink,
    });
    if (cmp == null) {
      return { kind: "error", message: "暂时无法检查" };
    }
    if (cmp > 0) {
      return {
        kind: "update",
        storeVersion: remoteVer,
        localVersion: localVer,
        url: deepLink,
        notes: "",
      };
    }
    return {
      kind: "latest",
      storeVersion: remoteVer,
      localVersion: localVer,
    };
  }

  /**
   * @returns {Promise<{kind:string, storeVersion?:string, url?:string, notes?:string, message?:string}>}
   */
  async function checkAndroid() {
    const url = String(ANDROID_VERSION_JSON_URL || "").trim();
    if (!url) {
      console.info("[update-check] Android: ANDROID_VERSION_JSON_URL empty");
      return { kind: "error", message: "暂时无法检查" };
    }
    const info = await getLocalInfo();
    const localCode = parseInt(String(info && info.build), 10);
    if (!Number.isFinite(localCode)) {
      return { kind: "error", message: "暂时无法检查" };
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
      return { kind: "error", message: "暂时无法检查" };
    }
    if (remoteCode > localCode) {
      if (!downloadUrl) {
        return { kind: "error", message: "暂时无法检查" };
      }
      return {
        kind: "update",
        storeVersion,
        url: downloadUrl,
        notes,
      };
    }
    return { kind: "latest", storeVersion, localVersion: String(localCode) };
  }

  async function probePlatform() {
    const p = platform();
    if (p === "ios") return checkIos();
    if (p === "android") return checkAndroid();
    return { kind: "error", message: "暂时无法检查" };
  }

  async function runCheck() {
    if (!isNative()) return;
    if (settled || inFlight) return;
    if (alreadyPromptedToday()) {
      settled = true;
      console.info("[update-check] already prompted today; skip");
      return;
    }
    inFlight = true;
    try {
      const result = await probePlatform();
      settled = true;
      if (result.kind === "update") {
        showSoftPrompt({
          storeVersion: result.storeVersion,
          notes: result.notes || "",
          url: result.url,
        });
      }
    } catch (err) {
      console.info("[update-check] silent skip", err && err.message ? err.message : err);
    } finally {
      inFlight = false;
    }
  }

  /**
   * Manual check from 设置 — ignores same-day prompt gate; always reports to user.
   * @returns {Promise<{kind:string}>}
   */
  async function checkNowManual() {
    if (!isNative()) {
      showToast("暂时无法检查");
      return { kind: "error", message: "暂时无法检查" };
    }
    if (inFlight) {
      showToast("正在检查…");
      return { kind: "busy" };
    }
    inFlight = true;
    setManualButtonBusy(true);
    try {
      const result = await probePlatform();
      if (result.kind === "update") {
        const shown = showSoftPrompt(
          {
            storeVersion: result.storeVersion,
            notes: result.notes || "",
            url: result.url,
          },
          { force: true }
        );
        if (!shown) {
          showToast(result.storeVersion ? `发现新版本 ${result.storeVersion}` : "发现新版本");
        }
      } else if (result.kind === "latest") {
        showToast("已是最新版本");
      } else {
        showToast((result && result.message) || "暂时无法检查");
      }
      return result;
    } catch (err) {
      console.info("[update-check] manual check failed", err && err.message ? err.message : err);
      showToast("暂时无法检查");
      return { kind: "error", message: "暂时无法检查" };
    } finally {
      inFlight = false;
      setManualButtonBusy(false);
    }
  }

  function setManualButtonBusy(busy) {
    const btn = document.getElementById("btn-check-update");
    if (!btn) return;
    btn.disabled = !!busy;
    btn.textContent = busy ? "检查中…" : "检查更新";
  }

  function ensureSettingsEntry() {
    if (!isNative()) return;
    const form = document.getElementById("settings-form");
    if (!form || !form.parentNode) return;
    let box = document.getElementById("update-check-settings");
    if (!box) {
      box = document.createElement("div");
      box.id = "update-check-settings";
      box.className = "update-check-settings sync-settings";
      box.innerHTML = `
        <h3 class="security-title">版本更新</h3>
        <p class="muted update-check-lede">检查 App Store / 下载页是否有新版本（不强制更新）。</p>
        <button type="button" class="btn primary" id="btn-check-update">检查更新</button>
        <p id="update-check-settings-msg" class="msg" hidden></p>
      `;
      const after =
        document.getElementById("sync-settings") ||
        document.getElementById("security-settings") ||
        form;
      if (after.nextSibling) {
        after.parentNode.insertBefore(box, after.nextSibling);
      } else {
        after.parentNode.appendChild(box);
      }
    }
    const btn = document.getElementById("btn-check-update");
    if (btn && btn.dataset.wired !== "1") {
      btn.dataset.wired = "1";
      btn.addEventListener("click", () => {
        checkNowManual().catch(() => {});
      });
    }
  }

  function wireSettingsTab() {
    document.querySelectorAll('.tab[data-tab="settings"]').forEach((tabBtn) => {
      if (tabBtn.dataset.updateCheckWired === "1") return;
      tabBtn.dataset.updateCheckWired = "1";
      tabBtn.addEventListener("click", () => {
        ensureSettingsEntry();
      });
    });
  }

  function schedule() {
    ensureSettingsEntry();
    wireSettingsTab();
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
    checkNowManual,
    showSoftPrompt,
    showToast,
    cmpSemver,
    parseSemverParts,
    appStoreDeepLink,
    ensureSettingsEntry,
    ANDROID_VERSION_JSON_URL,
    IOS_LOOKUP_URL,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule);
  } else {
    schedule();
  }
})();
