import assert from "node:assert/strict";
import {studyTaskIndex,reconcileLinkedTasks,setStudyTaskDone} from "./public/study-task-sync.js";
import {normalizeWeeklyRule,previewWeeklyRule,applyWeeklyRule,refreshWeeklyRules,weeklyRowsOverlap} from "./public/study-batch-core.js";
import {courseStudyTasks,studyTaskItems,patchStudyScheduleEntry,removeStudyScheduleEntry,createTaskStudySession,studyScheduleEntries,applyCourseStudyPlan} from "./public/study-plan-core.js";
import {coursePlanVersions,restoreCoursePlanVersion} from "./public/study-plan-history.js";
function fixture(){
 const tasks=[1,2,3,4].map((n)=>({id:"t"+n,title:"Week "+n,done:false,estimatedHours:4,weekOf:["2026-11-30","2026-12-07","2026-12-14","2026-12-21"][n-1],note:"keep",attachments:[{name:"keep.pdf"}]}));
 const course={id:"degree",name:"K&C",courseId:"learning",tasks:[],exams:[],planEvents:[],planRange:{start:"2026-11-30",end:"2026-12-27"}};
 const state={semesters:[{id:"s",name:"Winter",courses:[{id:"learning",name:"K&C",categories:[{id:"ha",name:"Hausaufgabe",tasks}]}]}],degreePlan:{blocks:[],modules:[{id:"m",courses:[course]}]},timer:{sessions:[]}};
 return {state,course,tasks,category:state.semesters[0].courses[0].categories[0]};
}
const config={categoryId:"ha",weekday:2,startTime:"19:00",endTime:"21:00",fromWeek:"2026-11-30",untilWeek:"2026-12-27",skipWeeks:["2026-12-21"]};
{
 const {state,course,tasks,category}=fixture();
 const preview=previewWeeklyRule(state,course.id,config,"2026-11-25");
 assert.equal(preview.rows.filter(r=>r.include).length,3);
 assert.equal(preview.rows[0].taskId,"t1");assert.equal(preview.rows[0].date,"2026-12-01");
 const result=applyWeeklyRule(state,course.id,preview.rule,preview.rows,"2026-11-25");
 assert.equal(result.count,3);assert.equal(tasks.length,4);assert.equal(course.planEvents.length,3);
 assert.equal(courseStudyTasks(course,state.semesters)[0].categoryId,"ha");
 const id=course.planEvents[0].id,rule=course.weeklyRules[0];
 assert.equal(course.planEvents[0].schedulingMode,"flexible");
 assert.equal(refreshWeeklyRules(state,"2026-11-25"),0);
 const again=previewWeeklyRule(state,course.id,rule,"2026-11-25");
 applyWeeklyRule(state,course.id,rule,again.rows,"2026-11-25");
 assert.equal(course.planEvents.length,3);assert.equal(course.planEvents[0].id,id);
 patchStudyScheduleEntry(state,course.id,"plan-event:"+id+":2026-12-01","2026-12-01",{date:"2026-12-02",startTime:"10:00",endTime:"12:00",viaDrag:true});
 assert.equal(course.planEvents[0].userScheduled,true);refreshWeeklyRules(state,"2026-11-25");assert.equal(course.planEvents[0].date,"2026-12-02");
 const second=course.planEvents.find(e=>e.taskId==="t2");
 removeStudyScheduleEntry(state,course.id,"plan-event:"+second.id+":"+second.date,second.date);
 refreshWeeklyRules(state,"2026-11-25");assert.ok(!course.planEvents.some(e=>e.taskId==="t2"),"Cancellation must not be recreated");
 category.tasks.push({id:"tnew",title:"Another task",done:false,estimatedHours:2,weekOf:"2026-12-28"});
 rule.untilWeek="2026-12-28";assert.equal(refreshWeeklyRules(state,"2026-11-25"),1);
 assert.equal(course.planEvents.at(-1).taskId,"tnew");
 category.tasks.push({id:"skip",title:"Holiday",weekOf:"2026-12-21"});assert.equal(refreshWeeklyRules(state,"2026-11-25"),0);
 rule.enabled=false;category.tasks.push({id:"disabled",title:"Disabled",weekOf:"2027-01-04"});rule.untilWeek="2027-01-04";assert.equal(refreshWeeklyRules(state,"2026-11-25"),0);
 assert.ok(coursePlanVersions(course).length>=2);
 const saved=coursePlanVersions(course).find(v=>v.snapshot.weeklyRules?.length);
 const beforeDelete=studyTaskIndex(state);state.semesters[0].courses[0].categories=[];reconcileLinkedTasks(state,beforeDelete,"2026-11-25");
 restoreCoursePlanVersion(state,course.id,saved.id);assert.equal(course.weeklyRules[0].id,result.ruleId);assert.equal(course.weeklyRules[0].categoryId,state.semesters[0].courses[0].categories[0].id);assert.equal(course.weeklyRules[0].enabled,true);
 assert.equal(state.timer.sessions.length,0);
}
{
 const {state,course,tasks}=fixture();
 delete tasks[0].weekOf;tasks[0].title="Week 7";
 let p=previewWeeklyRule(state,course.id,config,"2026-11-25");
 assert.equal(p.rows[0].include,false);assert.match(p.rows[0].reason,/确认对应/);
 p=previewWeeklyRule(state,course.id,{...config,anchorWeekNumber:7},"2026-11-25");
 assert.equal(p.rows[0].date,"2026-12-01");
 tasks[1].schedulingMode="fixed";tasks[1].plannedDate="2026-12-09";tasks[1].plannedStart="13:00";tasks[2].done=true;
 createTaskStudySession(state,course.id,"t4",{date:"2026-12-22",startTime:"12:00",endTime:"14:00"});
 p=previewWeeklyRule(state,course.id,config,"2026-11-25");
 assert.ok(p.rows.slice(1).every(r=>r.blocked));
 assert.equal(p.rows[3].reason,"已有安排，保留");
}
{
 const {state,course,tasks}=fixture();
 course.planEvents.push({id:"conflict",title:"Other class",type:"class",date:"2026-12-01",startTime:"20:00",endTime:"22:00"});
 const p=previewWeeklyRule(state,course.id,config,"2026-11-25");
 assert.equal(p.rows[0].include,false);assert.match(p.rows[0].reason,/冲突/);
 assert.throws(()=>applyWeeklyRule(state,course.id,p.rule,[{...p.rows[0],include:true}],"2026-11-25"),/重叠/);
 assert.equal(course.weeklyRules,undefined,"Rejected preview is atomic");
 applyWeeklyRule(state,course.id,p.rule,[{...p.rows[0],include:true,confirmConflicts:true}],"2026-11-25");
 assert.equal(course.planEvents.length,2);
 tasks.push({id:"same-week",title:"Extra",weekOf:"2026-12-14"});
 const other=previewWeeklyRule(state,course.id,{...config,id:"other-rule"},"2026-11-25");
 assert.ok(other.rows.filter(r=>r.week==="2026-12-14").every(r=>!r.include&&r.reason.includes("同周")));
}
{
 const {state,course,category}=fixture();
 createTaskStudySession(state,course.id,"t1",{date:"2026-11-20",startTime:"10:00",endTime:"12:00"});
 createTaskStudySession(state,course.id,"t1",{date:"2026-12-01",startTime:"10:00",endTime:"12:00"});
 const raw=category.tasks[0];state.timer.sessions.push({id:"actual",taskId:raw.id,courseName:"K&C",categoryName:"Hausaufgabe",taskName:raw.title,durationMs:3600000,startAt:1,endAt:3600001});
 state.timer.active={taskId:raw.id,courseId:"learning",categoryId:"ha",semesterId:"s",markTaskDone:true};
 let before=studyTaskIndex(state);
 raw.title="Updated Week 1";category.name="Homework";
 reconcileLinkedTasks(state,before,"2026-11-25");
 assert.equal(course.planEvents[0].title,"Homework · Updated Week 1");
 assert.equal(state.timer.sessions[0].taskName,"Week 1","Actual record keeps historical names");
 before=studyTaskIndex(state);const moved={id:"other",name:"Project",tasks:[raw]};category.tasks.shift();state.semesters[0].courses[0].categories.push(moved);
 reconcileLinkedTasks(state,before,"2026-11-25");assert.equal(state.timer.active.categoryId,"other");
 assert.equal(courseStudyTasks(course,state.semesters).find(t=>t.id===raw.id).group,"Project");
 setStudyTaskDone(state,raw.id,false);assert.equal(state.timer.active.markTaskDone,false);
 before=studyTaskIndex(state);moved.tasks=[];
 reconcileLinkedTasks(state,before,"2026-11-25");
 assert.equal(course.planEvents.length,1,"Only past schedule remains");
 assert.equal(course.planEvents[0].archivedTask.id,raw.id);assert.equal(course.planEvents[0].taskId,"");
 assert.equal(state.timer.sessions.length,1);assert.equal(state.timer.active.archivedTask.taskId,raw.id);
 assert.equal(course.planTaskArchive.find(a=>a.task.id===raw.id).task.attachments[0].name,"keep.pdf");
}
{
 const {state,course,category}=fixture();
 category.tasks[0].planSeriesKey="series";category.tasks[0].weekOf="2026-11-23";
 category.tasks[1].planSeriesKey="series";category.tasks[1].weekOf="2026-11-30";
 course.planEvents=[{id:"series",taskSeriesKey:"series",type:"class",title:"Weekly class",date:"2026-11-25",startTime:"13:00",endTime:"15:00",repeat:{weekdays:[3],until:"2026-12-02",exceptDates:[]}}];
 const before=studyTaskIndex(state);category.tasks.shift();category.tasks.shift();
 reconcileLinkedTasks(state,before,"2026-11-26");
 assert.equal(studyScheduleEntries(state,"2026-11-20","2026-12-10").filter(e=>e.type==="class").length,1);
 assert.equal(studyScheduleEntries(state,"2026-11-25","2026-11-25").find(e=>e.type==="class").taskTitle,"Week 1");
}
{
 const {state,course,category}=fixture();course.courseId="";course.tasks=[{id:"t1",title:"Independent",done:false}];
 setStudyTaskDone(state,"t1",true,course.id);
 assert.equal(course.tasks[0].done,true);assert.equal(category.tasks[0].done,false,"Unlinking must preserve independent completion even if an old source ID remains");
}
{
 const {state,course,tasks}=fixture();for(const task of tasks)delete task.weekOf;
 const preview=previewWeeklyRule(state,course.id,{...config,anchorWeekNumber:1,anchorWeekDate:"2026-12-07"},"2026-11-25");
 assert.equal(preview.rows[0].date,"2026-12-08");assert.equal(preview.rows[1].date,"2026-12-15","One week anchor fills all subsequent task weeks independently of the planning range");
 const empty={date:"",startTime:"19:00",endTime:"21:00"};assert.equal(weeklyRowsOverlap(empty,empty),false);
 assert.equal(weeklyRowsOverlap({...empty,date:"2026-12-08"},{...empty,date:"2026-12-15"}),false);
 assert.equal(weeklyRowsOverlap({...empty,date:"2026-12-08"},{...empty,date:"2026-12-08"}),true);
 assert.equal(weeklyRowsOverlap({...empty,date:"2026-12-08"},{date:"2026-12-08",startTime:"21:00",endTime:"22:00"}),false);
}
console.log("PASS weekly scheduling + strict shared tasks: editable/conflict-safe batches, date anchors, stable IDs, new tasks, manual overrides, canceled slots, rule history, fixed/completed skips, renames/moves/deletes, active timer archive and retained actual records");
