/* MyTimeTree portal SPA — parent mobile shell */
(() => {
  /** User-facing marketing version (align with iOS MARKETING_VERSION). */
  const APP_VERSION = "1.0.0";

  const STAGE_ZH = {
    seed: "种子",
    sprout: "胚芽",
    break_soil: "破土",
    germinate: "发芽",
    sapling: "树苗",
    young: "小树",
    tall: "高树",
    big: "大树",
    giant: "巨树",
    fruiting: "森林",
  };

  // 与 domain/tree.py _STAGE_TABLE 一致：low ≤ 净资产 < high（分）
  const STAGE_RANGE = {
    seed: [0, 20],
    sprout: [20, 50],
    break_soil: [50, 100],
    germinate: [100, 150],
    sapling: [150, 200],
    young: [200, 250],
    tall: [250, 300],
    big: [300, 400],
    giant: [400, 500],
    fruiting: [500, null],
  };

  // Style-C sticker PNGs — 整表连通域精确抠图，统一缩放（tallest=fruiting scale≈1.4675）
  const ASSET_V = "20260811e";
  const STAGE_ART = {
    seed: `./tree/seed.png?v=${ASSET_V}`,
    sprout: `./tree/sprout.png?v=${ASSET_V}`,
    break_soil: `./tree/break_soil.png?v=${ASSET_V}`,
    germinate: `./tree/germinate.png?v=${ASSET_V}`,
    sapling: `./tree/sapling.png?v=${ASSET_V}`,
    young: `./tree/young.png?v=${ASSET_V}`,
    tall: `./tree/tall.png?v=${ASSET_V}`,
    big: `./tree/big.png?v=${ASSET_V}`,
    giant: `./tree/giant.png?v=${ASSET_V}`,
    fruiting: `./tree/forest.png?v=${ASSET_V}`,
  };

  const ORN_ICON = {
    star: `./ornaments/star.png?v=${ASSET_V}`,
    sun: `./ornaments/sun.png?v=${ASSET_V}`,
    fruit: `./ornaments/fruit.png?v=${ASSET_V}`,
    pest: `./ornaments/pest.png?v=${ASSET_V}`,
    bird: `./ornaments/bird.png?v=${ASSET_V}`,
  };

  const HABIT_MEDIA_V = "20261018b";
  // Tip: bright star (icon-tip-seed path overwritten; icon-tip-star alias also shipped)
  const HABIT_TIP_ICON = `./habit/icon-tip-star.png?v=${HABIT_MEDIA_V}`;
  const HABIT_TIP_ICON_2X = `./habit/icon-tip-star@2x.png?v=${HABIT_MEDIA_V}`;
  const HABIT_CELEB_MARK = `./habit/mark-celeb-small.png?v=${HABIT_MEDIA_V}`;
  const HABIT_CELEB_MARK_2X = `./habit/mark-celeb-small@2x.png?v=${HABIT_MEDIA_V}`;

  /**
   * Canonical file stems = content image_key (img-ca-*, img-bm-*).
   * Only map deprecated KEYS names → new stems for leftover och_* rows.
   */
  const HABIT_IMAGE_ALIASES = {
    "img-high-five": "img-ca-high-five",
    "img-pillow-bump": "img-ca-pillow-bump",
    "img-shoulder-bump": "img-ca-shoulder-bump",
    "img-spin-clap": "img-ca-spin-clap",
    "img-fridge-sticker": "img-ca-fridge-star",
    "img-hug": "img-ca-hug-3s",
    "img-dance": "img-ca-victory-dance",
    "img-nod-smile": "img-ca-nod-smile",
    "img-thumbs-up": "img-ca-thumbs-up",
    "img-fist-bump": "img-ca-fist-bump",
    "img-soft-clap": "img-ca-silent-clap",
    "img-ear-whisper": "img-ca-whisper-ok-v2",
    "img-ca-whisper-ok": "img-ca-whisper-ok-v2",
    "img-ca-toe-wiggle": "img-ca-toe-bike-v2",
    "img-heart-hands": "img-ca-quiet-heart",
    "img-blanket-tuck": "img-ca-blanket-squeeze",
    "img-cheek-pat": "img-ca-cheek-soft",
    "img-stretch-smile": "img-ca-seated-stretch",
    "img-book-bookmark": "img-ca-desk-tap",
    "img-drawing-show": "img-ca-pencil-twirl",
    "img-seed-sprout": "img-ca-nature-point",
    ...Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => {
        const n = String(i + 1).padStart(2, "0");
        return [`mark-celeb-board-${n}`, `img-bm-${n}`];
      })
    ),
  };

  function resolveHabitImageKey(imageKey) {
    const safe = String(imageKey || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safe) return "";
    return HABIT_IMAGE_ALIASES[safe] || safe;
  }

  function habitHintArtSrc(imageKey, density) {
    const safe = resolveHabitImageKey(imageKey);
    if (!safe) return "";
    const suffix = density === 2 ? "@2x" : "";
    return `./habit/${safe}${suffix}.png?v=${HABIT_MEDIA_V}`;
  }

  function bindHabitHintArt(img, imageKey) {
    if (!img) return;
    const png = habitHintArtSrc(imageKey);
    if (!png) {
      img.hidden = true;
      img.removeAttribute("src");
      img.removeAttribute("srcset");
      return;
    }
    img.hidden = false;
    img.onerror = () => {
      img.hidden = true;
      img.removeAttribute("src");
      img.removeAttribute("srcset");
    };
    img.src = png;
    img.srcset = `${habitHintArtSrc(imageKey, 2)} 2x`;
  }

  // 有树冠：可挂果；young 起虫/鸟移到树身中部
  const CANOPY_STAGES = new Set([
    "sapling",
    "young",
    "tall",
    "big",
    "giant",
    "fruiting",
  ]);
  const MATURE_TREE_STAGES = new Set([
    "young",
    "tall",
    "big",
    "giant",
    "fruiting",
  ]);

  const ORN_SLOTS = {
    sun: [
      { left: "20%", top: "16%" },
      { left: "30%", top: "10%" },
      { left: "40%", top: "8%" },
      { left: "50%", top: "7%" },
      { left: "60%", top: "8%" },
      { left: "70%", top: "11%" },
      { left: "80%", top: "16%" },
      { left: "22%", top: "26%" },
      { left: "78%", top: "26%" },
      { left: "50%", top: "12%" },
    ],
    star: [
      { left: "26%", top: "22%" },
      { left: "36%", top: "17%" },
      { left: "46%", top: "20%" },
      { left: "56%", top: "17%" },
      { left: "66%", top: "22%" },
      { left: "32%", top: "28%" },
      { left: "44%", top: "26%" },
      { left: "56%", top: "26%" },
      { left: "68%", top: "28%" },
      { left: "50%", top: "32%" },
    ],
    fruit: [
      { left: "28%", top: "38%" },
      { left: "40%", top: "36%" },
      { left: "52%", top: "40%" },
      { left: "64%", top: "36%" },
      { left: "76%", top: "40%" },
      { left: "34%", top: "46%" },
      { left: "46%", top: "44%" },
      { left: "58%", top: "46%" },
      { left: "70%", top: "48%" },
      { left: "50%", top: "50%" },
    ],
  };

  // 种子~树苗：虫/鸟与星/太阳同一悬挂带并排
  const ORN_SLOTS_HANG = {
    pest: [{ left: "68%", top: "12%" }],
    bird: [{ left: "76%", top: "16%" }],
  };

  // 小树阶段起：虫/鸟下移到树身中部偏下（贴近树冠）
  const ORN_SLOTS_MID = {
    pest: [{ left: "42%", top: "60%" }],
    bird: [{ left: "58%", top: "62%" }],
  };

  /** 星：从 1 起每 +10 挂 1 颗，最多 10；为 0 不挂。 */
  function starDisplayCount(n) {
    const v = Number(n) || 0;
    if (v < 1) return 0;
    return Math.min(10, Math.floor((v - 1) / 10) + 1);
  }

  /** 果：与星相同 — 从 1 起每 +10 挂 1 个，最多 10。 */
  function fruitDisplayCount(n) {
    return starDisplayCount(n);
  }

  /** 虫/鸟：每 +10 数值放大 5%，最多 +100%（2×）。 */
  function growScale(count) {
    const v = Number(count) || 0;
    if (v < 1) return 1;
    return 1 + Math.min(1, Math.floor(v / 10) * 0.05);
  }

  function ornamentSlots(kind, stage) {
    if (kind === "pest" || kind === "bird") {
      const map = MATURE_TREE_STAGES.has(stage) ? ORN_SLOTS_MID : ORN_SLOTS_HANG;
      return map[kind] || [];
    }
    return ORN_SLOTS[kind] || [];
  }

  function ornamentShouldHang(kind, stage) {
    if (kind === "star" || kind === "sun" || kind === "fruit") return true;
    if (kind === "pest" || kind === "bird") {
      return !MATURE_TREE_STAGES.has(stage);
    }
    return false;
  }

  function formatStageRange(stage) {
    const range = STAGE_RANGE[stage] || STAGE_RANGE.seed;
    const [low, high] = range;
    if (high == null) return `≥${low} 分`;
    return `${low}–${high - 1} 分`;
  }

  function updateStageNet(stage, netMinutes) {
    const net = Math.floor(Number(netMinutes) || 0);
    const el = $("#stage-net");
    if (!el) return;
    el.innerHTML =
      `净资产 <strong>${net}</strong> 分` +
      `<span aria-hidden="true"> · </span>` +
      `本阶段 ${formatStageRange(stage)}`;
  }

  const state = {
    currentAccountId: null,
    accounts: [],
    dirtySettings: false,
    ledger: {
      offset: 0,
      total: 0,
      loading: false,
    },
    defaults: {
      spend: 20,
      borrow: 20,
      deposit: 20,
    },
    keypad: {
      open: false,
      title: "",
      value: "20",
      fresh: true,
      resolve: null,
    },
  };

  const $ = (sel) => document.querySelector(sel);

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.message || data.detail || res.statusText;
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return data;
  }

  async function bootstrap() {
    const boot = await api("/api/portal/bootstrap");
    state.accounts = boot.accounts || [];
    state.currentAccountId = boot.current_account_id;
    if (boot.needs_onboarding) {
      $("#onboarding").hidden = false;
      $("#main").hidden = true;
      $("#account-shell").hidden = true;
      return;
    }
    // Locked session: lock.js owns the overlay; don't fetch home yet (was throwing and
    // Cap console showed "bootstrap failed {}").
    if (boot.auth && boot.auth.locked) {
      $("#onboarding").hidden = true;
      $("#main").hidden = true;
      $("#account-shell").hidden = true;
      return;
    }
    $("#onboarding").hidden = true;
    $("#main").hidden = false;
    $("#account-shell").hidden = false;
    fillAccountSelect();
    await refreshHome();
  }

  // Soft re-entry after unlock (avoid location.reload → re-download wasm / re-open DB).
  window.__mytimetreeBootstrap = bootstrap;

  function fillAccountSelect() {
    const sel = $("#account-select");
    sel.innerHTML = "";
    for (const a of state.accounts) {
      const opt = document.createElement("option");
      opt.value = String(a.id);
      opt.textContent = a.name;
      if (a.id === state.currentAccountId) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  async function openAccount(payload) {
    const acc = await api("/api/accounts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.currentAccountId = acc.id;
    await bootstrap();
  }

  async function refreshHome() {
    const home = await api("/api/portal/home");
    state.currentAccountId = home.account.id;
    $("#asset-min").textContent = String(home.balance.asset);
    $("#liab-min").textContent = String(home.balance.liability);
    $("#cum-interest-min").textContent = String(home.balance.cumulative_interest ?? 0);
    $("#today-interest-min").textContent = String(home.balance.today_interest ?? 0);
    const stage = home.tree.stage;
    const treeEl = $("#tree-stage");
    treeEl.dataset.stage = stage;
    const art = $("#tree-art");
    const src = STAGE_ART[stage] || STAGE_ART.seed;
    if (art.getAttribute("src") !== src) {
      art.style.animation = "none";
      art.setAttribute("src", src);
      void art.offsetWidth;
      art.style.animation = "";
    }
    $("#stage-label").textContent = STAGE_ZH[stage] || stage;
    updateStageNet(stage, home.balance.net);
    const o = home.tree.ornaments || {};
    updateOrnamentCounters(o);
    renderTreeOrnaments(o, stage);
    await refreshDefaults();
    await refreshHabitsStrip();
  }

  async function refreshDefaults() {
    if (!state.currentAccountId) return;
    try {
      const st = await api(`/api/settings?account_id=${state.currentAccountId}`);
      const spend = Math.max(1, Math.floor(Number(st.default_spend_minutes) || 20));
      const deposit = Math.max(1, Math.floor(Number(st.default_repay_minutes) || 20));
      state.defaults.spend = spend;
      state.defaults.borrow = spend; // 借用暂与默认支出同设置
      state.defaults.deposit = deposit;
    } catch (_) {
      /* keep cached defaults */
    }
  }

  function updateOrnamentCounters(o) {
    $("#orn-star").textContent = String(o.fruit_count || 0);
    $("#orn-sun").textContent = String(o.golden_fruit_count || 0);
    $("#orn-fruit").textContent = String(
      o.interest_fruit_count ?? o.monthly_fruit_count ?? 0
    );
    $("#orn-pest").textContent = String(o.pest_count || 0);
    $("#orn-bird").textContent = String(o.woodpecker_count || 0);
  }

  function renderTreeOrnaments(o, stage) {
    const layer = $("#tree-ornament-layer");
    layer.innerHTML = "";

    const hasCanopy = CANOPY_STAGES.has(stage);

    const plan = [
      { kind: "sun", count: Math.min(10, o.golden_fruit_count || 0) },
      { kind: "star", count: starDisplayCount(o.fruit_count) },
      {
        kind: "fruit",
        count: hasCanopy
          ? fruitDisplayCount(o.interest_fruit_count ?? o.monthly_fruit_count)
          : 0,
      },
      {
        kind: "pest",
        count: Math.min(1, o.pest_count || 0),
        scale: growScale(o.pest_count),
      },
      {
        kind: "bird",
        count: Math.min(1, o.woodpecker_count || 0),
        scale: growScale(o.woodpecker_count),
      },
    ];
    let delay = 0;
    for (const { kind, count, scale } of plan) {
      const slots = ornamentSlots(kind, stage);
      for (let i = 0; i < count && i < slots.length; i++) {
        const el = document.createElement("div");
        const hang = ornamentShouldHang(kind, stage);
        el.className = `float-orn kind-${kind}${hang ? " hang" : ""}`;
        el.style.left = slots[i].left;
        el.style.top = slots[i].top;
        el.style.animationDelay = `${delay}s`;
        delay += 0.12;
        const img = document.createElement("img");
        img.src = ORN_ICON[kind];
        img.alt = "";
        if (scale && scale !== 1) {
          img.style.transform = `scale(${scale})`;
          img.style.transformOrigin = "center center";
        }
        el.appendChild(img);
        layer.appendChild(el);
      }
    }
  }

  const LEDGER_PAGE = 100;

  function appendLedgerItems(items) {
    const list = $("#ledger-list");
    for (const it of items) {
      const li = document.createElement("li");
      li.className = "ledger-row";
      const textCol = document.createElement("div");
      textCol.className = "ledger-text";
      const summary = document.createElement("div");
      summary.className = "ledger-summary";
      summary.textContent = it.summary || it.category || "";
      const time = document.createElement("div");
      time.className = "ledger-time muted";
      time.textContent = (it.created_at || "").slice(0, 16).replace("T", " ");
      textCol.append(summary, time);
      const amt = document.createElement("div");
      amt.className = "ledger-amt amt";
      amt.style.color = it.display?.color || "inherit";
      const sign = it.signed_asset_effect !== 0
        ? (it.signed_asset_effect > 0 ? "+" : "") + it.signed_asset_effect
        : (it.signed_liability_effect > 0 ? "负+" : "负") + Math.abs(it.signed_liability_effect);
      amt.textContent = `${sign} 分`;
      li.append(textCol, amt);
      list.appendChild(li);
    }
  }

  function syncLedgerChrome() {
    const shown = $("#ledger-list").children.length;
    const meta = $("#ledger-meta");
    const more = $("#ledger-more");
    const total = state.ledger.total;
    if (total <= 0) {
      meta.hidden = true;
      more.hidden = true;
      return;
    }
    meta.hidden = false;
    meta.textContent = `已显示 ${shown} / 共 ${total} 笔（按时间从新到旧）`;
    more.hidden = shown >= total;
  }

  async function refreshLedger({ append = false } = {}) {
    if (!state.currentAccountId) return;
    if (state.ledger.loading) return;
    state.ledger.loading = true;
    const moreBtn = $("#ledger-more");
    if (moreBtn) moreBtn.disabled = true;
    try {
      if (!append) {
        state.ledger.offset = 0;
        $("#ledger-list").innerHTML = "";
      }
      const page = await api(
        `/api/ledger?account_id=${state.currentAccountId}` +
          `&limit=${LEDGER_PAGE}&offset=${state.ledger.offset}`
      );
      state.ledger.total = page.total || 0;
      appendLedgerItems(page.items || []);
      state.ledger.offset += (page.items || []).length;
      $("#ledger-empty").hidden = state.ledger.total > 0;
      syncLedgerChrome();
    } finally {
      state.ledger.loading = false;
      if (moreBtn) moreBtn.disabled = false;
    }
  }

  function formatDailyRate(rate) {
    const n = Number(rate);
    if (!Number.isFinite(n)) return "—";
    const pct = n * 100;
    const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, "");
    return `${text}% / 天`;
  }

  async function refreshSettings() {
    if (!state.currentAccountId) return;
    const st = await api(`/api/settings?account_id=${state.currentAccountId}`);
    const form = $("#settings-form");
    form.daily_grant_minutes.value = st.daily_grant_minutes;
    form.default_spend_minutes.value = st.default_spend_minutes;
    form.default_repay_minutes.value = st.default_repay_minutes;
    $("#rule-asset-rate").textContent = formatDailyRate(st.asset_interest_rate);
    $("#rule-liability-rate").textContent = formatDailyRate(st.liability_interest_rate);
    state.defaults.spend = Math.max(1, Math.floor(Number(st.default_spend_minutes) || 20));
    state.defaults.borrow = state.defaults.spend;
    state.defaults.deposit = Math.max(1, Math.floor(Number(st.default_repay_minutes) || 20));
    state.dirtySettings = false;
  }

  async function refreshAnalytics() {
    if (!state.currentAccountId) return;
    const weekEl = $("#analytics-week");
    const monthEl = $("#analytics-month");
    if (weekEl) weekEl.textContent = "加载中…";
    if (monthEl) monthEl.textContent = "加载中…";
    // Let the tab paint before heavy local catch-up / chart work
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    try {
      const w = await api(`/api/analytics/weekly?account_id=${state.currentAccountId}`);
      const m = await api(`/api/analytics/monthly?account_id=${state.currentAccountId}`);
      if (weekEl) {
        weekEl.textContent =
          `区间 ${w.period_start} ~ ${w.period_end}\n` +
          `流水 ${w.entry_count} 笔\n进账 ${w.asset_in_minutes} / 支出 ${w.asset_out_minutes}\n` +
          `利息 ${w.interest_minutes}\n期末资产 ${w.ending_asset} · 负债 ${w.ending_liability} · 净值 ${w.ending_net}`;
      }
      if (monthEl) {
        monthEl.textContent =
          `区间 ${m.period_start} ~ ${m.period_end}\n` +
          `流水 ${m.entry_count} 笔\n进账 ${m.asset_in_minutes} / 支出 ${m.asset_out_minutes}\n` +
          `利息 ${m.interest_minutes}\n期末资产 ${m.ending_asset} · 负债 ${m.ending_liability} · 净值 ${m.ending_net}`;
      }
      renderTrendChart($("#chart-week"), w.series || []);
      renderTrendChart($("#chart-month"), m.series || []);
      await refreshHabitReview();
    } catch (err) {
      console.error("refreshAnalytics failed", err);
      const msg = `分析加载失败：${err && err.message ? err.message : err}`;
      if (weekEl) weekEl.textContent = msg;
      if (monthEl) monthEl.textContent = msg;
    }
  }

  function capPlugin(name) {
    try {
      const Cap = window.Capacitor;
      if (!Cap) return null;
      if (typeof Cap.registerPlugin === "function") {
        return Cap.registerPlugin(name);
      }
      return (Cap.Plugins && Cap.Plugins[name]) || null;
    } catch {
      return null;
    }
  }

  function isNativeApp() {
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

  /**
   * iOS SpringBoard icon badge — same count as tab「主屏」/「还剩 X」.
   * Prefer local AppIconBadge (UNUserNotificationCenter + setBadgeCount + alert/badge/sound
   * permission so the system dialog actually appears). Fall back to Capawesome Badge.
   */
  let appIconBadgeDenied = false;
  let appIconBadgeAsked = false;

  function resolveAppIconBadgePlugin() {
    const primary = capPlugin("AppIconBadge");
    if (primary && typeof primary.set === "function") {
      return { name: "AppIconBadge", plugin: primary };
    }
    const fallback = capPlugin("Badge");
    if (fallback && typeof fallback.set === "function") {
      return { name: "Badge", plugin: fallback };
    }
    return null;
  }

  async function ensureAppIconBadgePermission(forceAsk) {
    if (!isNativeApp()) return { ok: false, reason: "not-native" };
    if (appIconBadgeDenied && !forceAsk) {
      return { ok: false, reason: "denied-cached" };
    }
    const resolved = resolveAppIconBadgePlugin();
    if (!resolved) {
      console.warn(
        "[badge] no AppIconBadge/Badge plugin — Xcode Clean Build after cap sync; check MainViewController register"
      );
      try {
        const keys =
          window.Capacitor && window.Capacitor.Plugins
            ? Object.keys(window.Capacitor.Plugins)
            : [];
        console.warn("[badge] Capacitor.Plugins", keys);
      } catch {
        /* ignore */
      }
      return { ok: false, reason: "missing-plugin" };
    }
    const { name, plugin } = resolved;
    try {
      let status =
        typeof plugin.checkPermissions === "function"
          ? await plugin.checkPermissions()
          : { display: "prompt" };
      console.info("[badge] check", name, status);
      const display = status && status.display;
      if (display === "denied") {
        appIconBadgeDenied = true;
        return { ok: false, reason: "denied", status };
      }
      if (display !== "granted" || forceAsk) {
        if (typeof plugin.requestPermissions === "function") {
          appIconBadgeAsked = true;
          status = await plugin.requestPermissions();
          console.info("[badge] request", name, status);
        }
      }
      const granted =
        status &&
        (status.display === "granted" || status.granted === true);
      if (!granted && status && status.display === "denied") {
        appIconBadgeDenied = true;
        return { ok: false, reason: "denied", status };
      }
      // Even if still "prompt", let set() try (native set path re-asks).
      appIconBadgeDenied = false;
      return { ok: true, reason: granted ? "granted" : "try-set", status, name };
    } catch (e) {
      console.warn("[badge] permission", name, e);
      // Do NOT permanently cache false — Cap may not be ready on first tick.
      return { ok: false, reason: "error", error: String((e && e.message) || e) };
    }
  }

  async function syncAppIconBadge(n) {
    const count = Math.max(0, Math.floor(Number(n) || 0));
    if (!isNativeApp()) {
      console.info("[badge] skip web count=", count);
      return;
    }
    const resolved = resolveAppIconBadgePlugin();
    if (!resolved) return;
    const { name, plugin } = resolved;
    try {
      // Ask when there is something to show, or once after unlock even for clear.
      const forceAsk = count > 0 && !appIconBadgeAsked;
      const perm = await ensureAppIconBadgePermission(forceAsk);
      console.info("[badge] sync", { count, name, perm });
      if (perm.reason === "denied" || perm.reason === "denied-cached") {
        return;
      }
      if (count === 0 && typeof plugin.clear === "function") {
        await plugin.clear();
      } else {
        await plugin.set({ count });
      }
      console.info("[badge] set ok", name, count);
    } catch (e) {
      console.warn("[badge] set failed", name, e);
    }
  }

  function setHomeHabitBadge(n) {
    const count = Math.max(0, Math.floor(Number(n) || 0));
    const badge = $("#habit-home-badge");
    if (badge) {
      if (count > 0) {
        badge.hidden = false;
        badge.textContent = String(count);
      } else {
        badge.hidden = true;
        badge.textContent = "";
      }
    }
    // Defer native badge/permission off the first paint — avoids racing WKWebView
    // boot + system permission sheet (can look like a black screen on device).
    setTimeout(() => {
      syncAppIconBadge(count);
    }, 400);
  }

  async function refreshHabitsStrip() {
    const strip = $("#habit-today-strip");
    const rail = $("#habit-chip-rail");
    if (!strip || !rail || !state.currentAccountId) return;
    try {
      const data = await api("/api/portal/habits/today");
      setHomeHabitBadge(data.badge_count || 0);
      // Keep settings sort order (API already returns first 9)
      const show = data.items || [];
      const pending = show.filter((i) => !i.done).length;
      strip.hidden = false;
      // Status: red-dot +「还剩 X」when pending;「总共 N」only (no 完成/总数 slash).
      const remainEl = $("#habit-strip-remain");
      const totalEl = $("#habit-strip-total");
      if (remainEl) {
        if (pending > 0) {
          remainEl.textContent = `还剩 ${pending}`;
          remainEl.classList.add("has-pending");
        } else {
          remainEl.textContent = "今日已记完";
          remainEl.classList.remove("has-pending");
        }
      }
      if (totalEl) {
        totalEl.textContent = `总共 ${show.length}`;
      }
      rail.innerHTML = "";
      for (const it of show) {
        const row = document.createElement("div");
        row.className = "habit-row" + (it.done ? " done" : "");
        row.setAttribute("role", "listitem");
        row.style.setProperty("--habit-color", it.color || "#2f9e6b");

        const head = document.createElement("div");
        head.className = "habit-row-head";
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "habit-chip" + (it.done ? " done" : "");
        chip.textContent = it.done ? `✓ ${it.title}` : `记 · ${it.title}`;
        if (!it.done) {
          chip.addEventListener("click", () => completeHabitFromHome(it.habit_id));
        } else {
          chip.disabled = true;
        }
        const tip = document.createElement("button");
        tip.type = "button";
        tip.className = "habit-tip-btn";
        tip.setAttribute("aria-label", `展开 ${it.title} 的微习惯、毛伊习惯与话术`);
        tip.setAttribute("aria-expanded", "false");
        tip.innerHTML = `<img class="habit-tip-icon" src="${HABIT_TIP_ICON}" srcset="${HABIT_TIP_ICON_2X} 2x" width="20" height="20" alt="">`;
        const panel = document.createElement("div");
        panel.className = "habit-tip-panel";
        panel.hidden = true;
        const micro = (it.micro_steps || []).map((s) => s.step_text).filter(Boolean);
        const maui = it.maui_habit?.maui_text || "";
        const script = it.parent_script?.script_text || "";
        // Tip expand: 微习惯 · 毛伊习惯 · 家长话术（无「激励」行）
        panel.innerHTML =
          `<div class="habit-tip-layer"><strong>微习惯 <span class="habit-tip-note">（可被接受的最小行为）</span></strong><p>${
            micro.length ? micro.join(" · ") : "可在设置里添加微步骤"
          }</p></div>` +
          `<div class="habit-tip-layer"><strong>毛伊习惯 <span class="habit-tip-note">（可以先做毛伊习惯再正式开始）</span></strong><p>${
            maui || "洗完一件小事就做下一步"
          }</p></div>` +
          `<div class="habit-tip-layer"><strong>家长话术</strong><p>${
            script || "记下来了——孩子被看见。"
          }</p></div>`;
        tip.addEventListener("click", (e) => {
          e.stopPropagation();
          const open = panel.hidden;
          if (open) {
            rail.querySelectorAll(".habit-tip-panel").forEach((p) => {
              p.hidden = true;
            });
            rail.querySelectorAll(".habit-tip-btn").forEach((b) => {
              b.setAttribute("aria-expanded", "false");
            });
          }
          panel.hidden = !open;
          tip.setAttribute("aria-expanded", open ? "true" : "false");
        });
        head.append(chip, tip);
        row.append(head, panel);
        rail.appendChild(row);
      }
      if (!show.length) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "在设置里启用好习惯吧";
        rail.appendChild(empty);
      }
    } catch (err) {
      console.warn("habits strip", err);
      strip.hidden = true;
      setHomeHabitBadge(0);
    }
  }

  /** Queue: board milestones (level ASC) then one small — dismiss advances. */
  const celebrationQueue = [];
  let celebrationBusy = false;

  function hideAllCelebrationModals() {
    const mask = $("#habit-board-mask");
    const overlay = $("#habit-celeb-overlay");
    if (mask) mask.hidden = true;
    if (overlay) overlay.hidden = true;
  }

  function showBoardCelebrationItem(celeb, minutesCredited) {
    const mask = $("#habit-board-mask");
    if (!mask) return false;
    $("#habit-board-mask-title").textContent =
      celeb.title || "大庆祝！习惯里程碑";
    $("#habit-board-mask-body").textContent =
      celeb.body ||
      (minutesCredited
        ? `本记已存入 ${minutesCredited} 分 · 坚持很棒`
        : "坚持很棒");
    const levelEl = $("#habit-board-mask-level");
    if (levelEl) {
      levelEl.textContent = celeb.level ? `里程碑 L${celeb.level}` : "";
      levelEl.hidden = !celeb.level;
    }
    bindHabitHintArt($("#habit-board-art"), celeb.image_key);
    mask.hidden = false;
    return true;
  }

  function showSmallCelebrationItem(item) {
    const overlay = $("#habit-celeb-overlay");
    if (!overlay) return false;
    const line =
      item.small_celebration ||
      item.incentive_text ||
      "做到了！";
    const mark = $("#habit-celeb-mark");
    if (mark) {
      mark.hidden = false;
      mark.src = HABIT_CELEB_MARK;
      mark.srcset = `${HABIT_CELEB_MARK_2X} 2x`;
    }
    $("#habit-celeb-title").textContent = "小庆祝一下吧";
    const minutes = item.minutes_credited;
    $("#habit-celeb-credit").textContent = minutes
      ? `已自动入账 ${minutes} 分`
      : "";
    const incEl = $("#habit-celeb-incentive");
    if (incEl) incEl.textContent = line;
    const hint = item.offline_hint;
    const hintEl = $("#habit-celeb-hint");
    const hintArt = $("#habit-hint-art");
    const artKey = (hint && hint.image_key) || item.image_key || "";
    if (hint && hint.title) {
      hintEl.hidden = false;
      $("#habit-hint-title").textContent = hint.title;
      $("#habit-hint-body").textContent = hint.body || "";
      bindHabitHintArt(hintArt, artKey);
    } else if (artKey) {
      hintEl.hidden = false;
      $("#habit-hint-title").textContent = "线下小庆祝";
      $("#habit-hint-body").textContent = "";
      bindHabitHintArt(hintArt, artKey);
    } else {
      hintEl.hidden = true;
      if (hintArt) {
        hintArt.hidden = true;
        hintArt.removeAttribute("src");
      }
    }
    overlay.hidden = false;
    return true;
  }

  function pumpCelebrationQueue() {
    if (celebrationBusy) return;
    const next = celebrationQueue.shift();
    if (!next) {
      console.info("[celeb] queue empty");
      return;
    }
    celebrationBusy = true;
    hideAllCelebrationModals();
    const kind = next.kind || "small";
    console.info("[celeb] show", kind, next.milestone_id || next.log_id || "", "left=", celebrationQueue.length);
    let ok = false;
    if (kind === "board") {
      ok = showBoardCelebrationItem(next, next.minutes_credited);
    } else {
      ok = showSmallCelebrationItem(next);
    }
    if (!ok) {
      celebrationBusy = false;
      pumpCelebrationQueue();
    }
  }

  function dismissCelebrationAndAdvance() {
    hideAllCelebrationModals();
    celebrationBusy = false;
    pumpCelebrationQueue();
  }

  function buildCelebrationQueueFromResponse(res) {
    if (Array.isArray(res.celebrations) && res.celebrations.length) {
      return res.celebrations.map((c) => ({
        ...c,
        minutes_credited:
          c.minutes_credited != null ? c.minutes_credited : res.minutes_credited,
      }));
    }
    // Legacy: single celebration field swallowed small when board won.
    const items = [];
    if (res.celebration && res.celebration.kind === "board") {
      items.push({
        ...res.celebration,
        minutes_credited: res.minutes_credited,
      });
    }
    items.push({
      kind: "small",
      minutes_credited: res.minutes_credited,
      incentive_text: res.incentive_text,
      small_celebration: res.small_celebration,
      image_key: res.image_key,
      offline_hint: res.offline_hint,
      parent_script: res.parent_script,
    });
    return items;
  }

  function showHabitCelebration(res) {
    const items = buildCelebrationQueueFromResponse(res);
    for (const item of items) celebrationQueue.push(item);
    console.info(
      "[celeb] enqueue",
      items.map((i) => i.kind + (i.level != null ? ` L${i.level}` : "")).join(" → "),
      "q=",
      celebrationQueue.length
    );
    pumpCelebrationQueue();
  }

  function renderHabitMilestones(list) {
    const root = $("#habit-milestones");
    if (!root) return;
    root.innerHTML = "";
    const items = list || [];
    if (!items.length) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    const title = document.createElement("p");
    title.className = "habit-milestones-title";
    title.textContent = "里程碑达成奖章";
    const grid = document.createElement("div");
    grid.className = "habit-milestones-grid";
    grid.setAttribute("role", "list");
    for (const ms of items) {
      const cell = document.createElement("div");
      cell.className =
        "habit-milestone-cell" + (ms.achieved ? " achieved" : "");
      cell.setAttribute("role", "listitem");
      cell.title = ms.title || "";
      const art = document.createElement("img");
      art.className = "habit-milestone-art";
      art.alt = "";
      art.width = 40;
      art.height = 40;
      bindHabitHintArt(art, ms.image_key);
      if (art.hidden) {
        art.remove();
        const stub = document.createElement("span");
        stub.className = "habit-milestone-stub";
        stub.textContent = String(ms.level || "");
        cell.appendChild(stub);
      } else {
        cell.appendChild(art);
      }
      const lab = document.createElement("span");
      lab.className = "habit-milestone-label";
      lab.textContent = ms.achieved ? `✓${ms.level}` : String(ms.level || "");
      cell.appendChild(lab);
      grid.appendChild(cell);
    }
    root.append(title, grid);
  }

  async function completeHabitFromHome(habitId) {
    try {
      const res = await api("/api/portal/habits/complete", {
        method: "POST",
        body: JSON.stringify({ habit_id: habitId }),
      });
      showHabitCelebration(res);
      await refreshHome();
    } catch (ex) {
      flash($("#home-msg"), ex.message);
    }
  }

  /** Resolve seed list even when portaled to document.body. */
  function habitSeedPickerList(picker) {
    if (!picker) return null;
    if (picker._habitSeedList instanceof HTMLElement) return picker._habitSeedList;
    const id = picker.dataset.seedPickerId;
    if (id) {
      const portaled = document.querySelector(
        `.habit-seed-picker-list[data-seed-picker-id="${id}"]`
      );
      if (portaled) return portaled;
    }
    return picker.querySelector(".habit-seed-picker-list");
  }

  function closeHabitSeedPicker(picker) {
    if (!picker) return;
    const list = habitSeedPickerList(picker);
    const btn = picker.querySelector(".habit-seed-picker-btn");
    if (list) {
      list.hidden = true;
      list.style.display = "";
    }
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  /** Custom wide seed picker — native iOS <select> menus wrap long titles. */
  function ensureHabitSeedPicker(sel) {
    if (!sel) return null;
    let picker = sel.closest(".habit-seed-picker");
    if (picker) return picker;
    // Migrate older sibling layout (select then picker).
    const sibling = sel.nextElementSibling;
    if (sibling && sibling.classList.contains("habit-seed-picker")) {
      sibling.insertBefore(sel, sibling.firstChild);
      return sibling;
    }

    sel.classList.add("habit-seed-select-native");
    sel.setAttribute("aria-hidden", "true");
    sel.tabIndex = -1;

    picker = document.createElement("div");
    picker.className = "habit-seed-picker";
    const pickerId = `seed-picker-${Math.random().toString(36).slice(2, 9)}`;
    picker.dataset.seedPickerId = pickerId;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "habit-seed-picker-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    const list = document.createElement("ul");
    list.className = "habit-seed-picker-list";
    list.setAttribute("role", "listbox");
    list.dataset.seedPickerId = pickerId;
    list.hidden = true;
    picker._habitSeedList = list;

    const placeList = () => {
      // Portal to <body>: .tab-panel backdrop-filter creates a fixed containing
      // block + overflow:auto clips the menu — looks like "won't open" on iOS.
      if (list.parentNode !== document.body) {
        document.body.appendChild(list);
      }
      const rect = btn.getBoundingClientRect();
      const gutter = 12;
      // Nearly full phone width (≤26rem) so「专注作业二十五分钟（10分）」fits one line.
      const width = Math.min(window.innerWidth - gutter * 2, 26 * 16);
      let left = rect.left + rect.width / 2 - width / 2;
      left = Math.max(gutter, Math.min(left, window.innerWidth - gutter - width));
      const spaceBelow = window.innerHeight - rect.bottom - gutter;
      const preferBelow = spaceBelow >= 120 || spaceBelow >= rect.top - gutter;
      list.style.position = "fixed";
      list.style.left = `${Math.round(left)}px`;
      list.style.width = `${Math.round(width)}px`;
      list.style.maxWidth = `${Math.round(width)}px`;
      list.style.transform = "none";
      list.style.zIndex = "400";
      list.style.display = "grid";
      if (preferBelow) {
        list.style.top = `${Math.round(rect.bottom + 6)}px`;
      } else {
        // Tentative top; correct after layout using real list height.
        list.style.top = `${Math.round(gutter)}px`;
        requestAnimationFrame(() => {
          const h = list.offsetHeight || 200;
          list.style.top = `${Math.round(Math.max(gutter, rect.top - h - 6))}px`;
        });
      }
    };
    const setOpen = (open) => {
      if (open) {
        list.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        placeList();
        console.info("[seed-picker] open", {
          opts: sel.options.length,
          top: list.style.top,
          width: list.style.width,
          portaled: list.parentNode === document.body,
        });
      } else {
        closeHabitSeedPicker(picker);
      }
    };
    btn.addEventListener("pointerdown", (ev) => {
      // Capture-phase doc closer runs first; mark this gesture as "inside".
      ev.stopPropagation();
    });
    btn.addEventListener("click", (ev) => {
      // preventDefault: stop any leftover label/select activation from closing us.
      ev.preventDefault();
      ev.stopPropagation();
      if (btn.disabled) return;
      setOpen(!!list.hidden);
    });
    window.addEventListener(
      "resize",
      () => {
        if (!list.hidden) placeList();
      },
      { passive: true }
    );
    window.addEventListener(
      "scroll",
      () => {
        if (!list.hidden) placeList();
      },
      { passive: true, capture: true }
    );
    if (!document.documentElement.dataset.habitSeedPickerDoc) {
      document.documentElement.dataset.habitSeedPickerDoc = "1";
      // pointerdown capture: close on outside tap without racing the open click
      // (label→hidden select synthetic clicks used to close the list instantly).
      // List may live on document.body (portaled) — check list.contains too.
      document.addEventListener(
        "pointerdown",
        (ev) => {
          const t = ev.target;
          if (!(t instanceof Node)) return;
          document.querySelectorAll(".habit-seed-picker").forEach((p) => {
            const ul = habitSeedPickerList(p);
            if (p.contains(t)) return;
            if (ul && ul.contains(t)) return;
            if (t.id === "habit-template-select") return;
            if (ul && !ul.hidden) closeHabitSeedPicker(p);
          });
        },
        true
      );
    }

    // Keep select inside picker so label-less field still owns the control.
    const host = sel.parentNode;
    host.insertBefore(picker, sel);
    picker.append(sel, btn, list);
    return picker;
  }

  function syncHabitSeedPicker(sel) {
    const picker = ensureHabitSeedPicker(sel);
    if (!picker) return;
    const btn = picker.querySelector(".habit-seed-picker-btn");
    const list = habitSeedPickerList(picker);
    if (!btn || !list) return;
    list.innerHTML = "";
    closeHabitSeedPicker(picker);
    const opts = [...sel.options];
    if (!opts.length) {
      btn.textContent = "暂无可用种子";
      btn.disabled = true;
      return;
    }
    btn.disabled = false;
    if (!opts.some((o) => o.value === sel.value)) {
      sel.selectedIndex = 0;
    }
    const selected =
      opts.find((o) => o.value === sel.value) || opts[0];
    btn.textContent = selected.textContent;
    for (const opt of opts) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "option");
      b.textContent = opt.textContent;
      b.setAttribute(
        "aria-selected",
        opt.value === sel.value ? "true" : "false"
      );
      b.addEventListener("pointerdown", (ev) => {
        // Keep portaled list from being treated as outside on the same gesture.
        ev.stopPropagation();
      });
      b.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        sel.value = opt.value;
        btn.textContent = opt.textContent;
        closeHabitSeedPicker(picker);
        list.querySelectorAll("button").forEach((x) => {
          x.setAttribute(
            "aria-selected",
            x === b ? "true" : "false"
          );
        });
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      });
      li.appendChild(b);
      list.appendChild(li);
    }
  }

  async function refreshHabitSettings() {
    const list = $("#habit-settings-list");
    const sel = $("#habit-template-select");
    if (!list || !state.currentAccountId) return;
    try {
      const data = await api("/api/portal/habits/list");
      const habits = (data.habits || []).filter((h) => !h.archived);
      list.innerHTML = "";
      habits.forEach((h, idx) => {
        const onStrip = h.on_home_strip === true || (h.on_home_strip == null && idx < 9);
        const swatchColor = h.color || (onStrip ? h.color_featured : h.color_muted) || "#7a9e8c";
        const row = document.createElement("li");
        row.className =
          "habit-settings-row" + (onStrip ? " on-home-strip" : " off-home-strip");
        row.dataset.habitId = String(h.id);

        // Swipe actions (hidden until left-swipe): 微步骤 / 改奖励 / 移除
        const swipe = document.createElement("div");
        swipe.className = "habit-swipe-actions";
        swipe.setAttribute("aria-hidden", "true");

        const microBtn = document.createElement("button");
        microBtn.type = "button";
        microBtn.className = "habit-swipe-action habit-swipe-micro";
        microBtn.textContent = "微步骤";
        microBtn.setAttribute("aria-label", `编辑 ${h.title} 的微步骤`);
        microBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          closeAllHabitSwipes(list);
          await editMicroStepsForHabit(h);
        });

        const rewardBtn = document.createElement("button");
        rewardBtn.type = "button";
        rewardBtn.className = "habit-swipe-action habit-swipe-reward";
        rewardBtn.textContent = "改奖励";
        rewardBtn.setAttribute("aria-label", `修改 ${h.title} 的兑换分钟奖励`);
        rewardBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          closeAllHabitSwipes(list);
          const raw = window.prompt(
            `${h.title} 每次兑换奖励几分钟？`,
            String(h.minutes_per_completion)
          );
          if (raw == null) return;
          const n = Math.floor(Number(raw));
          if (!Number.isFinite(n) || n <= 0) return;
          await api("/api/portal/habits/rules", {
            method: "PATCH",
            body: JSON.stringify({ rule_id: h.rule_id, minutes_per_completion: n }),
          });
          await refreshHabitSettings();
        });

        const del = document.createElement("button");
        del.type = "button";
        del.className = "habit-swipe-action habit-swipe-delete";
        del.textContent = "移除";
        del.setAttribute("aria-label", `移除 ${h.title}`);
        del.addEventListener("click", async (e) => {
          e.stopPropagation();
          await api("/api/portal/habits/archive", {
            method: "POST",
            body: JSON.stringify({ habit_id: h.id }),
          });
          await refreshHabitSettings();
          await refreshHabitsStrip();
        });
        swipe.append(microBtn, rewardBtn, del);

        const front = document.createElement("div");
        front.className = "habit-settings-front";
        front.draggable = true;
        front.style.setProperty("--habit-color", swatchColor);

        const handle = document.createElement("span");
        handle.className = "habit-drag-handle";
        handle.textContent = "⋮⋮";
        handle.title = "拖拽排序";
        const swatch = document.createElement("span");
        swatch.className =
          "habit-settings-swatch" + (onStrip ? " featured" : " muted");
        swatch.style.background = swatchColor;
        swatch.title = onStrip ? "主屏展示色" : "清单第 10 条及以后（略降饱和）";
        swatch.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.className = "habit-settings-label";
        label.textContent = `${h.title} · ${h.minutes_per_completion} 分`;
        front.append(handle, swatch, label);
        row.append(swipe, front);
        list.appendChild(row);
      });
      wireHabitDragReorder(list);
      wireHabitSwipeDelete(list);
      if (sel) {
        const enabledSlugs = new Set(
          (data.habits || [])
            .filter((h) => !h.archived && h.template_id != null)
            .map((h) => h.template_id)
        );
        sel.innerHTML = "";
        for (const t of data.templates || []) {
          if (enabledSlugs.has(t.id)) continue;
          const opt = document.createElement("option");
          opt.value = String(t.id);
          opt.textContent = `${t.title}（${t.default_minutes}分）`;
          sel.appendChild(opt);
        }
        syncHabitSeedPicker(sel);
      }
    } catch (err) {
      console.warn("habit settings", err);
    }
  }

  function closeAllHabitSwipes(list, except) {
    const root = list || document;
    root.querySelectorAll(".habit-settings-row.open").forEach((row) => {
      if (except && row === except) return;
      row.classList.remove("open");
      const front = row.querySelector(".habit-settings-front");
      if (front) front.style.transform = "";
      const panel = row.querySelector(".habit-swipe-actions");
      if (panel) panel.setAttribute("aria-hidden", "true");
    });
  }

  function habitSwipeRevealWidth(row) {
    const panel = row && row.querySelector(".habit-swipe-actions");
    const w = panel ? panel.offsetWidth : 0;
    return w > 0 ? w : 216;
  }

  function wireHabitSwipeDelete(list) {
    if (!list || list.dataset.swipeWired === "1") return;
    list.dataset.swipeWired = "1";
    let swipe = null;

    list.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
        if (
          e.target.closest(
            ".habit-drag-handle, .habit-swipe-actions, .habit-swipe-action, button"
          )
        ) {
          return;
        }
        const row = e.target.closest(".habit-settings-row");
        const front = row && row.querySelector(".habit-settings-front");
        if (!row || !front) return;
        const reveal = habitSwipeRevealWidth(row);
        swipe = {
          row,
          front,
          reveal,
          x0: e.touches[0].clientX,
          y0: e.touches[0].clientY,
          opened: row.classList.contains("open"),
          axis: null,
        };
      },
      { passive: true }
    );

    list.addEventListener(
      "touchmove",
      (e) => {
        if (!swipe || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - swipe.x0;
        const dy = e.touches[0].clientY - swipe.y0;
        if (!swipe.axis) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          swipe.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y";
          if (swipe.axis === "y") {
            swipe = null;
            return;
          }
          closeAllHabitSwipes(list, swipe.row);
        }
        if (swipe.axis !== "x") return;
        e.preventDefault();
        const REVEAL = swipe.reveal || habitSwipeRevealWidth(swipe.row);
        let x = swipe.opened ? -REVEAL + dx : dx;
        if (x > 0) x = 0;
        if (x < -REVEAL) x = -REVEAL;
        swipe.front.style.transform = `translateX(${x}px)`;
        swipe.front.style.transition = "none";
      },
      { passive: false }
    );

    function endSwipe() {
      if (!swipe) return;
      const { row, front } = swipe;
      const REVEAL = swipe.reveal || habitSwipeRevealWidth(row);
      front.style.transition = "";
      const m = /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(front.style.transform || "");
      const x = m ? Number(m[1]) : 0;
      if (x <= -REVEAL * 0.35) {
        row.classList.add("open");
        front.style.transform = `translateX(${-REVEAL}px)`;
        const panel = row.querySelector(".habit-swipe-actions");
        if (panel) panel.setAttribute("aria-hidden", "false");
      } else {
        row.classList.remove("open");
        front.style.transform = "";
        const panel = row.querySelector(".habit-swipe-actions");
        if (panel) panel.setAttribute("aria-hidden", "true");
      }
      swipe = null;
    }

    list.addEventListener("touchend", endSwipe, { passive: true });
    list.addEventListener("touchcancel", endSwipe, { passive: true });
  }

  function wireHabitDragReorder(list) {
    if (!list || list.dataset.dragWired === "1") return;
    list.dataset.dragWired = "1";
    let dragEl = null;
    let touchDrag = null;

    async function persistOrder() {
      const ids = [...list.querySelectorAll("li.habit-settings-row")].map((li) =>
        Number(li.dataset.habitId)
      );
      try {
        await api("/api/portal/habits/reorder", {
          method: "POST",
          body: JSON.stringify({ ordered_ids: ids }),
        });
        await refreshHabitsStrip();
      } catch (err) {
        console.warn("habit reorder", err);
        await refreshHabitSettings();
      }
    }

    function placeBefore(clientY) {
      if (!dragEl) return;
      const items = [...list.querySelectorAll("li.habit-settings-row")].filter(
        (li) => li !== dragEl
      );
      let target = null;
      let before = false;
      for (const li of items) {
        const rect = li.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          target = li;
          before = true;
          break;
        }
        target = li;
        before = false;
      }
      if (!target) return;
      list.insertBefore(dragEl, before ? target : target.nextSibling);
    }

    list.addEventListener("dragstart", (e) => {
      const row = e.target.closest("li.habit-settings-row");
      if (!row || e.target.closest("button, .habit-swipe-actions, .habit-swipe-action")) {
        e.preventDefault();
        return;
      }
      closeAllHabitSwipes(list);
      dragEl = row;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", row.dataset.habitId || "");
      } catch {
        /* ignore */
      }
    });
    list.addEventListener("dragend", async () => {
      if (dragEl) dragEl.classList.remove("dragging");
      dragEl = null;
      await persistOrder();
    });
    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      placeBefore(e.clientY);
    });

    // iOS WKWebView: HTML5 DnD is unreliable — touch reorder from ⋮⋮ handle
    list.addEventListener(
      "touchstart",
      (e) => {
        const handle = e.target.closest(".habit-drag-handle");
        if (!handle || e.touches.length !== 1) return;
        const row = handle.closest("li.habit-settings-row");
        if (!row) return;
        closeAllHabitSwipes(list);
        touchDrag = { li: row, startY: e.touches[0].clientY };
        dragEl = row;
        row.classList.add("touch-dragging");
      },
      { passive: true }
    );
    list.addEventListener(
      "touchmove",
      (e) => {
        if (!touchDrag || e.touches.length !== 1) return;
        e.preventDefault();
        placeBefore(e.touches[0].clientY);
      },
      { passive: false }
    );
    list.addEventListener(
      "touchend",
      async () => {
        if (!touchDrag) return;
        touchDrag.li.classList.remove("touch-dragging");
        touchDrag = null;
        dragEl = null;
        await persistOrder();
      },
      { passive: true }
    );
    list.addEventListener(
      "touchcancel",
      () => {
        if (!touchDrag) return;
        touchDrag.li.classList.remove("touch-dragging");
        touchDrag = null;
        dragEl = null;
      },
      { passive: true }
    );
  }

  let microEditHabit = null;

  function closeMicroModal() {
    const modal = $("#habit-micro-modal");
    if (modal) modal.hidden = true;
    microEditHabit = null;
  }

  async function editMicroStepsForHabit(h) {
    const modal = $("#habit-micro-modal");
    const title = $("#habit-micro-title");
    const ta = $("#habit-micro-text");
    if (!modal || !ta) {
      flash($("#habit-settings-msg"), "微步骤编辑不可用");
      return;
    }
    try {
      const data = await api(
        `/api/portal/habits/micro-steps?habit_id=${h.id}`
      );
      microEditHabit = { id: h.id, title: h.title, steps: data.steps || [] };
      if (title) title.textContent = `${h.title} · 微步骤`;
      ta.value = (data.steps || []).map((s) => s.step_text).join("\n");
      modal.hidden = false;
      ta.focus();
    } catch (err) {
      flash($("#habit-settings-msg"), err.message || String(err));
    }
  }

  async function saveMicroStepsFromModal() {
    if (!microEditHabit) return;
    const ta = $("#habit-micro-text");
    const next = String(ta?.value || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    try {
      for (const s of microEditHabit.steps || []) {
        await api("/api/portal/habits/micro-steps/archive", {
          method: "POST",
          body: JSON.stringify({ step_id: s.id }),
        });
      }
      for (const text of next) {
        await api("/api/portal/habits/micro-steps", {
          method: "POST",
          body: JSON.stringify({ habit_id: microEditHabit.id, step_text: text }),
        });
      }
      closeMicroModal();
      flash($("#habit-settings-msg"), "微步骤已更新");
      await refreshHabitsStrip();
    } catch (err) {
      flash($("#habit-settings-msg"), err.message || String(err));
    }
  }

  async function refreshHabitReview() {
    try {
      const data = await api("/api/portal/habits/overview");
      // Design notes (legend_intro / month_summary) stay in content tables only — never UI lede
      const copyEl = $("#habit-board-copy");
      if (copyEl) {
        copyEl.textContent = "";
        copyEl.hidden = true;
      }
      renderHabitHeatmap(data.month_heatmap || data);
      renderHabitMilestones(data.milestones || []);
      const stats = $("#habit-board-stats");
      if (stats) {
        const monthLogs =
          data.board?.stats?.month_logs ?? data.board?.stats?.total_logs ?? 0;
        stats.textContent = `本周 ${data.board?.stats?.week_logs || 0} 记 · 月记 ${monthLogs} 条 · 已兑 ${data.board?.stats?.minutes_redeemed || 0} 分`;
      }
      const tl = $("#habit-timeline-list");
      if (tl) {
        tl.innerHTML = "";
        for (const it of data.timeline || []) {
          const li = document.createElement("li");
          li.textContent = `${it.title} · ${it.day_key} · ${it.minutes} 分`;
          tl.appendChild(li);
        }
        if (!(data.timeline || []).length) {
          const li = document.createElement("li");
          li.className = "muted";
          li.textContent = "还没有好习惯记录";
          tl.appendChild(li);
        }
      }
      const cats = $("#habit-category-list");
      if (cats) {
        cats.innerHTML = "";
        for (const c of data.categories || []) {
          const li = document.createElement("li");
          li.textContent = `${c.label} · ${c.count} 次 · ${c.minutes} 分`;
          cats.appendChild(li);
        }
      }
    } catch (err) {
      console.warn("habit review", err);
    }
  }

  function renderHabitHeatmap(heat) {
    const root = $("#habit-month-heatmap");
    const legend = $("#habit-heatmap-legend");
    if (!root || !legend) return;
    root.innerHTML = "";
    legend.innerHTML = "";
    const weeks = heat.weeks || [];
    if (!weeks.length) {
      root.innerHTML = `<p class="muted">暂无点阵</p>`;
      return;
    }
    const monthTitle = document.createElement("p");
    monthTitle.className = "habit-heatmap-month";
    monthTitle.textContent =
      heat.month_label ||
      (heat.year && heat.month ? `${heat.year}年${heat.month}月` : "本月");
    root.appendChild(monthTitle);
    // Monday-first weekday labels (matches monthHeatmap pad)
    const weekdayRow = document.createElement("div");
    weekdayRow.className = "habit-heatmap-weekdays";
    weekdayRow.setAttribute("aria-hidden", "true");
    for (const label of ["一", "二", "三", "四", "五", "六", "日"]) {
      const w = document.createElement("span");
      w.className = "habit-heatmap-weekday";
      w.textContent = label;
      weekdayRow.appendChild(w);
    }
    root.appendChild(weekdayRow);

    for (const week of weeks) {
      const row = document.createElement("div");
      row.className = "habit-heatmap-week";
      for (const cell of week) {
        const day = document.createElement("div");
        day.className = "habit-heatmap-day" + (cell.day_key ? "" : " empty");
        if (cell.day_key) {
          day.title = cell.day_key;
          const dayNum = String(cell.day_key).split("-")[2];
          const dateEl = document.createElement("span");
          dateEl.className = "habit-heatmap-date";
          dateEl.textContent = String(Number(dayNum) || dayNum || "");
          const dots = document.createElement("div");
          dots.className = "habit-heatmap-dots";
          // Cap at 9 (3×3) to match home strip capacity
          const shown = (cell.habits || []).slice(0, 9);
          for (const h of shown) {
            const d = document.createElement("span");
            d.className = "habit-heatmap-dot";
            d.style.background = h.color || "#4ec98a";
            dots.appendChild(d);
          }
          day.append(dateEl, dots);
        }
        row.appendChild(day);
      }
      root.appendChild(row);
    }
    for (const g of heat.legend || []) {
      const li = document.createElement("li");
      const legendColor =
        g.on_home_strip === false
          ? g.color
          : g.color_featured || g.color || "#4ec98a";
      // Legend: featured for strip habits; muted color already on g.color for rank 10+
      li.innerHTML = `<span class="habit-legend-swatch${
        g.on_home_strip === false ? " muted" : ""
      }" style="background:${g.color || legendColor}"></span>${g.title}`;
      legend.appendChild(li);
    }
  }

  function renderTrendChart(el, series) {
    if (!el) return;
    if (!series.length) {
      el.innerHTML = `<p class="muted chart-empty">暂无趋势数据</p>`;
      return;
    }
    const W = 320;
    const H = 168;
    const pad = { t: 14, r: 40, b: 28, l: 36 };
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;
    // 左轴：资产 / 负债（本金量级，折线）
    const lines = [
      { k: "asset", label: "资产", color: "#2f9e6b" },
      { k: "liability", label: "负债", color: "#e67e22" },
    ];
    // 右轴：每日利息（小额，柱状）
    const bars = [{ k: "interest_net", label: "利息", color: "#5c6bc0" }];

    // App calendar day (Shanghai) — dates after today are forecasts
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const isForecast = (p) => String(p.date) > todayStr;
    let lastActualIdx = -1;
    for (let i = 0; i < series.length; i++) {
      if (!isForecast(series[i])) lastActualIdx = i;
    }

    function rangeOf(keys, { includeZero = false } = {}) {
      let minV = includeZero ? 0 : Infinity;
      let maxV = includeZero ? 0 : -Infinity;
      for (const p of series) {
        for (const { k } of keys) {
          const v = Number(p[k]) || 0;
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
      }
      if (!Number.isFinite(minV) || !Number.isFinite(maxV)) {
        minV = 0;
        maxV = 1;
      }
      if (minV === maxV) {
        if (minV === 0) maxV = 1;
        else if (minV > 0) minV = 0;
        else maxV = 0;
      }
      // pad range slightly so tallest bar doesn't touch the top edge
      if (maxV > 0) maxV = Math.ceil(maxV * 1.15) || maxV + 1;
      if (minV < 0) minV = -Math.ceil(Math.abs(minV) * 1.15) || minV - 1;
      return { minV, maxV };
    }

    const left = rangeOf(lines);
    const right = rangeOf(bars, { includeZero: true });
    const leftSpan = left.maxV - left.minV || 1;
    const rightSpan = right.maxV - right.minV || 1;
    // Point scale for lines; column centers for bars
    const xAt = (i) =>
      pad.l + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
    const colW = innerW / series.length;
    const xBar = (i) => pad.l + colW * (i + 0.5);
    const yLeft = (v) => pad.t + innerH - ((v - left.minV) / leftSpan) * innerH;
    const yRight = (v) => pad.t + innerH - ((v - right.minV) / rightSpan) * innerH;
    const yRightZero = yRight(0);

    const barW = Math.max(4, Math.min(16, colW * 0.62));

    function pathSegment(k, fromIdx, toIdx) {
      if (fromIdx < 0 || toIdx < fromIdx || fromIdx >= series.length) return "";
      const parts = [];
      for (let i = fromIdx; i <= toIdx; i++) {
        const x = xAt(i).toFixed(1);
        const y = yLeft(Number(series[i][k]) || 0).toFixed(1);
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) continue;
        parts.push(`${parts.length === 0 ? "M" : "L"}${x},${y}`);
      }
      return parts.join(" ");
    }

    const linePaths = lines
      .map(({ k, color }) => {
        const chunks = [];
        // Solid: through today (inclusive)
        if (lastActualIdx >= 0) {
          const d = pathSegment(k, 0, lastActualIdx);
          if (d) {
            chunks.push(
              `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`
            );
          }
        }
        // Dashed forecast: from today (or first point) through future — connects at the hinge
        const forecastFrom = lastActualIdx >= 0 ? lastActualIdx : 0;
        const needsForecast =
          lastActualIdx < 0 ||
          (forecastFrom < series.length - 1 && isForecast(series[series.length - 1]));
        if (needsForecast) {
          const d = pathSegment(k, lastActualIdx < 0 ? 0 : forecastFrom, series.length - 1);
          if (d) {
            chunks.push(
              `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 4" />`
            );
          }
        }
        return chunks.join("");
      })
      .join("");

    const barRects = bars
      .map(({ k, color }) =>
        series
          .map((p, i) => {
            const v = Number(p[k]) || 0;
            if (v === 0) return "";
            const yVal = yRight(v);
            const rawH = Math.abs(yVal - yRightZero);
            const h = Math.max(innerH * 0.12, rawH);
            const y = v > 0 ? yRightZero - h : yRightZero;
            const x = xBar(i) - barW / 2;
            if (![x, y, h, barW].every(Number.isFinite)) return "";
            const forecast = isForecast(p);
            if (forecast) {
              // Hollow dashed outline via path (WKWebView can choke on dashed rounded rects)
              const x2 = x + barW;
              const y2 = y + h;
              const d = `M${x.toFixed(1)},${y.toFixed(1)} H${x2.toFixed(1)} V${y2.toFixed(1)} H${x.toFixed(1)} Z`;
              return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="3 2" />`;
            }
            const corner = Math.min(2, h / 2);
            return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" rx="${corner.toFixed(1)}" />`;
          })
          .join("")
      )
      .join("");

    const zeroLine =
      right.minV < 0 && right.maxV > 0
        ? `<line x1="${pad.l}" y1="${yRightZero.toFixed(1)}" x2="${pad.l + innerW}" y2="${yRightZero.toFixed(1)}" stroke="#c5cae9" stroke-dasharray="3 3" />`
        : "";

    const labelStep = Math.max(1, Math.ceil(series.length / 4));
    const xLabels = series
      .map((p, i) => {
        if (i % labelStep !== 0 && i !== series.length - 1) return "";
        const day = String(p.date).slice(5);
        return `<text x="${xAt(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="chart-axis">${day}</text>`;
      })
      .join("");

    const hasForecast = series.some(isForecast);
    const legend =
      lines
        .map(
          ({ label, color }) =>
            `<span class="chart-legend-item"><i class="chart-swatch-line" style="background:${color}"></i>${label}</span>`
        )
        .join("") +
      bars
        .map(
          ({ label, color }) =>
            `<span class="chart-legend-item"><i class="chart-swatch-bar" style="background:${color}"></i>${label}(右)</span>`
        )
        .join("") +
      (hasForecast
        ? `<span class="chart-legend-item chart-legend-forecast"><i class="chart-swatch-forecast"></i>预测</span>`
        : "");

    const rx = W - 4;
    el.innerHTML =
      `<div class="chart-legend">${legend}</div>` +
      `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" aria-hidden="true">` +
      `<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + innerH}" stroke="#c9ddd3" />` +
      `<line x1="${W - pad.r}" y1="${pad.t}" x2="${W - pad.r}" y2="${pad.t + innerH}" stroke="#c5cae9" />` +
      `<line x1="${pad.l}" y1="${pad.t + innerH}" x2="${pad.l + innerW}" y2="${pad.t + innerH}" stroke="#c9ddd3" />` +
      zeroLine +
      `<text x="4" y="${pad.t + 4}" class="chart-axis">${left.maxV}</text>` +
      `<text x="4" y="${pad.t + innerH}" class="chart-axis">${left.minV}</text>` +
      `<text x="${rx}" y="${pad.t + 4}" text-anchor="end" class="chart-axis chart-axis-right">${right.maxV}</text>` +
      `<text x="${rx}" y="${pad.t + innerH}" text-anchor="end" class="chart-axis chart-axis-right">${right.minV}</text>` +
      barRects +
      linePaths +
      xLabels +
      `</svg>`;
  }

  function showTab(name) {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      const on = p.id === `tab-${name}`;
      p.hidden = !on;
      p.classList.toggle("active", on);
    });
    if (name === "ledger") refreshLedger();
    if (name === "settings") {
      refreshSettings();
      refreshHabitSettings();
    }
    if (name === "analytics") refreshAnalytics();
    if (name === "home") refreshHome();
  }

  function flash(el, text) {
    el.hidden = false;
    el.textContent = text;
    setTimeout(() => { el.hidden = true; }, 2200);
  }

  function syncKeypadDisplay() {
    $("#keypad-display").textContent = state.keypad.value || "0";
  }

  function closeKeypad(result) {
    const modal = $("#keypad-modal");
    modal.hidden = true;
    state.keypad.open = false;
    const resolve = state.keypad.resolve;
    state.keypad.resolve = null;
    if (typeof window.resetMyTimeTreeViewport === "function") {
      window.resetMyTimeTreeViewport();
    }
    if (resolve) resolve(result);
  }

  function openKeypad({ title, hint, defaultMinutes }) {
    const def = Math.max(1, Math.floor(Number(defaultMinutes) || 20));
    state.keypad.open = true;
    state.keypad.title = title;
    state.keypad.value = String(def);
    state.keypad.fresh = true;
    $("#keypad-title").textContent = title;
    $("#keypad-hint").textContent = hint || `默认 ${def} 分，可直接点「输入」或改数后再输入`;
    syncKeypadDisplay();
    $("#keypad-modal").hidden = false;
    return new Promise((resolve) => {
      state.keypad.resolve = resolve;
    });
  }

  function keypadPress(key) {
    const k = state.keypad;
    if (key === "clear") {
      k.value = "0";
      k.fresh = true;
      syncKeypadDisplay();
      return;
    }
    if (key === "back") {
      if (k.fresh) {
        k.value = "0";
      } else if (k.value.length <= 1) {
        k.value = "0";
        k.fresh = true;
      } else {
        k.value = k.value.slice(0, -1);
      }
      syncKeypadDisplay();
      return;
    }
    if (!/^\d$/.test(key)) return;
    if (k.fresh || k.value === "0") {
      k.value = key;
      k.fresh = false;
    } else if (k.value.length < 6) {
      k.value += key;
    }
    syncKeypadDisplay();
  }

  function submitKeypad() {
    const n = Math.floor(Number(state.keypad.value));
    if (!Number.isFinite(n) || n <= 0) {
      flash($("#home-msg"), "请输入正数分钟");
      return;
    }
    closeKeypad(n);
  }

  $("#keypad-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-key]");
    if (!btn) return;
    keypadPress(btn.dataset.key);
  });
  $("#keypad-submit").addEventListener("click", submitKeypad);
  $("#keypad-modal").addEventListener("click", (e) => {
    if (e.target.closest("[data-keypad-dismiss]")) closeKeypad(null);
  });
  window.addEventListener("keydown", (e) => {
    if (!state.keypad.open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeKeypad(null);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      submitKeypad();
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      keypadPress("back");
      return;
    }
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      keypadPress(e.key);
    }
  });

  async function promptMinutes(kind) {
    await refreshDefaults();
    const map = {
      spend: {
        title: "支出多少分钟？",
        hint: `默认支出 ${state.defaults.spend} 分（设置）`,
        defaultMinutes: state.defaults.spend,
      },
      borrow: {
        title: "借用多少分钟？",
        hint: `默认借用 ${state.defaults.borrow} 分（同默认支出设置）`,
        defaultMinutes: state.defaults.borrow,
      },
      deposit: {
        title: "存入多少分钟？",
        hint: `默认存入 ${state.defaults.deposit} 分（设置）`,
        defaultMinutes: state.defaults.deposit,
      },
    };
    const cfg = map[kind] || map.spend;
    return openKeypad(cfg);
  }

  $("#onboarding-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const err = $("#onboarding-error");
    err.hidden = true;
    try {
      await openAccount({
        name: String(fd.get("name") || "").trim(),
        password: String(fd.get("password") || ""),
        asset_interest_rate: Number(fd.get("asset_interest_rate") || 0),
        recovery_question: String(fd.get("recovery_question") || "").trim(),
        recovery_answer: String(fd.get("recovery_answer") || ""),
      });
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
    }
  });

  $("#account-select").addEventListener("change", async (e) => {
    const id = Number(e.target.value);
    await api("/api/accounts/switch", {
      method: "POST",
      body: JSON.stringify({ account_id: id }),
    });
    state.currentAccountId = id;
    const active = document.querySelector(".tab.active")?.dataset.tab || "home";
    showTab(active);
  });

  let pendingDeleteId = null;

  function showAccountPanel(which) {
    const list = $("#account-panel-list");
    const add = $("#account-panel-add");
    const del = $("#account-panel-delete");
    list.hidden = which !== "list";
    add.hidden = which !== "add";
    del.hidden = which !== "delete";
    const title = $("#account-modal-title");
    if (which === "add") title.textContent = "添加孩子";
    else if (which === "delete") title.textContent = "删除孩子";
    else title.textContent = "管理孩子账户";
    $("#account-manage-error").hidden = true;
  }

  function openAccountModal() {
    $("#account-modal").hidden = false;
    pendingDeleteId = null;
    showAccountPanel("list");
    renderManageList();
    if (typeof window.resetMyTimeTreeViewport === "function") {
      window.resetMyTimeTreeViewport();
    }
  }

  function closeAccountModal() {
    $("#account-modal").hidden = true;
    pendingDeleteId = null;
    if (typeof window.resetMyTimeTreeViewport === "function") {
      window.resetMyTimeTreeViewport();
    }
  }

  function showAddForm() {
    const form = $("#account-add-form");
    form.reset();
    form.querySelector('[name="asset_interest_rate"]').value = "0.01";
    pendingDeleteId = null;
    showAccountPanel("add");
  }

  function showDeleteForm(id, name) {
    pendingDeleteId = id;
    const form = $("#account-delete-form");
    form.reset();
    $("#account-delete-target").textContent =
      `将删除「${name}」的全部数据，需输入家长密码确认`;
    showAccountPanel("delete");
  }

  function renderManageList() {
    const list = $("#account-manage-list");
    list.innerHTML = "";
    for (const a of state.accounts) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.className = "name";
      label.textContent = a.name;
      if (a.id === state.currentAccountId) {
        const tag = document.createElement("span");
        tag.className = "current-tag";
        tag.textContent = "当前";
        label.appendChild(tag);
      }
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn";
      del.textContent = "删除";
      del.dataset.deleteId = String(a.id);
      del.dataset.deleteName = a.name;
      li.appendChild(label);
      li.appendChild(del);
      list.appendChild(li);
    }
  }

  $("#account-manage-btn").addEventListener("click", () => openAccountModal());
  $("#account-modal").addEventListener("click", (e) => {
    if (e.target.closest("[data-account-dismiss]")) closeAccountModal();
  });
  $("#account-show-add").addEventListener("click", showAddForm);
  $("#account-add-cancel").addEventListener("click", () => showAccountPanel("list"));
  $("#account-delete-cancel").addEventListener("click", () => {
    pendingDeleteId = null;
    showAccountPanel("list");
  });

  $("#account-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const err = $("#account-manage-error");
    err.hidden = true;
    try {
      await openAccount({
        name: String(fd.get("name") || "").trim(),
        asset_interest_rate: Number(fd.get("asset_interest_rate") || 0),
      });
      closeAccountModal();
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
    }
  });

  $("#account-manage-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-delete-id]");
    if (!btn) return;
    showDeleteForm(Number(btn.dataset.deleteId), btn.dataset.deleteName);
  });

  $("#account-delete-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!pendingDeleteId) return;
    const fd = new FormData(e.target);
    const err = $("#account-manage-error");
    err.hidden = true;
    try {
      const result = await api("/api/accounts/delete", {
        method: "POST",
        body: JSON.stringify({
          account_id: pendingDeleteId,
          password: String(fd.get("password") || ""),
        }),
      });
      if (!result.remaining || result.remaining.length === 0) {
        closeAccountModal();
        await bootstrap();
        return;
      }
      state.accounts = result.remaining;
      state.currentAccountId = result.current_account_id;
      fillAccountSelect();
      closeAccountModal();
      const active = document.querySelector(".tab.active")?.dataset.tab || "home";
      showTab(active);
      await refreshHome();
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
    }
  });

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  (function wireTabSwipe() {
    const main = $("#main");
    if (!main || main.dataset.swipeReady) return;
    main.dataset.swipeReady = "1";
    const order = ["home", "ledger", "settings", "analytics"];
    let startX = 0;
    let startY = 0;
    let tracking = false;

    function isBlockedTarget(el) {
      return Boolean(
        el &&
          el.closest(
            "input, textarea, select, button, a, label, .question-picker, .habit-seed-picker, .keypad-modal, .account-modal, .sync-actions, .habit-drag-handle, .habit-settings-row, .habit-settings-front, .habit-overlay, .habit-board-mask"
          )
      );
    }

    function canSwipe() {
      if (!main || main.hidden) return false;
      const keypad = $("#keypad-modal");
      if (keypad && !keypad.hidden) return false;
      const account = $("#account-modal");
      if (account && !account.hidden) return false;
      const lock = $("#app-lock");
      if (lock && !lock.hidden) return false;
      const micro = $("#habit-micro-modal");
      if (micro && !micro.hidden) return false;
      const celeb = $("#habit-celeb-overlay");
      if (celeb && !celeb.hidden) return false;
      const board = $("#habit-board-mask");
      if (board && !board.hidden) return false;
      return true;
    }

    main.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1 || !canSwipe() || isBlockedTarget(e.target)) {
          tracking = false;
          return;
        }
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        tracking = true;
      },
      { passive: true }
    );

    main.addEventListener(
      "touchend",
      (e) => {
        if (!tracking) return;
        tracking = false;
        if (!canSwipe()) return;
        const t = e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        // Horizontal swipe: enough distance and clearly more horizontal than vertical
        if (absX < 56 || absX < absY * 1.25) return;
        const cur = document.querySelector(".tab.active")?.dataset.tab || "home";
        const idx = order.indexOf(cur);
        if (idx < 0) return;
        if (dx < 0 && idx < order.length - 1) showTab(order[idx + 1]);
        else if (dx > 0 && idx > 0) showTab(order[idx - 1]);
      },
      { passive: true }
    );

    main.addEventListener(
      "touchcancel",
      () => {
        tracking = false;
      },
      { passive: true }
    );
  })();

  $("#ledger-more").addEventListener("click", () => {
    refreshLedger({ append: true });
  });

  $("#btn-spend").addEventListener("click", async () => {
    const minutes = await promptMinutes("spend");
    if (minutes == null) return;
    try {
      await api("/api/portal/spend", {
        method: "POST",
        body: JSON.stringify({ minutes, summary: "支出" }),
      });
      flash($("#home-msg"), "已记账支出");
      await refreshHome();
    } catch (ex) {
      flash($("#home-msg"), ex.message);
    }
  });

  $("#btn-borrow").addEventListener("click", async () => {
    const minutes = await promptMinutes("borrow");
    if (minutes == null) return;
    try {
      await api("/api/portal/borrow", {
        method: "POST",
        body: JSON.stringify({ minutes, summary: "借用" }),
      });
      flash($("#home-msg"), "已借用（记借+入+支）");
      await refreshHome();
    } catch (ex) {
      flash($("#home-msg"), ex.message);
    }
  });

  $("#btn-deposit").addEventListener("click", async () => {
    const minutes = await promptMinutes("deposit");
    if (minutes == null) return;
    try {
      await api("/api/portal/repay", {
        method: "POST",
        body: JSON.stringify({ minutes, summary: "存入" }),
      });
      flash($("#home-msg"), "已存入");
      await refreshHome();
    } catch (ex) {
      flash($("#home-msg"), ex.message);
    }
  });

  $("#settings-form").addEventListener("input", () => {
    state.dirtySettings = true;
  });

  $("#settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          account_id: state.currentAccountId,
          daily_grant_minutes: Number(fd.get("daily_grant_minutes")),
          default_spend_minutes: Number(fd.get("default_spend_minutes")),
          default_repay_minutes: Number(fd.get("default_repay_minutes")),
        }),
      });
      state.dirtySettings = false;
      await refreshDefaults();
      flash($("#settings-msg"), "设置已保存");
    } catch (ex) {
      flash($("#settings-msg"), ex.message);
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (!state.dirtySettings) return;
    e.preventDefault();
    e.returnValue = "";
  });

  const homeVersion = $("#app-version");
  if (homeVersion) homeVersion.textContent = `v${APP_VERSION}`;

  // Build probe (Safari Console): confirms Capacitor loaded post-sync bundle
  try {
    const buildMeta = document.querySelector('meta[name="mytimetree-web-build"]');
    const webBuild = buildMeta?.getAttribute("content") || "(no meta)";
    console.info(
      `[MyTimeTree] web-build=${webBuild} habit-swipe=${typeof document.querySelector === "function"}`
    );
  } catch {
    /* ignore */
  }

  document.querySelectorAll("[data-habit-dismiss]").forEach((el) => {
    el.addEventListener("click", () => {
      dismissCelebrationAndAdvance();
    });
  });
  $("#habit-board-mask-ok")?.addEventListener("click", () => {
    dismissCelebrationAndAdvance();
  });
  document.querySelectorAll("[data-micro-dismiss]").forEach((el) => {
    el.addEventListener("click", () => closeMicroModal());
  });
  $("#habit-micro-save")?.addEventListener("click", () => {
    saveMicroStepsFromModal();
  });

  $("#btn-habit-enable")?.addEventListener("click", async () => {
    const sel = $("#habit-template-select");
    if (!sel || !sel.value) return;
    try {
      await api("/api/portal/habits/enable", {
        method: "POST",
        body: JSON.stringify({ template_id: Number(sel.value) }),
      });
      flash($("#habit-settings-msg"), "已启用");
      await refreshHabitSettings();
      await refreshHabitsStrip();
    } catch (ex) {
      flash($("#habit-settings-msg"), ex.message);
    }
  });

  $("#btn-habit-custom")?.addEventListener("click", async () => {
    const title = ($("#habit-custom-title")?.value || "").trim();
    const minutes = Number($("#habit-custom-minutes")?.value || 5);
    try {
      await api("/api/portal/habits/custom", {
        method: "POST",
        body: JSON.stringify({ title, minutes }),
      });
      if ($("#habit-custom-title")) $("#habit-custom-title").value = "";
      flash($("#habit-settings-msg"), "已添加自定义习惯");
      await refreshHabitSettings();
      await refreshHabitsStrip();
    } catch (ex) {
      flash($("#habit-settings-msg"), ex.message);
    }
  });

  // WKWebView CJK: never preventDefault Enter while IME is composing (breaks 中文选词).
  document.querySelectorAll("textarea.input-like").forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
    });
  });

  // Resume: refresh strip + icon badge (pending count may have changed overnight).
  try {
    const App = capPlugin("App");
    if (App && typeof App.addListener === "function") {
      App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive || !state.currentAccountId) return;
        // Allow another permission attempt if Cap was not ready at first paint.
        if (!appIconBadgeDenied) appIconBadgeAsked = false;
        refreshHabitsStrip().catch((err) => {
          console.warn("[badge] refresh on resume", err);
        });
      });
    }
  } catch (err) {
    console.warn("[badge] App resume wire failed", err);
  }

  bootstrap().catch((err) => {
    const msg = err && err.message ? err.message : String(err || "unknown");
    console.error("bootstrap failed", msg, err);
    // Don't force-show onboarding over the lock screen when session is locked.
    if (/解锁|forbidden|未选择当前账户/i.test(msg)) return;
    const onboarding = $("#onboarding");
    const errEl = $("#onboarding-error");
    if (onboarding) onboarding.hidden = false;
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = "启动失败：" + msg;
    }
  });
})();
