/**
 * Route /api/* through MyTimeTreeLocal when running in Capacitor / local mode.
 * Loaded before app.js. Web server mode (uvicorn) does not include this file.
 */
(function () {
  "use strict";

  if (!window.MyTimeTreeLocal) {
    console.warn("[MyTimeTree] local store missing; bridge idle");
    return;
  }

  window.__MYTIMETREE_LOCAL__ = true;
  document.documentElement.dataset.mode = "local";

  // iOS WKWebView scrolls the document to keep focused inputs visible; after the
  // keyboard dismisses (or lock reloads), scrollY can stay > 0 and clip the topbar.
  // IMPORTANT: never rewrite viewport meta / scrollTo while an input is focusing or
  // the keyboard is open — that steals focus and feels like settings "假死".
  try {
    if (history.scrollRestoration) history.scrollRestoration = "manual";
  } catch {
    /* ignore */
  }

  function isEditableFocused() {
    const ae = document.activeElement;
    if (!ae) return false;
    const tag = ae.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (ae.isContentEditable) return true;
    return false;
  }

  function isKeyboardLikelyOpen() {
    try {
      const vv = window.visualViewport;
      if (!vv) return false;
      // Soft keyboard shrinks / offsets the visual viewport on iOS.
      if (vv.offsetTop > 0) return true;
      if (vv.height > 0 && vv.height < window.innerHeight * 0.78) return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  function resetViewportScroll() {
    if (isEditableFocused() || isKeyboardLikelyOpen()) return;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.documentElement.scrollLeft = 0;
    document.body.scrollTop = 0;
    document.body.scrollLeft = 0;
    const portal = document.getElementById("portal");
    if (portal) portal.scrollLeft = 0;
    for (const el of [document.documentElement, document.body]) {
      el.style.removeProperty("top");
      el.style.removeProperty("left");
      el.style.removeProperty("right");
      el.style.removeProperty("transform");
      el.style.removeProperty("margin");
    }
    // If iOS already auto-zoomed, nudge viewport meta back to scale=1.
    // Skipping this while focused avoids dismissing the keyboard mid-input.
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      const base =
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
      meta.setAttribute("content", base);
    }
  }

  function scheduleViewportReset() {
    if (isEditableFocused() || isKeyboardLikelyOpen()) return;
    resetViewportScroll();
    requestAnimationFrame(resetViewportScroll);
    setTimeout(resetViewportScroll, 50);
    setTimeout(resetViewportScroll, 300);
  }

  let keyboardClosedTimer = 0;
  function onKeyboardLikelyClosed() {
    // iOS fires resize/scroll around focus+keyboard animation *before* activeElement
    // settles on the input. Debounce + re-check so we don't kill the keyboard.
    clearTimeout(keyboardClosedTimer);
    keyboardClosedTimer = setTimeout(() => {
      if (isEditableFocused() || isKeyboardLikelyOpen()) return;
      scheduleViewportReset();
    }, 350);
  }

  // If env(safe-area-inset-top) is 0, use a min height — do not add extra gutter
  // on top of a working inset (that pushed the title too far below the island).
  function applySafeAreaFallback() {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top, 0px)";
    document.documentElement.appendChild(probe);
    const top = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
    if (top < 24) {
      document.documentElement.style.setProperty("--safe-top-min", "47px");
    } else {
      document.documentElement.style.removeProperty("--safe-top-min");
    }
  }
  applySafeAreaFallback();
  document.addEventListener("DOMContentLoaded", () => {
    applySafeAreaFallback();
    scheduleViewportReset();
  });
  window.addEventListener("pageshow", scheduleViewportReset);
  window.addEventListener("resize", () => {
    applySafeAreaFallback();
    onKeyboardLikelyClosed();
  });
  document.addEventListener("focusout", () => {
    onKeyboardLikelyClosed();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onKeyboardLikelyClosed);
    window.visualViewport.addEventListener("scroll", () => {
      // When the visual viewport is offset (keyboard), nudge document back after close.
      if (window.visualViewport.offsetTop === 0) onKeyboardLikelyClosed();
    });
  }
  window.resetMyTimeTreeViewport = scheduleViewportReset;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(input, init) {
    const url =
      typeof input === "string"
        ? input
        : input && typeof input.url === "string"
          ? input.url
          : String(input);

    const isApi =
      url.startsWith("/api/") ||
      url.includes("://localhost") && url.includes("/api/") ||
      url.startsWith("/health");

    if (!isApi) {
      return nativeFetch(input, init);
    }

    try {
      await window.MyTimeTreeLocal.init();
      const result = await window.MyTimeTreeLocal.handle(url, init || {});
      const status = result.status || 200;
      const body = result.body != null ? result.body : {};
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      return new Response(JSON.stringify({ message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };

  console.info("[MyTimeTree] local bridge active", window.MyTimeTreeLocal.version);

  // Hide splash as soon as the bridge is up (don't wait for sql.js / ICloudDb).
  function hideNativeSplash() {
    try {
      const Cap = window.Capacitor;
      const Splash =
        Cap && typeof Cap.registerPlugin === "function"
          ? Cap.registerPlugin("SplashScreen")
          : Cap && Cap.Plugins && Cap.Plugins.SplashScreen;
      if (Splash && typeof Splash.hide === "function") {
        Splash.hide({ fadeOutDuration: 200 }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }
  hideNativeSplash();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hideNativeSplash);
  }
  setTimeout(hideNativeSplash, 400);

  // Capacitor App pause → flush DB (also handled in lock.js); keep a bridge-level backup.
  try {
    const Cap = window.Capacitor;
    const App =
      Cap && typeof Cap.registerPlugin === "function"
        ? Cap.registerPlugin("App")
        : Cap && Cap.Plugins && Cap.Plugins.App;
    if (App && typeof App.addListener === "function") {
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) return;
        if (typeof window.MyTimeTreeLocal.flushPersist === "function") {
          window.MyTimeTreeLocal.flushPersist().catch((err) => {
            console.warn("[bridge] flush on pause failed", err);
          });
        }
      });
    }
  } catch (err) {
    console.warn("[bridge] App lifecycle wire failed", err);
  }
})();
