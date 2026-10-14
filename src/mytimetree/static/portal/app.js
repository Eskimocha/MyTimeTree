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
    seed: `/static/portal/tree/seed.png?v=${ASSET_V}`,
    sprout: `/static/portal/tree/sprout.png?v=${ASSET_V}`,
    break_soil: `/static/portal/tree/break_soil.png?v=${ASSET_V}`,
    germinate: `/static/portal/tree/germinate.png?v=${ASSET_V}`,
    sapling: `/static/portal/tree/sapling.png?v=${ASSET_V}`,
    young: `/static/portal/tree/young.png?v=${ASSET_V}`,
    tall: `/static/portal/tree/tall.png?v=${ASSET_V}`,
    big: `/static/portal/tree/big.png?v=${ASSET_V}`,
    giant: `/static/portal/tree/giant.png?v=${ASSET_V}`,
    fruiting: `/static/portal/tree/forest.png?v=${ASSET_V}`,
  };

  const ORN_ICON = {
    star: `/static/portal/ornaments/star.png?v=${ASSET_V}`,
    sun: `/static/portal/ornaments/sun.png?v=${ASSET_V}`,
    fruit: `/static/portal/ornaments/fruit.png?v=${ASSET_V}`,
    pest: `/static/portal/ornaments/pest.png?v=${ASSET_V}`,
    bird: `/static/portal/ornaments/bird.png?v=${ASSET_V}`,
  };

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
      const left = document.createElement("span");
      left.textContent = `${it.summary || it.category} · ${it.created_at.slice(0, 16)}`;
      const amt = document.createElement("span");
      amt.className = "amt";
      amt.style.color = it.display?.color || "inherit";
      const sign = it.signed_asset_effect !== 0
        ? (it.signed_asset_effect > 0 ? "+" : "") + it.signed_asset_effect
        : (it.signed_liability_effect > 0 ? "负+" : "负") + Math.abs(it.signed_liability_effect);
      amt.textContent = `${sign} 分`;
      li.append(left, amt);
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

  function setHomeHabitBadge(n) {
    const badge = $("#habit-home-badge");
    if (!badge) return;
    if (n > 0) {
      badge.hidden = false;
      badge.textContent = String(n);
    } else {
      badge.hidden = true;
      badge.textContent = "";
    }
  }

  async function refreshHabitsStrip() {
    const strip = $("#habit-today-strip");
    const rail = $("#habit-chip-rail");
    if (!strip || !rail || !state.currentAccountId) return;
    try {
      const data = await api("/api/portal/habits/today");
      setHomeHabitBadge(data.badge_count || 0);
      const pending = (data.items || []).filter((i) => !i.done);
      const done = (data.items || []).filter((i) => i.done);
      strip.hidden = false;
      $("#habit-strip-meta").textContent = pending.length
        ? `还剩 ${pending.length}`
        : "今日已记完";
      rail.innerHTML = "";
      const show = [...pending, ...done].slice(0, 6);
      for (const it of show) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "habit-chip" + (it.done ? " done" : "");
        chip.setAttribute("role", "listitem");
        chip.textContent = it.done ? `✓ ${it.title}` : `记 · ${it.title}`;
        if (!it.done) {
          chip.addEventListener("click", () => completeHabitFromHome(it.habit_id));
        } else {
          chip.disabled = true;
        }
        rail.appendChild(chip);
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

  function showHabitCelebration(res) {
    const overlay = $("#habit-celeb-overlay");
    if (!overlay) return;
    const board = res.celebration && res.celebration.kind === "board";
    const approach = res.motivation_payload?.approach?.emotion_copy || "";
    const avoid = res.motivation_payload?.avoid?.emotion_copy || "";
    $("#habit-celeb-title").textContent = board
      ? "大庆祝！这周习惯满满"
      : `小庆祝 · ${approach}${avoid ? " / " + avoid : ""}`;
    $("#habit-celeb-credit").textContent = res.minutes_credited
      ? `已存入 ${res.minutes_credited} 分`
      : "";
    $("#habit-celeb-script").textContent =
      res.parent_script?.script_text || "";
    const hint = res.offline_hint;
    const hintEl = $("#habit-celeb-hint");
    if (hint && hint.title) {
      hintEl.hidden = false;
      $("#habit-hint-title").textContent = hint.title;
      $("#habit-hint-body").textContent = hint.body || "";
    } else {
      hintEl.hidden = true;
    }
    overlay.hidden = false;
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

  async function refreshHabitSettings() {
    const list = $("#habit-settings-list");
    const sel = $("#habit-template-select");
    if (!list || !state.currentAccountId) return;
    try {
      const data = await api("/api/portal/habits/list");
      const habits = (data.habits || []).filter((h) => !h.archived);
      list.innerHTML = "";
      habits.forEach((h, idx) => {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = `${h.title} · ${h.minutes_per_completion} 分`;
        const actions = document.createElement("span");
        actions.className = "habit-settings-actions";
        const up = document.createElement("button");
        up.type = "button";
        up.className = "btn compact";
        up.textContent = "上移";
        up.disabled = idx === 0;
        up.addEventListener("click", async () => {
          const ids = habits.map((x) => x.id);
          [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
          await api("/api/portal/habits/reorder", {
            method: "POST",
            body: JSON.stringify({ ordered_ids: ids }),
          });
          await refreshHabitSettings();
          await refreshHabitsStrip();
        });
        const down = document.createElement("button");
        down.type = "button";
        down.className = "btn compact";
        down.textContent = "下移";
        down.disabled = idx === habits.length - 1;
        down.addEventListener("click", async () => {
          const ids = habits.map((x) => x.id);
          [ids[idx + 1], ids[idx]] = [ids[idx], ids[idx + 1]];
          await api("/api/portal/habits/reorder", {
            method: "POST",
            body: JSON.stringify({ ordered_ids: ids }),
          });
          await refreshHabitSettings();
          await refreshHabitsStrip();
        });
        const arch = document.createElement("button");
        arch.type = "button";
        arch.className = "btn compact";
        arch.textContent = "移除";
        arch.addEventListener("click", async () => {
          await api("/api/portal/habits/archive", {
            method: "POST",
            body: JSON.stringify({ habit_id: h.id }),
          });
          await refreshHabitSettings();
          await refreshHabitsStrip();
        });
        const editMin = document.createElement("button");
        editMin.type = "button";
        editMin.className = "btn compact";
        editMin.textContent = "改分钟";
        editMin.addEventListener("click", async () => {
          const raw = window.prompt(`${h.title} 每次几分钟？`, String(h.minutes_per_completion));
          if (raw == null) return;
          const n = Math.floor(Number(raw));
          if (!Number.isFinite(n) || n <= 0) return;
          await api("/api/portal/habits/rules", {
            method: "PATCH",
            body: JSON.stringify({ rule_id: h.rule_id, minutes_per_completion: n }),
          });
          await refreshHabitSettings();
        });
        actions.append(up, down, editMin, arch);
        li.append(label, actions);
        list.appendChild(li);
      });
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
      }
    } catch (err) {
      console.warn("habit settings", err);
    }
  }

  async function refreshHabitReview() {
    try {
      const data = await api("/api/portal/habits/overview");
      const stats = $("#habit-board-stats");
      if (stats) {
        stats.textContent =
          `本周 ${data.board?.stats?.week_logs || 0} 记 · 近记 ${data.board?.stats?.total_logs || 0} 条 · 已兑 ${data.board?.stats?.minutes_redeemed || 0} 分`;
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
            "input, textarea, select, button, a, label, .question-picker, .keypad-modal, .account-modal, .sync-actions"
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

  document.querySelectorAll("[data-habit-dismiss]").forEach((el) => {
    el.addEventListener("click", () => {
      const overlay = $("#habit-celeb-overlay");
      if (overlay) overlay.hidden = true;
    });
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
