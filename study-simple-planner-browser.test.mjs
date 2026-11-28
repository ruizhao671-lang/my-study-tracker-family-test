import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
const page=await browser.newPage({viewport:{width:1580,height:1050},timezoneId:"Europe/Berlin"});
page.setDefaultTimeout(10000);
const errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("dialog",d=>d.accept());
const url=process.env.STUDY_TRACKER_TEST_URL||"http://127.0.0.1:8096";
const fixture={ownerName:"Planner QA",starterContentVersion:2,onboardingSeeded:true,semesters:[{id:"s",name:"Winter",courses:[
{id:"kc",name:"Komputer & Creativität",categories:[{id:"vl",name:"Vorlesung",tasks:[{id:"classTask",title:"Week 8",weekOf:"2026-11-30",estimatedHours:3,done:false}]},{id:"ha",name:"Hausaufgabe",tasks:[7,8,9].map(n=>({id:"ha"+n,title:"Week "+n,estimatedHours:2,done:false}))}]},
{id:"signal",name:"Signaltheorie",categories:[{id:"chapter",name:"Chapters",tasks:[{id:"a",title:"Chapter 3",estimatedHours:4,done:false,note:"Keep",attachments:[]},{id:"b",title:"Chapter 4",done:false},{id:"done",title:"Completed",done:true}]}]}
]}],degreePlan:{name:"TUM",requiredCredits:180,blocks:[],modules:[{id:"m",name:"Elective",kind:"elective",requiredCredits:30,courses:[{id:"degree-kc",name:"Komputer & Creativität",code:"EI04001",credits:6,courseId:"kc",tasks:[],exams:[],planRange:{start:"2026-11-30",end:"2026-12-20"},planEvents:[{id:"class",title:"K&C 上课",type:"class",taskId:"classTask",date:"2026-12-02",startTime:"13:15",endTime:"16:15",schedulingMode:"fixed"}]}]}]},timer:{sessions:[{id:"actual",taskId:"a",courseId:"signal",courseName:"Signaltheorie",categoryName:"Chapters",taskName:"Chapter 3",startAt:Date.parse("2026-11-28T10:00:00+01:00"),endAt:Date.parse("2026-11-28T11:00:00+01:00"),durationMs:3600000}],calendarItems:[],scheduleStartMinute:0,scheduleEndMinute:0}};
const get=()=>page.evaluate(()=>studyTrackerBridge.getState());
const raw=s=>s.semesters.flatMap(s=>s.courses).flatMap(c=>c.categories).flatMap(c=>c.tasks);
const events=s=>s.semesters[0].courses.find(c=>c.id==="signal").planEvents||[];
const brick=id=>page.locator('[data-task-source="'+id+'"]');
const save=()=>page.locator('#degreeDialog [type="submit"]').click();
const close=()=>page.locator('#degreeDialog .degree-dialog-close').click();
const openAll=()=>page.evaluate(()=>studyDegree.openSchedule("","2026-11-30"));
const calendar=task=>page.locator(".schedule-day-grid .schedule-event").filter({hasText:task}).first();
try{
 await page.clock.setFixedTime(new Date("2026-11-28T11:00:00+01:00"));
 await page.addInitScript(s=>{if(!localStorage.getItem("study-tracker-online-guest-v1"))localStorage.setItem("study-tracker-online-guest-v1",JSON.stringify(s));localStorage.setItem("study-tracker-language-v1","zh-CN");},fixture);
 await page.goto(url,{waitUntil:"networkidle"});await page.waitForFunction(()=>window.studyDegree);await openAll();
 assert.equal(await page.locator("[data-task-bucket]").count(),0);assert.equal(await page.locator(".task-brick").count(),5);
 assert.equal(await brick("classTask").count(),0);assert.equal(await brick("done").count(),0);
 assert.equal(await page.locator('[data-schedule-filter] option').count(),3,"Unlinked progress course is available automatically");
 await brick("a").locator("[data-plan-task-time]").click();
 await page.locator('#degreeDialog [name="date"]').fill("2026-12-01");await page.locator('#degreeDialog [name="startTime"]').fill("19:00");await page.locator('#degreeDialog [name="endTime"]').fill("21:00");await save();
 assert.equal(await brick("a").count(),0,"A partially scheduled task leaves pending");
 assert.equal(events(await get()).length,1);assert.equal(raw(await get()).find(t=>t.id==="a").done,false);
 await calendar("Chapter 3").locator(".schedule-event-open").click();
 assert.ok((await page.locator("[data-linked-task-label]").innerText()).includes("Chapters"));
 await page.locator('[data-schedule="add-task-session"]').click();
 await page.locator('#degreeDialog [name="date"]').fill("2026-12-05");await page.locator('#degreeDialog [name="startTime"]').fill("10:00");await page.locator('#degreeDialog [name="endTime"]').fill("12:00");await save();
 assert.equal(events(await get()).filter(e=>e.taskId==="a").length,2);
 await calendar("Chapter 3").locator(".schedule-event-open").click();await page.locator('[data-schedule="unschedule"]').click();
 assert.equal(await brick("a").count(),0,"Another session still allocates the task");
 await calendar("Chapter 3").dragTo(page.locator(".schedule-flexible"),{targetPosition:{x:50,y:50}});
 assert.equal(events(await get()).filter(e=>e.taskId==="a").length,0);assert.equal(await brick("a").count(),1);
 await brick("a").dragTo(page.locator('.schedule-day-grid[data-drop-date="2026-12-01"]'),{targetPosition:{x:40,y:560}});
 assert.equal(await brick("a").count(),0);
 await calendar("Chapter 3").locator(".schedule-event-open").click();
 await page.locator('#degreeDialog [name="done"]').check();await save();assert.equal(raw(await get()).find(t=>t.id==="a").done,true);
 await page.evaluate(()=>studyTrackerBridge.openCourseProgress("signal"));
 const checkbox=page.locator('[data-task-id="a"] [data-action="toggle-task"]');assert.equal(await checkbox.isChecked(),true);await checkbox.uncheck();
 await openAll();await calendar("Chapter 3").locator(".schedule-delete-x").click();
 assert.equal(raw(await get()).some(t=>t.id==="a"),false);assert.equal(events(await get()).length,0);assert.equal((await get()).timer.sessions.length,1,"Deleting plan tasks preserves actual time");
 // A fixed class can be canceled and reset, but cannot be moved to another hour by dragging.
 await calendar("K&C 上课").locator(".schedule-event-open").click();await page.locator('[data-schedule="unschedule"]').click();
 assert.equal(await brick("classTask").count(),1);assert.equal(await brick("classTask").getAttribute("draggable"),"false");
 await brick("classTask").locator("[data-plan-task-time]").click();await page.locator('#degreeDialog [name="date"]').fill("2026-12-02");await page.locator('#degreeDialog [name="startTime"]').fill("13:15");await page.locator('#degreeDialog [name="endTime"]').fill("16:15");await save();
 assert.equal(await brick("classTask").count(),0);
 await page.locator('[data-weekly-open][data-weekly-category="ha"]').click();
 assert.equal(await page.locator('#degreeDialog [name="anchorWeekNumber"]').count(),0);
 await page.locator('#degreeDialog [name="startTaskId"]').selectOption("ha7");await page.locator('#degreeDialog [name="weekday"]').selectOption("3");
 await page.locator("#degreeDialog [data-weekly-preview]").click();
 assert.deepEqual(await page.locator('[data-slot="date"]').evaluateAll(nodes=>nodes.map(n=>n.value)),["2026-12-02","2026-12-09","2026-12-16"]);
 await save();assert.equal(await brick("ha7").count(),0);assert.equal(await brick("ha8").count(),0);assert.equal(await brick("ha9").count(),0);
 const kc=(await get()).degreePlan.modules[0].courses[0];assert.equal(kc.planEvents.filter(e=>e.batchRuleId).length,3);
 await page.locator('[data-schedule-filter]').selectOption("progress-signal");assert.equal(await page.locator(".task-brick").count(),1);
 await page.locator('[data-schedule="edit-course"]').click();assert.equal(await page.locator('#degreeDialog select[name="progressLink"]').count(),0);
 await page.locator('[data-plan-action="add-task"]').click();
 const newRow=page.locator("[data-task-row]").last();await newRow.locator('[data-field="title"]').fill("New chapter");await save();await page.keyboard.press("Escape");
 assert.equal(raw(await get()).some(t=>t.title==="New chapter"),true);
 await openAll();assert.equal(await page.locator(".task-brick").count(),2,"New editor task immediately appears without linking");
 await page.locator("[data-schedule-date]").fill("2026-12-01");await page.locator('[data-schedule="month"]').click();assert.ok(await page.locator(".schedule-month").count());assert.ok(await page.locator(".schedule-month-entry-wrap .schedule-delete-x").count());
 await page.locator('[data-schedule="week"]').click();
 await page.reload({waitUntil:"networkidle"});await openAll();assert.equal(await page.locator(".task-brick").count(),2);
 await page.evaluate(()=>studyTrackerBridge.startPlannedTaskTimer("progress-signal","b"));assert.equal((await get()).timer.active.taskId,"b");assert.equal(raw(await get()).find(t=>t.id==="b").done,false);
 await openAll();await page.setViewportSize({width:400,height:850});assert.equal(await page.locator(".schedule-flexible").isVisible(),true);
 await page.setViewportSize({width:1580,height:1050});await mkdir("test-results",{recursive:true});await page.screenshot({path:"test-results/simple-planner.png",fullPage:true});
 // A learner without a degree plan can use exactly the same planner and editor.
 const fresh=structuredClone(fixture);delete fresh.degreePlan;
 await page.evaluate(s=>studyTrackerBridge.replaceState(s),fresh);await openAll();assert.equal(await page.locator(".task-brick").count(),6);
 await brick("b").locator("[data-plan-task-time]").click();await page.locator('#degreeDialog [name="date"]').fill("2026-12-01");await page.locator('#degreeDialog [name="startTime"]').fill("08:00");await page.locator('#degreeDialog [name="endTime"]').fill("09:00");await save();
 assert.equal(await brick("b").count(),0);assert.equal((await get()).degreePlan,undefined);
 assert.deepEqual(errors,[]);
 console.log("PASS simplified planner browser: all courses automatically, pure pending shelf, split/cancel/drag-back/x, canonical completion, actual record retention, fixed classes, automatic weekly dates, editor, month/mobile/reload and no-degree usage");
}catch(error){console.error("Page errors:",errors);await mkdir("test-results",{recursive:true});await page.screenshot({path:"test-results/simple-planner-failure.png",fullPage:true});throw error;}
finally{await browser.close();}
