import assert from "node:assert/strict";
import { makeSharedState } from "./public/cloud-core.js";
import {
  addTumStudyPeriods, applyExamMatches, nextExam, scheduleNewExamCourse, creditTotals, examMatches, newCourse,
  campusForVenue, normalizeModuleCode, parseStudyTasks, replaceTumMathChoice, revisionProgress, suggestProgressCourse, timeBlockCredits, useTumTemplate
} from "./public/degree-core.js";

const plan = useTumTemplate();
assert.equal(plan.requiredCredits, 180);
assert.equal(plan.modules.reduce((sum, module) => sum + module.requiredCredits, 0), 180);
assert.equal(plan.modules[0].courses.reduce((sum, course) => sum + course.credits, 0), 32);
assert.equal(plan.modules[0].courses.filter(course => course.code === "EI00460").length, 1);

const math = plan.modules[0];
const discrete = math.courses.find(course => course.code === "EI00460");
const passedAnalysis = math.courses.find(course => course.code === "MA9411");
passedAnalysis.passed = true;
assert.equal(creditTotals(plan, []).earned, 6);

discrete.courseId = "old-course";
discrete.passTaskId = "passed-exam";
const ordinary = { id: "revision", done: true };
const examTask = { id: "passed-exam", done: false };
const stages = [{ courses: [{ id: "old-course", categories: [{ tasks: [ordinary, examTask] }] }] }];
assert.equal(creditTotals(plan, stages).earned, 6);
examTask.done = true;
assert.equal(creditTotals(plan, stages).earned, 11);
examTask.done = false;

plan.term = "WS 2026/27";
const electives = plan.modules.find(module => module.kind === "elective");
electives.courses.push(
  newCourse({ code: "EI00888", name: "Planned elective", credits: 5, examTerm: plan.term }),
  newCourse({ code: "EI00999", name: "Other term", credits: 5, examTerm: "SS 2027" }),
);
const row = (code, kind, date) => ({ code, kind, date, time: "14:00", name: "", source: "TUM" });
const rows = [
  row("EI00460", "first", "2027-02-10"),
  row("EI00460", "retake", "2027-03-24"),
  row("MA9411", "first", "2027-02-15"),
  row("EI00888", "first", "2027-02-15"),
  row("EI00999", "retake", "2027-03-23"),
  row("EI00460", "retake", "2027-03-24")
];
const economics = newCourse({ code: "WI001056_1", name: "Principles of Economics", credits: 6, examTerm: plan.term });
electives.courses.push(economics);
assert.equal(examMatches(plan, stages, [row("WI001056_1", "first", "2027-02-15")])[0].course, economics);
assert.deepEqual(examMatches(plan, stages, [row("WI001056", "first", "2027-02-15")]), []);
assert.deepEqual(examMatches(plan, stages, [row("WI0010561", "first", "2027-02-15")]), []);
const matches = examMatches(plan, stages, rows);
assert.deepEqual(matches.map(item => item.course.code), ["EI00460", "EI00460", "EI00888"]);
applyExamMatches(matches);
assert.deepEqual(discrete.exams.map(exam => exam.kind), ["first", "retake"]);
assert.equal(examMatches(plan, stages, rows).length, 0);

const selectedRetake = discrete.exams.find(exam => exam.kind === "retake");
discrete.examId = selectedRetake.id;
const changed = examMatches(plan, stages, [row("EI00460", "retake", "2027-03-25")]);
assert.equal(changed[0].previous.date, "2027-03-24");
applyExamMatches(changed);
assert.equal(discrete.exams.find(exam => exam.id === discrete.examId).date, "2027-03-25");

const tasks = parseStudyTasks("Chapter 1 | 2\nMock exam | 1,5 | Break", [{ id: "holiday", name: "Break" }]);
assert.deepEqual(tasks.map(item => [item.hours, item.blockId]), [[2, ""], [1.5, "holiday"]]);
assert.throws(() => parseStudyTasks("Chapter 1 | 2 | Typo", []));
const shared = makeSharedState({ degreePlan: plan, timer: { calendarItems: [
  { id: "manual" }, { id: "linked", degreeExamId: "exam" }, { id: "was-linked", privateDegreeExam: true }
] } });
assert.equal("degreePlan" in shared, false);
assert.deepEqual(shared.timer.calendarItems.map(item => item.id), ["manual"]);
const planning = useTumTemplate();
addTumStudyPeriods(planning, "2026-11-14");
assert.equal(planning.term, "WS 2026/27");
assert.deepEqual(planning.blocks.map(block => block.kind), ["lecture", "break", "lecture", "break"]);
assert.equal(planning.blocks[1].start, "2027-02-06");
assert.equal(planning.blocks[1].end, "2027-04-11");
const blocksBeforeRetry = structuredClone(planning.blocks);
addTumStudyPeriods(planning, "2026-11-14");
assert.deepEqual(planning.blocks, blocksBeforeRetry);

const selectedMath = planning.modules[0].courses.find(course => course.code === "EI00460");
assert.equal(normalizeModuleCode("\uFEFFＥＩ００４６０\u200b"), "EI00460");
selectedMath.exams.push({ id: "retake", date: "2027-03-24", time: "14:00", kind: "retake" });
selectedMath.exams.push({ id: "first", date: "2027-02-10", time: "10:00", kind: "first" });
selectedMath.examId = "retake";
assert.equal(nextExam(selectedMath, planning, "2026-11-14").id, "first");
assert.equal(nextExam(selectedMath, planning, "2027-02-11").id, "retake");
scheduleNewExamCourse(selectedMath, planning, "2026-11-14");
assert.equal(selectedMath.blockId, planning.blocks[1].id);
selectedMath.blockId = planning.blocks[2].id;
selectedMath.examPlacement = "manual";
assert.equal(nextExam(selectedMath, planning, "2026-11-14"), undefined);
scheduleNewExamCourse(selectedMath, planning, "2026-11-14");
assert.equal(selectedMath.blockId, planning.blocks[2].id);
selectedMath.exams.push({ id: "next-term", date: "2027-08-03", time: "09:00", kind: "first" });
assert.equal(nextExam(selectedMath, planning, "2026-11-14").id, "next-term");
selectedMath.blockId = planning.blocks[0].id;
assert.equal(nextExam(selectedMath, planning, "2026-11-14").id, "first");
selectedMath.passed = true;
replaceTumMathChoice(planning, selectedMath.id, "MA9410");
const numerical = planning.modules[0].courses.find(course => course.code === "MA9410");
assert.equal(creditTotals(planning, []).earned, 0);
assert.equal(numerical.exams.length, 0);
replaceTumMathChoice(planning, numerical.id, "EI00460");
assert.equal(creditTotals(planning, []).earned, 5);
assert.equal(planning.modules[0].courses.find(course => course.code === "EI00460").exams[0].id, "retake");

const electiveGroup = plan.modules.find(module => module.kind === "elective");
const more = electiveGroup.courses.find(course => course.code === "EI00888");
const kept = more.exams[0];
more.examId = kept.id;
const unchangedAndNew = [
  { ...row("EI00888", "first", "2027-02-15"), location: "MUC - 05 1200" },
  { ...row("EI00888", "first", "2027-03-01"), location: "GAR - MI HS1" }
];
const incremental = examMatches(plan, stages, unchangedAndNew);
assert.deepEqual(incremental.map(item => item.change), ["location", "added"]);
applyExamMatches(incremental);
assert.equal(more.exams.length, 2);
assert.equal(more.examId, kept.id);
assert.equal(more.exams.find(item => item.id === kept.id).location, "MUC - 05 1200");
assert.equal(examMatches(plan, stages, unchangedAndNew).length, 0);
assert.equal(campusForVenue("MUC - 05 1200; GAR - MI HS1"), "München / Garching");
assert.equal(campusForVenue("Eikon-Rechnerräume"), "");

const weightedPlan = useTumTemplate();
addTumStudyPeriods(weightedPlan, "2026-11-14");
const weightedMath = weightedPlan.modules[0].courses.find(course => course.code === "EI00460");
weightedMath.blockId = weightedPlan.blocks[0].id;
weightedMath.examId = "march-exam";
weightedMath.exams.push({ id: "march-exam", date: "2027-03-24" });
const linked = { id: "old-discrete", name: "Diskrete Mathematik für Ingenieure", categories: [{
  tasks: [{ id: "chapter-one", done: true }, { id: "chapter-two", done: false }]
}] };
const history = [{ courses: [linked] }];
assert.equal(suggestProgressCourse(weightedMath.name, history).id, "old-discrete");
assert.equal(revisionProgress(weightedMath, history).total, 0);
weightedMath.courseId = linked.id;
assert.equal(revisionProgress(weightedMath, history).ratio, 0.5);
const periodCredits = timeBlockCredits(weightedPlan, history, "2026-11-14");
assert.equal(periodCredits.get(weightedPlan.blocks[0].id).planned, 0);
assert.equal(periodCredits.get(weightedPlan.blocks[1].id).planned, 5);
assert.equal(periodCredits.get(weightedPlan.blocks[1].id).weighted, 2.5);
linked.categories[0].tasks[1].done = true;
assert.equal(timeBlockCredits(weightedPlan, history, "2026-11-14").get(weightedPlan.blocks[1].id).weighted, 5);
assert.equal(creditTotals(weightedPlan, history).earned, 0);
weightedMath.courseId = "";
assert.equal(revisionProgress(weightedMath, history).total, 0);
console.log("PASS linked forecast, exam additions and venue updates, degree templates, and sharing");
