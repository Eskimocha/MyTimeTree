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

  const state = {
    currentAccountId: null,
    accounts: [],
    dirtySettings: false,
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
    try {
      const badge = await api("/api/portal/habits/badge");
      setHabitBadge(badge.badge_count || 0);
    } catch (_) {
      /* habits optional if service not wired in older tests */
    }
    $("#asset-min").textContent = String(home.balance.asset);
    $("#liab-min").textContent = String(home.balance.liability);
    const stage = home.tree.stage;
    const treeEl = $("#tree-stage");
    treeEl.dataset.stage = stage;
    treeEl.querySelector(".tree-visual").style.animation = "none";
    // reflow for fade-in
    void treeEl.querySelector(".tree-visual").offsetWidth;
    treeEl.querySelector(".tree-visual").style.animation = "";
    $("#stage-label").textContent = STAGE_ZH[stage] || stage;
    const o = home.tree.ornaments || {};
    $("#ornaments-line").textContent =
      `果 ${o.fruit_count || 0} · 金果 ${o.golden_fruit_count || 0} · 虫 ${o.pest_count || 0} · 鸟 ${o.woodpecker_count || 0}`;
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

  async function refreshSettings() {
    if (!state.currentAccountId) return;
    const st = await api(`/api/settings?account_id=${state.currentAccountId}`);
    const form = $("#settings-form");
    form.daily_grant_minutes.value = st.daily_grant_minutes;
    form.default_spend_minutes.value = st.default_spend_minutes;
    form.default_repay_minutes.value = st.default_repay_minutes;
    state.dirtySettings = false;
  }

  async function refreshAnalytics() {
    if (!state.currentAccountId) return;
    const w = await api(`/api/analytics/weekly?account_id=${state.currentAccountId}`);
    const m = await api(`/api/analytics/monthly?account_id=${state.currentAccountId}`);
    $("#analytics-week").textContent =
      `区间 ${w.period_start} ~ ${w.period_end}\n` +
      `流水 ${w.entry_count} 笔\n进账 ${w.asset_in_minutes} / 支出 ${w.asset_out_minutes}\n` +
      `利息 ${w.interest_minutes}\n期末资产 ${w.ending_asset} · 负债 ${w.ending_liability}`;
    $("#analytics-month").textContent =
      `区间 ${m.period_start} ~ ${m.period_end}\n` +
      `流水 ${m.entry_count} 笔\n进账 ${m.asset_in_minutes} / 支出 ${m.asset_out_minutes}\n` +
      `利息 ${m.interest_minutes}\n期末资产 ${m.ending_asset} · 负债 ${m.ending_liability}`;
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
    if (name === "habits") refreshHabits();
  }

  function setHabitBadge(n) {
    const badge = $("#habit-badge");
    if (!badge) return;
    if (n > 0) {
      badge.hidden = false;
      badge.textContent = String(n);
    } else {
      badge.hidden = true;
      badge.textContent = "";
    }
  }

  function showCelebration(payload, celebration) {
    const el = $("#habit-celeb");
    if (!el) return;
    const approach = payload?.approach?.emotion_copy || "";
    const avoid = payload?.avoid?.emotion_copy || "";
    const kind = celebration?.kind || "small";
    el.hidden = false;
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
    el.textContent =
      kind === "board"
        ? `大庆祝！${approach || "这周习惯满满"}`
        : `小庆祝 · ${approach}${avoid ? " / " + avoid : ""}`;
    setTimeout(() => { el.hidden = true; }, 2800);
  }

  function showParentGuide(res) {
    const wrap = $("#parent-guide");
    if (!wrap) return;
    const script = res.parent_script;
    const hint = res.offline_hint;
    if (!script && !hint) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    $("#parent-script-text").textContent =
      (res.parent_motivation_payload?.message || "") +
      (script ? `\n话术：${script.script_text}` : "");
    if (hint) {
      $("#offline-hint-card").hidden = false;
      $("#offline-hint-title").textContent = hint.title || "线下庆祝";
      $("#offline-hint-body").textContent = hint.body || "";
      const url = hintImageUrl(hint.image_key);
      if (url) {
        $("#offline-hint-image").innerHTML =
          `<img alt="" src="${url}" width="72" height="72" />`;
      } else {
        $("#offline-hint-image").textContent = "（文字指引，配图稍后可补）";
      }
    } else {
      $("#offline-hint-card").hidden = true;
    }
  }

  async function refreshHabits() {
    if (!state.currentAccountId) return;
    const data = await api("/api/portal/habits/today");
    setHabitBadge(data.badge_count || 0);
    const list = $("#habit-today-list");
    list.innerHTML = "";
    for (const it of data.items || []) {
      const li = document.createElement("li");
      const title = document.createElement("span");
      title.textContent = it.done ? `✓ ${it.title}` : it.title;
      li.appendChild(title);
      if (!it.done) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn primary compact";
        btn.textContent = "记录";
        btn.addEventListener("click", async () => {
          try {
            const res = await api("/api/portal/habits/complete", {
              method: "POST",
              body: JSON.stringify({ habit_id: it.habit_id }),
            });
            showCelebration(res.motivation_payload, res.celebration);
            showParentGuide(res);
            flash($("#habit-msg"), res.credit
              ? `已记录，待兑 ${res.credit.minutes} 分`
              : "已记录");
            setHabitBadge(res.badge_count || 0);
            await refreshHabits();
            await refreshHome();
          } catch (ex) {
            flash($("#habit-msg"), ex.message);
          }
        });
        li.appendChild(btn);
      } else if (it.pending_credit_id) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn compact";
        btn.textContent = `兑 ${it.pending_minutes} 分`;
        btn.addEventListener("click", async () => {
          try {
            await api(`/api/portal/habits/credits/${it.pending_credit_id}/redeem`, {
              method: "POST",
              body: "{}",
            });
            flash($("#habit-msg"), "已兑换入账");
            await refreshHabits();
            await refreshHome();
          } catch (ex) {
            flash($("#habit-msg"), ex.message);
          }
        });
        li.appendChild(btn);
      }
      list.appendChild(li);
    }
  }

  function hideHabitPanelsExcept(id) {
    for (const sel of ["#habit-board", "#habit-timeline", "#habit-rules"]) {
      const el = $(sel);
      if (el) el.hidden = sel !== id;
    }
  }

  async function refreshHabitBoard() {
    const board = await api("/api/portal/habits/board");
    hideHabitPanelsExcept("#habit-board");
    $("#habit-board-stats").textContent =
      `共 ${board.stats.total_logs} 记 · 已兑 ${board.stats.minutes_redeemed} 分 · 待兑 ${board.stats.minutes_pending} 分`;
    const list = $("#habit-board-list");
    list.innerHTML = "";
    for (const e of board.entries || []) {
      const li = document.createElement("li");
      li.textContent = `${e.habit_title} · ${e.day_key} · ${e.minutes || 0} 分`;
      list.appendChild(li);
    }
    if (board.board_celebration) {
      showCelebration(
        { approach: { emotion_copy: "总表里程碑达成" } },
        board.board_celebration,
      );
    }
  }

  async function refreshHabitOverview() {
    const data = await api("/api/portal/habits/overview");
    hideHabitPanelsExcept("#habit-timeline");
    const tl = $("#habit-timeline-list");
    tl.innerHTML = "";
    for (const it of data.timeline || []) {
      const li = document.createElement("li");
      li.textContent = `${it.title} · ${it.day_key}`;
      tl.appendChild(li);
    }
    const cats = $("#habit-category-list");
    cats.innerHTML = "";
    for (const c of data.categories || []) {
      const li = document.createElement("li");
      li.textContent = `${c.label} · ${c.count} 次 · ${c.minutes} 分`;
      cats.appendChild(li);
    }
  }

  async function refreshHabitRules() {
    const data = await api("/api/portal/habits/overview");
    hideHabitPanelsExcept("#habit-rules");
    const list = $("#habit-rules-list");
    list.innerHTML = "";
    for (const r of data.rules || []) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${r.title} · ${r.minutes_per_completion} 分${r.auto_redeem ? " · 自动兑" : ""}`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn compact";
      btn.textContent = "改分钟";
      btn.addEventListener("click", async () => {
        const minutes = promptMinutes(`${r.title} 每次兑换几分钟？`);
        if (minutes == null) return;
        try {
          await api("/api/portal/habits/rules", {
            method: "PATCH",
            body: JSON.stringify({
              rule_id: r.rule_id,
              minutes_per_completion: minutes,
            }),
          });
          flash($("#habit-msg"), "规则已更新");
          await refreshHabitRules();
        } catch (ex) {
          flash($("#habit-msg"), ex.message);
        }
      });
      li.append(label, btn);
      list.appendChild(li);
    }
  }

  function hintImageUrl(imageKey) {
    if (!imageKey) return null;
    return `/static/portal/hints/${imageKey}.svg`;
  }

  function flash(el, text) {
    el.hidden = false;
    el.textContent = text;
    setTimeout(() => { el.hidden = true; }, 2200);
  }

  function promptMinutes(label) {
    const raw = window.prompt(label, "20");
    if (raw == null) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      window.alert("请输入正数分钟");
      return null;
    }
    return Math.floor(n);
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
    const minutes = promptMinutes("支出多少分钟？");
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
    const minutes = promptMinutes("借用多少分钟？");
    if (minutes == null) return;
    try {
      await api("/api/portal/borrow", {
        method: "POST",
        body: JSON.stringify({ minutes, summary: "借用" }),
      });
      flash($("#home-msg"), "已借用（记借+支）");
      await refreshHome();
    } catch (ex) {
      flash($("#home-msg"), ex.message);
    }
  });

  $("#btn-repay").addEventListener("click", async () => {
    const minutes = promptMinutes("还入多少分钟？");
    if (minutes == null) return;
    try {
      await api("/api/portal/repay", {
        method: "POST",
        body: JSON.stringify({ minutes, summary: "还入" }),
      });
      flash($("#home-msg"), "已还入");
      await refreshHome();
    } catch (ex) {
      flash($("#home-msg"), ex.message);
    }
  });

  $("#btn-habit-snooze")?.addEventListener("click", async () => {
    try {
      const res = await api("/api/portal/habits/badge/snooze?minutes=60", {
        method: "POST",
        body: "{}",
      });
      setHabitBadge(res.badge_count || 0);
      flash($("#habit-msg"), "已稍后提醒");
    } catch (ex) {
      flash($("#habit-msg"), ex.message);
    }
  });

  $("#btn-habit-board")?.addEventListener("click", async () => {
    try {
      await refreshHabitBoard();
    } catch (ex) {
      flash($("#habit-msg"), ex.message);
    }
  });

  $("#btn-habit-timeline")?.addEventListener("click", async () => {
    try {
      await refreshHabitOverview();
    } catch (ex) {
      flash($("#habit-msg"), ex.message);
    }
  });

  $("#btn-habit-rules")?.addEventListener("click", async () => {
    try {
      await refreshHabitRules();
    } catch (ex) {
      flash($("#habit-msg"), ex.message);
    }
  });

  $("#btn-habit-redeem-all")?.addEventListener("click", async () => {
    try {
      const data = await api("/api/portal/habits/today");
      for (const c of data.pending_credits || []) {
        await api(`/api/portal/habits/credits/${c.id}/redeem`, {
          method: "POST",
          body: "{}",
        });
      }
      flash($("#habit-msg"), "待入账已全部兑换");
      await refreshHabits();
      await refreshHome();
    } catch (ex) {
      flash($("#habit-msg"), ex.message);
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
