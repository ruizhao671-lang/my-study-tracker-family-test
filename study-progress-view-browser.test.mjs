import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1100},timezoneId:"Europe/Berlin"});
page.setDefaultTimeout(12000);
const errors=[];page.on("pageerror",error=>errors.push(error.message));page.on("dialog",dialog=>dialog.accept());
const fixture={ownerName:"Schedule consistency QA",semesters:[{id:"s",name:"Winter",courses:[{id:"learning",name:"Komputer & Creativität",categories:[
{id:"vl",name:"Vorlesung",tasks:[{id:"v8",title:"Week 8",detail:"02.11.2026",estimatedHours:3,done:false,note:"Keep notes",attachments:[]},
{id:"v15",title:"Week 15",detail:"27.01.2026",estimatedHours:3,done:false},
{id:"held",title:"Week 12",detail:"30.12.2026",schedulingMode:"fixed",fixedTimePending:true,done:false}]},
{id:"ha",name:"Hausaufgabe",tasks:[{id:"h8",title:"Week 8",estimatedHours:2,done:false}]}]}]}],
degreePlan:{name:"TUM",requiredCredits:180,blocks:[],modules:[{id:"m",name:"Electives",kind:"elective",courses:[{id:"kc",name:"Komputer & Creativität",code:"EI04001",credits:6,courseId:"learning",tasks:[],exams:[],
planEvents:[{id:"class",title:"K&C class",type:"class",date:"2026-12-02",startTime:"13:15",endTime:"16:15",repeat:{until:"2027-01-27",weekdays:[3],exceptDates:["2026-12-30","2027-01-06"]},taskWeekLinks:{"2026-11-30":"v8","2027-01-25":"v15"}}]}]}]},
timer:{sessions:[],calendarItems:[],scheduleStartMinute:0,scheduleEndMinute:0}};
const state=()=>page.evaluate(()=>studyTrackerBridge.getState());
const tasks=s=>s.semesters.flatMap(s=>s.courses).flatMap(c=>c.categories).flatMap(c=>c.tasks);
const progress=()=>page.evaluate(()=>studyTrackerBridge.openCourseProgress("learning"));
const row=id=>page.locator('.task[data-task-id="'+id+'"]');
const label=id=>row(id).locator(".task-schedule-summary");
const save=()=>page.locator('#degreeDialog [type="submit"]').click();
try{
 await page.clock.setFixedTime(new Date("2026-11-28T10:00:00+01:00"));
 await page.addInitScript(s=>{if(!localStorage.getItem("study-tracker-online-guest-v1"))localStorage.setItem("study-tracker-online-guest-v1",JSON.stringify(s));localStorage.setItem("study-tracker-language-v1","zh-CN");},fixture);
 await page.goto(process.env.STUDY_TRACKER_TEST_URL||"http://127.0.0.1:8096",{waitUntil:"networkidle"});await page.waitForFunction(()=>window.studyDegree);await progress();
 assert.ok((await label("v8").innerText()).includes("2026-12-02 13:15–16:15"));
 assert.ok((await label("v15").innerText()).includes("2027-01-27"));
 assert.equal(await row("v8").locator(".task-name .task-detail").count(),0,"Old plain-date detail is not shown as the live schedule");
 assert.equal(await row("v8").locator(".task-legacy-date").textContent(),"原第二栏文字（不用于排课）：02.11.2026");
 assert.ok((await label("held").innerText()).includes("时间待定"));assert.ok((await label("h8").innerText()).includes("待安排"));
 assert.equal(tasks(await state()).find(t=>t.id==="v8").detail,"02.11.2026","Original detail is not overwritten");
 await label("v8").click();assert.equal(await page.locator("[data-schedule-filter]").inputValue(),"kc");
 const card=()=>page.locator('.schedule-day-grid [data-task-source-id="v8"]');
 assert.equal(await card().count(),1);assert.ok((await card().getAttribute("class")).includes("is-focused"));
 await card().locator(".schedule-event-open").click();assert.ok((await page.locator("[data-linked-task-label]").innerText()).includes("Vorlesung · Week 8"));
 await page.locator('#degreeDialog [name="date"]').fill("2026-12-03");await page.locator('#degreeDialog [name="startTime"]').fill("14:00");await page.locator('#degreeDialog [name="endTime"]').fill("17:00");await save();
 await progress();assert.ok((await label("v8").innerText()).includes("2026-12-03 14:00–17:00"));
 assert.ok(!(await label("v15").innerText()).includes("2027-01-20"),"Saving another class never adds an inferred date to a stable explicit link");
 await label("v15").click();assert.equal(await page.locator('.schedule-day-grid [data-task-source-id="v15"]').count(),1);
 await progress();await row("v8").locator('[data-action="toggle-task"]').check();await label("v8").click();await card().locator(".schedule-event-open").click();
 assert.equal(await page.locator('#degreeDialog [name="done"]').isChecked(),true);
 await page.locator('#degreeDialog [name="done"]').uncheck();await save();await progress();assert.equal(await row("v8").locator('[data-action="toggle-task"]').isChecked(),false);
 // Finish-time completion is an explicit user choice and updates the same progress task.
 await page.evaluate(()=>studyTrackerBridge.startPlannedTaskTimer("kc","v8"));
 assert.equal(await page.locator("#timerCompleteTask").isChecked(),false);assert.ok(!(await page.locator("#timerTask option:checked").innerText()).includes("02.11.2026"));
 await page.locator("#timerCompleteTask").check();assert.equal(tasks(await state()).find(t=>t.id==="v8").done,false);
 await page.waitForTimeout(1100);await page.locator("#timerFinishBtn").click();
 let s=await state();assert.equal(tasks(s).find(t=>t.id==="v8").done,true);assert.equal(s.timer.sessions.at(-1).taskId,"v8");
 await progress();assert.equal(await row("v8").locator('[data-action="toggle-task"]').isChecked(),true);
 await page.evaluate(()=>studyTrackerBridge.startPlannedTaskTimer("kc","h8"));
 assert.equal(await page.locator("#timerCompleteTask").isChecked(),false);
 await page.waitForTimeout(1100);await page.locator("#timerFinishBtn").click();assert.equal(tasks(await state()).find(t=>t.id==="h8").done,false,"Unchecked finish does not complete the task");
 await progress();await label("v8").click();await card().locator(".schedule-event-open").click();await page.locator('[data-schedule="unschedule"]').click();
 await progress();assert.ok((await label("v8").innerText()).includes("时间待定"));assert.ok(!(await label("v8").innerText()).includes("2026-12-03"));
 assert.equal(tasks(await state()).find(t=>t.id==="v8").detail,"02.11.2026");
 await row("v15").locator('[data-action="delete-task"]').click();await page.evaluate(()=>studyDegree.openSchedule("kc","2027-01-25"));assert.equal(await page.locator('[data-task-source-id="v15"]').count(),0);
 await page.reload({waitUntil:"networkidle"});await page.waitForFunction(()=>window.studyDegree);await progress();
 s=await state();assert.equal(tasks(s).some(t=>t.id==="v15"),false);assert.equal(s.timer.sessions.length,2);assert.equal(tasks(s).find(t=>t.id==="v8").note,"Keep notes");assert.ok((await label("v8").innerText()).includes("时间待定"));
 await page.locator(".language-switcher select").selectOption("en");assert.ok((await label("v8").innerText()).includes("Fixed class"));
 await page.setViewportSize({width:400,height:850});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await mkdir("test-results",{recursive:true});await page.screenshot({path:"test-results/progress-schedule-consistency.png",fullPage:true});
 assert.deepEqual(errors,[]);
 console.log("PASS progress schedule consistency: real linked dates across years, preserved old detail, direct highlighted calendar navigation, stable week links, rescheduling, two-way completion, optional finish-time completion, cancellation, deletion, records, reload, English and mobile");
}catch(error){console.error(errors);await mkdir("test-results",{recursive:true});await page.screenshot({path:"test-results/progress-schedule-failure.png",fullPage:true});throw error;}
finally{await browser.close();}
