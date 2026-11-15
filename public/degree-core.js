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

// Lecture dates published by TUM. Break blocks extend to the next lecture period.
const TUM_TERMS = [
  { term: "SS 2026", starts: "2026-04-01", lectureStart: "2026-04-13", lectureEnd: "2026-07-17", breakEnd: "2026-10-11" },
  { term: "WS 2026/27", starts: "2026-10-01", lectureStart: "2026-10-12", lectureEnd: "2027-02-05", breakEnd: "2027-04-11" },
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

export function courseTasks(courseId, semesters) {
  const course = semesters.flatMap(stage => stage.courses).find(item => item.id === courseId);
  return course?.categories.flatMap(category => category.tasks) ?? [];
}

export function isEarned(course, semesters) {
  if (!course.passTaskId) return course.passed === true;
  return courseTasks(course.courseId, semesters).some(task => task.id === course.passTaskId && task.done);
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
  return normalizeModuleCode(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
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

export function timeBlockCredits(plan, semesters, date) {
  const summary = new Map(plan.blocks.map(block => [block.id, { planned: 0, weighted: 0, courses: [] }]));
  for (const module of plan.modules) {
    for (const course of module.courses) {
      const exam = !isEarned(course, semesters) ? nextExam(course, plan, date) : undefined;
      const examBlock = exam && plan.blocks.find(block => block.start <= exam.date && exam.date <= block.end);
      const entry = summary.get(examBlock?.id ?? course.blockId);
      if (!entry) continue;
      const progress = revisionProgress(course, semesters);
      entry.planned += course.credits;
      entry.weighted += course.credits * progress.ratio;
      entry.courses.push({ course, exam, progress });
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

export function parseStudyTasks(text, blocks) {
  return text.split(/\r?\n/).filter(line => line.trim()).map(line => {
    const [title, rawHours, blockName] = line.replace(/^\s*[-•]\s*/, "").split(/[|｜]/).map(value => value.trim());
    const hours = creditNumber(rawHours?.replace(/\s*(h|hours?|小时|stunden?)$/i, ""));
    const block = blockName ? blocks.find(item => item.name === blockName) : null;
    if (!title || !rawHours || hours === null || (blockName && !block)) {
      throw new Error(line);
    }
    return { id: crypto.randomUUID(), title: title.slice(0, 180), hours, blockId: block?.id ?? "", done: false };
  });
}
