import assert from "node:assert/strict";
import {parseCoursePlan,applyCourseStudyPlan,courseStudyTasks,studyScheduleEntries,studyTaskItems,studyTaskWindow,createTaskStudySession,removeStudyScheduleEntry,patchStudyScheduleEntry,mergeImportedPlan} from "./public/study-plan-core.js";
const course={id:"degree",name:"Signaltheorie",code:"EI00330",credits:5,tasks:[],exams:[]};
const plan={name:"Test",modules:[{id:"m",courses:[course]}],blocks:[]};
const state={degreePlan:plan,semesters:[],timer:{sessions:[]}};
const range={start:"2026-11-23",end:"2026-12-13"};
const input={tasks:[{id:"chapter",title:"Chapter 3",group:"Vorlesung",hours:4,weekOf:"2026-11-23",teachingWeek:7},
{id:"old",title:"Old task",hours:2,windowStart:"2026-11-01",windowEnd:"2026-11-15"},
{id:"future",title:"Future task",hours:null,windowStart:"2026-12-01",windowEnd:"2026-12-15"},
{id:"unknown",title:"Project",hours:null},
{id:"deadline",title:"Submit report",hours:null,deadline:"2026-11-27"}],events:[]};
applyCourseStudyPlan(state,course.id,{...parseCoursePlan(input,course,plan,range),link:"__new",range});
let tasks=courseStudyTasks(course,state.semesters),chapter=tasks.find(t=>t.title==="Chapter 3");
const learning=state.semesters.flatMap(s=>s.courses).find(c=>c.id===course.courseId);
const canonical=learning.categories.flatMap(c=>c.tasks).find(t=>t.id===chapter.id);
canonical.note="Keep note";canonical.attachments=[{name:"my-file.pdf"}];
assert.equal(studyScheduleEntries(state,range.start,range.end).filter(e=>e.date&&e.type!=="deadline").length,0);
let shelf=studyTaskItems(state,"2026-11-23","2026-11-29");
assert.equal(shelf.find(t=>t.taskId===chapter.id).bucket,"current");
assert.equal(shelf.find(t=>t.title==="Old task").bucket,"overdue");
assert.equal(shelf.find(t=>t.title==="Future task").bucket,"future");
assert.equal(shelf.find(t=>t.title==="Project").bucket,"unscoped");
assert.equal(shelf.find(t=>t.title==="Submit report").bucket,"current");
const a=createTaskStudySession(state,course.id,chapter.id,{date:"2026-11-23",startTime:"10:00",endTime:"12:00",hours:2});
const b=createTaskStudySession(state,course.id,chapter.id,{date:"2026-11-28",startTime:"14:00",endTime:"16:00",hours:2});
assert.equal(createTaskStudySession(state,course.id,chapter.id,{date:"2026-11-28",startTime:"14:00",endTime:"16:00",hours:2}),b,"Double drop does not duplicate a slot");
assert.notEqual(a,b);assert.equal(course.planEvents.length,2);
chapter=courseStudyTasks(course,state.semesters).find(t=>t.id===chapter.id);
assert.equal(chapter.hours,4);assert.equal(chapter.date,"");assert.equal(chapter.weekOf,"2026-11-23");assert.equal(chapter.teachingWeek,7);
let item=studyTaskItems(state,"2026-11-23","2026-11-29").find(t=>t.taskId===chapter.id);
assert.equal(item.plannedHours,4);assert.equal(item.remainingHours,0);assert.equal(item.allocations.length,2);
patchStudyScheduleEntry(state,course.id,"plan-event:"+a+":2026-11-23","2026-11-23",{date:"2026-11-24",endTime:"11:00",hours:1,executed:true});
state.timer.sessions.push({taskId:chapter.id,startAt:Date.parse("2026-11-24T10:00:00"),endAt:Date.parse("2026-11-24T11:00:00"),durationMs:3600000});
item=studyTaskItems(state,"2026-11-23","2026-11-29").find(t=>t.taskId===chapter.id);
assert.equal(item.actualHours,1);assert.equal(item.done,false);assert.equal(item.plannedHours,3);assert.equal(item.remainingHours,1);
removeStudyScheduleEntry(state,course.id,"plan-event:"+b+":2026-11-28","2026-11-28");
assert.equal(course.planEvents.length,1);assert.equal(state.timer.sessions.length,1);
state.timer.sessions.push({taskId:chapter.id,startAt:Date.parse("2026-11-25T10:00:00"),endAt:Date.parse("2026-11-25T13:00:00"),durationMs:10800000});
assert.equal(studyTaskItems(state,range.start,range.end).find(t=>t.taskId===chapter.id).actualHours,4);
assert.equal(courseStudyTasks(course,state.semesters).find(t=>t.id===chapter.id).done,false,"Reaching estimated hours never completes the task automatically");
const reimport=mergeImportedPlan(courseStudyTasks(course,state.semesters),course.planEvents,parseCoursePlan(input,course,plan,range));
applyCourseStudyPlan(state,course.id,{...reimport,link:course.courseId,range});
assert.equal(courseStudyTasks(course,state.semesters).find(t=>t.title==="Chapter 3").id,chapter.id);
assert.equal(course.planEvents[0].id,a);
const kept=learning.categories.flatMap(c=>c.tasks).find(t=>t.id===chapter.id);
assert.equal(kept.note,"Keep note");assert.equal(kept.attachments[0].name,"my-file.pdf");
kept.done=true;assert.equal(studyTaskItems(state,range.start,range.end).find(t=>t.taskId===chapter.id).bucket,"complete");
assert.equal(course.planEvents[0].executed,true);
assert.deepEqual(studyTaskWindow({title:"Week 7",windowStart:"2026-11-23",windowEnd:"2026-12-06",weekOf:"2026-11-23"}),{start:"2026-11-23",end:"2026-12-06",teachingWeek:7});
assert.equal(studyTaskWindow({title:"Week 7"}).start,"","Week ordinal never fabricates a calendar date");
assert.throws(()=>parseCoursePlan({tasks:[{title:"bad",windowStart:"2026-12-01",windowEnd:"2026-11-30"}]},course,plan,range));
const fixed={tasks:[{id:"lecture",title:"Weekly lecture",group:"Vorlesung",hours:3,repeat:{from:range.start,until:range.end}}],events:[
{id:"class",title:"Class",type:"class",date:"2026-11-25",startTime:"13:15",endTime:"16:15",taskId:"lecture",repeat:{weekdays:[3],until:range.end,exceptDates:["2026-12-02"]}}]};
const parsed=parseCoursePlan(fixed,course,plan,range);
applyCourseStudyPlan(state,course.id,{...parsed,link:course.courseId,range});
shelf=studyTaskItems(state,range.start,range.end);
assert.deepEqual(shelf.map(t=>t.allocations.length),[1,0,1]);
assert.ok(shelf[0].allocations[0].taskId===shelf[0].taskId);
const ev=course.planEvents[0],taskIds=shelf.map(t=>t.taskId);
removeStudyScheduleEntry(state,course.id,"plan-event:"+ev.id+":2026-11-25","2026-11-25");
assert.equal(studyTaskItems(state,range.start,range.end)[0].allocations.length,0);
assert.equal(studyTaskItems(state,range.start,range.end)[2].allocations.length,1);
assert.deepEqual(courseStudyTasks(course,state.semesters).map(t=>t.id),taskIds);

const onceInput={tasks:[{id:"one-task",title:"One task",hours:4}],events:[{id:"one-slot",type:"study",title:"Original slot",date:"2026-11-25",startTime:"10:00",endTime:"12:00",taskId:"one-task"}]};
applyCourseStudyPlan(state,course.id,{...parseCoursePlan(onceInput,course,plan,range),link:course.courseId,range});
const once=course.planEvents[0];
patchStudyScheduleEntry(state,course.id,"plan-event:"+once.id+":2026-11-25","2026-11-25",{date:"2026-11-26",endTime:"11:00",hours:1});
const incoming=parseCoursePlan(onceInput,course,plan,range);
const keptManual=mergeImportedPlan(courseStudyTasks(course,state.semesters),course.planEvents,incoming);
assert.equal(keptManual.events[0].date,"2026-11-26","Reimport preserves user-moved imported sessions");
assert.equal(keptManual.events[0].id,once.id);
incoming.events[0].arrangementEdited=true;
const explicitChange=mergeImportedPlan(courseStudyTasks(course,state.semesters),course.planEvents,incoming);
assert.equal(explicitChange.events[0].date,"2026-11-25","An explicit edited preview may replace the manual arrangement");

console.log("PASS task bricks: completion windows, backlog/future/unknown filters, two slots per task, move/resize/remove, no duplicate drop, null estimates, actual time vs completion, stable reimport IDs/notes, weekly fixed-class links and exceptions");
