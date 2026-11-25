import { TUM_EI_BACHELOR } from "./degree-templates.js";

export function newCourse(fields) {
  return {
    id: crypto.randomUUID(),
    code: "",
    credits: 0,
    passed: false,
    courseId: "",
    passTaskId: "",
    blockId: "",
    examTerm: "",
    exams: [],
    examId: "",
    tasks: [],
    ...fields
  };
}

export function newModule(fields) {
  return { id: crypto.randomUUID(), name: "", requiredCredits: 0, kind: "required", courses: [], ...fields };
}

export function makePlan(name, requiredCredits) {
  return { name, requiredCredits, modules: [], blocks: [], term: "", weeklyHours: 0 };
}

export function useTumTemplate(mathCode = "EI00460") {
  const plan = makePlan(TUM_EI_BACHELOR.name, TUM_EI_BACHELOR.requiredCredits);
  plan.examSource = "tum-ei";
  plan.modules = TUM_EI_BACHELOR.modules.map(({ choices, courses, ...fields }) => {
    const selected = choices?.find(course => course.code === mathCode);
    return newModule({ ...fields, courses: [...courses, ...(selected ? [selected] : [])].map(newCourse) });
  });
  return plan;
}

export function isTumMathChoice(plan, course) {
  return plan.examSource === "tum-ei" && TUM_EI_BACHELOR.modules[0].choices.some(choice => choice.code === normalizeModuleCode(course.code));
}

export function replaceTumMathChoice(plan, courseId, code) {
  const module = plan.modules.find(group => group.courses.some(course => course.id === courseId));
  const current = module?.courses.find(course => course.id === courseId);
  const next = TUM_EI_BACHELOR.modules[0].choices.find(choice => choice.code === code);
  if (!current || !next || !isTumMathChoice(plan, current)) return;
  const currentCode = normalizeModuleCode(current.code);
  if (currentCode === code) return;
  plan.mathAlternatives ??= {};
  const replacement = plan.mathAlternatives[code] ?? newCourse({ ...next, blockId: current.blockId });
  plan.mathAlternatives[currentCode] = current;
  delete plan.mathAlternatives[code];
  module.courses = module.courses.map(course => course.id === courseId ? replacement : course);
}

// Source: https://www.tum.de/en/studies/application/application-info-portal/dates-periods-and-deadlines
// Lecture dates published by TUM. Break blocks extend to the next lecture period.
export const TUM_TERMS = [
  { term: "SS 2026", starts: "2026-04-01", lectureStart: "2026-04-13", lectureEnd: "2026-07-17", breakEnd: "2026-10-11" },
  { term: "WS 2026/27", starts: "2026-10-01", lectureStart: "2026-10-12", lectureEnd: "2027-02-05", breakEnd: "2027-04-11", lectureBreaks:[{start:"2026-12-24",end:"2027-01-06"}] },
  { term: "SS 2027", starts: "2027-04-01", lectureStart: "2027-04-12", lectureEnd: "2027-07-16", breakEnd: "2027-10-17" },
  { term: "WS 2027/28", starts: "2027-10-01", lectureStart: "2027-10-18", lectureEnd: "2028-02-11", breakEnd: "2028-03-31" }
];

function dayAfter(date) {
  return new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
}

export function addTumStudyPeriods(plan, date) {
  if (plan.examSource !== "tum-ei") return;
  const active = TUM_TERMS.findLastIndex(term => term.starts <= date);
  if (active < 0 || date > TUM_TERMS[active].breakEnd) return;
  plan.term ||= TUM_TERMS[active].term;
  const ids = new Set(plan.blocks.map(block => block.id));
  const first = active > 0 && date < TUM_TERMS[active].lectureStart ? active - 1 : active;
  for (const term of TUM_TERMS.slice(first, active + 2)) {
    const entries = [
      { kind: "lecture", name: term.term + " · Vorlesungszeit", start: term.lectureStart, end: term.lectureEnd },
      { kind: "break", name: term.term + " · Vorlesungsfreie Zeit", start: dayAfter(term.lectureEnd), end: term.breakEnd }
    ];
    for (const entry of entries) {
      const id = "tum-" + term.starts + "-" + entry.kind;
      if (entry.end >= date && !ids.has(id) && !plan.blocks.some(block => block.start === entry.start && block.end === entry.end)) {
        plan.blocks.push({ ...entry, id });
      }
    }
  }
  plan.blocks.sort((left, right) => left.start.localeCompare(right.start));
}

export function nextExam(course, plan, date) {
  const block = plan.blocks.find(item => item.id === course.blockId);
  const followingBreak = block?.kind === "lecture"
    ? plan.blocks.find(item => item.kind === "break" && item.start === dayAfter(block.end))
    : null;
  const end = followingBreak?.end ?? block?.end;
  const start = block && block.start > date ? block.start : date;
  return course.exams.filter(exam => exam.date >= start && (!end || exam.date <= end))
    .sort((left, right) => left.date.localeCompare(right.date) || (left.time || "24:00").localeCompare(right.time || "24:00"))[0];
}

export function examCountdown(exam, now = new Date()) {
  if (!exam?.date) return null;
  const start = new Date(exam.date + "T00:00:00");
  if (!Number.isFinite(start.getTime())) return null;
  const dateOnly = !exam.time;
  const target = dateOnly ? new Date(start) : new Date(exam.date + "T" + exam.time);
  if (dateOnly) target.setDate(target.getDate() + 1);
  if (!Number.isFinite(target.getTime())) return null;
  const milliseconds = target.getTime() - now.getTime();
  const minutes = Math.max(0, Math.ceil(milliseconds / 60000));
  const dayStart = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const calendarDays = Math.round((Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) - dayStart) / 86400000);
  return {
    dateOnly, expired: milliseconds <= 0, milliseconds,
    days: dateOnly ? Math.max(0, calendarDays) : Math.floor(minutes / 1440),
    hours: Math.floor(minutes / 60) % 24, minutes: minutes % 60
  };
}

export function scheduleNewExamCourse(course, plan, date) {
  if (course.examPlacement === "manual" || (course.blockId && course.examPlacement !== "auto")) return;
  const exam = nextExam({ ...course, blockId: "" }, plan, date);
  const block = exam && plan.blocks.find(item => item.start <= exam.date && exam.date <= item.end);
  course.blockId = block?.id ?? "";
  course.examPlacement = "auto";
}

export function normalizeModuleCode(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\p{Cc}\p{Cf}\uFFFD]/gu, "").trim();
}

export function creditNumber(value) {
  const number = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(number) && number >= 0 && number <= 1000 ? number : null;
}

function normalizeCourseSearch(text) {
  return text.normalize("NFKD").toLowerCase().replace(/\p{Diacritic}/gu, "").replaceAll("ß", "ss")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isSmallSpellingChange(typed, word) {
  if (Math.abs(typed.length - word.length) > 1) return false;
  let index = 0;
  const sharedLength = Math.min(typed.length, word.length);
  while (index < sharedLength && typed[index] === word[index]) index++;
  if (typed.length < word.length) return typed.slice(index) === word.slice(index + 1);
  if (typed.length > word.length) return typed.slice(index + 1) === word.slice(index);
  return typed.slice(index + 1) === word.slice(index + 1) ||
    (typed[index] === word[index + 1] && typed[index + 1] === word[index] && typed.slice(index + 2) === word.slice(index + 2));
}

export function findCatalogueCourses(courses, value) {
  const query = normalizeCourseSearch(value);
  if (query.length < 2) return [];
  const compact = query.replaceAll(" ", "");
  const looksLikeCode = /^[a-z]{0,6}\d{2,}[a-z]?\d*$/.test(compact);
  const terms = query.split(" ");
  const contentWords = terms.filter(term => term !== "und" && term !== "and");
  const words = contentWords.length ? contentWords : terms;
  const withoutActivity = words.length > 1 && /^(praktikum|vorlesung|ubung)$/.test(words[0]) ? words.slice(1) : null;

  const score = course => {
    const code = normalizeCourseSearch(course.code).replaceAll(" ", "");
    if (code === compact) return 0;
    if (looksLikeCode) return code.startsWith(compact) ? 1 : code.includes(compact) ? 2 : Infinity;
    const name = normalizeCourseSearch(course.name);
    if (name === query) return 0;
    const candidates = name.split(" ");
    const scoreWords = tokens => tokens.reduce((total, token) => {
      if (candidates.includes(token)) return total;
      if (candidates.some(word => word.startsWith(token))) return total + 1;
      if (name.includes(token) || code.includes(token)) return total + 2;
      const close = token.length >= 4 && /^\p{L}+$/u.test(token) &&
        candidates.some(word => word.length >= 4 && isSmallSpellingChange(token, word));
      return close ? total + 5 : Infinity;
    }, 0);
    return 1 + Math.min(scoreWords(words), withoutActivity ? 3 + scoreWords(withoutActivity) : Infinity);
  };
  const distinct = [...new Map(courses.map(course => [course.code, course])).values()];
  return distinct.map(course => ({ course, score: score(course) })).filter(match => Number.isFinite(match.score))
    .sort((left, right) => left.score - right.score).map(match => match.course);
}

export function courseTasks(courseId, semesters) {
  const course = semesters.flatMap(stage => stage.courses).find(item => item.id === courseId);
  return course?.categories.flatMap(category => category.tasks) ?? [];
}

export function isEarned(course, semesters) {
  if (!course.passTaskId) return course.passed === true;
  return courseTasks(course.courseId, semesters).some(task => task.id === course.passTaskId && task.done);
}

export function setProgressLink(course, courseId, passTaskId, semesters) {
  if (course.passTaskId && (!passTaskId || course.courseId !== courseId)) {
    course.passed = isEarned(course, semesters);
  }
  course.courseId = courseId;
  course.passTaskId = passTaskId;
}

export function creditTotals(plan, semesters) {
  const modules = plan.modules.map(module => {
    const earned = Math.round(module.courses.reduce((total, course) =>
      total + (isEarned(course, semesters) ? course.credits : 0), 0
    ) * 100) / 100;
    const counted = Math.min(earned, module.requiredCredits);
    const requiredPassed = module.kind === "elective" || module.courses.every(course => isEarned(course, semesters));
    return { module, earned, counted, complete: earned >= module.requiredCredits && requiredPassed };
  });
  const earned = Math.round(modules.reduce((sum, module) => sum + module.counted, 0) * 100) / 100;
  return { modules, earned, complete: modules.length > 0 && earned >= plan.requiredCredits && modules.every(module => module.complete) };
}

function matchCode(value) {
  return normalizeModuleCode(value).toUpperCase().replace(/[^A-Z0-9_]/g, "");
}

function matchName(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function examKey(exam) {
  return [exam.term, exam.kind, exam.date, exam.time].join("|");
}

export function linkedProgressCourse(course, semesters) {
  const available = semesters.flatMap(stage => stage.courses);
  return available.find(item => item.id === course.courseId);
}

export function suggestProgressCourse(name, semesters) {
  const available = semesters.flatMap(stage => stage.courses);
  name = matchName(name);
  if (!name) return undefined;
  const matches = available.filter(item => matchName(item.name) === name);
  return matches.length === 1 ? matches[0] : undefined;
}

export function revisionProgress(course, semesters) {
  const linked = linkedProgressCourse(course, semesters);
  const existing = linked?.categories.flatMap(group => group.tasks) ?? [];
  const tasks = [...existing.filter(task => task.id !== course.passTaskId), ...course.tasks];
  const done = tasks.filter(task => task.done).length;
  return { linked, existing, total: tasks.length, done, ratio: tasks.length ? done / tasks.length : 0 };
}

export function timeBlockCredits(plan, semesters) {
  const summary = new Map(plan.blocks.map(block => [block.id, { planned: 0, weighted: 0, courses: [] }]));
  for (const module of plan.modules) {
    for (const course of module.courses) {
      const entry = summary.get(course.blockId);
      if (!entry) continue;
      const progress = revisionProgress(course, semesters);
      entry.planned += course.credits;
      entry.weighted += course.credits * progress.ratio;
      entry.courses.push({ course, progress });
    }
  }
  return summary;
}

export function campusForVenue(location) {
  const campuses = [];
  if (/\b(?:MUC|München|Munich|Stammgelände)\b/i.test(location)) campuses.push("München");
  if (/\b(?:GAR|Garching)\b/i.test(location)) campuses.push("Garching");
  return campuses.join(" / ");
}

function sameVenue(a, b) {
  return (a || "").trim().replace(/\s+/g, " ") === (b || "").trim().replace(/\s+/g, " ");
}

export function examMatches(plan, semesters, rows) {
  if (!plan.term) return [];
  const eligible = plan.modules.flatMap(module => module.courses.filter(course =>
    !isEarned(course, semesters) && (module.kind !== "elective" || course.examTerm === plan.term)
  ));
  const byCourse = new Map();
  for (const row of rows) {
    const candidates = eligible.filter(course => course.code && row.code
      ? matchCode(course.code) === matchCode(row.code)
      : matchName(course.name) === matchName(row.name));
    if (candidates.length !== 1) continue;
    const [course] = candidates;
    const exam = { term: plan.term, kind: row.kind, date: row.date, time: row.time, source: row.source, location: row.location || "" };
    const byKey = byCourse.get(course) ?? new Map();
    const key = examKey(exam);
    if (!byKey.has(key) || (exam.location && !byKey.get(key).location)) byKey.set(key, exam);
    byCourse.set(course, byKey);
  }

  const matches = [];
  for (const [course, imported] of byCourse) {
    const saved = course.exams.filter(exam => exam.term === plan.term);
    for (const [key, exam] of imported) {
      const exact = saved.find(item => examKey(item) === key);
      if (exact) {
        if (exam.location && !sameVenue(exam.location, exact.location)) {
          matches.push({ course, exam: { ...exact, location: exam.location }, previous: exact, change: "location" });
        }
        continue;
      }
      const sameSource = saved.filter(item => item.kind === exam.kind && item.source && item.source === exam.source);
      const newFromSource = [...imported.values()].filter(item => item.kind === exam.kind && item.source === exam.source);
      const previous = sameSource.length === 1 && newFromSource.length === 1 && !imported.has(examKey(sameSource[0]))
        ? sameSource[0] : null;
      if (previous && !exam.location) exam.location = previous.location || "";
      matches.push({ course, exam, previous, change: previous ? "rescheduled" : "added" });
    }
  }
  return matches;
}


export function applyExamMatches(matches) {
  for (const { course, exam, previous } of matches) {
    const id = previous?.id ?? crypto.randomUUID();
    course.exams = [...course.exams.filter(item => item.id !== id), { ...exam, id }];
  }
}

export function daysBetween(start, end) {
  if (!start || !end) return null;
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
}

export const STUDY_PLAN_LINK_PREFIX = "#study-plan-v1=";

export function studyPlanFromLink(hash) {
  const match = hash.match(/^#study-plan-v([12])=(.*)$/);
  if (!match) return null;
  const encoded = match[2];
  if (encoded.length > 90000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("Invalid study plan link");
  const bytes = Uint8Array.from(atob(encoded.replaceAll("-", "+").replaceAll("_", "/")), character => character.charCodeAt(0));
  const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) || {};
  const { course, tasks, events, period } = payload;
  const validTasks = typeof tasks === "string" ? tasks.trim() && tasks.length <= 30000 :
    Array.isArray(tasks) && tasks.length <= 500;
  const validPeriod = !period || (!Array.isArray(period) && typeof period === "object" &&
    typeof period.start === "string" && typeof period.end === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(period.start) && /^\d{4}-\d{2}-\d{2}$/.test(period.end) &&
    (period.exceptDates === undefined || (Array.isArray(period.exceptDates) && period.exceptDates.every(date=>typeof date==="string"))));
  if (!validPeriod || !validTasks || (events !== undefined && (!Array.isArray(events) || events.length > 500)) ||
      (course !== undefined && (typeof course !== "string" || course.length > 40))) {
    throw new Error("Invalid study plan data");
  }
  return { course: normalizeModuleCode(course).toUpperCase(), tasks,
    ...(events ? { events } : {}), ...(period ? { period } : {}) };
}

export function parseStudyTasks(text, blocks) {
  const normalizePeriod = value => value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  const names = new Map();
  for (const { id, name, aliases = [] } of blocks) {
    for (const label of [name, ...aliases]) {
      const key = normalizePeriod(label);
      names.set(key, names.has(key) && names.get(key) !== id ? null : id);
    }
  }
  const tasks = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^```/.test(line)) continue;
    const columns = line.replace(/^(?:[-•]\s+|\d+[.)]\s+|[|｜])/, "").replace(/[|｜]$/, "")
      .split(/[|｜]/).map(value => value.trim());
    if (columns.every(value => /^:?-{2,}:?$/.test(value))) continue;
    if (/^(?:时间块|study period)$/i.test(columns[0]) && columns.length === 4) continue;
    const [blockName, group, title, rawHours] = columns.length === 4 ? columns : [columns[2], "", columns[0], columns[1]];
    const hoursText = rawHours?.replace(/\s*(h|hours?|小时|stunden?)$/i, "").trim();
    const unknownHours = /^(?:待定|待估算|未知|未估算|tbd|unknown|\?)$/i.test(hoursText || "");
    const hours = unknownHours ? null : creditNumber(hoursText);
    if (columns.length < 2 || columns.length > 4 || !title || !hoursText || (hours === null && !unknownHours)) throw new Error(raw);
    const followsCourse = !blockName || /^(?:跟随课程|use course placement)$/i.test(blockName);
    tasks.push({
      id: crypto.randomUUID(), title: title.slice(0, 180), group: group.slice(0, 100), hours,
      blockId: followsCourse ? "" : names.get(normalizePeriod(blockName)) ?? null,
      requestedPeriod: followsCourse ? "" : blockName, done: false
    });
  }
  return tasks;
}
