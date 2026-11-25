import assert from "node:assert/strict";
import {studyCalendarEntries,monthTaskWeeks} from "./public/study-plan-core.js";
import {calendarOverviewItems} from "./public/study-schedule.js";
const course={id:"degree",name:"Signaltheorie",code:"EI00330",credits:5,courseId:"learning",passed:false,tasks:[],exams:[{id:"exam",date:"2026-11-27",time:"10:00",location:"München"}],
planEvents:[{id:"slot",title:"Chapter 3 study",type:"study",taskId:"task",date:"2026-11-26",startTime:"18:00",endTime:"20:00",hours:2}]};
const state={degreePlan:{name:"Test",blocks:[],modules:[{id:"m",courses:[course]}]},semesters:[{id:"s",courses:[{id:"learning",categories:[{id:"c",name:"Vorlesung",tasks:[
{id:"task",title:"Chapter 3",estimatedHours:4,weekOf:"2026-11-23",done:false},
{id:"next",title:"Next week",estimatedHours:2,weekOf:"2026-11-30",done:false},
{id:"completed",title:"Done",weekOf:"2026-11-23",done:true},
{id:"unknown",title:"Week 7",done:false},
{id:"due",title:"Submit report",deadline:"2026-12-02",done:false}
]}]}]}],timer:{sessions:[],calendarItems:[{id:"reminder",type:"reminder",title:"Office appointment",date:"2026-11-26",startTime:"09:00",details:"Bring documents"}]}};
const before=JSON.stringify(state);
const day=calendarOverviewItems(state,"2026-11-27");
assert.equal(day.length,1);assert.equal(day[0].type,"exam");assert.equal(day[0].virtualPlanExam,true);assert.equal(day[0].degreeExamId,"exam");
assert.equal(calendarOverviewItems(state,"2026-11-26").filter(e=>e.type==="study").length,1);
assert.equal(calendarOverviewItems(state,"2026-11-26").filter(e=>e.type==="reminder").length,1);
assert.equal(studyCalendarEntries(state,"2026-11-23","2026-11-29").filter(e=>e.kind==="calendar").length,1);
assert.equal(studyCalendarEntries(state,"2026-11-23","2026-11-29").find(e=>e.kind==="calendar").detail,"Bring documents");
assert.equal(JSON.stringify(state),before,"Overview projects existing data without persisting copies");
const november=monthTaskWeeks(state,"2026-11");
assert.deepEqual(november.map(w=>w.date),["2026-11-23","2026-11-30"]);
assert.deepEqual(november.map(w=>w.count),[1,2]);
assert.ok(!november.flatMap(w=>w.taskIds).includes("completed"));
assert.ok(!november.flatMap(w=>w.taskIds).includes("unknown"),"An ordinal Week 7 never gets a fabricated date");
assert.equal(monthTaskWeeks(state,"2026-13").length,0);
const saved=structuredClone(state);
saved.timer.calendarItems.push({id:"saved-exam",type:"exam",date:"2026-11-27",startTime:"11:00",title:course.name,degreeCourseId:course.id,degreeExamId:"exam"});
assert.equal(calendarOverviewItems(saved,"2026-11-27").filter(e=>e.type==="exam").length,1);
assert.equal(calendarOverviewItems(saved,"2026-11-27")[0].id,"saved-exam");
const standalone={semesters:[],timer:{calendarItems:[{id:"exam",type:"exam",title:"Independent exam",date:"2026-11-27"},{id:"reminder",type:"reminder",title:"Appointment",date:"2026-11-26"}]}};
assert.equal(studyCalendarEntries(standalone,"2026-11-23","2026-11-29").length,2);
assert.equal(calendarOverviewItems(standalone,"2026-11-27").length,1);
console.log("PASS calendar overview: shared plans, virtual exams, reminders, stable exam deduplication, month/week task counts, no inferred dates, no plan prerequisite and no writes");
