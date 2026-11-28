import assert from "node:assert/strict";
import {previewWeeklyRule,applyWeeklyRule,refreshWeeklyRules} from "./public/study-batch-core.js";
import {studyTaskItems} from "./public/study-plan-core.js";
const tasks=Array.from({length:10},(_,i)=>({id:"t"+(72+i),title:(i%2?"A ":"Z ")+"工作日 4h "+(72+i),done:false,note:"Keep "+i,attachments:[]}));
const source={id:"learning",name:"IP",categories:[{id:"work",name:"工作时长",tasks}]};
const course={id:"ip",name:"IP",credits:6,courseId:"learning",tasks:[],exams:[],planEvents:[]};
const state={semesters:[{id:"s",courses:[source]}],degreePlan:{modules:[{courses:[course]}],blocks:[]},timer:{sessions:[],calendarItems:[]}};
const config={id:"am",compactSelection:true,mappingMode:"sequence",categoryId:"work",startTaskId:"t72",fromWeek:"2026-11-30",untilWeek:"2026-12-27",weekday:1,startTime:"09:00",endTime:"13:00",enabled:false};
const preview=ids=>previewWeeklyRule(state,"ip",{...config,...(ids?{selectedTaskIds:ids}:{})},"2026-11-28");
let p=preview(["t72","t77"]);
assert.deepEqual(p.rows.filter(r=>r.include).map(r=>[r.taskId,r.date]),[["t72","2026-11-30"],["t77","2026-12-07"]]);
p=preview(["t72","t73","t77"]);assert.deepEqual(p.rows.filter(r=>r.include).map(r=>r.date),["2026-11-30","2026-12-07","2026-12-14"]);
p=preview(["t72","t77"]);assert.equal(p.rows.find(r=>r.taskId==="t77").date,"2026-12-07","Unchecking fills the vacated week");
p=preview(["t77"]);assert.equal(p.rows.find(r=>r.taskId==="t77").date,"2026-11-30");
assert.deepEqual(preview().rows.filter(r=>r.include).map(r=>r.taskId),["t72","t73","t74","t75"],"Progress order wins over title sorting");
p=preview(tasks.map(t=>t.id));assert.ok(p.rows.some(r=>r.include&&!r.date),"Explicit overflow is reported, not silently discarded");
assert.equal(course.planEvents.length,0,"Preview does not save anything");
const assignments=[
 {id:"a",weekday:1,startTime:"09:00",endTime:"13:00",ids:["t72","t77"]},
 {id:"b",weekday:1,startTime:"14:00",endTime:"18:00",ids:["t73","t78"]},
 {id:"c",weekday:2,startTime:"09:00",endTime:"13:00",ids:["t74","t79"]},
 {id:"d",weekday:2,startTime:"14:00",endTime:"18:00",ids:["t75","t80"]},
 {id:"e",weekday:3,startTime:"09:00",endTime:"13:00",ids:["t76","t81"]}
];
let first;
for(const slot of assignments){
 const input={...config,...slot,selectedTaskIds:slot.ids},value=previewWeeklyRule(state,"ip",input,"2026-11-28");
 const selected=value.rows.filter(r=>r.include);
 assert.equal(selected.length,2);
 applyWeeklyRule(state,"ip",{...value.rule,selectedTaskIds:slot.ids},selected,"2026-11-28");
 if(!first)first=structuredClone(course.planEvents[0]);else assert.deepEqual(course.planEvents[0],first,"Later batches do not move earlier assignments");
}
assert.equal(course.weeklyRules.length,5);assert.equal(course.planEvents.length,10);
for(const week of ["2026-11-30","2026-12-07"]){const plans=course.planEvents.filter(e=>e.date>=week&&e.date<=new Date(Date.parse(week)+6*86400000).toISOString().slice(0,10));assert.equal(plans.length,5);assert.equal(plans.reduce((n,e)=>n+e.hours,0),20);}
assert.equal(source.categories[0].tasks.length,10);assert.ok(source.categories[0].tasks.every(t=>!t.done));assert.equal(state.timer.sessions.length,0);
assert.equal(studyTaskItems(state,"2026-11-30","2026-12-27").filter(t=>!t.done&&!t.allocations.length).length,0);
source.categories[0].tasks.push({id:"new",title:"New work",done:false});assert.equal(refreshWeeklyRules(state,"2026-11-28"),0,"New tasks are not bound to the whole category automatically");
assert.ok(studyTaskItems(state,"2026-11-30","2026-12-27").find(t=>t.taskId==="new").allocations.length===0);
const automatic=structuredClone(state),autoCourse=automatic.degreePlan.modules[0].courses[0];
autoCourse.weeklyRules[0].enabled=true;
autoCourse.planEvents.push({id:"occupied",type:"study",title:"Occupied",date:"2026-12-14",startTime:"09:00",endTime:"13:00"});
assert.equal(refreshWeeklyRules(automatic,"2026-11-28"),0,"Optional automation leaves conflicting new work pending");
autoCourse.planEvents=autoCourse.planEvents.filter(e=>e.id!=="occupied");
assert.equal(refreshWeeklyRules(automatic,"2026-11-28"),1);
assert.equal(autoCourse.planEvents.find(e=>e.taskId==="new").date,"2026-12-14");
assert.deepEqual(autoCourse.planEvents.slice(0,10),course.planEvents,"Optional automation never moves saved sessions");
console.log("PASS weekly compaction: source order, selected-only fill, deselection refill, overflow, preview isolation, five independent batches, 20h weeks, stable task links and no automatic category lock");
