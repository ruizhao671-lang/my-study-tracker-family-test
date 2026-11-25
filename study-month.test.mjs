import assert from "node:assert/strict";
import {studySchedulePeriod,shiftStudyScheduleDate,studyMonthEntries,monthTaskWeeks} from "./public/study-plan-core.js";
assert.deepEqual([studySchedulePeriod("2026-11-25","month").first,studySchedulePeriod("2026-11-25","month").last],["2026-11-01","2026-11-30"]);
assert.equal(studySchedulePeriod("2024-02-29","month").dates.length,29);
assert.equal(studySchedulePeriod("2027-02-15","month").dates.length,28);
assert.equal(studySchedulePeriod("2026-12-15","month").dates.length,31);
assert.deepEqual(studySchedulePeriod("2026-11-25","week").dates,["2026-11-23","2026-11-24","2026-11-25","2026-11-26","2026-11-27","2026-11-28","2026-11-29"]);
assert.deepEqual(studySchedulePeriod("2026-11-25","day").dates,["2026-11-25"]);
assert.equal(shiftStudyScheduleDate("2027-01-31","month",1),"2027-02-28");
assert.equal(shiftStudyScheduleDate("2024-01-31","month",1),"2024-02-29");
assert.equal(shiftStudyScheduleDate("2026-12-31","month",1),"2027-01-31");
assert.equal(shiftStudyScheduleDate("2027-01-31","month",-1),"2026-12-31");
assert.equal(shiftStudyScheduleDate("2026-11-25","week",1),"2026-12-02");
const state={semesters:[{id:"s",courses:[{id:"l",categories:[{id:"cat",tasks:[{id:"t",title:"Week 7",weekOf:"2026-11-23",done:false},{id:"undated",title:"Week 8",done:false},{id:"done",title:"Done",weekOf:"2026-11-23",done:true}]}]},{id:"other-l",categories:[{id:"other-cat",tasks:[{id:"other-task",title:"Other",weekOf:"2026-11-23",done:false}]}]}]}],degreePlan:{blocks:[],modules:[{id:"m",courses:[
{id:"c",name:"Course",courseId:"l",passed:false,tasks:[],exams:[{id:"first",date:"2026-11-20",time:"10:00"},{id:"retake",date:"2026-11-27",time:"14:00"}],planEvents:[
{id:"class",type:"class",title:"Class",date:"2026-11-04",startTime:"13:15",endTime:"16:15",repeat:{weekdays:[3],until:"2026-11-25",exceptDates:["2026-11-11"]}},
{id:"study",type:"study",title:"Work",taskId:"t",date:"2026-11-26",startTime:"18:00",endTime:"20:00",hours:2}]},
{id:"other",name:"Other",courseId:"other-l",passed:false,tasks:[],exams:[],planEvents:[]}
]}]},timer:{sessions:[],calendarItems:[{id:"manual",title:"Saved retake",type:"exam",degreeCourseId:"c",degreeExamId:"retake",date:"2026-11-27",startTime:"14:00"},{id:"reminder",type:"reminder",title:"Appointment",date:"2026-11-24"}]}};
const before=JSON.stringify(state);
const entries=studyMonthEntries(state,"2026-11-01","2026-11-30");
assert.deepEqual(entries.filter(e=>e.kind==="exam").map(e=>e.date).sort(),["2026-11-20","2026-11-27"],"Month shows all known sittings, with no duplicate saved exam");
assert.equal(entries.filter(e=>e.type==="class").length,3);
assert.ok(!entries.some(e=>e.type==="class"&&e.date==="2026-11-11"));
assert.equal(entries.filter(e=>e.kind==="calendar").length,1);
assert.equal(monthTaskWeeks(state,"2026-11","c").find(w=>w.date==="2026-11-23").count,1);
assert.equal(monthTaskWeeks(state,"2026-11").find(w=>w.date==="2026-11-23").count,2);
assert.ok(!monthTaskWeeks(state,"2026-11").flatMap(w=>w.taskIds).includes("undated"),"No invented date from a Week label");
assert.equal(JSON.stringify(state),before,"Month projects existing data without copies or writes");
console.log("PASS monthly schedule periods, leap years, month clamping and year navigation, recurring exceptions, all exam sittings with deduplication, course-filtered task weeks and no fabricated dates or writes");
