import { readFile } from "node:fs/promises";

const files = {
  stable: await readFile("../index.html", "utf8"),
  online: await readFile("./public/index.html", "utf8"),
  bootstrap: await readFile("./public/cloud-bootstrap.js", "utf8"),
  cloud: await readFile("./public/api-sync.js", "utf8"),
  i18n: await readFile("./public/i18n.js", "utf8"),
  core: await readFile("./public/cloud-core.js", "utf8"),
  backend: await readFile("./backend/app.py", "utf8")
};

const inlineScripts = [...files.online.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1])
  .filter(Boolean);
const ids = [...files.online.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
let inlineScriptsParse = true;
try {
  inlineScripts.forEach(script => new Function(script));
} catch {
  inlineScriptsParse = false;
}

const checks = [
  ["稳定版仍使用原存储键", files.stable.includes('const STORAGE_KEY = "study-tracker-state-v2"')],
  ["联网版使用独立存储键", files.online.includes('const STORAGE_KEY = "study-tracker-online-state-v1"')],
  ["联网版启动不回退读取旧通用缓存", !files.online.includes("const saved = localStorage.getItem(STORAGE_KEY)")],
  ["联网版加载 FastAPI 适配层", files.online.includes('type="module" src="api-sync.js"')],
  ["联网版提供中文优先与 English 切换", files.online.includes('src="i18n.js"') && files.i18n.includes('option value="en">English') && files.i18n.includes('LANGUAGE_KEY')],
  ["语言切换不修改用户数据并支持动态界面", files.i18n.includes("MutationObserver") && files.i18n.includes("translateElement(document)")],
  ["语言切换只在翻译确实变化时改写选项并防止无限循环", files.i18n.includes('if (translated !== value) element.textContent = translated;') && files.i18n.includes("finally {")],
  ["英文只读分享窗口不再残留中文说明", files.i18n.includes('"只有拿到链接的人可以查看。家人不能修改内容，你也可以随时撤回链接。": "Only people with the link can view it.')],
  ["顶部阶段工具栏支持英文长文案自动换行", files.online.includes(".toolbar {") && files.online.includes("flex-wrap: wrap;") && files.online.includes(".toolbar #semesterName")],
  ["动态同步时间可以从英文切回中文", files.i18n.includes('[/^Synced to cloud · (.+)$/, "已同步到云端 · $1"]')],
  ["PDF 报告跟随当前界面语言", files.online.includes("window.studyI18n?.translateDocument?.(reportWindow.document)")],
  ["普通用户不再看到本地版内部说明", !files.online.includes("原来的本地版和其中的数据没有被删除") && !files.cloud.includes("原来的本地版和其中的数据没有被删除")],
  ["启动保护层按访客与账号隔离本地缓存", files.online.includes('src="cloud-bootstrap.js"') && files.bootstrap.includes("keyForActiveSpace")],
  ["联网版暴露状态桥接接口", files.online.includes("window.studyTrackerBridge = {")],
  ["云端状态切换会正确关闭或打开名字窗口", files.online.includes("if (state.ownerName)") && files.online.includes("closeWelcomeModal();")],
  ["只读页面不会写入本地学习数据", files.online.includes("window.studyCloud?.isReadOnly?.()")],
  ["只读页面展开收起只刷新显示而不保存或记录历史", files.online.includes("function commitDisclosureChange()") && files.online.includes("if (window.studyCloud?.isReadOnly?.())") && files.online.includes("commitDisclosureChange();")],
  ["只读链接启动时不展示当前浏览器私人数据", files.online.includes("if (READ_ONLY_LINK) return") && files.online.includes("!READ_ONLY_LINK) openWelcomeModal")],
  ["只读链接加载或失效时始终保持只读界面", files.cloud.includes('enableReadOnlyMode("家人")') && files.cloud.includes("readOnlyObserver")],
  ["云端层支持邮箱注册", files.backend.includes('@app.post("/api/auth/register")') && files.cloud.includes('"register" : "login"')],
  ["测试版明确说明暂未开放密码重置", files.cloud.includes("测试版暂未开放邮件重置密码")],
  ["云端层支持自动同步", files.cloud.includes("queueSave(nextState)")],
  ["修改后明确显示本机保存与云端同步状态", files.cloud.includes("已保存到本机，正在同步云端") && files.cloud.includes("已同步到云端 ·")],
  ["存在未同步修改时关闭页面会提醒用户", files.cloud.includes('window.addEventListener("beforeunload"') && files.cloud.includes("pendingCloudChanges")],
  ["云端同步失败会提示保持页面打开", files.cloud.includes("暂未同步云端，请保持页面打开并检查网络")],
  ["云端层保护较新的离线修改", files.cloud.includes("localIsNewer")],
  ["云端层支持只读分享", files.cloud.includes("loadReadOnlyWorkspace")],
  ["后端私人空间接口要求登录身份", files.backend.includes("def get_workspace(user: Any = Depends(current_user))")],
  ["后端保存接口绑定当前登录用户", files.backend.includes("def put_workspace(body: WorkspaceBody, user: Any = Depends(current_user))")],
  ["公开分享使用独立安全副本", files.backend.includes("def shared_state") && files.core.includes("makeSharedState")],
  ["分享副本使用字段白名单并移除备注和附件", files.core.includes("ownerName: sourceState?.ownerName") && files.core.includes('note: ""') && files.core.includes("attachments: []")],
  ["不同账号使用独立本地缓存", files.core.includes("getAccountCacheKey") && files.cloud.includes("cacheAccountState")],
  ["登录与退出会切换本地保存空间", files.cloud.includes("setActiveUser?.(user.uid)") && files.cloud.includes("setActiveUser?.(null)")],
  ["延迟同步绑定原账号，避免切换账号后串写", files.cloud.includes("expectedUserId") && files.cloud.includes("currentUser?.uid !== expectedUserId") && files.cloud.includes("authEpoch")],
  ["退出登录前立即保存最后修改", files.cloud.includes("signOutSafely") && files.cloud.includes("await saveCloudState(bridge.getState(), true, userId)")],
  ["退出时可选择保留或清除当前账号本机缓存", files.cloud.includes("退出并清除此设备数据") && files.cloud.includes("clearAccountLocalData(previousUserId)") && files.cloud.includes("handleAuthChange(null, { clearDeviceData })")],
  ["注册账号默认不导入访客数据且支持明确选择导入", files.cloud.includes('name="importGuest"') && files.cloud.includes("ui.authForm.elements.importGuest.checked")],
  ["联网版内联脚本可以解析", inlineScriptsParse],
  ["联网版静态 HTML 没有重复 ID", duplicateIds.length === 0],
  ["新用户首次进入会同时获得第一学期与考研模块", files.online.includes("function createInitialSemesters()") && files.online.includes(".slice(0, 2)")],
  ["旧版单一示例阶段会被替换且不再生成", files.online.includes("starterContentVersion: 2") && !files.online.includes("function createDemoSemester()")],
  ["考研备考模块默认位于最上方", files.online.includes('const graduateExamIndex = semesters.findIndex') && files.online.indexOf('{ id: uid(), name: "考研备考模块"') < files.online.indexOf('{ id: uid(), name: "我的第一学期"')],
  ["新账号会把首次生成后的真实内容保存到云端", files.cloud.includes("saveCloudState(bridge.getState(), true, user.uid)")],
  ["课程模板与阶段模板入口同时存在", files.online.includes('id="loadTemplateBtn"') && files.online.includes('id="loadSemesterTemplateBtn"')],
  ["学习计时作为独立板块存在并与学习进度记录分开切换", files.online.includes('id="systemPanelBtn"') && files.online.includes("学习进度记录") && files.online.includes('id="timerPanelBtn"') && files.online.includes('id="timerPanel"') && files.online.includes("body.timer-mode .study-system-section")],
  ["学习计时支持开始暂停结束保存和备注", files.online.includes("function startTimer(") && files.online.includes("function pauseTimer()") && files.online.includes("function finishTimer(") && files.online.includes('id="timerNote"')],
  ["学习计时提供月历和当天课表式时间轴", files.online.includes('id="timerCalendarGrid"') && files.online.includes('id="timerDayTimeline"') && files.online.includes("function renderTimerCalendar()") && files.online.includes("function renderTimerDay()")],
  ["学习计时可以可选关联到具体任务并同步完成状态", files.online.includes('id="timerCategory"') && files.online.includes('id="timerTask"') && files.online.includes('id="timerCompleteTask"') && files.online.includes("selection.task.done = true")],
  ["学习计时当天课表可收起并通过点击日期展开", files.online.includes('id="timerCloseDayBtn"') && files.online.includes("function closeTimerDay()") && files.online.includes("state.timer.dayOpen = true") && files.online.includes("timer-day\").hidden")],
  ["学习计时不满一分钟正常保存并按秒显示明细", files.online.includes("function formatDurationWithSeconds") && files.online.includes("Math.max(1, sumSegments") && !files.online.includes("本次计时太短，已取消")],
  ["学习计时不满一分钟记录仍能显示编辑和删除操作", files.online.includes("min-height: 86px;") && files.online.includes("overflow: visible;") && files.online.includes("Math.max(94,") && files.online.includes('data-action="edit-time-session"') && files.online.includes('data-action="delete-time-session"')],
  ["学习计时跨自然日会拆分并显示分段标记", files.online.includes("function splitSegmentByDay") && files.online.includes("partIndex") && files.online.includes("time-part")],
  ["学习计时暂停后会在详情中显示多个学习段", files.online.includes("segments: [{ startAt: now, endAt: null }]") && files.online.includes("function formatSegmentRanges") && files.online.includes("学习段")],
  ["学习计时英文包含新增关联层级与秒级时长规则", files.i18n.includes("Linked task (optional)") && files.i18n.includes("Also mark this task as done after saving") && files.i18n.includes("$1 sec")],
  ["空账号状态包含独立学习计时记录容器", files.core.includes("timer: {") && files.core.includes("sessions: []") && files.core.includes("active: null")],
  ["学习阶段可以保存并使用为模板", files.online.includes('data-action="save-semester-template"') && files.online.includes('data-action="use-semester-template"')],
  ["支持大学学期与备考模块两种类型", files.online.includes('value="semester">大学学期') && files.online.includes('value="module">备考模块')],
  ["课程支持不新增层级的标签字段", files.online.includes("课程标签（可选，例如专业课、公共课）") && files.online.includes('title="课程标签（可选），例如专业课"') && files.core.includes("label: course.label")],
  ["复制粘贴提示会在下一次非复制左击后结束，粘贴后也结束", files.online.includes("if (!appClipboard) return;") && files.online.includes('if (action.startsWith("copy-")) return;') && !files.online.includes('action.startsWith("copy-") || action.startsWith("paste-")')],
  ["新建课程支持填写统一标签并用于批量新增课程", files.online.includes('name="courseLabel"') && files.online.includes("newCourse.label = label")],
  ["考研阶段模板包含五门直接并列课程", ["模电", "数电", "数学", "英语", "政治"].every(name => files.online.includes(`createLabeledCourse("${name}"`))],
  ["新建阶段放在底部且新建课程放在顶部", files.online.includes("state.semesters.push(...names.map") && files.online.includes("semester.courses.unshift(...names.map")],
  ["分类层级支持备注、附件、折叠与只读分享脱敏", files.online.includes('data-action="update-category-note"') && files.online.includes('data-action="add-category-attachment"') && files.online.includes('data-action="toggle-category-info"') && files.online.includes("renderAttachments(categoryEl.querySelector(\".attachments\"), category, \"category\")") && files.online.includes("category.attachments = Array.isArray(category.attachments)") && files.core.includes("attachments: []")],
  ["学习计时支持作息时间、休息提醒和临时延长", files.online.includes('id="timerDayStart"') && files.online.includes('id="restModal"') && files.online.includes("function checkRestReminder()") && files.online.includes("dailyExtensions")],
  ["学习计时作息标签使用开启一天和睡觉觉文案", files.online.includes("开启一天的时间") && files.online.includes("睡觉觉时间") && !files.online.includes(">课表开始时间</label>") && !files.online.includes(">休息提醒时间</label>")],
  ["休息提醒会覆盖结束时间之后和开始时间之前", files.online.includes("function getRestReminderState()") && files.online.includes("nowMinute >= scheduleEndMinute || isBeforeStart") && files.online.includes('"before-start"')],
  ["学习计时支持按学习阶段设置每日目标和专注学习天数", files.online.includes('id="focusDailyGoalHours"') && files.online.includes('id="focusSemester"') && files.online.includes('id="focusStartDate"') && files.online.includes('id="focusEndDate"') && files.online.includes("function countFocusedDays")],
  ["专注学习计划位于日历侧栏并突出展示专注天数", files.online.includes('class="timer-side"') && files.online.indexOf('class="timer-calendar"') < files.online.indexOf('class="timer-focus-plan"') && files.online.includes("font-size: 24px") && files.online.indexOf('id="timerPauseLimit"') < files.online.indexOf('id="focusDailyGoalHours"')],
  ["每日学习目标使用目标历史，今天修改只影响今天和未来", files.online.includes("targetHistory") && files.online.includes("function setFocusDailyGoal") && files.online.includes("compareDateKeys(entry.fromDate, fromDate) < 0")],
  ["超出作息时间开始计时会先弹休息提醒，用户确认继续后才启动", files.online.includes("pendingTimerStartAfterRest") && files.online.includes("openPreStartRestModal()") && files.online.includes("startTimer({ skipRestCheck: true })")],
  ["学习计时暂停有倒计时，到期自动保存", files.online.includes('id="timerPauseLimit"') && files.online.includes("pauseDeadlineAt") && files.online.includes("finishTimer();") && files.online.includes("已暂停 · 暂停倒计时")],
  ["暂停倒计时默认十五分钟并滚动选择一到六十分钟", files.online.includes('<select class="input" id="timerPauseLimit"></select>') && files.online.includes("function setupTimerPauseLimitOptions()") && files.online.includes("Array.from({ length: 60 }") && files.online.includes("pauseLimitMinutes: Math.min(60, Math.max(1, Number(timer.pauseLimitMinutes || 15)))")],
  ["暂停倒计时超时会自动保存但不完成关联任务并弹窗提醒", files.online.includes("finishTimer({ autoEndedByPause: true })") && files.online.includes("selection.markTaskDone = false") && files.online.includes('id="pauseExpiredModal"') && files.online.includes("openPauseExpiredModal()")],
  ["学习计时新增作息与暂停文案已有英文翻译", files.i18n.includes("Start-the-day time") && files.i18n.includes("Sleepy time") && files.i18n.includes("Pause countdown (minutes)") && files.i18n.includes("Expected study time per day") && files.i18n.includes("Focus study plan") && files.i18n.includes("It is rest time now") && files.i18n.includes("Oops, you were away too long") && files.i18n.includes("Category notes: key points")],
  ["本地测试服务器支持带空格的 D 盘路径", (await readFile("./dev-server.mjs", "utf8")).includes("decodeURIComponent")],
  ["FastAPI 后端提供健康检查", files.backend.includes('@app.get("/api/health")')],
  ["FastAPI 健康检查会验证数据库连接", files.backend.includes('db.execute("SELECT 1").fetchone()')],
  ["FastAPI 后端不会保存明文密码", files.backend.includes("pbkdf2_hmac") && files.backend.includes("password_hash")],
  ["公开注册与登录接口具有基础限流保护", files.backend.includes("def enforce_rate_limit") && files.backend.includes('enforce_rate_limit(request, "register"') && files.backend.includes('enforce_rate_limit(request, "login"')],
  ["测试版注册必须使用服务器端邀请码", files.backend.includes("REGISTRATION_INVITE_CODE") && files.backend.includes("invalid_invite_code") && files.cloud.includes('name="inviteCode"')],
  ["互联网响应带有基础浏览器安全头", files.backend.includes("X-Content-Type-Options") && files.backend.includes("X-Frame-Options") && files.backend.includes("Permissions-Policy")],
  ["部署时支持 PostgreSQL 持久数据库", files.backend.includes("USING_POSTGRES") && files.backend.includes("psycopg.connect")]
];

const failed = checks.filter(([, passed]) => !passed);
checks.forEach(([label, passed]) => console.log(`${passed ? "PASS" : "FAIL"} ${label}`));

if (failed.length) process.exitCode = 1;
