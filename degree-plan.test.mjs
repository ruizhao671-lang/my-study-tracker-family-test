import assert from "node:assert/strict";
import { makeSharedState } from "./public/cloud-core.js";
import { applyExamMatches, creditTotals, examMatches, newCourse, parseStudyTasks, useTumTemplate } from "./public/degree-core.js";

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
console.log("PASS degree template, ECTS, linked tasks, exam filtering and updates, and sharing");
