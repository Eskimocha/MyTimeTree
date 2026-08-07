/* MyTimeTree portal SPA — parent mobile shell */
(() => {
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
    fruiting: "结果",
  };

  // Priority art: seed→sapling + fruiting; mid stages also have interim SVGs
  const ASSET_V = "20260807b";
  const STAGE_ART = {
    seed: `/static/portal/tree/seed.svg?v=${ASSET_V}`,
    sprout: `/static/portal/tree/sprout.svg?v=${ASSET_V}`,
    break_soil: `/static/portal/tree/break_soil.svg?v=${ASSET_V}`,
    germinate: `/static/portal/tree/germinate.svg?v=${ASSET_V}`,
    sapling: `/static/portal/tree/sapling.svg?v=${ASSET_V}`,
    young: `/static/portal/tree/young.svg?v=${ASSET_V}`,
    tall: `/static/portal/tree/tall.svg?v=${ASSET_V}`,
    big: `/static/portal/tree/big.svg?v=${ASSET_V}`,
    giant: `/static/portal/tree/giant.svg?v=${ASSET_V}`,
    fruiting: `/static/portal/tree/fruiting.svg?v=${ASSET_V}`,
  };

  const ORN_ICON = {
    star: `/static/portal/ornaments/star.svg?v=${ASSET_V}`,
    sun: `/static/portal/ornaments/sun.svg?v=${ASSET_V}`,
    fruit: `/static/portal/ornaments/fruit.svg?v=${ASSET_V}`,
    pest: `/static/portal/ornaments/pest.svg?v=${ASSET_V}`,
    bird: `/static/portal/ornaments/bird.svg?v=${ASSET_V}`,
  };

  // Positions on the tree scene (percent of scene). Centered via CSS margin.
  const ORN_SLOTS = {
    sun: [
      { left: "16%", top: "14%" },
      { left: "28%", top: "8%" },
      { left: "40%", top: "5%" },
      { left: "52%", top: "4%" },
      { left: "64%", top: "6%" },
      { left: "76%", top: "10%" },
      { left: "86%", top: "18%" },
      { left: "12%", top: "26%" },
      { left: "88%", top: "28%" },
      { left: "50%", top: "10%" },
    ],
    star: [
      { left: "26%", top: "20%" },
      { left: "38%", top: "15%" },
      { left: "50%", top: "18%" },
      { left: "62%", top: "15%" },
      { left: "74%", top: "20%" },
      { left: "32%", top: "28%" },
      { left: "46%", top: "26%" },
      { left: "58%", top: "26%" },
      { left: "70%", top: "28%" },
      { left: "50%", top: "32%" },
    ],
    fruit: [
      { left: "30%", top: "36%" },
      { left: "42%", top: "34%" },
      { left: "54%", top: "38%" },
      { left: "66%", top: "34%" },
      { left: "78%", top: "38%" },
      { left: "36%", top: "44%" },
      { left: "48%", top: "42%" },
      { left: "60%", top: "44%" },
      { left: "72%", top: "46%" },
      { left: "50%", top: "48%" },
    ],
    pest: [{ left: "22%", top: "48%" }],
    bird: [{ left: "68%", top: "58%" }],
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

  const state = {
    currentAccountId: null,
    accounts: [],
    dirtySettings: false,
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
    $("#onboarding").hidden = true;
    $("#main").hidden = false;
    $("#account-shell").hidden = false;
    fillAccountSelect();
    await refreshHome();
  }

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
    const o = home.tree.ornaments || {};
    updateOrnamentCounters(o);
    renderTreeOrnaments(o, stage);
    await refreshDefaults();
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
    // Early seed: keep ornaments mostly off-tree for clarity
    if (stage === "seed") return;

    const plan = [
      { kind: "sun", count: Math.min(10, o.golden_fruit_count || 0) },
      { kind: "star", count: starDisplayCount(o.fruit_count) },
      {
        kind: "fruit",
        count: fruitDisplayCount(o.interest_fruit_count ?? o.monthly_fruit_count),
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
      const slots = ORN_SLOTS[kind] || [];
      for (let i = 0; i < count && i < slots.length; i++) {
        const el = document.createElement("div");
        const hang = kind === "star" || kind === "sun" || kind === "fruit";
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

  async function refreshLedger() {
    if (!state.currentAccountId) return;
    const page = await api(`/api/ledger?account_id=${state.currentAccountId}&limit=50`);
    const list = $("#ledger-list");
    list.innerHTML = "";
    $("#ledger-empty").hidden = page.total > 0;
    for (const it of page.items) {
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
    const w = await api(`/api/analytics/weekly?account_id=${state.currentAccountId}`);
    const m = await api(`/api/analytics/monthly?account_id=${state.currentAccountId}`);
    $("#analytics-week").textContent =
      `区间 ${w.period_start} ~ ${w.period_end}\n` +
      `流水 ${w.entry_count} 笔\n进账 ${w.asset_in_minutes} / 支出 ${w.asset_out_minutes}\n` +
      `利息 ${w.interest_minutes}\n期末资产 ${w.ending_asset} · 负债 ${w.ending_liability} · 净值 ${w.ending_net}`;
    $("#analytics-month").textContent =
      `区间 ${m.period_start} ~ ${m.period_end}\n` +
      `流水 ${m.entry_count} 笔\n进账 ${m.asset_in_minutes} / 支出 ${m.asset_out_minutes}\n` +
      `利息 ${m.interest_minutes}\n期末资产 ${m.ending_asset} · 负债 ${m.ending_liability} · 净值 ${m.ending_net}`;
    renderTrendChart($("#chart-week"), w.series || []);
    renderTrendChart($("#chart-month"), m.series || []);
  }

  function renderTrendChart(el, series) {
    if (!el) return;
    if (!series.length) {
      el.innerHTML = `<p class="muted chart-empty">暂无趋势数据</p>`;
      return;
    }
    const W = 320;
    const H = 160;
    const pad = { t: 12, r: 10, b: 28, l: 36 };
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;
    const keys = [
      { k: "asset", label: "资产", color: "#2f9e6b" },
      { k: "liability", label: "负债", color: "#e67e22" },
      { k: "net", label: "净资产", color: "#1a3d32" },
      { k: "interest_net", label: "净利息", color: "#5c6bc0" },
    ];
    let minV = 0;
    let maxV = 0;
    for (const p of series) {
      for (const { k } of keys) {
        const v = Number(p[k]) || 0;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
    }
    if (minV === maxV) {
      maxV = minV + 1;
    }
    const xAt = (i) => pad.l + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
    const yAt = (v) => pad.t + innerH - ((v - minV) / (maxV - minV)) * innerH;
    const paths = keys.map(({ k, color }) => {
      const d = series
        .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(Number(p[k]) || 0).toFixed(1)}`)
        .join(" ");
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
    }).join("");
    const labelStep = Math.max(1, Math.ceil(series.length / 4));
    const xLabels = series
      .map((p, i) => {
        if (i % labelStep !== 0 && i !== series.length - 1) return "";
        const day = String(p.date).slice(5);
        return `<text x="${xAt(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="chart-axis">${day}</text>`;
      })
      .join("");
    const legend = keys
      .map(
        ({ label, color }) =>
          `<span class="chart-legend-item"><i style="background:${color}"></i>${label}</span>`
      )
      .join("");
    el.innerHTML =
      `<div class="chart-legend">${legend}</div>` +
      `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" aria-hidden="true">` +
      `<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + innerH}" stroke="#c9ddd3" />` +
      `<line x1="${pad.l}" y1="${pad.t + innerH}" x2="${pad.l + innerW}" y2="${pad.t + innerH}" stroke="#c9ddd3" />` +
      `<text x="4" y="${pad.t + 4}" class="chart-axis">${maxV}</text>` +
      `<text x="4" y="${pad.t + innerH}" class="chart-axis">${minV}</text>` +
      paths +
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
    if (name === "settings") refreshSettings();
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

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
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

  bootstrap().catch((err) => {
    console.error("bootstrap failed", err);
  });
})();
