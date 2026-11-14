import { TUM_EI_BACHELOR } from "./degree-templates.js";
import {
  applyExamMatches, courseTasks, creditNumber, creditTotals, daysBetween, examMatches,
  addTumStudyPeriods, chooseTargetExam, isEarned, isTumMathChoice, makePlan, newCourse,
  newModule, normalizeModuleCode, parseStudyTasks, replaceTumMathChoice, useTumTemplate
} from "./degree-core.js";

const panel = document.querySelector("#degreePanel");
const dialog = document.querySelector("#degreeDialog");
const bridge = window.studyTrackerBridge;
const get = () => bridge.getDegreeWorkspace();
const en = () => window.studyI18n?.getLanguage?.() === "en";
const word = (zh, english) => en() ? english : zh;
const escape = value => String(value ?? "").replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
);
const today = () => {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(number => String(number).padStart(2, "0")).join("-");
};
const button = (label, action, data = "", primary = false) =>
  `<button type="button" class="btn ${primary ? "" : "secondary"}" data-degree="${action}" ${data}>${escape(label)}</button>`;
const option = (value, label, selected) =>
  `<option value="${escape(value)}" ${value === selected ? "selected" : ""}>${escape(label)}</option>`;
const field = (label, name, value = "", type = "text", extra = "") =>
  `<label>${escape(label)}<input class="input" type="${type}" name="${name}" value="${escape(value)}" ${extra}></label>`;
const select = (label, name, options) => `<label>${escape(label)}<select class="input" name="${name}">${options}</select></label>`;
const heading = text => `<h3>${escape(text)}</h3>`;
const actions = html => `<div class="degree-actions">${html}</div>`;
const fields = html => `<div class="degree-fields">${html}</div>`;
const caption = text => `<p class="degree-help">${escape(text)}</p>`;
const courseData = id => `data-course="${escape(id)}"`;
const moduleData = id => `data-module="${escape(id)}"`;
const blockData = id => `data-block="${escape(id)}"`;
const allCourses = plan => plan.modules.flatMap(module => module.courses);
const kindName = kind => kind === "retake" ? word("补考", "Retake") : kind === "first" ? word("初考", "First sitting") : word("考试", "Exam");
const examLabel = exam => `${exam.date} ${exam.time || ""} · ${kindName(exam.kind)}`;
const signedIn = () => window.studyCloud?.degreeAccountId?.() || "";
const clean = (value, max = 180) => String(value ?? "").trim().slice(0, max);
const displayNumber = number => new Intl.NumberFormat(en() ? "en" : "zh-CN", { maximumFractionDigits: 2 }).format(number);
const requireValue = (value, message) => {
  if (!value) throw new Error(message);
  return value;
};

let view = "timeline";
let dragging = "";
let dialogVersion = 0;
let currentSnapshot = null;

function update(change) {
  const { plan, editable } = get();
  if (!editable || !plan) return;
  const draft = structuredClone(plan);
  change(draft);
  bridge.saveDegreePlan(draft);
}

function editCourse(id, change) {
  update(plan => {
    const course = allCourses(plan).find(item => item.id === id);
    if (course) change(course, plan);
  });
}

function showDialog(title, body, submit, submitLabel = word("保存", "Save")) {
  const version = ++dialogVersion;
  const owner = signedIn();
  const originalPlan = get().plan;
  dialog.innerHTML = `<form>${heading(title)}${body}<p role="status" class="degree-error" hidden></p>
    <div class="degree-actions"><button class="btn" type="submit">${escape(submitLabel)}</button>
    <button class="btn secondary" type="button" data-close>${word("取消", "Cancel")}</button></div></form>`;
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  if (!dialog.open) dialog.showModal();
  const form = dialog.querySelector("form");
  form.onsubmit = async event => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    const error = form.querySelector('[role="status"]');
    submitButton.disabled = true;
    error.hidden = true;
    try {
      if (signedIn() !== owner || originalPlan !== get().plan || !get().editable) {
        throw new Error(word("工作区已更新，请重新打开后继续。", "The workspace changed. Reopen this form to continue."));
      }
      const isCurrent = () => version === dialogVersion && dialog.open && owner === signedIn() && originalPlan === get().plan;
      await submit(new FormData(form), isCurrent);
      if (version === dialogVersion && dialog.open) dialog.close();
    } catch (reason) {
      error.textContent = reason.message || word("保存失败", "Could not save.");
      error.hidden = false;
    } finally {
      submitButton.disabled = false;
    }
  };
}

dialog.addEventListener("close", () => { if (!dialog.open) dialogVersion++; });

function render() {
  const state = get();
  if (currentSnapshot && currentSnapshot.plan !== state.plan && dialog.open) dialog.close();
  currentSnapshot = state;
  if (!state.editable || panel.hidden) {
    panel.replaceChildren();
    return;
  }
  const previousDetails = new Map([...panel.querySelectorAll("details[data-key]")].map(node => [node.dataset.key, node.open]));
  const { plan, semesters } = state;
  panel.innerHTML = `<header class="degree-header"><h2>${word("毕业规划", "Degree planner")}</h2>
    ${plan ? `<div class="degree-actions">
      ${button(word("时间块视图", "Timeline"), "timeline", `aria-pressed="${view === "timeline"}"`, view === "timeline")}
      ${button(word("学分视图", "ECTS by module"), "credits", `aria-pressed="${view === "credits"}"`, view === "credits")}
      ${button(word("方案设置", "Programme settings"), "settings")}
    </div>` : ""}</header>
    ${plan ? (view === "credits" ? renderCredits(plan, semesters) : renderTimeline(plan, semesters)) : renderSetup()}`;
  panel.querySelectorAll("details[data-key]").forEach(node => {
    node.open = previousDetails.get(node.dataset.key) ?? node.hasAttribute("data-initial-open");
  });
}

function renderSetup() {
  return `<section class="degree-card">${heading(word("设置毕业要求", "Set up your degree requirements"))}
    ${actions([
      button("TUM EI Bachelor", "template", "", true),
      button(word("手动输入", "Enter manually"), "settings"),
      button(word("从学校链接导入", "Import from university link"), "import-programme"),
      button(word("上传培养方案 PDF", "Upload programme PDF"), "import-programme-pdf")
    ].join(""))}</section>`;
}

function renderCredits(plan, semesters) {
  const totals = creditTotals(plan, semesters);
  const stat = [displayNumber(totals.earned), displayNumber(plan.requiredCredits)].join(" / ") + " ECTS";
  const outstanding = totals.modules.filter(item => !item.complete).length;
  const missing = displayNumber(Math.max(0, plan.requiredCredits - totals.earned));
  return `<div class="degree-card"><div class="degree-header"><strong>${escape(plan.name)}</strong><strong>${stat}</strong></div>
    <progress value="${totals.earned}" max="${plan.requiredCredits}" aria-label="ECTS"></progress>
    ${caption(totals.complete ? word("已达到毕业学分要求", "Degree credit requirements met") :
      word("还差 " + missing + " ECTS · 未达标模块 " + outstanding + " 个", missing + " ECTS needed · " + outstanding + " requirements outstanding"))}</div>
    ${actions(button(word("添加模块", "Add requirement group"), "module"))}
    ${totals.modules.map(({ module, earned, complete }) => `<details class="degree-module" data-key="module-${escape(module.id)}">
      <summary>${escape(module.name)} · ${displayNumber(earned)} / ${displayNumber(module.requiredCredits)} ECTS${complete ? " ✓" : ""}</summary>
      ${actions(button(word("编辑模块", "Edit group"), "module", moduleData(module.id)) +
        button(word("添加课程", "Add course"), "course", moduleData(module.id)))}
      <div class="degree-course-grid">${module.courses.map(course => renderCourse(course, module, plan, semesters, "credits")).join("")}</div>
      </details>`).join("")}`;
}

function formatPlannerDate(date) {
  return new Intl.DateTimeFormat(en() ? "en-GB" : "zh-CN", {
    month: "short", day: "numeric", timeZone: "UTC"
  }).format(new Date(date + "T00:00:00Z"));
}

function periodName(block) {
  if (block.kind === "lecture" && block.name.endsWith(" · Vorlesungszeit")) {
    return block.name.replace("Vorlesungszeit", word("上课期间", "Teaching period"));
  }
  if (block.kind === "break" && block.name.endsWith(" · Vorlesungsfreie Zeit")) {
    return block.name.replace("Vorlesungsfreie Zeit", word("假期", "Semester break"));
  }
  return block.name;
}

function renderCourse(course, module, plan, semesters, location, blockId = "") {
  const onTimeline = location === "timeline";
  const original = courseTasks(course.courseId, semesters);
  const tasks = course.tasks.filter(task => !onTimeline || (task.blockId || course.blockId) === blockId);
  const exam = course.exams.find(item => item.id === course.examId);
  const remaining = exam ? daysBetween(today(), exam.date) : null;
  const remainingHours = tasks.reduce((sum, task) => sum + (task.done ? 0 : task.hours), 0);
  const total = tasks.length + original.length;
  const done = tasks.filter(task => task.done).length + original.filter(task => task.done).length;
  const progress = original.length ? word("已有任务 ", "Existing tasks ") + original.filter(task => task.done).length + "/" + original.length : "";
  const timing = remaining === 0 ? word("今天考试", "Today") :
    remaining > 0 ? word("还有 " + remaining + " 天", remaining + " days left") : "";
  const earned = isEarned(course, semesters);
  const courseRef = courseData(course.id);
  const linkedTask = original.find(task => task.id === course.passTaskId);
  const mathChoice = isTumMathChoice(plan, course);
  const moveField = select(word("安排到", "Move to"), "blockId",
    option("", word("待安排", "Unscheduled"), course.blockId) +
    plan.blocks.map(block => option(block.id, periodName(block), course.blockId)).join(""));
  return `<article class="degree-course ${earned ? "degree-earned" : ""}" ${courseRef}
      ${onTimeline ? 'draggable="true"' : ""}>
    <div class="degree-course-top">
      <div class="degree-tags">
        <span class="degree-tag">${escape(module.name)}</span>
        <span class="degree-tag degree-ects">${displayNumber(course.credits)} ECTS</span>
        ${normalizeModuleCode(course.code) ? `<bdi dir="ltr" class="degree-code">${escape(normalizeModuleCode(course.code))}</bdi>` : ""}
      </div>
      ${onTimeline ? '<span class="degree-drag-handle" aria-hidden="true">⠿</span>' : ""}
    </div>
    ${mathChoice ? `<div class="degree-math-choice">${select(word("数学二选一", "Mathematics choice"), "mathChoice",
      TUM_EI_BACHELOR.modules[0].choices.map(choice => option(choice.code, choice.name + " (" + choice.code + ")", normalizeModuleCode(course.code))).join(""))}</div>` :
      `<h4>${escape(course.name)}</h4>`}
    ${earned ? `<div class="degree-course-date"><strong>${word("✓ 已获学分", "✓ Credits earned")}</strong></div>` :
      exam ? `<div class="degree-course-date"><div><span>${kindName(exam.kind)}</span>
      <strong>${formatPlannerDate(exam.date)}${exam.time ? " · " + escape(exam.time) : ""}</strong></div>
      ${timing ? `<span class="degree-remaining">${timing}</span>` : ""}</div>` :
      `<div class="degree-course-date"><span>${course.exams.length ? word("选一场考试作为截止日", "Choose a target exam") :
        word("待定考试日期", "Exam date to be set")}</span></div>`}
    ${course.exams.length && !earned ? `<div class="degree-sittings">${course.exams.map(item =>
      button(kindName(item.kind) + " · " + formatPlannerDate(item.date) + (item.time ? " " + item.time : ""), "choose-exam",
        `data-exam="${escape(item.id)}" aria-pressed="${course.examId === item.id}"`)).join("")}</div>` : ""}
    ${total ? `<div class="degree-card-progress"><div><span>${word("复习进度", "Study progress")} ${done}/${total}</span>
      ${remainingHours ? `<span>${displayNumber(remainingHours)} h ${word("待学", "left")}</span>` : ""}</div>
      <progress value="${done}" max="${total}" aria-label="${word("复习进度", "Study progress")}"></progress></div>` : ""}
    ${onTimeline && !blockId && plan.blocks.length && !earned ? `<div class="degree-quick-move">${moveField}</div>` : ""}
    <details class="degree-course-details" data-key="${escape(location + "-" + blockId + "-" + course.id)}">
      <summary>${word("课程计划与学分", "Course plan and credits")}</summary>
      ${!onTimeline || blockId ? `<div class="degree-fields">${moveField}</div>` : ""}
      ${actions(button(word("编辑课程", "Edit course"), "course", courseRef) +
        button(word("添加考试", "Add exam"), "exam", courseRef) +
        (exam ? button(word("编辑所选考试", "Edit selected exam"), "edit-exam", courseRef) +
          button(word("取消选定", "Clear target"), "choose-exam", 'data-exam=""') : "") +
        button(word("粘贴复习计划", "Paste study plan"), "study-tasks", courseRef))}
      ${linkedTask ? caption(word("学分关联任务：", "Credit linked to: ") + (linkedTask.title || linkedTask.name)) :
        course.passTaskId ? caption(word("关联任务已找不到，请编辑课程重新选择。", "Linked task missing. Open Edit course to choose again.")) :
        `<div class="degree-pass"><label><input name="passed" type="checkbox" ${course.passed ? "checked" : ""}> ${word("已取得学分", "Credits earned")}</label></div>`}
      ${progress ? `<details><summary>${escape(progress)}</summary>${original.map(task => `<div class="degree-row" data-task="${escape(task.id)}"><label><input type="checkbox" name="linkedDone" ${task.done ? "checked" : ""}> ${escape(task.title || task.name)}</label></div>`).join("")}</details>` : ""}
      ${tasks.map(task => `<div class="degree-row" data-task="${escape(task.id)}"><label>
        <input type="checkbox" name="studyDone" ${task.done ? "checked" : ""}> ${escape(task.title)} · ${displayNumber(task.hours)} h
        </label>${button(word("编辑", "Edit"), "study-task")}</div>`).join("")}
    </details>
  </article>`;
}

function periodHours(block, courses, weeklyHours) {
  const currentDate = today();
  const start = currentDate > block.start ? currentDate : block.start;
  const available = Math.max(0, daysBetween(start, block.end) + 1) * weeklyHours / 7;
  const planned = courses.reduce((sum, course) => sum + course.tasks.reduce((hours, task) =>
    !task.done && (task.blockId || course.blockId) === block.id ? hours + task.hours : hours, 0), 0);
  return word("剩余任务约 " + displayNumber(planned) + " 小时 · 此时间块约可用 " + displayNumber(available) + " 小时",
    "~" + displayNumber(planned) + " h of tasks remaining · ~" + displayNumber(available) + " h available in this period");
}

function scrollToPeriod(id) {
  const target = document.getElementById("degree-period-" + id);
  if (target instanceof HTMLDetailsElement) target.open = true;
  target?.scrollIntoView({ block: "start" });
}

function renderTimeline(plan, semesters) {
  const date = today();
  const entries = plan.modules.flatMap(module => module.courses.map(course => ({ module, course })));
  const active = plan.blocks.find(block => block.start <= date && date <= block.end);
  const upcoming = entries.flatMap(({ course }) => {
    const exam = course.exams.find(item => item.id === course.examId);
    return exam && exam.date >= date && !isEarned(course, semesters) ? [{ course, exam }] : [];
  }).sort((a, b) => (a.exam.date + a.exam.time).localeCompare(b.exam.date + b.exam.time));
  const pending = entries.filter(({ course }) => !course.blockId && !isEarned(course, semesters));
  const next = upcoming[0];
  const totals = creditTotals(plan, semesters);
  const canAddTumPeriods = plan.examSource === "tum-ei" && (!plan.blocks.length ||
    plan.blocks.every(block => block.end < date));
  const pendingLabel = word("待安排 " + pending.length + " 门", pending.length + " to schedule");

  function courseGrid(items, blockId) {
    return `<div class="degree-course-grid">${items.map(({ module, course }) =>
      renderCourse(course, module, plan, semesters, "timeline", blockId)).join("")}</div>`;
  }

  return `<section class="degree-overview"><div class="degree-header">
      <div><h3>${word("学习与考试", "Study and exams")}</h3><span class="degree-caption">${escape(plan.name)}${plan.term ? " · " + escape(plan.term) : ""}</span></div>
      ${actions((plan.examSource === "tum-ei" ? button(word("从 TUM 导入考试", "Import exams from TUM"), "import-tum", "", true) : "") +
        button(word("上传考试表", "Upload exam PDF"), "import-exams", "", plan.examSource !== "tum-ei") +
        button(word("添加时间块", "Add study period"), "block"))}
    </div><div class="degree-overview-stats">
      <div><span>${word("当前时间块", "Current period")}</span><strong>${active ? escape(periodName(active)) : word("未设置", "Not set")}</strong></div>
      <div><span>${word("下一场考试", "Next exam")}</span><strong>${next ? escape(formatPlannerDate(next.exam.date)) + " · " + escape(next.course.name) : word("待选定", "Choose a target")}</strong></div>
      <button type="button" data-degree="credits"><span>${word("毕业学分", "Degree credits")}</span>
      <strong>${displayNumber(totals.earned)} / ${displayNumber(plan.requiredCredits)} ECTS</strong></button>
    </div></section>
    ${entries.length ? "" : actions(button(word("添加学分模块或课程", "Add credit groups or courses"), "credits"))}
    ${canAddTumPeriods ? `<div class="degree-card degree-header"><span>${word("按 TUM 校历添加上课期和假期，可再修改日期。", "Add TUM teaching periods and breaks, then adjust the dates if needed.")}</span>
      ${button(word("加上校历时间块", "Use TUM calendar"), "seed-periods", "", true)}</div>` : ""}
    ${plan.blocks.length || pending.length ? `<nav class="degree-period-nav" aria-label="${word("时间块", "Study periods")}">
      ${plan.blocks.map(block => button(periodName(block), "jump-period", `${blockData(block.id)} data-lane="${escape(block.id)}"`)).join("")}
      ${pending.length ? button(pendingLabel, "jump-period", `${blockData("")} data-lane=""`) : ""}
      </nav>` : ""}
    <div class="degree-lanes">${plan.blocks.map(block => {
      const scheduled = entries.filter(({ course }) => course.blockId === block.id ||
        course.tasks.some(task => (task.blockId || course.blockId) === block.id));
      const chosenExams = scheduled.filter(({ course }) => course.exams.some(exam => exam.id === course.examId && exam.date >= block.start && exam.date <= block.end));
      const current = active?.id === block.id;
      return `<section class="degree-block ${block.kind === "break" ? "degree-break" : ""} ${current ? "degree-current" : ""}"
          id="degree-period-${escape(block.id)}" data-lane="${escape(block.id)}">
        <div class="degree-block-heading">
          <div><div class="degree-block-range">${formatPlannerDate(block.start)} — ${formatPlannerDate(block.end)} <span>${escape(block.start.slice(0, 4))}${block.start.slice(0, 4) === block.end.slice(0, 4) ? "" : "–" + escape(block.end.slice(0, 4))}</span></div>
          ${heading(periodName(block))}</div>
          <div class="degree-actions">
          ${current ? `<span class="degree-status">${word("当前", "Now")}</span>` : ""}
          ${button(word("编辑", "Edit"), "block", blockData(block.id))}</div>
        </div>
        <div class="degree-block-info">${word(scheduled.length + " 门课", scheduled.length + " courses")} · ${word(chosenExams.length + " 场考试", chosenExams.length + " exams")}</div>
        ${plan.weeklyHours > 0 ? caption(periodHours(block, scheduled.map(item => item.course), plan.weeklyHours)) : ""}
        ${scheduled.length ? courseGrid(scheduled, block.id) : `<div class="degree-drop-target">${word("把课程拖到这里，或在课程卡上选择这个时间块", "Drop courses here or choose this period on a course card")}</div>`}
      </section>`;
    }).join("")}
    <details id="degree-period-" class="degree-block degree-pool" data-key="timeline-pool" data-lane="" ${pending.length && !plan.blocks.some(block =>
      entries.some(({ course }) => course.blockId === block.id)) ? "data-initial-open" : ""}>
      <summary><span>${word("待安排课程", "Unscheduled courses")}</span><span class="degree-tag">${pending.length}</span></summary>
      ${pending.length ? courseGrid(pending, "") : caption(word("待安排课程会出现在这里。", "Unscheduled courses will appear here."))}
    </details></div>`;
}

function settingsDialog(plan) {
  showDialog(word("方案设置", "Programme settings"), fields(
    field(word("专业或方案名称", "Programme name"), "name", plan?.name, "text", 'required maxlength="180"') +
    field(word("毕业总 ECTS", "Required ECTS"), "credits", plan?.requiredCredits, "number", 'required min="0.5" max="1000" step="0.01"') +
    field(word("本次导入对应的考试学期", "Semester for exam import"), "term", plan?.term, "text", 'placeholder="WS 2026/27" maxlength="40"') +
    field(word("每周可用学习小时（可选）", "Available hours per week (optional)"), "weeklyHours", plan?.weeklyHours || "", "number", 'min="0" max="168" step="0.5"')
  ), data => {
    const name = requireValue(clean(data.get("name")), word("请填写名称。", "Enter a programme name."));
    const requiredCredits = requireValue(creditNumber(data.get("credits")), word("请填写毕业学分。", "Enter the required ECTS."));
    const term = clean(data.get("term"), 40);
    const weeklyHours = creditNumber(data.get("weeklyHours")) || 0;
    if (!plan) {
      view = "timeline";
      bridge.saveDegreePlan({ ...makePlan(name, requiredCredits), term, weeklyHours });
    } else {
      update(draft => Object.assign(draft, { name, requiredCredits, term, weeklyHours }));
    }
  });
}

function moduleDialog(module) {
  showDialog(word("模块要求", "Requirement group"), fields(
    field(word("模块名称", "Group name"), "name", module?.name, "text", 'required maxlength="180"') +
    field(word("要求 ECTS", "Required ECTS"), "credits", module?.requiredCredits, "number", 'required min="0.5" max="1000" step="0.01"') +
    select(word("模块类型", "Group type"), "kind", option("required", word("必修", "Required"), module?.kind || "required") +
      option("elective", word("选修", "Elective"), module?.kind))
  ), data => {
    const input = {
      name: requireValue(clean(data.get("name")), word("请填写模块名称。", "Enter the group name.")),
      requiredCredits: requireValue(creditNumber(data.get("credits")), word("请填写要求学分。", "Enter the required ECTS.")),
      kind: data.get("kind")
    };
    update(plan => {
      if (module) Object.assign(plan.modules.find(item => item.id === module.id), input);
      else plan.modules.push(newModule(input));
    });
  });
}

function courseDialog(course, module, plan, semesters) {
  const groups = semesters.flatMap(stage => stage.courses.map(item => ({ id: item.id, label: stage.name + " · " + item.name })));
  const targetModule = module || plan.modules.find(item => item.courses.some(candidate => candidate.id === course.id));
  showDialog(word("课程与学分", "Course and credits"), fields(
    field(word("课程名", "Course name"), "name", course?.name, "text", 'required maxlength="180"') +
    field(word("模块编号", "Module code"), "code", normalizeModuleCode(course?.code), "text", 'maxlength="40" dir="ltr" placeholder="EI00460" spellcheck="false" autocomplete="off"') +
    field("ECTS", "credits", course?.credits, "number", 'required min="0" max="1000" step="0.01"') +
    select(word("关联学习进度", "Link existing progress"), "courseId", option("", word("手动记录", "Manual"), course?.courseId) +
      groups.map(item => option(item.id, item.label, course?.courseId)).join("")) +
    select(word("确认取得学分的任务", "Task that confirms earned credits"), "passTaskId", "") +
    (targetModule.kind === "elective" ? field(word("计划考试学期", "Planned exam semester"), "examTerm", course?.examTerm || "", "text",
      `placeholder="${escape(plan.term || "WS 2026/27")}" maxlength="40"`) : "")
  ) + caption(word("只选择确认考试通过的任务。其他任务用于显示复习进度。", "Pick the task that confirms you passed. Other tasks track preparation.")) +
    (course ? `<label><input type="checkbox" name="remove"> ${word("删除这门课的学分和规划记录", "Remove this course from the degree plan")}</label>` : ""), data => {
    if (course && data.has("remove")) {
      update(draft => {
        const group = draft.modules.find(item => item.id === targetModule.id);
        group.courses = group.courses.filter(item => item.id !== course.id);
      });
      return;
    }
    const name = requireValue(clean(data.get("name")), word("请填写课程名称。", "Enter a course name."));
    const courseId = clean(data.get("courseId"));
    const passTaskId = clean(data.get("passTaskId"));
    const examTerm = clean(data.get("examTerm"), 40);
    const next = {
      name, code: normalizeModuleCode(data.get("code")).slice(0, 40), credits: creditNumber(data.get("credits")) ?? 0, courseId, passTaskId, examTerm
    };
    if (course) editCourse(course.id, item => {
      if (item.passTaskId && !passTaskId) item.passed = isEarned(item, semesters);
      Object.assign(item, next);
    });
    else update(draft => draft.modules.find(item => item.id === targetModule.id).courses.push(newCourse(next)));
  });
  const link = dialog.querySelector('[name="courseId"]');
  const task = dialog.querySelector('[name="passTaskId"]');
  const fillTasks = selected => {
    task.innerHTML = option("", word("手动确认", "Confirm manually"), selected) +
      courseTasks(link.value, semesters).map(item => option(item.id, item.title || item.name, selected)).join("");
  };
  fillTasks(course?.passTaskId);
  link.addEventListener("change", () => fillTasks(""));
}

function blockDialog(block) {
  showDialog(word("学习时间块", "Study period"), fields(
    field(word("名称", "Name"), "name", block?.name, "text", 'required maxlength="180"') +
    field(word("开始", "Start"), "start", block?.start, "date", "required") +
    field(word("结束", "End"), "end", block?.end, "date", "required")
  ), data => {
    const name = requireValue(clean(data.get("name")), word("请填写名称。", "Enter a period name."));
    const start = data.get("start");
    const end = data.get("end");
    if (end < start) throw new Error(word("结束时间早于开始时间。", "End precedes start."));
    update(plan => {
      if (plan.blocks.some(item => item.name === name && item.id !== block?.id)) {
        throw new Error(word("这个时间块名称已存在。", "This period name is already used."));
      }
      if (block) Object.assign(plan.blocks.find(item => item.id === block.id), { name, start, end });
      else plan.blocks.push({ id: crypto.randomUUID(), name, start, end });
      plan.blocks.sort((left, right) => left.start.localeCompare(right.start));
    });
  });
}

function examDialog(course, plan, previous) {
  showDialog(previous ? word("编辑所选考试", "Edit selected exam") : word("添加考试", "Add exam"), fields(
    field(word("考试学期", "Exam semester"), "term", previous?.term || plan.term, "text", 'required maxlength="40"') +
    select(word("场次", "Sitting"), "kind", ["first", "retake", "exam"].map(kind => option(kind, kindName(kind), previous?.kind || "first")).join("")) +
    field(word("考试日期", "Exam date"), "date", previous?.date, "date", "required") +
    field(word("开始时间", "Start time"), "time", previous?.time, "time")
  ) + (previous ? `<label><input type="checkbox" name="remove"> ${word("删除这场考试", "Delete this sitting")}</label>` : ""),
  data => editCourse(course.id, item => {
    if (previous && data.has("remove")) {
      item.exams = item.exams.filter(exam => exam.id !== previous.id);
      item.examId = "";
      return;
    }
    const exam = { term: clean(data.get("term"), 40), kind: data.get("kind"), date: data.get("date"), time: data.get("time"), source: "" };
    requireValue(exam.term, word("请填写考试学期。", "Enter the exam semester."));
    const existing = item.exams.find(entry => ["term", "kind", "date", "time"].every(key => entry[key] === exam[key]));
    if (existing) {
      if (previous && previous.id !== existing.id) item.exams = item.exams.filter(entry => entry.id !== previous.id);
      item.examId = existing.id;
      return;
    }
    exam.id = previous?.id || crypto.randomUUID();
    item.exams = [...item.exams.filter(entry => entry.id !== exam.id), exam];
    if (!item.examId) item.examId = exam.id;
  }));
}

function tasksDialog(course, plan) {
  showDialog(word("粘贴复习计划", "Paste study plan"),
    caption(word("每行：任务名称｜预计小时｜时间块名称（可省略）", "One row per task: title | estimated hours | period name (optional)")) +
    `<textarea class="input" name="tasks" required maxlength="30000" placeholder="Kapitel 1 | 2"></textarea>`,
    data => {
      let tasks;
      try { tasks = parseStudyTasks(data.get("tasks"), plan.blocks); }
      catch (reason) { throw new Error(word("请检查这一行：", "Check this row: ") + reason.message); }
      editCourse(course.id, item => {
        const alreadyAdded = new Set(item.tasks.map(task => JSON.stringify([task.title, task.hours, task.blockId])));
        item.tasks.push(...tasks.filter(task => {
          const key = JSON.stringify([task.title, task.hours, task.blockId]);
          if (alreadyAdded.has(key)) return false;
          alreadyAdded.add(key);
          return true;
        }));
      });
    });
}

function taskDialog(course, task, plan) {
  if (!task) return;
  showDialog(word("编辑复习任务", "Edit study task"), fields(
    field(word("任务名", "Task title"), "title", task.title, "text", 'required maxlength="180"') +
    field(word("预计小时", "Estimated hours"), "hours", task.hours, "number", 'required min="0" max="1000" step="0.01"') +
    select(word("时间块", "Study period"), "blockId", option("", word("跟随课程", "Use course placement"), task.blockId) +
      plan.blocks.map(block => option(block.id, block.name, task.blockId)).join(""))
  ) + `<label><input type="checkbox" name="remove"> ${word("删除这个任务", "Delete this task")}</label>`,
  data => editCourse(course.id, item => {
    if (data.has("remove")) item.tasks = item.tasks.filter(entry => entry.id !== task.id);
    else Object.assign(item.tasks.find(entry => entry.id === task.id), {
      title: requireValue(clean(data.get("title")), word("请填写任务名称。", "Enter a task name.")),
      hours: creditNumber(data.get("hours")) ?? 0,
      blockId: data.get("blockId")
    });
  }));
}

async function loadSource(data, mode) {
  const file = data.get("file");
  const code = signedIn();
  if (!code) throw new Error(word("请先登录，再导入文件或官网链接。", "Sign in to import PDFs or university links."));
  let source = { mode, url: clean(data.get("url"), 2000) };
  if (file?.size) {
    if (file.size > 4 * 1024 * 1024) throw new Error(word("PDF 最大 4 MB。", "PDF files can be up to 4 MB."));
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    source = { mode, name: clean(file.name), pdf: btoa(binary) };
  }
  if (signedIn() !== code) throw new Error(word("账号已切换，请重试。", "The account changed. Try again."));
  try {
    return await window.studyCloud.importDegreeSource(source);
  } catch (reason) {
    const messages = {
      source_unreadable: word("无法读取这份资料，请试试 PDF 或手动输入。", "Cannot read this source. Try a PDF or enter it manually."),
      source_too_large: word("资料太大，请上传所需页面。", "This source is too large. Upload the relevant pages."),
      source_not_found: word("找不到对应考试表，请手动上传 PDF。", "No matching exam documents found. Upload a PDF instead.")
    };
    throw new Error(messages[reason.code] || messages.source_unreadable);
  }
}

function importProgramme(fileMode) {
  const title = fileMode ? word("上传培养方案 PDF", "Upload programme PDF") : word("从学校链接导入", "Import from university link");
  showDialog(title, fields(fileMode
    ? field("PDF", "file", "", "file", 'accept=".pdf,application/pdf" required')
    : field(word("公开培养方案网址", "Public programme URL"), "url", "", "url", "required")
  ), async (data, current) => {
    const parsed = await loadSource(data, "programme");
    if (current()) previewProgramme(parsed);
  }, word("读取预览", "Preview"));
}

function previewProgramme(parsed) {
  const suggestedRows = parsed.rows.map(row => [row.group, row.target || "", row.name, row.credits ?? "", row.code].join(" | ")).join("\n");
  showDialog(word("检查培养方案", "Review programme"), fields(
    field(word("专业名称", "Programme name"), "name", parsed.name, "text", 'required maxlength="180"') +
    field(word("毕业总 ECTS", "Required ECTS"), "credits", creditNumber(parsed.requiredCredits) || "", "number", 'required min="0.5" max="1000" step="0.01"')
  ) + caption(word(
    "每行填写：模块｜模块目标学分｜课程名称｜课程 ECTS｜模块编号。模块只有总学分时，课程列可空着。",
    "One row per entry: requirement group | group ECTS | course | course ECTS | module code. Leave the course columns blank for a group target only."
  )) + `<textarea name="rows" class="input" required maxlength="60000">${escape(suggestedRows)}</textarea>
    <details><summary>${word("查看原文提取结果", "View extracted text")}</summary><pre style="white-space:pre-wrap">${escape(parsed.text)}</pre></details>`, data => {
    const plan = makePlan(requireValue(clean(data.get("name")), word("请填写专业名称。", "Enter the programme name.")),
      requireValue(creditNumber(data.get("credits")), word("请填写毕业学分。", "Enter the required ECTS.")));
    const groups = new Map();
    for (const line of data.get("rows").split(/\r?\n/).filter(row => row.trim())) {
      const [groupName, rawTotal, courseName, rawCredits, code] = line.split(/[|｜]/).map(value => clean(value));
      const total = creditNumber(rawTotal);
      const credits = creditNumber(rawCredits);
      if (!groupName || !rawTotal || !total || (courseName && (!rawCredits || credits === null))) {
        throw new Error(word("请补齐模块或课程学分：", "Fill in the group or course credits: ") + line);
      }
      if (!groups.has(groupName)) groups.set(groupName, newModule({ name: groupName, requiredCredits: total, kind: courseName ? "required" : "elective" }));
      const group = groups.get(groupName);
      if (group.requiredCredits !== total) throw new Error(word("同一模块的目标学分不同：", "Group has inconsistent target credits: ") + groupName);
      if (courseName) group.courses.push(newCourse({ name: courseName, credits, code: normalizeModuleCode(code) }));
    }
    plan.modules = [...groups.values()];
    view = "timeline";
    bridge.saveDegreePlan(plan);
  }, word("创建方案", "Create programme"));
}

function previewExamImport(plan, semesters, parsed, fallbackTerm) {
  const term = requireValue(parsed.term || fallbackTerm,
    word("这份表没有识别到考试学期，请填写后再上传。", "The exam semester could not be read. Enter it and upload again."));
  const matches = examMatches({ ...plan, term }, semesters, parsed.rows);
  if (!matches.length) throw new Error(word("没有符合条件的新考试。请检查课程编号和选修课的计划学期。",
    "No matching new exams. Check module codes and planned terms for electives."));
  showDialog(word("确认考试安排", "Review exam dates") + " · " + term,
    caption(word("确认要保存的场次。之后点课程卡上的初考或补考，即可设为截止日。",
      "Confirm the sittings to save, then choose a date on a course card.")) +
    matches.map(({ course, exam, previous }, index) => `<div class="degree-row"><label><input type="checkbox" name="exam" value="${index}" checked>
      ${escape(course.name)} · ${previous ? escape(examLabel(previous)) + " → " : ""}${escape(examLabel(exam))}</label></div>`).join(""),
    selections => {
      const chosen = new Set(selections.getAll("exam"));
      const selected = matches.filter((_, index) => chosen.has(String(index)));
      if (!selected.length) return;
      update(draft => {
        draft.term = term;
        const byId = new Map(allCourses(draft).map(course => [course.id, course]));
        applyExamMatches(selected.map(match => ({ ...match, course: byId.get(match.course.id) })));
      });
    }, word("保存选中的场次", "Save selected dates"));
}

async function importTumExams(plan, semesters, trigger) {
  const account = signedIn();
  trigger.disabled = true;
  trigger.setAttribute("aria-busy", "true");
  const label = trigger.textContent;
  trigger.textContent = word("正在读取 TUM 考试表…", "Reading TUM exam dates…");
  try {
    const parsed = await loadSource(new FormData(), "exams");
    if (get().plan === plan && signedIn() === account && !panel.hidden && view === "timeline") {
      previewExamImport(plan, semesters, parsed, plan.term);
    }
  } catch (reason) {
    if (signedIn() === account) bridge.showToast(reason.message);
  } finally {
    trigger.disabled = false;
    trigger.removeAttribute("aria-busy");
    trigger.textContent = label;
  }
}

function importExams(plan, semesters) {
  showDialog(word("上传考试表", "Upload exam PDF"), fields(
    field("PDF", "file", "", "file", 'accept=".pdf,application/pdf" required') +
    field(word("考试学期（PDF 没有写时使用）", "Exam semester (if missing from the PDF)"), "term",
      plan.term, "text", 'placeholder="WS 2026/27" maxlength="40"')
  ), async (data, current) => {
    const parsed = await loadSource(data, "exams");
    if (current()) previewExamImport(plan, semesters, parsed, clean(data.get("term"), 40));
  }, word("读取预览", "Preview"));
}


panel.addEventListener("click", event => {
  const target = event.target.closest("[data-degree]");
  if (!target) return;
  const { plan, semesters, editable } = get();
  if (!editable) return;
  const courses = plan ? allCourses(plan) : [];
  const course = courses.find(item => item.id === target.closest("[data-course]")?.dataset.course);
  const module = plan?.modules.find(item => item.id === target.dataset.module);
  const block = plan?.blocks.find(item => item.id === target.dataset.block);
  switch (target.dataset.degree) {
    case "timeline": view = "timeline"; render(); break;
    case "credits": view = "credits"; render(); break;
    case "settings": settingsDialog(plan); break;
    case "template": {
      const draft = useTumTemplate();
      addTumStudyPeriods(draft, today());
      view = "timeline";
      bridge.saveDegreePlan(draft);
      break;
    }
    case "seed-periods": update(draft => addTumStudyPeriods(draft, today())); break;
    case "jump-period": scrollToPeriod(target.dataset.block); break;
    case "choose-exam":
      if (course) editCourse(course.id, (item, draft) => chooseTargetExam(item, draft, target.dataset.exam, today()));
      break;
    case "import-tum": importTumExams(plan, semesters, target); break;
    case "module": moduleDialog(module); break;
    case "course": courseDialog(course, module, plan, semesters); break;
    case "block": blockDialog(block); break;
    case "exam": examDialog(course, plan); break;
    case "edit-exam": examDialog(course, plan, course.exams.find(item => item.id === course.examId)); break;
    case "study-tasks": tasksDialog(course, plan); break;
    case "study-task": taskDialog(course, course.tasks.find(item => item.id === target.closest("[data-task]")?.dataset.task), plan); break;
    case "import-programme": importProgramme(false); break;
    case "import-programme-pdf": importProgramme(true); break;
    case "import-exams":
      importExams(plan, semesters);
      break;
  }
});

panel.addEventListener("change", event => {
  const input = event.target;
  const id = input.closest("[data-course]")?.dataset.course;
  if (!id) return;
  switch (input.name) {
    case "passed": editCourse(id, course => { if (!course.passTaskId) course.passed = input.checked; }); break;
    case "blockId": editCourse(id, course => { course.blockId = input.value; }); break;
    case "mathChoice": update(plan => replaceTumMathChoice(plan, id, input.value)); break;
    case "linkedDone": {
      const course = allCourses(get().plan).find(item => item.id === id);
      if (course) bridge.setDegreeLinkedTask(course.courseId, input.closest("[data-task]")?.dataset.task, input.checked);
      break;
    }
    case "studyDone": editCourse(id, course => {
      const task = course.tasks.find(item => item.id === input.closest("[data-task]")?.dataset.task);
      if (task) task.done = input.checked;
    }); break;
  }
});

panel.addEventListener("dragstart", event => {
  const card = event.target.closest('[draggable="true"][data-course]');
  if (!card) return;
  dragging = card.dataset.course;
  event.dataTransfer.setData("text/plain", dragging);
  event.dataTransfer.effectAllowed = "move";
});
panel.addEventListener("dragover", event => {
  if (!dragging) return;
  const lane = event.target.closest("[data-lane]");
  if (!lane) return;
  event.preventDefault();
  panel.querySelectorAll(".over").forEach(item => item.classList.toggle("over", item === lane));
  lane.classList.add("over");
});
panel.addEventListener("drop", event => {
  const lane = event.target.closest("[data-lane]");
  if (!dragging || !lane) return;
  event.preventDefault();
  editCourse(dragging, course => { course.blockId = lane.dataset.lane; });
  dragging = "";
});
panel.addEventListener("dragend", () => {
  dragging = "";
  panel.querySelectorAll(".over").forEach(item => item.classList.remove("over"));
});

window.studyDegree = { render };
render();
