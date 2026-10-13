/**
 * Capture current portal page as a long PNG, save to Photos, then open system share sheet.
 * Uses native SaveToPhotos.shareImage (no JS Filesystem / Share plugins required).
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
      background: #eef8f1 !important;
      opacity: 1 !important;
    }
    .portal, .main, .tab-panel, .panel, .hero-tree, .tree-art, .tree-scene,
    .balances, .actions, .btn, .ornament-counters, .float-orn, .brand-mark,
    .account-shell, .topbar, .tabs, .tab {
      opacity: 1 !important;
      filter: none !important;
      transform: none !important;
    }
    .panel, .tab-panel {
      background: #f7fcf8 !important;
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
    .hero-tree::before,
    .hero-tree::after {
      filter: none !important;
      opacity: 0.45 !important;
    }
    .app-version {
      opacity: 0.7 !important;
    }
  `;

  function applyShareCloneFixes(doc) {
    const clonePortal = doc.getElementById("portal");
    if (clonePortal) {
      clonePortal.style.overflow = "visible";
      clonePortal.style.height = "auto";
      clonePortal.style.maxHeight = "none";
      clonePortal.style.opacity = "1";
    }
    const fix = doc.createElement("style");
    fix.setAttribute("data-share-fix", "1");
    fix.textContent = SHARE_CLONE_CSS;
    (doc.head || doc.documentElement).appendChild(fix);

    // Hard-set opacity on animated nodes (clone animations restart at keyframe 0).
    const forceOpaque = doc.querySelectorAll(
      ".tab-panel, .panel, .tree-art, .float-orn, .brand-mark, .account-modal-sheet, .keypad-sheet"
    );
    forceOpaque.forEach((el) => {
      el.style.setProperty("opacity", "1", "important");
      el.style.setProperty("animation", "none", "important");
      el.style.setProperty("transform", "none", "important");
      el.style.setProperty("filter", "none", "important");
    });

    const hideIds = ["share-page-btn", "app-lock", "keypad-modal", "account-modal", "share-toast"];
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

    const prevOverflow = portal.style.overflow;
    const prevHeight = portal.style.height;
    const prevScrollTop = portal.scrollTop;
    const fullH = Math.max(portal.scrollHeight, portal.clientHeight, 1);
    const fullW = Math.max(portal.scrollWidth, portal.clientWidth, 1);

    portal.scrollTop = 0;
    portal.style.overflow = "visible";
    portal.style.height = `${fullH}px`;
    document.documentElement.classList.add("share-capture");

    try {
      // Let live CSS (.share-capture) paint opaque frames before snapshot.
      await waitFrames(2);
      const canvas = await html2canvas(portal, {
        backgroundColor: "#eef8f1",
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
        onclone: (_doc, _el) => {
          applyShareCloneFixes(_doc);
        },
      });
      return canvas.toDataURL("image/png");
    } finally {
      document.documentElement.classList.remove("share-capture");
      portal.style.overflow = prevOverflow;
      portal.style.height = prevHeight;
      portal.scrollTop = prevScrollTop;
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
