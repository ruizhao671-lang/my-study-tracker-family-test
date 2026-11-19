import { examCountdown, nextExam, isEarned, revisionProgress, creditNumber } from "./degree-core.js";

const dashboard = document.querySelector("#examHourglass");
const modal = document.querySelector("#examHourglassDialog");
const bridge = window.studyTrackerBridge;
const en = () => window.studyI18n?.getLanguage?.() === "en";
const word = (zh, english) => en() ? english : zh;
const escape = value => String(value ?? "").replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const option = (value, label, selected) =>
  `<option value="${escape(value)}" ${value === selected ? "selected" : ""}>${escape(label)}</option>`;
const dateKey = now => [now.getFullYear(), now.getMonth() + 1, now.getDate()]
  .map(value => String(value).padStart(2, "0")).join("-");
const sittingName = exam => exam.kind === "retake" ? word("补考", "Retake") :
  exam.kind === "first" ? word("初考", "First sitting") : word("考试", "Exam");
const number = value => new Intl.NumberFormat(en() ? "en-GB" : "zh-CN", { maximumFractionDigits: 1 }).format(value);
const keyFor = (course, exam) => JSON.stringify([course.id, exam.id]);

let selected = "";
let modalSelection = "";
let modalCourseId = "";
let workspace = null;
let account = "";
let animation = 0;

function courseEntries(state) {
  return state.plan.modules.flatMap(module => module.courses.map(course => ({ course, module })));
}

function availableExams(state, courseId = "") {
  const now = new Date();
  const date = dateKey(now);
  return courseEntries(state).filter(({ course }) =>
    (!courseId || course.id === courseId) && !isEarned(course, state.semesters))
    .flatMap(({ course, module }) => course.exams.filter(exam => {
      const clock = examCountdown(exam, now);
      return clock && !clock.expired && nextExam({ ...course, exams: [exam] }, state.plan, date);
    }).map(exam => ({ course, module, exam, key: keyFor(course, exam) })))
    .sort((left, right) =>
      (left.exam.date + (left.exam.time || "23:59")).localeCompare(right.exam.date + (right.exam.time || "23:59")));
}

function renderCountdown(clock) {
  if (!clock) return `<div class="hourglass-pending">${word("考试时间待定", "Exam date pending")}</div>`;
  const details = clock.dateOnly ? word("具体时间待公布", "Time to be announced") :
    number(clock.hours) + word(" 小时 ", " hr ") + number(clock.minutes) + word(" 分钟", " min");
  return `<div class="hourglass-countdown"><strong>${clock.days}</strong><span>${word("天", "days")}</span></div>
    <div class="hourglass-clock">${details}</div>`;
}

function renderFace(state, courseId, selection) {
  const choices = availableExams(state, courseId);
  const chosen = choices.find(item => item.key === selection) || choices[0];
  const entry = chosen || courseEntries(state).find(item => item.course.id === courseId);
  if (!choices.some(item => item.key === selection)) selection = "";
  const course = entry?.course;
  const clock = chosen && examCountdown(chosen.exam);
  const progress = course && revisionProgress(course, state.semesters);
  const ratio = progress?.ratio || 0;
  const percent = Math.round(ratio * 100);
  const tasks = course?.tasks || [];
  const planned = tasks.reduce((sum, task) => sum + (creditNumber(task.hours) || 0), 0);
  const remaining = tasks.reduce((sum, task) => sum + (task.done ? 0 : creditNumber(task.hours) || 0), 0);
  const earned = course && isEarned(course, state.semesters);
  const automatic = courseId ? word("自动 · 这门课的下一场", "Auto · Next sitting for this course") :
    word("自动 · 下一场考试", "Auto · Next exam");
  const examDate = chosen ? new Intl.DateTimeFormat(en() ? "en-GB" : "zh-CN", {
    year: "numeric", month: "long", day: "numeric"
  }).format(new Date(chosen.exam.date + "T00:00:00")) + (chosen.exam.time ? " · " + chosen.exam.time : "") :
    earned ? word("已取得学分", "Credits earned") : word("等考试安排公布后显示倒计时", "Countdown appears when the exam date is available");
  return `<div class="hourglass-layout" data-hourglass-exam="${escape(chosen?.key || "")}" ${course ? `data-hourglass-course="${escape(course.id)}"` : ""}>
    <div class="hourglass-visual" aria-hidden="true">
      <canvas class="hourglass-canvas" width="480" height="640"></canvas>
      <span class="hourglass-sand-note">${chosen && state.plan.blocks.some(block => block.id === course.blockId && block.start < chosen.exam.date)
        ? word("从学习时间块开始，沙量随倒计时减少", "Sand drains from the start of your study period")
        : word("时间流逝", "Time passing")}</span>
    </div>
    <div class="hourglass-content">
      <div class="hourglass-heading">
        <span>${selection ? word("正在关注", "In focus") : word("下一场考试", "Next exam")}</span>
        ${choices.length ? `<label class="hourglass-picker">${word("切换考试", "Switch exam")}
          <select class="input" data-hourglass-select>
            ${option("", automatic, selection)}
            ${choices.map(item => option(item.key, [courseId ? "" : item.course.name, item.exam.date,
              item.exam.time, sittingName(item.exam)].filter(Boolean).join(" · "), selection)).join("")}
          </select></label>` : ""}
      </div>
      <h2 class="hourglass-course">${escape(course?.name || word("下一场，准备开始", "Ready for your next exam"))}</h2>
      <p class="hourglass-exam">${escape(examDate)}${chosen ? " · " + sittingName(chosen.exam) : ""}</p>
      <div data-hourglass-clock>${renderCountdown(clock)}</div>
      ${course ? `<div class="hourglass-metrics">
        <div><span>${word("可用学习时间", "Available study time")}</span>
          <strong>${word("待排作息", "Schedule pending")}</strong>
          <small>${word("排好后显示这门课分到的时间", "Appears once time is allocated to this course")}</small></div>
        <div><span>${word("学习计划还需", "Planned work remaining")}</span>
          <strong>${planned ? number(remaining) + word(" 小时", " hr") : word("待估算", "To estimate")}</strong>
          <small>${planned ? word("按已填预计用时的任务计算", "From tasks with estimated hours") :
            word("在学习计划里填任务用时", "Estimate task hours in your study plan")}</small></div>
      </div>
      <div class="hourglass-progress"><div><span>${word("学习完成度", "Study progress")}</span>
        <strong>${progress.total ? percent + "%" : word("待添加任务", "No tasks yet")}</strong></div>
        <progress value="${percent}" max="100" aria-label="${word("学习完成度", "Study progress")}"></progress>
        <span>${progress.total ? progress.done + " / " + progress.total + word(" 项任务已完成", " tasks complete") :
          word("可关联已有学习进度，或添加学习任务", "Link your study progress or add tasks")}</span></div>
      <button class="btn secondary hourglass-plan-button" type="button" data-hourglass-plan="${escape(course.id)}">
        ${word("打开学习计划", "Open study plan")}</button>` :
        `<p class="hourglass-empty">${word("给课程添加考试日期，这里就会自动显示最近的一场。", "Add exam dates to your courses to see the next one here.")}</p>`}
    </div></div>`;
}

function drawGlass(canvas, fraction, flowing, phase = 0) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(2, 0, 0, 2, 0, 0);
  context.clearRect(0, 0, 240, 320);
  const glass = new Path2D("M58 36 L182 36 C182 94 169 116 128 153 L128 167 C169 204 182 226 182 284 L58 284 C58 226 71 204 112 167 L112 153 C71 116 58 94 58 36 Z");
  const glow = context.createRadialGradient(120, 155, 15, 120, 155, 154);
  glow.addColorStop(0, "#e4c78e3b");
  glow.addColorStop(1, "#e4c78e00");
  context.fillStyle = glow;
  context.fillRect(0, 0, 240, 320);

  context.save();
  context.clip(glass);
  const surface = 152 - 108 * Math.sqrt(fraction);
  const sand = context.createLinearGradient(62, 40, 175, 280);
  sand.addColorStop(0, "#eed8a0");
  sand.addColorStop(0.5, "#cf9f50");
  sand.addColorStop(1, "#e9c578");
  context.fillStyle = sand;
  context.fillRect(50, surface, 145, 156 - surface);
  context.fillStyle = "#f4dca2";
  context.fillRect(58, surface, 124, 2);
  const base = 282 - 100 * Math.sqrt(1 - fraction);
  context.fillStyle = sand;
  context.beginPath();
  context.moveTo(50, 290);
  context.lineTo(50, base);
  context.lineTo(102, base);
  context.quadraticCurveTo(120, base - 13, 138, base);
  context.lineTo(190, base);
  context.lineTo(190, 290);
  context.fill();
  if (flowing && fraction > 0 && fraction < 1) {
    context.fillStyle = "#d9b16b";
    context.fillRect(119, 155, 2, Math.max(0, base - 158));
    for (let index = 0; index < 7; index++) {
      const y = 163 + ((phase * 0.045 + index * 19) % Math.max(1, base - 165));
      context.fillRect(119 + Math.sin(index * 5) * 2, y, 1.4, 1.8);
    }
  }
  const reflection = context.createLinearGradient(58, 0, 182, 0);
  reflection.addColorStop(0, "#ffffff8a");
  reflection.addColorStop(0.16, "#ffffff05");
  reflection.addColorStop(0.76, "#ffffff00");
  reflection.addColorStop(1, "#ffffff70");
  context.fillStyle = reflection;
  context.fillRect(48, 30, 145, 265);
  context.restore();

  context.strokeStyle = "#84a69b";
  context.lineWidth = 1.7;
  context.stroke(glass);
  context.strokeStyle = "#ffffffe0";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(68, 53);
  context.bezierCurveTo(68, 104, 89, 120, 108, 140);
  context.moveTo(68, 265);
  context.bezierCurveTo(69, 227, 85, 207, 106, 185);
  context.stroke();

  const frame = context.createLinearGradient(25, 0, 215, 0);
  frame.addColorStop(0, "#24483d");
  frame.addColorStop(0.45, "#5e7a67");
  frame.addColorStop(1, "#24483d");
  context.fillStyle = frame;
  for (const x of [37, 196]) {
    context.beginPath();
    context.roundRect(x, 32, 7, 258, 3);
    context.fill();
  }
  for (const y of [21, 284]) {
    context.shadowColor = "#26453c22";
    context.shadowBlur = 6;
    context.shadowOffsetY = 4;
    context.beginPath();
    context.roundRect(26, y, 188, 16, 5);
    context.fill();
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    context.fillStyle = "#b6b288";
    context.fillRect(35, y + 2, 170, 1);
    context.fillStyle = frame;
  }
}

function paintClock(container) {
  const state = workspace;
  if (!state?.plan) return;
  const courseId = container === modal ? modalCourseId : "";
  const selection = container === modal ? modalSelection : selected;
  const choices = availableExams(state, courseId);
  const chosen = choices.find(item => item.key === selection) || choices[0];
  const clock = chosen && examCountdown(chosen.exam);
  const output = container.querySelector("[data-hourglass-clock]");
  if (output) output.innerHTML = renderCountdown(clock);
  const canvas = container.querySelector("canvas");
  if (!canvas) return;
  let fraction = 1;
  const startDate = chosen && state.plan.blocks.find(block => block.id === chosen.course.blockId)?.start;
  if (startDate && startDate < chosen.exam.date) {
    const start = new Date(startDate + "T00:00:00").getTime();
    const end = new Date(chosen.exam.date + "T" + (chosen.exam.time || "23:59")).getTime();
    fraction = Math.max(0, Math.min(1, (end - Date.now()) / (end - start)));
  }
  canvas.dataset.fraction = String(fraction);
  canvas.dataset.flowing = String(Boolean(chosen));
  drawGlass(canvas, fraction, Boolean(chosen));
}

function renderModal() {
  if (!modal.open || !workspace?.plan) return;
  if (!courseEntries(workspace).some(item => item.course.id === modalCourseId)) {
    modal.close();
    return;
  }
  modal.innerHTML = `<header class="hourglass-modal-header"><h2>${word("考试沙漏", "Exam hourglass")}</h2>
    <button class="btn secondary" type="button" data-hourglass-close>${word("关闭", "Close")}</button></header>
    ${renderFace(workspace, modalCourseId, modalSelection)}`;
  paintClock(modal);
}

export function renderExamHourglass(state) {
  const owner = window.studyCloud?.degreeAccountId?.() || "";
  if (account !== owner || !state.editable) {
    selected = "";
    modal.close();
  }
  account = owner;
  workspace = state;
  dashboard.hidden = !state.editable || !state.plan;
  if (dashboard.hidden) {
    dashboard.replaceChildren();
    modal.close();
    return;
  }
  dashboard.innerHTML = renderFace(state, "", selected);
  paintClock(dashboard);
  renderModal();
}

export function openExamHourglass(courseId) {
  const state = bridge.getDegreeWorkspace();
  if (!state.editable || !state.plan) return;
  workspace = state;
  modalCourseId = courseId;
  modalSelection = "";
  modal.setAttribute("aria-label", word("考试沙漏", "Exam hourglass"));
  if (!modal.open) modal.showModal();
  renderModal();
  modal.querySelector("[data-hourglass-close]")?.focus();
}

for (const container of [dashboard, modal]) {
  container.addEventListener("change", event => {
    if (!event.target.matches("[data-hourglass-select]")) return;
    if (container === modal) {
      modalSelection = event.target.value;
      renderModal();
    } else {
      selected = event.target.value;
      dashboard.innerHTML = renderFace(workspace, "", selected);
      paintClock(dashboard);
    }
    container.querySelector("[data-hourglass-select]")?.focus();
  });
  container.addEventListener("click", event => {
    if (event.target.closest("[data-hourglass-close]")) modal.close();
    const trigger = event.target.closest("[data-hourglass-plan]");
    if (trigger) {
      modal.close();
      window.studyDegree?.openCourseStudyPlan(trigger.dataset.hourglassPlan);
    }
  });
}
modal.addEventListener("click", event => { if (event.target === modal) modal.close(); });

function refreshCountdowns() {
  if (document.hidden || !workspace?.editable || !workspace.plan) return;
  const current = availableExams(workspace);
  const displayedExam = dashboard.querySelector("[data-hourglass-exam]")?.dataset.hourglassExam || "";
  const selectedEntry = current.find(item => item.key === selected) || current[0];
  if (displayedExam !== (selectedEntry?.key || "") || (selected && !current.some(item => item.key === selected))) {
    selected = "";
    dashboard.innerHTML = renderFace(workspace, "", selected);
  }
  paintClock(dashboard);
  if (modal.open) {
    const choices = availableExams(workspace, modalCourseId);
    const displayed = modal.querySelector("[data-hourglass-exam]")?.dataset.hourglassExam || "";
    const active = choices.find(item => item.key === modalSelection) || choices[0];
    if (displayed !== (active?.key || "")) {
      if (!choices.some(item => item.key === modalSelection)) modalSelection = "";
      renderModal();
    } else {
      paintClock(modal);
    }
  }
}
setInterval(refreshCountdowns, 15000);
document.addEventListener("visibilitychange", refreshCountdowns);

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
function animate(now) {
  animation = 0;
  if (document.hidden || reducedMotion.matches) return;
  for (const container of [dashboard, modal]) {
    if (container === modal ? !modal.open : dashboard.hidden || document.body.classList.contains("timer-mode")) continue;
    const canvas = container.querySelector("canvas");
    if (!canvas || !canvas.getBoundingClientRect().height) continue;
    const box = canvas.getBoundingClientRect();
    if (box.bottom > 0 && box.top < window.innerHeight) {
      drawGlass(canvas, Number(canvas.dataset.fraction), canvas.dataset.flowing === "true", now);
    }
  }
  animation = requestAnimationFrame(animate);
}
function startAnimation() {
  if (!animation && !document.hidden && !reducedMotion.matches) animation = requestAnimationFrame(animate);
}
document.addEventListener("visibilitychange", startAnimation);
reducedMotion.addEventListener("change", startAnimation);
startAnimation();
