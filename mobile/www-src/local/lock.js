/**
 * Phase 2 lock screen: Face ID + parent password + recovery reset.
 */
(function () {
  "use strict";

  const BACKGROUND_LOCK_MS = 15 * 1000;
  let backgroundAt = 0;
  let faceBtn = null;

  function plugin(name) {
    try {
      const cap = window.Capacitor;
      if (!cap) return null;
      // Custom App plugins (ICloudDb / SaveToPhotos) need registerPlugin.
      if (typeof cap.registerPlugin === "function") {
        return cap.registerPlugin(name);
      }
      if (typeof cap.isPluginAvailable === "function" && !cap.isPluginAvailable(name)) {
        return null;
      }
      return (cap.Plugins && cap.Plugins[name]) || null;
    } catch {
      return null;
    }
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  async function api(path, init) {
    const r = await window.MyTimeTreeLocal.handle(path, init || {});
    if (r.status >= 400) {
      const msg = (r.body && r.body.message) || JSON.stringify(r.body);
      const err = new Error(msg);
      err.status = r.status;
      err.body = r.body;
      throw err;
    }
    return r.body;
  }

  function setErr(el, msg) {
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    el.hidden = false;
  }

  function ensureLockDom() {
    if ($("#app-lock")) return;
    const el = document.createElement("div");
    el.id = "app-lock";
    el.className = "app-lock";
    el.hidden = true;
    el.innerHTML = `
      <div class="app-lock-card" id="app-lock-main">
        <p class="app-lock-brand">MyTimeTree</p>
        <p class="app-lock-lede">家长解锁后继续</p>
        <button type="button" class="btn primary" id="app-lock-face">使用 Face ID 解锁</button>
        <p class="app-lock-hint muted" id="app-lock-face-hint" hidden></p>
        <form id="app-lock-form" class="stack app-lock-form">
          <label>家长密码
            <input name="password" type="password" autocomplete="current-password" required minlength="4" />
          </label>
          <button type="submit" class="btn primary">解锁</button>
        </form>
        <button type="button" class="btn linkish" id="app-lock-forgot">忘记密码？</button>
        <p id="app-lock-error" class="error" hidden></p>
      </div>
      <div class="app-lock-card" id="app-lock-recovery" hidden>
        <p class="app-lock-brand">重置密码</p>
        <p class="app-lock-lede" id="recovery-question-text">安全问题</p>
        <form id="app-lock-recovery-form" class="stack app-lock-form">
          <label>答案
            <textarea name="answer" rows="1" lang="zh-CN" enterkeyhint="done" autocomplete="off" spellcheck="false" required placeholder="例如：三体（可不加书名号）"></textarea>
          </label>
          <label>新家长密码
            <input name="new_password" type="password" autocomplete="new-password" required minlength="4" />
          </label>
          <label>确认新密码
            <input name="new_password2" type="password" autocomplete="new-password" required minlength="4" />
          </label>
          <button type="submit" class="btn primary">重置并解锁</button>
        </form>
        <p class="app-lock-hint muted">答案尽量用汉字；避免书名号《》，部分机型输入后会卡住中文键盘。</p>
        <button type="button" class="btn linkish" id="recovery-back">返回解锁</button>
        <p id="recovery-error" class="error" hidden></p>
        <div id="recovery-wipe-box" hidden>
          <p class="muted">尚未设置安全问题，无法自助找回。</p>
          <button type="button" class="btn danger" id="app-lock-wipe">清除本机数据并重新开户</button>
        </div>
      </div>
      <div class="app-lock-card" id="app-lock-faceid-optin" hidden>
        <p class="app-lock-brand">启用 Face ID？</p>
        <p class="app-lock-lede">下次可用面容快速解锁。也可稍后在「设置」中开关。</p>
        <button type="button" class="btn primary" id="faceid-optin-yes">启用 Face ID</button>
        <button type="button" class="btn" id="faceid-optin-no">暂不启用</button>
        <p id="faceid-optin-error" class="error" hidden></p>
      </div>
    `;
    document.body.appendChild(el);

    faceBtn = $("#app-lock-face", el);

    $("#app-lock-form", el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const password = String(fd.get("password") || "");
      const errEl = $("#app-lock-error", el);
      setErr(errEl, "");
      try {
        const unlocked = await api("/api/auth/unlock", {
          method: "POST",
          body: JSON.stringify({ password }),
        });
        window.MyTimeTreeLocal.unlockSession();
        await afterUnlock(unlocked);
      } catch (ex) {
        setErr(errEl, ex.message || "解锁失败");
      }
    });

    faceBtn.addEventListener("click", () => tryFaceId(true));

    $("#app-lock-forgot", el).addEventListener("click", () => showRecoveryPanel());
    $("#recovery-back", el).addEventListener("click", () => showMainLockPanel());

    $("#app-lock-recovery-form", el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const errEl = $("#recovery-error", el);
      setErr(errEl, "");
      const p1 = String(fd.get("new_password") || "");
      const p2 = String(fd.get("new_password2") || "");
      if (p1 !== p2) {
        setErr(errEl, "两次输入的新密码不一致");
        return;
      }
      try {
        const result = await api("/api/auth/recovery/reset", {
          method: "POST",
          body: JSON.stringify({
            answer: String(fd.get("answer") || ""),
            new_password: p1,
          }),
        });
        window.MyTimeTreeLocal.unlockSession();
        await afterUnlock(result);
      } catch (ex) {
        setErr(errEl, ex.message || "重置失败");
      }
    });

    $("#app-lock-wipe", el).addEventListener("click", async () => {
      if (
        !confirm(
          "将删除本机全部时间树数据（不可恢复），并回到开户页。确定继续？"
        )
      ) {
        return;
      }
      try {
        await api("/api/auth/wipe", {
          method: "POST",
          body: JSON.stringify({ confirm: true }),
        });
        location.reload();
      } catch (ex) {
        setErr($("#recovery-error", el), ex.message || "清除失败");
      }
    });

    $("#faceid-optin-yes", el).addEventListener("click", async () => {
      const errEl = $("#faceid-optin-error", el);
      setErr(errEl, "");
      try {
        const bio = plugin("NativeBiometric");
        if (bio) {
          await bio.verifyIdentity({
            reason: "确认启用 Face ID 解锁",
            title: "启用 Face ID",
            subtitle: "验证面容以开启快捷解锁",
            negativeButtonText: "取消",
            useFallback: false,
          });
        }
        await api("/api/auth/faceid", {
          method: "PATCH",
          body: JSON.stringify({ enabled: true, optin_done: true }),
        });
        await finishUnlockReload();
      } catch (ex) {
        setErr(errEl, ex.message || "未能启用 Face ID，可稍后再试");
      }
    });

    $("#faceid-optin-no", el).addEventListener("click", async () => {
      try {
        await api("/api/auth/faceid", {
          method: "PATCH",
          body: JSON.stringify({ enabled: false, optin_done: true }),
        });
      } catch {
        /* ignore */
      }
      await finishUnlockReload();
    });
  }

  function showPanel(which) {
    const main = $("#app-lock-main");
    const recovery = $("#app-lock-recovery");
    const optin = $("#app-lock-faceid-optin");
    if (!main || !recovery || !optin) return;
    main.hidden = which !== "main";
    recovery.hidden = which !== "recovery";
    optin.hidden = which !== "faceid";
    const root = $("#app-lock");
    if (root) root.dataset.panel = which;
  }

  function showMainLockPanel() {
    showPanel("main");
  }

  async function showRecoveryPanel() {
    showPanel("recovery");
    setErr($("#recovery-error"), "");
    const rec = await api("/api/auth/recovery");
    const wipeBox = $("#recovery-wipe-box");
    const form = $("#app-lock-recovery-form");
    if (rec.configured) {
      $("#recovery-question-text").textContent = rec.question;
      form.hidden = false;
      wipeBox.hidden = true;
    } else {
      $("#recovery-question-text").textContent =
        "当前数据尚未设置安全问题";
      form.hidden = true;
      wipeBox.hidden = false;
    }
  }

  function showFaceIdOptin() {
    showPanel("faceid");
  }

  async function afterUnlock(unlocked) {
    const avail = await biometryAvailable();
    const optinDone = unlocked && unlocked.faceid_optin_done;
    if (avail && !optinDone) {
      showFaceIdOptin();
      return;
    }
    await finishUnlockReload();
  }

  function clearLockOverlay() {
    const lock = $("#app-lock");
    if (lock) lock.hidden = true;
    document.documentElement.classList.remove("is-locked");
    if (typeof window.resetMyTimeTreeViewport === "function") {
      window.resetMyTimeTreeViewport();
    } else {
      window.scrollTo(0, 0);
    }
  }

  async function finishUnlockReload() {
    clearLockOverlay();
    location.reload();
  }

  function ensureSettingsSecurity() {
    const form = $("#settings-form");
    if (!form) return;
    if ($("#security-settings")) {
      upgradeFaceIdSwitchDom();
      wireFaceIdToggle();
      ensureSyncSettings($("#security-settings"));
      // ensureImportSettings hidden for production; enable via window.__MYTIMETREE_SHOW_IMPORT__ = true
      if (window.__MYTIMETREE_SHOW_IMPORT__) {
        ensureImportSettings($("#sync-settings") || $("#security-settings"));
      }
      return;
    }
    const box = document.createElement("div");
    box.id = "security-settings";
    box.className = "security-settings";
    box.innerHTML = `
      <h3 class="security-title">安全</h3>
      <label class="faceid-toggle-row">
        <span class="faceid-toggle-label">Face ID 解锁</span>
        <span class="faceid-switch">
          <input type="checkbox" id="faceid-enabled" role="switch" aria-label="Face ID 解锁" />
          <span class="faceid-switch-track" aria-hidden="true">
            <span class="faceid-switch-thumb"></span>
          </span>
        </span>
      </label>
      <p class="muted security-note" id="faceid-settings-hint"></p>
      <form id="password-change-form" class="stack">
        <label>当前密码<input name="current_password" type="password" required minlength="4" /></label>
        <label>新密码<input name="new_password" type="password" required minlength="4" /></label>
        <button type="submit" class="btn">修改家长密码</button>
      </form>
      <p id="password-change-msg" class="msg" hidden></p>
    `;
    form.parentNode.insertBefore(box, form.nextSibling);
    ensureSyncSettings(box);
    if (window.__MYTIMETREE_SHOW_IMPORT__) {
      ensureImportSettings($("#sync-settings") || box);
    }
    wireFaceIdToggle();
    wirePasswordChangeForm();
  }

  function wireFaceIdToggle() {
    const toggle = $("#faceid-enabled");
    if (!toggle || toggle.dataset.wired === "1") return;
    toggle.dataset.wired = "1";
    toggle.addEventListener("change", async () => {
      try {
        if (toggle.checked) {
          const bio = plugin("NativeBiometric");
          const avail = await biometryAvailable();
          if (!avail) {
            toggle.checked = false;
            flashMsg(
              $("#faceid-settings-hint"),
              "设备未录入 Face ID。模拟器请用 Features → Face ID → Enrolled"
            );
            return;
          }
          if (bio) {
            await bio.verifyIdentity({
              reason: "确认启用 Face ID",
              title: "启用 Face ID",
              useFallback: false,
            });
          }
        }
        await api("/api/auth/faceid", {
          method: "PATCH",
          body: JSON.stringify({
            enabled: toggle.checked,
            optin_done: true,
          }),
        });
        flashMsg(
          $("#faceid-settings-hint"),
          toggle.checked ? "已启用 Face ID 解锁" : "已关闭 Face ID 解锁"
        );
      } catch (ex) {
        toggle.checked = !toggle.checked;
        flashMsg($("#faceid-settings-hint"), ex.message || "设置失败");
      }
    });
  }

  function wirePasswordChangeForm() {
    const form = $("#password-change-form");
    if (!form || form.dataset.wired === "1") return;
    form.dataset.wired = "1";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const msg = $("#password-change-msg");
      try {
        await api("/api/auth/password", {
          method: "PATCH",
          body: JSON.stringify({
            current_password: String(fd.get("current_password") || ""),
            new_password: String(fd.get("new_password") || ""),
          }),
        });
        e.target.reset();
        flashMsg(msg, "密码已更新");
      } catch (ex) {
        flashMsg(msg, ex.message || "修改失败");
      }
    });
  }

  function upgradeFaceIdSwitchDom() {
    const row = $(".faceid-toggle-row");
    const input = $("#faceid-enabled");
    if (!row || !input) return;
    if (row.querySelector(".faceid-switch")) return;
    const checked = input.checked;
    row.innerHTML = `
      <span class="faceid-toggle-label">Face ID 解锁</span>
      <span class="faceid-switch">
        <input type="checkbox" id="faceid-enabled" role="switch" aria-label="Face ID 解锁" />
        <span class="faceid-switch-track" aria-hidden="true">
          <span class="faceid-switch-thumb"></span>
        </span>
      </span>
    `;
    const next = $("#faceid-enabled");
    if (next) next.checked = checked;
  }

  function flashMsg(el, text) {
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
  }

  function ensureSyncSettings(afterEl) {
    let box = $("#sync-settings");
    if (!box) {
      box = document.createElement("div");
      box.id = "sync-settings";
      box.className = "sync-settings";
      box.innerHTML = `
        <h3 class="security-title">iCloud 同步</h3>
        <p class="sync-status-line" id="sync-status-text">
          <span class="sync-status-dot" id="sync-status-dot" aria-hidden="true"></span>
          <span id="sync-status-label">正在检查…</span>
        </p>
        <ul class="sync-time-list" id="sync-time-list" aria-label="同步时间">
          <li>检查时间：<strong id="sync-checked-at">—</strong></li>
          <li>上次写入：<strong id="sync-last-write">—</strong></li>
          <li>本机文件：<strong id="sync-local-at">—</strong></li>
          <li>iCloud 文件：<strong id="sync-icloud-at">—</strong></li>
        </ul>
        <p class="security-note" id="sync-status-detail" hidden></p>
        <div class="sync-actions">
          <button type="button" class="btn primary sync-flush-btn" id="sync-flush-btn">立即同步到 iCloud</button>
          <div class="sync-actions-row">
            <button type="button" class="btn sync-refresh-btn" id="sync-refresh-btn">刷新状态</button>
            <button type="button" class="btn sync-restore-main" id="sync-restore-btn">从 iCloud 恢复</button>
          </div>
        </div>
        <p id="sync-settings-msg" class="msg" hidden></p>
      `;
      if (afterEl && afterEl.parentNode) {
        afterEl.parentNode.insertBefore(box, afterEl.nextSibling);
      }
      wireSyncSettingsHandlers();
    } else {
      upgradeSyncSettingsDom(box);
      wireSyncSettingsHandlers();
    }
  }

  function upgradeSyncSettingsDom(box) {
    const line = $("#sync-status-text");
    if (line && !$("#sync-status-dot")) {
      const labelText = line.textContent || "正在检查…";
      line.innerHTML = `
        <span class="sync-status-dot" id="sync-status-dot" aria-hidden="true"></span>
        <span id="sync-status-label"></span>
      `;
      const label = $("#sync-status-label");
      if (label) label.textContent = labelText;
    }
    if (!$("#sync-time-list")) {
      const list = document.createElement("ul");
      list.className = "sync-time-list";
      list.id = "sync-time-list";
      list.innerHTML = `
        <li>检查时间：<strong id="sync-checked-at">—</strong></li>
        <li>上次写入：<strong id="sync-last-write">—</strong></li>
        <li>本机文件：<strong id="sync-local-at">—</strong></li>
        <li>iCloud 文件：<strong id="sync-icloud-at">—</strong></li>
      `;
      if (line && line.parentNode) line.parentNode.insertBefore(list, line.nextSibling);
    }
    const flush = $("#sync-flush-btn");
    if (flush) {
      flush.classList.add("sync-flush-btn", "primary");
    }
    let refresh = $("#sync-refresh-btn");
    if (refresh) refresh.classList.add("sync-refresh-btn");

    let actions = box.querySelector(".sync-actions");
    if (!actions && box) {
      actions = document.createElement("div");
      actions.className = "sync-actions";
      const detail = $("#sync-status-detail");
      if (detail && detail.nextSibling) {
        box.insertBefore(actions, detail.nextSibling);
      } else {
        box.appendChild(actions);
      }
    }

    let row = actions && actions.querySelector(".sync-actions-row");
    if (actions && !row) {
      row = document.createElement("div");
      row.className = "sync-actions-row";
      actions.appendChild(row);
    }

    if (flush && actions && flush.parentNode !== actions) {
      actions.insertBefore(flush, actions.firstChild);
    } else if (flush && actions && flush.nextSibling !== row && row) {
      actions.insertBefore(flush, row);
    }

    let restore = $("#sync-restore-btn");
    if (!restore && box) {
      restore = document.createElement("button");
      restore.type = "button";
      restore.className = "btn sync-restore-main";
      restore.id = "sync-restore-btn";
      restore.textContent = "从 iCloud 恢复";
    }
    if (restore) {
      restore.classList.add("sync-restore-main");
      restore.textContent = "从 iCloud 恢复";
      if (row && restore.parentNode !== row) {
        row.appendChild(restore);
      }
    }
    if (refresh && row && refresh.parentNode !== row) {
      row.insertBefore(refresh, row.firstChild);
    }

    // Inline password field removed — confirm via modal after OK.
    box.querySelectorAll(".sync-restore-pass").forEach((el) => el.remove());
    if (!$("#sync-settings-msg") && box) {
      const p = document.createElement("p");
      p.id = "sync-settings-msg";
      p.className = "msg";
      p.hidden = true;
      box.appendChild(p);
    }
  }

  function promptRestorePassword() {
    return new Promise((resolve) => {
      let root = $("#sync-password-modal");
      if (!root) {
        root = document.createElement("div");
        root.id = "sync-password-modal";
        root.className = "sync-password-modal";
        root.hidden = true;
        root.innerHTML = `
          <div class="sync-password-modal-backdrop" data-dismiss="1"></div>
          <div class="sync-password-modal-sheet" role="dialog" aria-modal="true" aria-labelledby="sync-password-title">
            <h2 id="sync-password-title">确认覆盖</h2>
            <p>本机已有数据时，请输入当前家长密码以确认覆盖。</p>
            <label>家长密码
              <input type="password" id="sync-password-input" minlength="4" autocomplete="current-password" placeholder="请输入家长密码" />
            </label>
            <p id="sync-password-error" class="error" hidden></p>
            <div class="sync-password-modal-actions">
              <button type="button" class="btn" data-dismiss="1">取消</button>
              <button type="button" class="btn primary" id="sync-password-ok">确认恢复</button>
            </div>
          </div>
        `;
        document.body.appendChild(root);
      }

      const input = $("#sync-password-input", root);
      const errEl = $("#sync-password-error", root);
      const finish = (value) => {
        root.hidden = true;
        if (input) input.value = "";
        if (errEl) {
          errEl.hidden = true;
          errEl.textContent = "";
        }
        resolve(value);
      };

      const onDismiss = (e) => {
        if (e.target && e.target.getAttribute("data-dismiss") === "1") {
          finish(null);
        }
      };
      const onOk = () => {
        const password = String((input && input.value) || "");
        finish(password);
      };
      const onKey = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOk();
        } else if (e.key === "Escape") {
          finish(null);
        }
      };

      root.onclick = onDismiss;
      const okBtn = $("#sync-password-ok", root);
      if (okBtn) okBtn.onclick = onOk;
      if (input) {
        input.onkeydown = onKey;
        input.value = "";
      }
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = "";
      }
      root.hidden = false;
      setTimeout(() => input && input.focus(), 50);
    });
  }

  function wireSyncSettingsHandlers() {
    const refresh = $("#sync-refresh-btn");
    if (refresh && !refresh.dataset.wired) {
      refresh.dataset.wired = "1";
      refresh.addEventListener("click", () => refreshSyncStatus(true));
    }
    const flush = $("#sync-flush-btn");
    if (flush && !flush.dataset.wired) {
      flush.dataset.wired = "1";
      flush.addEventListener("click", async () => {
        const msg = $("#sync-settings-msg");
        try {
          await api("/api/sync/flush", { method: "POST", body: "{}" });
          flashMsg(msg, "已请求写入；正在读取时间戳…");
          await refreshSyncStatus(true);
        } catch (ex) {
          flashMsg(msg, ex.message || "同步失败");
        }
      });
    }
    const restore = $("#sync-restore-btn");
    if (restore && !restore.dataset.wired) {
      restore.dataset.wired = "1";
      restore.addEventListener("click", async () => {
        const msg = $("#sync-settings-msg");
        const ok = window.confirm(
          "将用 iCloud 上的整库覆盖本机全部数据。若 iCloud 较旧，本机较新的改动会丢失。确定继续？"
        );
        if (!ok) return;
        const password = await promptRestorePassword();
        if (password == null) return;
        try {
          flashMsg(msg, "正在从 iCloud 拉取…");
          if (!window.MyTimeTreeLocal || typeof window.MyTimeTreeLocal.restoreFromICloud !== "function") {
            throw new Error("当前 App 版本过旧，请 Clean Build 后重新 Run");
          }
          const result = await window.MyTimeTreeLocal.restoreFromICloud({
            confirm: true,
            password: password || undefined,
          });
          flashMsg(
            msg,
            `已恢复 ${result.account_count} 个账户。即将锁屏，请用恢复库密码解锁…`
          );
          setTimeout(() => location.reload(), 700);
        } catch (ex) {
          flashMsg(msg, ex.message || "恢复失败");
        }
      });
    }
  }

  function setText(id, text) {
    const el = $("#" + id);
    if (el) el.textContent = text || "—";
  }

  function formatIsoLocal(iso) {
    if (iso == null || iso === "" || iso === false) return null;
    if (typeof iso !== "string" && typeof iso !== "number") return null;
    const s = String(iso);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
    if (m) return `${m[1]} ${m[2]}`;
    // Already "yyyy-MM-dd HH:mm:ss"
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) return s.slice(0, 19);
    return s.slice(0, 32);
  }

  async function readNativeSyncStatus() {
    const ICloudDb = plugin("ICloudDb");
    if (!ICloudDb || typeof ICloudDb.status !== "function") {
      return { plugin: false };
    }
    try {
      const st = await ICloudDb.status();
      return { plugin: true, ...(st || {}) };
    } catch (err) {
      return {
        plugin: false,
        lastError: String(err && err.message ? err.message : err),
      };
    }
  }

  function applySyncStatus(sync) {
    const nowStamp = formatIsoLocal(new Date().toISOString().replace("Z", "")) ||
      new Date().toLocaleString("zh-CN", { hour12: false });
    const checked = formatIsoLocal(sync.checkedAt) || nowStamp;
    const lastWrite = formatIsoLocal(sync.lastWriteAt) ||
      (sync.lastSave && formatIsoLocal(sync.lastSave.at)) ||
      null;
    const localAt = formatIsoLocal(sync.localModified);
    const cloudAt = formatIsoLocal(sync.iCloudModified);

    setText("sync-checked-at", checked);
    setText(
      "sync-last-write",
      lastWrite ? lastWrite : "尚无记录（请先点「立即同步」）"
    );
    setText(
      "sync-local-at",
      localAt
        ? localAt
        : sync.localExists === true
          ? "有文件（无时间）"
          : sync.localExists === false
            ? "无文件"
            : "未知（插件未返回 localExists）"
    );
    setText(
      "sync-icloud-at",
      sync.iCloudAvailable === false
        ? "容器不可用"
        : cloudAt
          ? cloudAt
          : sync.iCloudExists === false
            ? "尚无文件"
            : sync.iCloudExists === true
              ? "有文件（无时间）"
              : "未知"
    );

    const label = $("#sync-status-label") || $("#sync-status-text");
    const dot = $("#sync-status-dot");
    const detail = $("#sync-status-detail");
    const native =
      typeof window.Capacitor !== "undefined" &&
      window.Capacitor.isNativePlatform &&
      window.Capacitor.isNativePlatform();

    const setStatus = (summary, tone) => {
      if (label) label.textContent = summary;
      if (dot) {
        dot.classList.remove("ok", "bad", "warn");
        if (tone) dot.classList.add(tone);
      }
    };

    const setDetail = (text) => {
      if (!detail) return;
      const t = text || "";
      detail.textContent = t;
      detail.hidden = !t;
    };

    if (!native) {
      setStatus("网页模式（无 iCloud）", "bad");
      setDetail("请用 iPhone App 验证同步。");
      return { summary: "网页模式" };
    }
    if (sync.plugin === false) {
      setStatus("ICloudDb 插件未就绪", "bad");
      setDetail(
        sync.lastError ||
          "请 Product → Clean Build Folder 后重新 Run。"
      );
      return { summary: "插件未就绪" };
    }

    let summary;
    let tone = "bad";
    if (sync.iCloudAvailable) {
      summary = sync.lastWriteICloud || cloudAt ? "iCloud 可用" : "iCloud 可用（待写入云端文件）";
      tone = "ok";
    } else if (sync.isSimulator) {
      summary = "模拟器：iCloud Documents 通常不可用";
      tone = "warn";
    } else {
      summary = "iCloud 容器不可用（本机仍应能保存）";
      tone = "bad";
    }
    setStatus(summary, tone);
    const bits = [];
    if (sync.iCloudReason) bits.push(String(sync.iCloudReason));
    else if (sync.hasIdentityToken === false && !sync.isSimulator) {
      bits.push("未检测到 iCloud 登录令牌");
    }
    if (sync.lastError) bits.push(`错误：${sync.lastError}`);
    setDetail(bits.join(" · "));
    return {
      summary,
      checked,
      lastWrite,
      localAt,
      cloudAt,
      reason: sync.iCloudReason || null,
    };
  }

  async function refreshSyncStatus(showMsg) {
    const label = $("#sync-status-label") || $("#sync-status-text");
    if (!label && !$("#sync-time-list")) return;
    try {
      let sync = {};
      try {
        const st = await api("/api/persistence/status");
        sync = { ...(st && st.sync) };
      } catch (err) {
        sync.lastError = String(err && err.message ? err.message : err);
      }
      const nativeSt = await readNativeSyncStatus();
      sync = { ...sync, ...nativeSt };
      const view = applySyncStatus(sync);
      if (showMsg) {
        const parts = [
          view.checked ? `检查 ${view.checked}` : null,
          view.lastWrite ? `写入 ${view.lastWrite}` : null,
          view.localAt ? `本机 ${view.localAt}` : null,
          view.cloudAt ? `iCloud ${view.cloudAt}` : null,
          view.reason ? view.reason : view.summary,
        ].filter(Boolean);
        flashMsg(
          $("#sync-settings-msg"),
          parts.length ? parts.join(" · ") : "状态已刷新（无时间戳）"
        );
      }
    } catch (ex) {
      if ($("#sync-status-label")) {
        $("#sync-status-label").textContent = "无法读取同步状态";
      } else if (label) {
        label.textContent = "无法读取同步状态";
      }
      const dot = $("#sync-status-dot");
      if (dot) {
        dot.classList.remove("ok", "warn");
        dot.classList.add("bad");
      }
      setText("sync-checked-at", "错误");
      flashMsg($("#sync-settings-msg"), ex.message || "刷新失败");
    }
  }

  function ensureImportSettings(afterEl) {
    // Dev/debug only — not shown in normal builds.
    if (!window.__MYTIMETREE_SHOW_IMPORT__) {
      const existing = $("#import-settings");
      if (existing) existing.remove();
      return;
    }
    if ($("#import-settings")) return;
    const box = document.createElement("div");
    box.id = "import-settings";
    box.className = "import-settings";
    box.innerHTML = `
      <h3 class="security-title">从电脑导入</h3>
      <p class="security-note">
        选择桌面版数据目录里的 <code>mytimetree.db</code>
        （通常在 <code>.local-data/mytimetree.db</code>）。
        将<strong>覆盖</strong>本机全部数据；导入后需用电脑端家长密码重新解锁。
        暂不支持仅导入 <code>backup_*.json</code>。
      </p>
      <label class="import-file-label">
        选择 mytimetree.db
        <input type="file" id="import-db-file" accept=".db,.sqlite,application/octet-stream,application/x-sqlite3" />
      </label>
      <label>当前家长密码（确认覆盖）
        <input type="password" id="import-confirm-password" minlength="4" autocomplete="current-password" />
      </label>
      <button type="button" class="btn" id="import-db-btn">导入并覆盖</button>
      <p id="import-settings-msg" class="msg" hidden></p>
    `;
    if (afterEl && afterEl.parentNode) {
      afterEl.parentNode.insertBefore(box, afterEl.nextSibling);
    }

    $("#import-db-btn").addEventListener("click", async () => {
      const msg = $("#import-settings-msg");
      const input = $("#import-db-file");
      const file = input && input.files && input.files[0];
      const password = String(($("#import-confirm-password") || {}).value || "");
      if (!file) {
        flashMsg(msg, "请先选择 mytimetree.db 文件");
        return;
      }
      if (!password) {
        flashMsg(msg, "请输入当前家长密码以确认覆盖");
        return;
      }
      const ok = window.confirm(
        `确定用「${file.name}」覆盖本机全部数据？此操作不可撤销。`
      );
      if (!ok) return;
      try {
        flashMsg(msg, "正在导入…");
        const buf = await file.arrayBuffer();
        const result = await window.MyTimeTreeLocal.importSqliteBytes(buf, {
          confirm: true,
          password,
        });
        flashMsg(
          msg,
          `已导入 ${result.account_count} 个账户（${Math.round(result.bytes / 1024)} KB）。即将锁屏…`
        );
        setTimeout(() => {
          location.reload();
        }, 600);
      } catch (ex) {
        flashMsg(msg, ex.message || "导入失败");
      }
    });
  }

  async function refreshFaceIdToggle() {
    const box = $("#faceid-enabled");
    if (!box) return;
    try {
      const st = await api("/api/auth/faceid");
      box.checked = Boolean(st.enabled);
      const hint = $("#faceid-settings-hint");
      const avail = await biometryAvailable();
      if (hint && !avail) {
        hint.hidden = false;
        hint.textContent =
          "当前检测不到 Face ID。模拟器：Features → Face ID → Enrolled，然后再开此开关。";
      }
    } catch {
      /* locked */
    }
  }

  async function biometryAvailable() {
    const bio = plugin("NativeBiometric");
    if (!bio || typeof bio.isAvailable !== "function") return false;
    try {
      const r = await bio.isAvailable({ useFallback: false });
      return Boolean(r && r.isAvailable);
    } catch (e) {
      console.warn("[lock] isAvailable", e);
      return false;
    }
  }

  async function tryFaceId(fromButton) {
    const bio = plugin("NativeBiometric");
    const errEl = $("#app-lock-error");
    const hint = $("#app-lock-face-hint");
    if (!bio) {
      setErr(
        errEl,
        "未找到 Face ID 插件。请重新 Run 一次工程；模拟器还需 Features → Face ID → Enrolled"
      );
      return false;
    }
    try {
      const pref = await api("/api/auth/faceid");
      if (!pref.enabled) {
        setErr(
          errEl,
          "尚未启用 Face ID。请先用密码解锁，按提示开启；或在设置中打开。"
        );
        return false;
      }
      const avail = await biometryAvailable();
      if (!avail) {
        setErr(
          errEl,
          "Face ID 不可用。模拟器：Features → Face ID → Enrolled，然后再点按钮；出现系统弹窗后选 Matching Face"
        );
        if (hint) {
          hint.hidden = false;
          hint.textContent =
            "提示：要先点「使用 Face ID 解锁」弹出系统框，再选 Matching Face";
        }
        return false;
      }
      await bio.verifyIdentity({
        reason: "解锁 MyTimeTree",
        title: "家长验证",
        subtitle: "使用 Face ID 解锁",
        description: "验证通过后可管理时间树",
        negativeButtonText: "使用密码",
        useFallback: false,
      });
      window.MyTimeTreeLocal.unlockSession();
      await afterUnlock({
        faceid_optin_done: true,
        faceid_enabled: true,
      });
      return true;
    } catch (ex) {
      console.warn("[lock] Face ID failed", ex);
      if (fromButton) {
        const code = ex && (ex.code || ex.errorCode);
        const msg = String((ex && ex.message) || "");
        if (/cancel|Cancel|16|11|15/i.test(msg + code)) {
          setErr(errEl, "");
        } else {
          setErr(errEl, "Face ID 未通过，请输入家长密码，或再试 Matching Face");
        }
      }
      return false;
    }
  }

  async function updateFaceButton() {
    if (!faceBtn) return;
    const avail = await biometryAvailable();
    let faceOn = false;
    try {
      faceOn = (await api("/api/auth/faceid")).enabled;
    } catch {
      /* ignore */
    }
    const hint = $("#app-lock-face-hint");
    faceBtn.hidden = false;
    faceBtn.disabled = false;
    if (!plugin("NativeBiometric")) {
      faceBtn.textContent = "Face ID（插件未就绪）";
      if (hint) {
        hint.hidden = false;
        hint.textContent = "请重新编译运行 App 后再试";
      }
    } else if (!avail) {
      faceBtn.textContent = "使用 Face ID 解锁";
      if (hint) {
        hint.hidden = false;
        hint.textContent =
          "模拟器请先 Features → Face ID → Enrolled，再点此按钮；弹出后再 Matching Face";
      }
    } else if (!faceOn) {
      faceBtn.textContent = "使用 Face ID 解锁";
      if (hint) {
        hint.hidden = false;
        hint.textContent = "尚未启用：先密码解锁并选择启用，或在设置中打开";
      }
    } else {
      faceBtn.textContent = "使用 Face ID 解锁";
      if (hint) hint.hidden = true;
      setTimeout(() => tryFaceId(false), 400);
    }
  }

  async function showLock() {
    ensureLockDom();
    const lock = $("#app-lock");
    lock.hidden = false;
    document.documentElement.classList.add("is-locked");
    showMainLockPanel();
    await updateFaceButton();
  }

  async function evaluateLock() {
    await window.MyTimeTreeLocal.init();
    const st = await api("/api/auth/status");
    if (!st.has_accounts) {
      window.MyTimeTreeLocal.unlockSession();
      clearLockOverlay();
      return;
    }
    if (st.locked) {
      await showLock();
    } else {
      clearLockOverlay();
      await refreshFaceIdToggle();
      await refreshSyncStatus(false);
    }
  }

  function wireAppLifecycle() {
    const App = plugin("App");
    if (!App || typeof App.addListener !== "function") return;
    App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        backgroundAt = Date.now();
        if (
          window.MyTimeTreeLocal &&
          typeof window.MyTimeTreeLocal.flushPersist === "function"
        ) {
          window.MyTimeTreeLocal.flushPersist().catch((err) => {
            console.warn("[lock] background flush failed", err);
          });
        }
        return;
      }
      const elapsed = Date.now() - backgroundAt;
      if (backgroundAt && elapsed >= BACKGROUND_LOCK_MS) {
        window.MyTimeTreeLocal.lockSession();
        evaluateLock();
      }
      backgroundAt = 0;
    });
  }

  function ensureOnboardingRecoveryFields() {
    const form = $("#onboarding-form");
    if (!form) return;
    if (!form.querySelector('[name="recovery_question"]')) {
      const pwd = form.querySelector('input[name="password"]');
      if (!pwd) return;
      const wrap = document.createElement("div");
      wrap.className = "stack recovery-onboard";
      wrap.innerHTML = `
        <label>安全问题（忘记密码时用）
          <select name="recovery_question" required>
            <option value="你母亲的姓名是？">你母亲的姓名是？</option>
            <option value="你就读的小学叫什么？">你就读的小学叫什么？</option>
            <option value="你喜欢的一本书是？">你喜欢的一本书是？</option>
            <option value="你喜欢的一部电影是？">你喜欢的一部电影是？</option>
          </select>
        </label>
        <label>安全问题答案
          <textarea name="recovery_answer" rows="1" lang="zh-CN" enterkeyhint="done" required minlength="2" placeholder="请牢记答案（建议不用《》书名号）" autocomplete="off" spellcheck="false"></textarea>
        </label>
      `;
      pwd.closest("label").after(wrap);
    }
    // Prefer textarea + lang=zh-CN; avoid autocapitalize/autocorrect=off (iOS may lock Latin keyboard after 《).
    const answer = form.querySelector('[name="recovery_answer"]');
    if (answer) {
      answer.setAttribute("lang", "zh-CN");
      answer.setAttribute("autocomplete", "off");
      answer.setAttribute("spellcheck", "false");
      answer.setAttribute("enterkeyhint", "done");
    }
    enhanceQuestionPickers(form);
  }

  function enhanceQuestionPickers(root) {
    (root || document)
      .querySelectorAll('select[name="recovery_question"]')
      .forEach((sel) => {
        if (sel.dataset.pickerReady) return;
        sel.dataset.pickerReady = "1";
        sel.classList.add("sr-only-select");
        sel.setAttribute("aria-hidden", "true");
        sel.tabIndex = -1;
        // Keep in form for FormData but hide native UI
        sel.style.position = "absolute";
        sel.style.opacity = "0";
        sel.style.pointerEvents = "none";
        sel.style.width = "1px";
        sel.style.height = "1px";

        const picker = document.createElement("div");
        picker.className = "question-picker";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "question-picker-btn";
        btn.textContent = sel.value || sel.options[0]?.value || "请选择";
        const list = document.createElement("ul");
        list.className = "question-picker-list";
        list.hidden = true;
        [...sel.options].forEach((opt) => {
          const li = document.createElement("li");
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = opt.textContent;
          b.setAttribute(
            "aria-selected",
            opt.value === sel.value ? "true" : "false"
          );
          b.addEventListener("click", () => {
            sel.value = opt.value;
            btn.textContent = opt.textContent;
            list.hidden = true;
            list.querySelectorAll("button").forEach((x) => {
              x.setAttribute(
                "aria-selected",
                x.textContent === opt.textContent ? "true" : "false"
              );
            });
            sel.dispatchEvent(new Event("change", { bubbles: true }));
          });
          li.appendChild(b);
          list.appendChild(li);
        });
        btn.addEventListener("click", () => {
          list.hidden = !list.hidden;
        });
        document.addEventListener("click", (ev) => {
          if (!picker.contains(ev.target)) list.hidden = true;
        });
        picker.appendChild(btn);
        picker.appendChild(list);
        sel.insertAdjacentElement("afterend", picker);
      });
  }

  function patchOnboardingSubmit() {
    const form = $("#onboarding-form");
    if (!form || form.dataset.recoveryPatched) return;
    form.dataset.recoveryPatched = "1";
    // Capture phase: enrich payload via monkey-patch of FormData usage is hard;
    // replace listener by intercepting submit before app.js... app.js already bound.
    // Instead wrap openAccount path: listen submit in capture and stash fields on form dataset
    // Actually app.js only sends name/password/rate — patch window.fetch? Better patch form submit capture
    // and temporarily override FormData? Simplest: patch MyTimeTreeLocal.handle for POST /api/accounts
  }

  function wireAccountsPayloadEnrichment() {
    const L = window.MyTimeTreeLocal;
    if (!L || L.__recoveryWrapped) return;
    L.__recoveryWrapped = true;
    const orig = L.handle.bind(L);
    L.handle = async function (url, init) {
      const u = String(url);
      const method = ((init && init.method) || "GET").toUpperCase();
      if (u.includes("/api/accounts") && method === "POST" && init && init.body) {
        try {
          const body = JSON.parse(init.body);
          const form = $("#onboarding-form");
          if (form) {
            const fd = new FormData(form);
            if (!body.recovery_question) {
              body.recovery_question = String(fd.get("recovery_question") || "");
            }
            if (!body.recovery_answer) {
              body.recovery_answer = String(fd.get("recovery_answer") || "");
            }
            init = { ...init, body: JSON.stringify(body) };
          }
        } catch {
          /* ignore */
        }
      }
      return orig(url, init);
    };
  }

  async function bootLock() {
    if (!window.MyTimeTreeLocal) return;
    document.documentElement.classList.add("is-locked");
    ensureLockDom();
    ensureOnboardingRecoveryFields();
    ensureSettingsSecurity();
    wireAccountsPayloadEnrichment();
    wireAppLifecycle();
    // Re-inject when user opens 设置 (covers late DOM / cached partial UI).
    document.querySelectorAll('.tab[data-tab="settings"]').forEach((btn) => {
      if (btn.dataset.syncInjectWired) return;
      btn.dataset.syncInjectWired = "1";
      btn.addEventListener("click", () => {
        ensureSettingsSecurity();
        refreshSyncStatus(false).catch(() => {});
      });
    });
    await evaluateLock();
    console.info("[MyTimeTree] lock UI ready", {
      bio: Boolean(plugin("NativeBiometric")),
      version: (window.MyTimeTreeLocal && window.MyTimeTreeLocal.version) || "?",
      hasRestore: typeof window.MyTimeTreeLocal.restoreFromICloud === "function",
      plugins: window.Capacitor && window.Capacitor.Plugins
        ? Object.keys(window.Capacitor.Plugins)
        : [],
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      bootLock().catch((e) => console.error("[lock]", e));
    });
  } else {
    bootLock().catch((e) => console.error("[lock]", e));
  }

  window.MyTimeTreeLock = {
    evaluateLock,
    showLock,
    tryFaceId,
  };
})();
