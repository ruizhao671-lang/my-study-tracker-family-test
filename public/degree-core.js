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
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function matchName(value) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function examKey(exam) {
  return [exam.term, exam.kind, exam.date, exam.time].join("|");
}

export function examMatches(plan, semesters, rows) {
  if (!plan.term) return [];
  const eligible = plan.modules.flatMap(module => module.courses.filter(course =>
    !isEarned(course, semesters) && (module.kind !== "elective" || course.examTerm === plan.term)
  ));
  const matches = [];
  const seen = new Set();
  for (const row of rows) {
    const candidates = eligible.filter(course => course.code && row.code
      ? matchCode(course.code) === matchCode(row.code)
      : matchName(course.name) === matchName(row.name));
    if (candidates.length !== 1) continue;
    const [course] = candidates;
    const exam = { term: plan.term, kind: row.kind, date: row.date, time: row.time, source: row.source };
    const key = course.id + "|" + examKey(exam);
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = course.exams.filter(item => item.term === exam.term && item.kind === exam.kind);
    if (existing.some(item => examKey(item) === examKey(exam))) continue;
    matches.push({ course, exam, existing });
  }
  return matches.map(match => {
    const competing = matches.filter(other => other.course === match.course && other.exam.kind === match.exam.kind);
    const previous = match.existing.length === 1 && competing.length === 1 && match.existing[0].source
      ? match.existing[0] : null;
    return { ...match, previous };
  });
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
