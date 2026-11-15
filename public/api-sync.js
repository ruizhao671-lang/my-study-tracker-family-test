import {
  getAccountCacheKey,
  getAccountMetaKey,
  makeEmptyState,
  shouldUploadLocal
} from "./cloud-core.js";

const API_SAFE_BYTES = 2 * 1024 * 1024;
const GUEST_CACHE_KEY = "study-tracker-online-guest-v1";
const SESSION_KEY = "study-tracker-api-session-v1";
const LANGUAGE_KEY = "study-tracker-language-v1";
const viewShareToken = new URLSearchParams(location.search).get("view");
const readOnly = Boolean(viewShareToken);

let currentUser = null;
let workspaceMeta = null;
let loadingRemote = false;
let saveTimer = null;
let bridge = window.studyTrackerBridge || null;
let previousUserId = null;
let pendingInitialState = null;
let authEpoch = 0;
let readOnlyObserver = null;
let pendingCloudChanges = false;
let changeRevision = 0;

const ui = createCloudUI();

window.addEventListener("beforeunload", event => {
  if (!currentUser || readOnly || !pendingCloudChanges) return;
  event.preventDefault();
  event.returnValue = "";
});

window.studyCloud = {
  ...window.studyCloud,
  isReadOnly: () => readOnly,
  degreeAccountId: () => currentUser?.uid || "",
  importDegreeSource: body => api("/api/degree/import", { method: "POST", body }),
  queueSave(nextState) {
    if (readOnly || loadingRemote || !currentUser) return;
    const userId = currentUser.uid;
    pendingCloudChanges = true;
    changeRevision += 1;
    cacheAccountState(userId, nextState);
    writeLocalMeta(userId, { userId, updatedAt: Date.now() });
    setStatus("已保存到本机，正在同步云端…", "syncing");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveCloudState(nextState, false, userId), 900);
  }
};

window.studyCloud.initialWorkspace = start();

async function start() {
  bridge = bridge || await waitForBridge();

  try {
    await api("/api/health", { authenticated: false });
  } catch {
    ui.shell.dataset.mode = "setup";
    ui.title.textContent = "FastAPI 后端尚未启动";
    setStatus("你的内容仍会保存在当前浏览器。启动测试后端后，账号、同步和家人分享才会启用。", "setup");
    ui.authBtn.hidden = true;
    ui.shareBtn.hidden = true;
    ui.signOutBtn.hidden = true;
    ui.setupBtn.hidden = false;
    return;
  }

  if (readOnly) {
    await loadReadOnlyWorkspace(viewShareToken);
    return;
  }

  const token = localStorage.getItem(SESSION_KEY);
  if (!token) {
    await handleAuthChange(null);
    return;
  }

  try {
    const result = await api("/api/auth/me");
    await handleAuthChange({ uid: result.user.id, email: result.user.email });
  } catch {
    localStorage.removeItem(SESSION_KEY);
    await handleAuthChange(null);
  }
}

function waitForBridge() {
  return new Promise(resolve => {
    window.addEventListener("study-tracker-ready", () => resolve(window.studyTrackerBridge), { once: true });
  });
}

async function handleAuthChange(user, options = {}) {
  const epoch = ++authEpoch;
  clearTimeout(saveTimer);
  loadingRemote = false;
  pendingCloudChanges = false;
  currentUser = user;

  if (!user) {
    if (previousUserId) {
      if (options.clearDeviceData) {
        clearAccountLocalData(previousUserId);
      } else {
        cacheAccountState(previousUserId, bridge.getState());
      }
    }
    previousUserId = null;
    window.studyCloud.setActiveUser?.(null);
    if (options.clearDeviceData) {
      clearGuestLocalData();
      bridge.replaceState(makeEmptyState(), { persist: false });
      resetLanguagePreferenceToChinese();
    } else {
      bridge.replaceState(loadGuestState());
    }
    workspaceMeta = null;
    const guestState = bridge.getState();
    const hasGuestContent = Boolean(guestState.ownerName || guestState.semesters?.length);
    setStatus(
      hasGuestContent
        ? "当前测试空间仅保存在这个浏览器。登录后会同步到你的账号空间。"
        : "这是全新的空测试空间。登录或注册后即可开始使用。",
      "local"
    );
    ui.authBtn.hidden = false;
    ui.shareBtn.hidden = true;
    ui.signOutBtn.hidden = true;
    ui.account.textContent = "";
    return;
  }

  preserveGuestState();
  previousUserId = user.uid;
  window.studyCloud.setActiveUser?.(user.uid);
  ui.authBtn.hidden = true;
  ui.shareBtn.hidden = false;
  ui.signOutBtn.hidden = false;
  ui.account.textContent = user.email || "";
  setStatus("正在读取你的云端空间…", "syncing");

  try {
    loadingRemote = true;
    const remote = await api("/api/workspace");
    if (!isActiveSession(user.uid, epoch)) return;
    const cachedState = loadAccountState(user.uid);

    if (remote.state) {
      workspaceMeta = remote;
      const localMeta = readLocalMeta(user.uid);
      const localIsNewer = Boolean(cachedState)
        && shouldUploadLocal(localMeta, user.uid, remote.clientUpdatedAt);

      if (pendingInitialState) {
        const importedState = pendingInitialState;
        pendingInitialState = null;
        bridge.replaceState(importedState);
        await saveCloudState(importedState, true, user.uid);
        if (!isActiveSession(user.uid, epoch)) return;
        setStatus("已把当前浏览器内容导入新账号并同步。", "online");
      } else if (localIsNewer) {
        bridge.replaceState(cachedState);
        await saveCloudState(cachedState, true, user.uid);
        if (!isActiveSession(user.uid, epoch)) return;
        setStatus("已把离线期间的本地修改同步到云端。", "online");
      } else {
        bridge.replaceState(remote.state);
        cacheAccountState(user.uid, remote.state);
        writeLocalMeta(user.uid, {
          userId: user.uid,
          updatedAt: Number(remote.clientUpdatedAt || Date.now())
        });
        setStatus("已连接云端，之后的修改会自动同步。", "online");
      }
    } else {
      workspaceMeta = { shareEnabled: false };
      const firstState = cachedState || pendingInitialState || makeEmptyState();
      pendingInitialState = null;
      bridge.replaceState(firstState);
      await saveCloudState(bridge.getState(), true, user.uid);
      if (!isActiveSession(user.uid, epoch)) return;
      setStatus("已创建你的云端空间，之后的修改会自动同步。", "online");
    }
  } catch (error) {
    console.error(error);
    setStatus("读取云端数据失败。本地内容仍然安全，请检查网络或权限设置。", "error");
  } finally {
    if (epoch === authEpoch) loadingRemote = false;
  }
}

async function saveCloudState(nextState, force = false, expectedUserId = currentUser?.uid) {
  if ((!force && (readOnly || loadingRemote)) || !expectedUserId || currentUser?.uid !== expectedUserId) return;

  const savingRevision = changeRevision;
  const serialized = JSON.stringify(nextState);
  const bytes = new Blob([serialized]).size;
  if (bytes > API_SAFE_BYTES) {
    pendingCloudChanges = true;
    setStatus("暂未同步云端：内容过大，请减少较大的附件。", "error");
    return;
  }

  try {
    const clientUpdatedAt = Date.now();
    setStatus("本机已保存，正在同步云端…", "syncing");
    const result = await api("/api/workspace", {
      method: "PUT",
      body: { state: nextState, client_updated_at: clientUpdatedAt }
    });
    if (currentUser?.uid !== expectedUserId) return;
    workspaceMeta = { ...workspaceMeta, state: nextState, clientUpdatedAt: result.clientUpdatedAt };
    cacheAccountState(expectedUserId, nextState);
    writeLocalMeta(expectedUserId, { userId: expectedUserId, updatedAt: clientUpdatedAt });
    if (savingRevision === changeRevision) {
      pendingCloudChanges = false;
      setStatus(`已同步到云端 · ${formatSyncTime(new Date())}`, "online");
    }
  } catch (error) {
    console.error(error);
    pendingCloudChanges = true;
    setStatus("暂未同步云端，请保持页面打开并检查网络。", "error");
  }
}

async function loadReadOnlyWorkspace(workspaceId) {
  ui.authBtn.hidden = true;
  ui.shareBtn.hidden = true;
  ui.signOutBtn.hidden = true;
  ui.account.textContent = "只读分享";
  enableReadOnlyMode("家人");
  setStatus("正在打开家人分享的学习进度…", "syncing");

  try {
    const result = await api(`/api/shared/${encodeURIComponent(workspaceId)}`, { authenticated: false });
    workspaceMeta = result;
    bridge.replaceState(result.state, { persist: false });
    enableReadOnlyMode(result.state.ownerName || "家人");
    setStatus("这是只读分享页面。你可以查看进度，但不能修改学习内容。", "readonly");
  } catch (error) {
    console.error(error);
    setStatus("无法打开这个分享页面。链接可能已被撤回。", "error");
  }
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (options.authenticated !== false) {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) throw new Error("not_authenticated");
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.detail || "request_failed");
    error.code = result.detail || "request_failed";
    throw error;
  }
  return result;
}

function enableReadOnlyMode(ownerName) {
  document.body.classList.add("cloud-readonly");
  document.title = `${ownerName}的学习进度（只读）`;
  ui.title.textContent = `${ownerName}分享的学习进度`;
  ui.shell.dataset.mode = "readonly";

  const apply = () => {
    const allowedIds = new Set([
      "listViewBtn",
      "chartViewBtn",
      "gardenViewBtn",
      "systemPanelBtn",
      "timerPanelBtn",
      "timerPrevMonthBtn",
      "timerNextMonthBtn",
      "timerCloseDayBtn"
    ]);
    const allowedActions = new Set([
      "toggle-semester",
      "toggle-semester-info",
      "toggle-course",
      "toggle-course-info",
      "toggle-category",
      "toggle-category-info",
      "toggle-task-details",
      "select-timer-date",
      "select-calendar-item"
    ]);

    document.querySelectorAll("button, input, textarea, select").forEach(control => {
      if (control.closest(".cloud-shell")) return;
      const allowed = allowedIds.has(control.id) || allowedActions.has(control.dataset.action);
      control.disabled = !allowed;
    });
  };

  apply();
  if (!readOnlyObserver) {
    readOnlyObserver = new MutationObserver(apply);
    readOnlyObserver.observe(document.body, { childList: true, subtree: true });
  }
}

function createCloudUI() {
  const style = document.createElement("style");
  style.textContent = `
    .cloud-shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      margin-bottom: 18px;
      padding: 14px 16px;
      border: 1px solid #cbded8;
      border-radius: 8px;
      background: #f4faf8;
      color: #25463d;
      box-sizing: border-box;
    }
    .cloud-shell [hidden] { display: none !important; }
    .cloud-copy { display: grid; gap: 3px; min-width: 0; }
    .cloud-copy strong { font-size: 15px; }
    .cloud-status { margin: 0; color: #55756c; font-size: 13px; line-height: 1.5; }
    .cloud-status[data-kind="error"] { color: #8b4f58; }
    .cloud-status[data-kind="online"] { color: #32705e; }
    .cloud-status[data-kind="setup"] { color: #42655c; }
    .cloud-shell[data-mode="setup"] {
      border-color: #b8d2ca;
      background: #eef7f4;
    }
    .cloud-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    .cloud-account { width: 100%; text-align: right; color: #55756c; font-size: 12px; }
    .cloud-dialog-backdrop {
      position: fixed; inset: 0; z-index: 1000; display: none; place-items: center;
      padding: 20px; background: rgba(31, 50, 45, .38);
    }
    .cloud-dialog-backdrop.open { display: grid; }
    .cloud-dialog {
      width: min(460px, 100%); display: grid; gap: 15px; padding: 22px;
      border: 1px solid #cbded8; border-radius: 8px; background: #fff;
      box-shadow: 0 18px 50px rgba(31, 50, 45, .18);
    }
    .cloud-dialog h2, .cloud-dialog p { margin: 0; }
    .cloud-setup-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .cloud-setup-step {
      display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 10px; align-items: start;
      padding: 11px 12px; border: 1px solid #d7e6e1; border-radius: 7px; background: #f8fbfa;
    }
    .cloud-setup-number {
      display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%;
      background: #dcece7; color: #315f52; font-weight: 800; font-size: 13px;
    }
    .cloud-setup-step strong { display: block; margin-bottom: 3px; font-size: 14px; }
    .cloud-setup-step p { color: #55756c; font-size: 13px; line-height: 1.5; }
    .cloud-setup-note {
      padding: 10px 12px; border-left: 3px solid #79a99a; background: #f4faf8;
      color: #42655c; font-size: 13px; line-height: 1.6;
    }
    .cloud-field { display: grid; gap: 6px; }
    .cloud-field label { font-weight: 700; font-size: 13px; }
    .cloud-dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    .cloud-link-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
    .cloud-readonly .toolbar, .cloud-readonly .history-actions, .cloud-readonly .name-edit {
      display: none !important;
    }
    .cloud-readonly .course-add,
    .cloud-readonly .category-add,
    .cloud-readonly .quick-add,
    .cloud-readonly .entity-extra,
    .cloud-readonly .task-extra,
    .cloud-readonly .paste-zone,
    .cloud-readonly .actions button {
      display: none !important;
    }
    .cloud-readonly .timer-card,
    .cloud-readonly .timer-focus-plan,
    .cloud-readonly .timer-calendar-actions,
    .cloud-readonly #addManualSessionBtn {
      display: none !important;
    }
    .cloud-readonly .timer-layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .cloud-readonly .actions button[data-action="toggle-semester"],
    .cloud-readonly .actions button[data-action="toggle-course"],
    .cloud-readonly .actions button[data-action="toggle-category"] {
      display: inline-flex !important;
    }
    .cloud-readonly :disabled { cursor: default; opacity: .62; }
    @media (max-width: 760px) {
      .cloud-shell { grid-template-columns: 1fr; }
      .cloud-actions { justify-content: flex-start; }
      .cloud-account { text-align: left; }
      .cloud-link-row { grid-template-columns: 1fr; }
      .dialog, .cloud-dialog {
        width: calc(100vw - 32px);
        max-width: calc(100vw - 32px);
        box-sizing: border-box;
      }
    }
  `;
  document.head.appendChild(style);

  const shell = document.createElement("section");
  shell.className = "cloud-shell";
  shell.innerHTML = `
    <div class="cloud-copy">
      <strong class="cloud-title">联网测试版</strong>
      <p class="cloud-status" data-kind="local">正在准备云端连接…</p>
    </div>
    <div class="cloud-actions">
      <span class="cloud-account"></span>
      <button class="btn cloud-setup-btn" type="button" hidden>连接云端</button>
      <button class="btn secondary cloud-auth-btn" type="button">登录 / 注册</button>
      <button class="btn secondary cloud-share-btn" type="button" hidden>家人只读分享</button>
      <button class="btn secondary cloud-signout-btn" type="button" hidden>退出登录</button>
    </div>
  `;
  document.querySelector("main.app").prepend(shell);

  const authDialog = document.createElement("div");
  authDialog.className = "cloud-dialog-backdrop";
  authDialog.innerHTML = `
    <form class="cloud-dialog cloud-auth-form">
      <h2>登录云端空间</h2>
      <p class="cloud-status">第一次使用可以直接注册。登录后，你的修改会自动同步。</p>
      <div class="cloud-field">
        <label for="cloudEmail">邮箱</label>
        <input class="input" id="cloudEmail" name="email" type="email" autocomplete="email" required>
      </div>
      <div class="cloud-field">
        <label for="cloudPassword">密码</label>
        <input class="input" id="cloudPassword" name="password" type="password" autocomplete="current-password" minlength="8" required>
      </div>
      <div class="cloud-field">
        <label for="cloudInviteCode">邀请码（仅注册需要）</label>
        <input class="input" id="cloudInviteCode" name="inviteCode" type="password" autocomplete="off">
      </div>
      <label class="cloud-field">
        <span><input name="importGuest" type="checkbox"> 注册新账号时，把当前浏览器里的内容带入新账号</span>
      </label>
      <p class="cloud-status cloud-auth-error" data-kind="error"></p>
      <div class="cloud-dialog-actions">
        <button class="btn secondary cloud-close-auth" type="button">取消</button>
        <button class="btn secondary cloud-reset-password" type="button">忘记密码</button>
        <button class="btn secondary" type="submit" data-mode="register">注册新账号</button>
        <button class="btn" type="submit" data-mode="login">登录</button>
      </div>
    </form>
  `;
  document.body.appendChild(authDialog);

  const shareDialog = document.createElement("div");
  shareDialog.className = "cloud-dialog-backdrop";
  shareDialog.innerHTML = `
    <section class="cloud-dialog">
      <h2>家人只读分享</h2>
      <p class="cloud-status">只有拿到链接的人可以查看。家人不能修改内容，你也可以随时撤回链接。</p>
      <label class="cloud-field">
        <span>分享状态</span>
        <select class="input cloud-share-state">
          <option value="false">关闭分享</option>
          <option value="true">开启只读分享</option>
        </select>
      </label>
      <div class="cloud-link-row">
        <input class="input cloud-share-link" readonly aria-label="只读分享链接">
        <button class="btn secondary cloud-copy-link" type="button">复制链接</button>
      </div>
      <p class="cloud-status cloud-share-hint"></p>
      <div class="cloud-dialog-actions">
        <button class="btn cloud-close-share" type="button">完成</button>
      </div>
    </section>
  `;
  document.body.appendChild(shareDialog);

  const signOutDialog = document.createElement("div");
  signOutDialog.className = "cloud-dialog-backdrop";
  signOutDialog.innerHTML = `
    <section class="cloud-dialog">
      <h2>退出登录</h2>
      <p class="cloud-status">退出前会先把最后修改同步到云端。请选择是否保留这个账号在当前浏览器中的本地缓存。</p>
      <div class="cloud-dialog-actions">
        <button class="btn secondary cloud-close-signout" type="button">取消</button>
        <button class="btn secondary cloud-signout-keep" type="button">退出登录</button>
        <button class="btn cloud-signout-clear" type="button">退出并清除此设备数据</button>
      </div>
    </section>
  `;
  document.body.appendChild(signOutDialog);

  const setupDialog = document.createElement("div");
  setupDialog.className = "cloud-dialog-backdrop";
  setupDialog.innerHTML = `
    <section class="cloud-dialog">
      <h2>把测试版连接到互联网</h2>
      <p class="cloud-status">网页功能已经准备好了。当前需要启动我们自己的 FastAPI 后端；发布后才会变成其他设备可访问的网址。</p>
      <ol class="cloud-setup-list">
        <li class="cloud-setup-step">
          <span class="cloud-setup-number">1</span>
          <div><strong>本机测试 FastAPI</strong><p>先检查账号隔离、自动保存和只读分享，测试数据库保存在项目目录外的私有数据文件中。</p></div>
        </li>
        <li class="cloud-setup-step">
          <span class="cloud-setup-number">2</span>
          <div><strong>选择免费测试服务器</strong><p>部署后让中国大陆、德国和其他地区分别实际测试访问速度与稳定性。</p></div>
        </li>
        <li class="cloud-setup-step">
          <span class="cloud-setup-number">3</span>
          <div><strong>再决定正式部署方案</strong><p>测试版不绑定某一家平台，后续可以迁移服务器和 PostgreSQL 数据库。</p></div>
        </li>
      </ol>
      <p class="cloud-setup-note">原来的本地版没有被修改。FastAPI 未启动时，你仍然可以在这里继续试用，内容会保存在当前浏览器。</p>
      <div class="cloud-dialog-actions">
        <button class="btn cloud-close-setup" type="button">知道了</button>
      </div>
    </section>
  `;
  document.body.appendChild(setupDialog);

  const refs = {
    shell,
    title: shell.querySelector(".cloud-title"),
    status: shell.querySelector(".cloud-status"),
    account: shell.querySelector(".cloud-account"),
    setupBtn: shell.querySelector(".cloud-setup-btn"),
    authBtn: shell.querySelector(".cloud-auth-btn"),
    shareBtn: shell.querySelector(".cloud-share-btn"),
    signOutBtn: shell.querySelector(".cloud-signout-btn"),
    authDialog,
    authForm: authDialog.querySelector(".cloud-auth-form"),
    authError: authDialog.querySelector(".cloud-auth-error"),
    setupDialog,
    shareDialog,
    signOutDialog,
    shareState: shareDialog.querySelector(".cloud-share-state"),
    shareLink: shareDialog.querySelector(".cloud-share-link"),
    shareHint: shareDialog.querySelector(".cloud-share-hint")
  };

  refs.setupBtn.addEventListener("click", () => refs.setupDialog.classList.add("open"));
  refs.setupDialog.querySelector(".cloud-close-setup").addEventListener("click", () => refs.setupDialog.classList.remove("open"));
  const openAuthentication = () => {
    refs.authError.textContent = "";
    refs.authDialog.classList.add("open");
    refs.authForm.elements.email.focus();
  };
  refs.authBtn.addEventListener("click", openAuthentication);
  document.querySelector("#welcomeAuthBtn")?.addEventListener("click", openAuthentication);
  refs.authDialog.querySelector(".cloud-close-auth").addEventListener("click", () => refs.authDialog.classList.remove("open"));
  refs.authDialog.querySelector(".cloud-reset-password").addEventListener("click", resetPassword);
  refs.shareDialog.querySelector(".cloud-close-share").addEventListener("click", () => refs.shareDialog.classList.remove("open"));
  refs.signOutBtn.addEventListener("click", () => refs.signOutDialog.classList.add("open"));
  refs.signOutDialog.querySelector(".cloud-close-signout").addEventListener("click", () => refs.signOutDialog.classList.remove("open"));
  refs.signOutDialog.querySelector(".cloud-signout-keep").addEventListener("click", () => signOutSafely(false));
  refs.signOutDialog.querySelector(".cloud-signout-clear").addEventListener("click", () => signOutSafely(true));
  refs.shareBtn.addEventListener("click", openShareDialog);
  refs.shareState.addEventListener("change", changeShareState);
  refs.shareDialog.querySelector(".cloud-copy-link").addEventListener("click", copyShareLink);
  refs.authForm.addEventListener("submit", submitAuth);

  [refs.authDialog, refs.shareDialog, refs.signOutDialog, refs.setupDialog].forEach(backdrop => {
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) backdrop.classList.remove("open");
    });
  });

  return refs;
}

async function submitAuth(event) {
  event.preventDefault();
  const mode = event.submitter?.dataset.mode || "login";
  const email = ui.authForm.elements.email.value.trim();
  const password = ui.authForm.elements.password.value;
  const inviteCode = ui.authForm.elements.inviteCode.value;
  ui.authError.dataset.kind = "error";
  ui.authError.textContent = "";

  try {
    const result = await api(`/api/auth/${mode === "register" ? "register" : "login"}`, {
      method: "POST",
      authenticated: false,
      body: mode === "register"
        ? { email, password, invite_code: inviteCode }
        : { email, password }
    });
    if (mode === "register") {
      pendingInitialState = ui.authForm.elements.importGuest.checked ? bridge.getState() : null;
    } else {
      pendingInitialState = null;
    }
    localStorage.setItem(SESSION_KEY, result.token);
    await handleAuthChange({ uid: result.user.id, email: result.user.email });
    ui.authDialog.classList.remove("open");
    ui.authForm.reset();
  } catch (error) {
    pendingInitialState = null;
    console.error(error);
    ui.authError.textContent = humanizeAuthError(error.code);
  }
}

async function signOutSafely(clearDeviceData = false) {
  if (!currentUser) return;
  const userId = currentUser.uid;
  ui.signOutDialog.querySelectorAll("button").forEach(button => { button.disabled = true; });
  ui.signOutBtn.disabled = true;
  setStatus("正在保存最后的修改并退出…", "syncing");
  try {
    clearTimeout(saveTimer);
    await saveCloudState(bridge.getState(), true, userId);
    await api("/api/auth/logout", { method: "POST" });
    localStorage.removeItem(SESSION_KEY);
    await handleAuthChange(null, { clearDeviceData });
    ui.signOutDialog.classList.remove("open");
    setStatus(
      clearDeviceData
        ? "已退出，并清除当前账号在这台设备上的本地数据。云端数据仍然保留。"
        : "已退出登录。当前账号的本地缓存仍保留在这台设备上。",
      "local"
    );
  } catch (error) {
    console.error(error);
    setStatus("退出失败，本地内容仍然安全，请稍后重试。", "error");
  } finally {
    ui.signOutBtn.disabled = false;
    ui.signOutDialog.querySelectorAll("button").forEach(button => { button.disabled = false; });
  }
}

async function resetPassword() {
  ui.authError.dataset.kind = "setup";
  ui.authError.textContent = "测试版暂未开放邮件重置密码。忘记密码时请联系管理员，正式版再接入邮件服务。";
}

function openShareDialog() {
  const enabled = Boolean(workspaceMeta?.shareEnabled);
  ui.shareState.value = String(enabled);
  ui.shareLink.value = enabled ? buildShareLink() : "";
  ui.shareHint.textContent = enabled ? "链接已开启。你可以把它发给家人。" : "开启后才会生成可访问的链接。";
  ui.shareDialog.classList.add("open");
}

async function changeShareState() {
  if (!currentUser) return;
  const enabled = ui.shareState.value === "true";
  ui.shareState.disabled = true;
  ui.shareHint.textContent = "正在更新分享状态…";

  try {
    await saveCloudState(bridge.getState(), true, currentUser.uid);
    const result = await api("/api/share", { method: "PUT", body: { enabled } });
    workspaceMeta = { ...workspaceMeta, shareEnabled: result.enabled, shareToken: result.token };
    ui.shareLink.value = enabled ? buildShareLink() : "";
    ui.shareHint.textContent = enabled ? "只读链接已开启，可以发给家人。" : "分享已关闭，原链接无法继续查看。";
  } catch (error) {
    console.error(error);
    ui.shareState.value = String(Boolean(workspaceMeta?.shareEnabled));
    ui.shareHint.textContent = "更新失败，请检查网络和后端服务。";
  } finally {
    ui.shareState.disabled = false;
  }
}

async function copyShareLink() {
  if (!ui.shareLink.value) {
    ui.shareHint.textContent = "请先开启只读分享。";
    return;
  }

  try {
    await navigator.clipboard.writeText(ui.shareLink.value);
    ui.shareHint.textContent = "链接已复制。";
  } catch {
    ui.shareLink.select();
    document.execCommand("copy");
    ui.shareHint.textContent = "链接已复制。";
  }
}

function buildShareLink() {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("view", workspaceMeta.shareToken);
  return url.toString();
}

function setStatus(message, kind) {
  ui.status.textContent = message;
  ui.status.dataset.kind = kind;
}

function formatSyncTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function humanizeAuthError(code = "") {
  if (code.includes("email_already_exists")) return "这个邮箱已经注册，请直接登录。";
  if (code.includes("invalid_credentials")) return "邮箱或密码不正确。";
  if (code.includes("invalid_email")) return "请输入正确的邮箱地址。";
  if (code.includes("invalid_invite_code")) return "邀请码不正确，请向邀请你的人确认。";
  if (code.includes("registration_closed")) return "测试版注册暂未开放，请联系邀请你的人。";
  if (code.includes("too_many_attempts")) return "尝试次数较多，请稍后再试。";
  return "操作失败，请检查网络后重试。";
}

function isActiveSession(userId, epoch) {
  return authEpoch === epoch && currentUser?.uid === userId;
}

function readLocalMeta(userId) {
  try {
    return JSON.parse(localStorage.getItem(getAccountMetaKey(userId)) || "{}");
  } catch {
    return {};
  }
}

function writeLocalMeta(userId, meta) {
  try {
    localStorage.setItem(getAccountMetaKey(userId), JSON.stringify(meta));
  } catch {
    // The study data still has its own local save error handling.
  }
}

function cacheAccountState(userId, nextState) {
  try {
    localStorage.setItem(getAccountCacheKey(userId), JSON.stringify(nextState));
  } catch {
    setStatus("账号本地缓存保存失败，附件可能过大。", "error");
  }
}

function loadAccountState(userId) {
  try {
    const saved = localStorage.getItem(getAccountCacheKey(userId));
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function clearAccountLocalData(userId) {
  localStorage.removeItem(getAccountCacheKey(userId));
  localStorage.removeItem(getAccountMetaKey(userId));
}

function clearGuestLocalData() {
  localStorage.removeItem(GUEST_CACHE_KEY);
}

function resetLanguagePreferenceToChinese() {
  localStorage.removeItem(LANGUAGE_KEY);
  window.studyI18n?.setLanguage?.("zh-CN");
}

function loadGuestState() {
  try {
    const saved = localStorage.getItem(GUEST_CACHE_KEY);
    return saved ? JSON.parse(saved) : makeEmptyState();
  } catch {
    return makeEmptyState();
  }
}

function preserveGuestState() {
  try {
    if (localStorage.getItem(GUEST_CACHE_KEY)) return;
    localStorage.setItem(GUEST_CACHE_KEY, JSON.stringify(bridge.getState()));
  } catch {
    // Guest mode still has the main page's normal local save.
  }
}
