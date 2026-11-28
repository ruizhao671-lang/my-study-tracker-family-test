import assert from "node:assert/strict";
import {progressTaskScheduleIndex,taskSchedulePresentation,isLegacyDateDetail,progressTaskName} from "./public/study-progress-view.js";
import {patchStudyScheduleEntry,removeStudyScheduleEntry,removeCourseStudyTask,studyTaskItems} from "./public/study-plan-core.js";
import {setStudyTaskDone,reconcileLinkedTasks,studyTaskIndex} from "./public/study-task-sync.js";
const source={id:"learning",name:"Komputer & Creativität",categories:[
{id:"vl",name:"Vorlesung",tasks:[{id:"v8",title:"Week 8",detail:"02.11.2026",estimatedHours:3,done:false,note:"Keep notes",attachments:[{name:"keep.pdf"}]},
{id:"v15",title:"Week 15",detail:"27.01.2026",estimatedHours:3,done:false},
{id:"held",title:"Week 12",detail:"30.12.2026",schedulingMode:"fixed",fixedTimePending:true,done:false}]},
{id:"ha",name:"Hausaufgabe",tasks:[{id:"h8",title:"Week 8",detail:"Complete worksheet",estimatedHours:4,weekOf:"2026-11-30",done:false}]}]};
const course={id:"kc",code:"EI04001",name:source.name,courseId:"learning",tasks:[],exams:[],planEvents:[
{id:"classes",type:"class",title:"K&C class",date:"2026-12-02",startTime:"13:15",endTime:"16:15",repeat:{until:"2027-01-27",weekdays:[3],exceptDates:[]},taskWeekLinks:{"2026-11-30":"v8","2027-01-25":"v15"}}]};
const state={semesters:[{id:"s",name:"Winter",courses:[source]}],degreePlan:{modules:[{id:"m",courses:[course]}],blocks:[]},timer:{sessions:[],calendarItems:[]}};
const before=JSON.stringify(state),index=()=>progressTaskScheduleIndex(state,"2026-11-28");
assert.equal(isLegacyDateDetail("02.11.2026"),true);assert.equal(isLegacyDateDetail("2026-12-02 13:15–16:15"),true);
assert.equal(isLegacyDateDetail("Review the worksheet from 02.11.2026"),false);
assert.equal(progressTaskName(source.categories[0].tasks[0]),"Week 8");
assert.equal(progressTaskName(source.categories[1].tasks[0]),"Week 8 Complete worksheet");
let projection=index();assert.equal(projection.size,4);assert.equal(projection.get("v8").slots[0].date,"2026-12-02");
assert.equal(projection.get("v15").slots[0].date,"2027-01-27","Actual calendar year wins over legacy date text");
assert.ok(taskSchedulePresentation(projection.get("v8")).text.includes("2026-12-02 13:15–16:15"));
assert.ok(!taskSchedulePresentation(projection.get("v8")).text.includes("02.11.2026"));
assert.equal(projection.get("h8").slots.length,0,"Same titles in another category never match by name");
assert.ok(taskSchedulePresentation(projection.get("held")).text.includes("时间待定"));
assert.equal(JSON.stringify(state),before,"Presentation does not rewrite tasks, dates, notes or records");
patchStudyScheduleEntry(state,"kc","plan-event:classes:2026-12-02","2026-12-02",{date:"2026-12-03",startTime:"14:00",endTime:"17:00"});
projection=index();assert.equal(projection.get("v8").slots.length,1);assert.equal(projection.get("v8").slots[0].date,"2026-12-03");
assert.equal(projection.get("v15").slots[0].date,"2027-01-27","Moving one class leaves later weeks intact");
setStudyTaskDone(state,"v8",true);assert.equal(index().get("v8").done,true);assert.equal(source.categories[0].tasks[0].done,true);
removeStudyScheduleEntry(state,"kc",projection.get("v8").slots[0].id,"2026-12-03");
assert.equal(index().get("v8").slots.length,0);assert.equal(index().get("v8").done,true);
assert.equal(source.categories[0].tasks[0].detail,"02.11.2026");
const snapshot=studyTaskIndex(state);source.categories[1].tasks.push({id:"new",title:"New homework",done:false});
reconcileLinkedTasks(state,snapshot);assert.ok(index().has("new"));
removeCourseStudyTask(state,"kc","v15");assert.equal(index().has("v15"),false);assert.equal(studyTaskItems(state,"2027-01-25","2027-01-31").some(t=>t.taskId==="v15"),false);
console.log("PASS shared task schedule presentation: calendar dates/years, stable IDs across same titles, reschedule/cancel propagation, pending fixed slots, shared completion, deletion and unchanged source notes");
