import assert from "node:assert/strict";
import { makeSharedState } from "./public/cloud-core.js";
import {
  addTumStudyPeriods, applyExamMatches, chooseTargetExam, creditTotals, examMatches, newCourse,
  normalizeModuleCode, parseStudyTasks, replaceTumMathChoice, useTumTemplate
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
assert.equal("degreePlan" in makeSharedState({ degreePlan: plan }), false);
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
chooseTargetExam(selectedMath, planning, "retake", "2026-11-14");
assert.equal(selectedMath.blockId, planning.blocks[1].id);
chooseTargetExam(selectedMath, planning, "", "2026-11-14");
assert.equal(selectedMath.examId, "");
assert.equal(selectedMath.blockId, planning.blocks[1].id);
selectedMath.passed = true;
replaceTumMathChoice(planning, selectedMath.id, "MA9410");
const numerical = planning.modules[0].courses.find(course => course.code === "MA9410");
assert.equal(creditTotals(planning, []).earned, 0);
assert.equal(numerical.exams.length, 0);
replaceTumMathChoice(planning, numerical.id, "EI00460");
assert.equal(creditTotals(planning, []).earned, 5);
assert.equal(planning.modules[0].courses.find(course => course.code === "EI00460").exams[0].id, "retake");

console.log("PASS degree template, ECTS, linked tasks, exam filtering, study periods, and sharing");
