import assert from "node:assert/strict";
import {repairFixedClassLinks} from "./public/study-class-links.js";
import {courseStudyTasks,studyScheduleEntries,studyTaskItems,removeStudyScheduleEntry,removeCourseStudyTask,patchStudyScheduleEntry,applyCourseStudyPlan} from "./public/study-plan-core.js";
const NativeDate=globalThis.Date;
globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:["2026-11-28T11:00:00+01:00"]));}static now(){return NativeDate.parse("2026-11-28T11:00:00+01:00");}};
const raw=[7,8,9].map(n=>({id:"v"+n,title:"Week "+n,done:false,estimatedHours:3,note:"keep",attachments:[{name:"keep.pdf"}]}));
const course={id:"kc",code:"EI04001",name:"Komputer & Creativität",courseId:"learning",tasks:[],exams:[],planRange:{start:"2026-10-14",end:"2026-12-16"},planEvents:[
{id:"class",title:"Komputer & Creativität 上课",type:"class",date:"2026-10-14",startTime:"13:15",endTime:"16:15",repeat:{until:"2026-12-16",weekdays:[3],exceptDates:[]}},
{id:"duplicate",title:"Vorlesung · Week 7",type:"study",date:"2026-11-25",startTime:"13:15",endTime:"16:30",taskId:"v7",executed:true,userScheduled:true},
{id:"homework-slot",title:"Homework",type:"study",date:"2026-12-02",startTime:"19:00",endTime:"21:00",taskId:"ha"}
]};
const state={semesters:[{id:"s",courses:[{id:"learning",name:course.name,categories:[{id:"vl",name:"Vorlesung",tasks:raw},{id:"homework",name:"Hausaufgabe",tasks:[{id:"ha",title:"Week 8",done:false}]}]}]}],degreePlan:{blocks:[],modules:[{id:"m",courses:[course]}]},timer:{sessions:[{id:"actual",taskId:"v7",durationMs:3600000,startAt:1000,endAt:3601000}]}};
const actual=JSON.stringify(state.timer),ids=raw.map(t=>t.id);
assert.equal(repairFixedClassLinks(state),true);
assert.equal(repairFixedClassLinks(state),false,"Automatic repair is idempotent");
assert.deepEqual(raw.map(t=>t.id),ids);assert.equal(JSON.stringify(state.timer),actual);
assert.equal(course.planEvents.length,2);assert.equal(course.planEventArchive[0].event.id,"duplicate");
assert.ok(course.planEvents[0].completedDates.includes("2026-11-25"));
assert.equal(studyScheduleEntries(state,"2026-11-25","2026-11-25").filter(e=>e.date==="2026-11-25").length,1);
assert.equal(studyTaskItems(state,"2026-11-23","2026-12-06").find(t=>t.taskId==="v8").schedulingMode,"fixed");
assert.equal(studyTaskItems(state,"2026-11-23","2026-12-06").find(t=>t.taskId==="v8").plannedHours,3);
assert.equal(raw[1].weekOf,"2026-11-30");assert.equal(raw[0].done,false);
let event=studyScheduleEntries(state,"2026-12-02","2026-12-02").find(e=>e.taskId==="v8");
patchStudyScheduleEntry(state,course.id,event.id,event.date,{schedulingMode:"flexible"});
assert.equal(studyTaskItems(state,"2026-11-23","2026-12-06").find(t=>t.taskId==="v8").schedulingMode,"flexible");
repairFixedClassLinks(state);assert.equal(courseStudyTasks(course,state.semesters).find(t=>t.id==="v8").schedulingMode,"flexible","Explicit changes remain editable");
event=studyScheduleEntries(state,"2026-12-02","2026-12-02").find(e=>e.taskId==="v8");
removeStudyScheduleEntry(state,course.id,event.id,event.date);
assert.ok(courseStudyTasks(course,state.semesters).some(t=>t.id==="v8"));
assert.ok(!studyScheduleEntries(state,"2026-12-02","2026-12-02").some(e=>e.taskId==="v8"&&e.date));
removeCourseStudyTask(state,course.id,"v9");
assert.ok(!courseStudyTasks(course,state.semesters).some(t=>t.id==="v9"));
assert.ok(!studyScheduleEntries(state,"2026-12-09","2026-12-09").some(e=>e.date==="2026-12-09"));
assert.equal(JSON.stringify(state.timer),actual);
assert.ok(course.planEvents.some(e=>e.id==="homework-slot"));
const ambiguous=structuredClone(state),learn=ambiguous.semesters[0].courses[0];
learn.categories[0].tasks=[{id:"unknown-a",title:"Week 1"},{id:"unknown-b",title:"Week 1"}];
ambiguous.degreePlan.modules[0].courses[0].planEvents=[{id:"a",type:"class",title:"A",date:"2026-12-02",startTime:"10:00",endTime:"11:00"}];
repairFixedClassLinks(ambiguous);assert.equal(ambiguous.degreePlan.modules[0].courses[0].planEvents[0].taskId,undefined);assert.ok(learn.categories[0].tasks.every(t=>!t.weekOf),"Ambiguous tasks are held as fixed pending tasks, never assigned invented dates");
const noClasses=structuredClone(state),noCourse=noClasses.degreePlan.modules[0].courses[0];
applyCourseStudyPlan(noClasses,noCourse.id,{tasks:courseStudyTasks(noCourse,noClasses.semesters),events:noCourse.planEvents.filter(e=>e.type!=="class"),link:noCourse.courseId,range:noCourse.planRange});
assert.equal(courseStudyTasks(noCourse,noClasses.semesters).find(t=>t.id==="v7").fixedTimePending,true,"A whole fixed series can be removed while retaining its task");
console.log("PASS fixed-class repair: authoritative schedule shared by lecture tasks, one block per lesson, archived duplicate with execution retained, stable IDs/notes/timer, editable modes, cancel-only vs delete task, and no guessing for ambiguous matches");
