/**
 * Capture current portal page as a long PNG, save to Photos, then open system share sheet.
 * Uses native SaveToPhotos.shareImage (no JS Filesystem / Share plugins required).
 *
 * Long-capture expands nested scrollers (#tab-home inside .main/.portal) so「今日好习惯」
 * below the fold is included. share-capture CSS kills backdrop-filter without whitewashing
 * the forest card / tree art.
 */
(function () {
  "use strict";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function plugin(name) {
    try {
      const Cap = window.Capacitor;
      if (!Cap) return null;
      if (typeof Cap.registerPlugin === "function") {
        return Cap.registerPlugin(name);
      }
      return (Cap.Plugins && Cap.Plugins[name]) || null;
    } catch (e) {
      console.warn("[share] plugin", name, e);
      return null;
    }
  }

  function isNative() {
    try {
      return Boolean(
        window.Capacitor &&
          window.Capacitor.isNativePlatform &&
          window.Capacitor.isNativePlatform()
      );
    } catch {
      return false;
    }
  }

  function toast(msg) {
    let el = $("#share-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "share-toast";
      el.className = "share-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.hidden = true;
    }, 2800);
  }

  function waitFrames(n) {
    return new Promise((resolve) => {
      let left = Math.max(1, n | 0);
      const tick = () => {
        left -= 1;
        if (left <= 0) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /** Styles forced into the html2canvas clone (animations reset to opacity:0 otherwise). */
  const SHARE_CLONE_CSS = `
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    html, body {
      background:
        radial-gradient(120% 80% at 10% -10%, #fff6d6 0%, transparent 45%),
        linear-gradient(165deg, #d8eefc, #eef8f1 55%, #f4faf6) !important;
      opacity: 1 !important;
    }
    .portal, .main, #tab-home.tab-panel {
      overflow: visible !important;
      height: auto !important;
      max-height: none !important;
      min-height: 0 !important;
      flex: 0 0 auto !important;
      opacity: 1 !important;
    }
    .portal {
      background:
        radial-gradient(120% 80% at 10% -10%, #fff6d6 0%, transparent 45%),
        linear-gradient(165deg, #d8eefc, #eef8f1 55%, #f4faf6) !important;
    }
    #tab-home.tab-panel {
      background: transparent !important;
      box-shadow: none !important;
    }
    .tab-panel:not(#tab-home), .panel:not(.hero-tree) {
      background: #f7fcf8 !important;
      opacity: 1 !important;
    }
    .hero-tree, .tree-scene, .tree-art, .float-orn, .brand-mark,
    .balances, .actions, .habit-strip, .btn, .ornament-counters,
    .account-shell, .topbar, .tabs, .tab {
      opacity: 1 !important;
      transform: none !important;
    }
    .tree-art, .float-orn {
      filter: none !important;
    }
    .hero-tree {
      filter: none !important;
    }
    .hero-tree::before,
    .hero-tree::after {
      filter: none !important;
      opacity: 0.45 !important;
    }
    .habit-strip {
      background: #f3faf6 !important;
    }
    .account-shell select,
    .account-icon-btn,
    .balances .bal,
    .ornament-counters li,
    .tab.active {
      background: #ffffff !important;
    }
    .btn {
      background: #dff3e8 !important;
      color: #1a6b48 !important;
    }
    .btn.primary {
      background: linear-gradient(135deg, #2f9e6b, #1a6b48) !important;
      color: #fff !important;
    }
    .app-version {
      opacity: 0.7 !important;
    }
  `;

  function snapshotStyles(el) {
    return {
      el,
      overflow: el.style.overflow,
      overflowY: el.style.overflowY,
      height: el.style.height,
      maxHeight: el.style.maxHeight,
      minHeight: el.style.minHeight,
      flex: el.style.flex,
    };
  }

  function restoreStyles(snap) {
    if (!snap || !snap.el) return;
    const el = snap.el;
    el.style.overflow = snap.overflow;
    el.style.overflowY = snap.overflowY;
    el.style.height = snap.height;
    el.style.maxHeight = snap.maxHeight;
    el.style.minHeight = snap.minHeight;
    el.style.flex = snap.flex;
  }

  /** Expand portal + nested home scroller so full habit list is in layout height. */
  function expandScrollersForCapture(portal) {
    const snaps = [];
    const main = $(".main", portal);
    const tab =
      $(".tab-panel.active", portal) || $("#tab-home", portal) || null;
    const chain = [portal, main, tab].filter(Boolean);
    for (const el of chain) {
      snaps.push(snapshotStyles(el));
      el.style.setProperty("overflow", "visible", "important");
      el.style.setProperty("overflow-y", "visible", "important");
      el.style.setProperty("max-height", "none", "important");
      el.style.setProperty("min-height", "0", "important");
      el.style.setProperty("flex", "0 0 auto", "important");
      // Important: share-capture CSS also uses height:auto !important — must match.
      el.style.setProperty("height", "auto", "important");
    }
    // Bottom-up explicit pixel heights (html2canvas reads layout box, not CSS auto alone).
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const el = chain[i];
      const h = Math.max(el.scrollHeight, el.offsetHeight, el.clientHeight, 1);
      el.style.setProperty("height", `${h}px`, "important");
    }
    return {
      restore() {
        for (const s of snaps) restoreStyles(s);
      },
      fullW: Math.max(portal.scrollWidth, portal.clientWidth, 1),
      fullH: Math.max(portal.scrollHeight, portal.clientHeight, 1),
    };
  }

  function applyShareCloneFixes(doc) {
    const clonePortal = doc.getElementById("portal");
    if (clonePortal) {
      const main = clonePortal.querySelector(".main");
      const tab =
        clonePortal.querySelector(".tab-panel.active") ||
        doc.getElementById("tab-home");
      for (const el of [clonePortal, main, tab].filter(Boolean)) {
        el.style.setProperty("overflow", "visible", "important");
        el.style.setProperty("overflow-y", "visible", "important");
        el.style.setProperty("max-height", "none", "important");
        el.style.setProperty("min-height", "0", "important");
        el.style.setProperty("flex", "0 0 auto", "important");
        el.style.setProperty("height", "auto", "important");
        el.style.opacity = "1";
      }
      for (const el of [tab, main, clonePortal].filter(Boolean)) {
        const h = Math.max(el.scrollHeight, el.offsetHeight, el.clientHeight, 1);
        el.style.setProperty("height", `${h}px`, "important");
      }
    }
    const fix = doc.createElement("style");
    fix.setAttribute("data-share-fix", "1");
    fix.textContent = SHARE_CLONE_CSS;
    (doc.head || doc.documentElement).appendChild(fix);

    const forceOpaque = doc.querySelectorAll(
      ".tab-panel, .panel, .tree-art, .float-orn, .brand-mark, .hero-tree, .tree-scene, .habit-strip, .balances, .actions"
    );
    forceOpaque.forEach((el) => {
      el.style.setProperty("opacity", "1", "important");
      el.style.setProperty("animation", "none", "important");
      el.style.setProperty("transform", "none", "important");
      el.style.setProperty("backdrop-filter", "none", "important");
      el.style.setProperty("-webkit-backdrop-filter", "none", "important");
    });
    doc.querySelectorAll(".tree-art, .float-orn").forEach((el) => {
      el.style.setProperty("filter", "none", "important");
    });

    const hideIds = [
      "share-page-btn",
      "app-lock",
      "keypad-modal",
      "account-modal",
      "share-toast",
      "habit-celeb-overlay",
      "habit-board-mask",
      "habit-micro-modal",
    ];
    for (const id of hideIds) {
      const n = doc.getElementById(id);
      if (n) n.style.display = "none";
    }
  }

  async function captureLongImage() {
    if (typeof html2canvas !== "function") {
      throw new Error("截图组件未加载");
    }
    const portal = $("#portal");
    if (!portal) throw new Error("找不到主界面");

    const prevScrollTop = portal.scrollTop;
    const tab =
      $(".tab-panel.active", portal) || $("#tab-home", portal) || null;
    const prevTabScroll = tab ? tab.scrollTop : 0;

    portal.scrollTop = 0;
    if (tab) tab.scrollTop = 0;
    document.documentElement.classList.add("share-capture");
    const expanded = expandScrollersForCapture(portal);

    try {
      // Paint opaque / no-blur frames before snapshot (live + clone).
      await waitFrames(3);
      const fullW = expanded.fullW;
      const fullH = Math.max(
        expanded.fullH,
        portal.scrollHeight,
        tab ? tab.scrollHeight : 0,
        1
      );
      console.info("[share] capture size", { fullW, fullH, tabH: tab && tab.scrollHeight });
      const canvas = await html2canvas(portal, {
        backgroundColor: null,
        scale: Math.min(2, window.devicePixelRatio || 2),
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: fullW,
        height: fullH,
        windowWidth: fullW,
        windowHeight: fullH,
        scrollX: 0,
        scrollY: 0,
        // false: avoid foreignObject alpha bugs on iOS WKWebView
        foreignObjectRendering: false,
        onclone: (doc) => {
          applyShareCloneFixes(doc);
        },
      });
      return canvas.toDataURL("image/png");
    } finally {
      document.documentElement.classList.remove("share-capture");
      expanded.restore();
      portal.scrollTop = prevScrollTop;
      if (tab) tab.scrollTop = prevTabScroll;
    }
  }

  async function shareNative(dataUrl) {
    const SaveToPhotos = plugin("SaveToPhotos");
    if (!SaveToPhotos || typeof SaveToPhotos.shareImage !== "function") {
      throw new Error("分享插件未就绪：请在 Xcode 重新 Product → Clean Build Folder 后再 Run");
    }
    toast("正在打开分享…");
    const result = await SaveToPhotos.shareImage({ dataUrl });
    console.info("[share] native result", result);
    if (result && result.shared) {
      toast("已完成分享操作");
    }
    // Do not auto-save; user taps 「存储图像」 in the system sheet if needed.
    return result;
  }

  async function shareWebFallback(dataUrl) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `mytimetree-share-${Date.now()}.png`;
    a.click();
    toast("已下载长图（网页模式）");
  }

  async function onShareClick() {
    const btn = $("#share-page-btn");
    if (btn) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
    }
    toast("正在生成长图…");
    try {
      const dataUrl = await captureLongImage();
      if (isNative()) {
        await shareNative(dataUrl);
      } else {
        await shareWebFallback(dataUrl);
      }
    } catch (e) {
      console.error("[share]", e);
      const msg = String((e && e.message) || e || "");
      if (!/cancel|Cancel|abort|Abort/i.test(msg)) {
        toast(msg || "分享失败");
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
      }
    }
  }

  function ensureShareButton() {
    const btn = $("#share-page-btn");
    if (!btn || btn.dataset.shareReady) return;
    btn.dataset.shareReady = "1";
    btn.addEventListener("click", onShareClick);
  }

  function boot() {
    ensureShareButton();
    const obs = new MutationObserver(() => ensureShareButton());
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.MyTimeTreeShare = { captureLongImage, onShareClick };
})();
