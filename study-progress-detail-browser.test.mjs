import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
const page=await browser.newPage({viewport:{width:1450,height:1000},timezoneId:"Europe/Berlin"});
page.setDefaultTimeout(12000);const errors=[];page.on("pageerror",e=>errors.push(e.message));
const inputs=[
{id:"p51",title:"工作日（半天 4h）51",detail:"27.10.2026",done:true,note:"当天已完成：保留我的记录",attachments:[{id:"a",name:"my-note.txt",type:"text/plain",data:"data:text/plain;base64,S2VlcA=="}]},
{id:"p52",title:"工作日（半天 4h）52",detail:"原始日期 05.11.2-26；自己的说明",done:true,note:"这个不是排课日期",attachments:[]},
{id:"p53",title:"工作日（半天 4h）53",detail:"2026-11-06 09:00–13:00",done:false,note:"保留备注",attachments:[]},
{id:"p54",title:"工作日（半天 4h）54",detail:"",done:false,note:"空第二栏也保留",attachments:[]}
];
const fixture={ownerName:"Detail preservation QA",semesters:[{id:"s",name:"Winter",courses:[{id:"learning",name:"Ingenieurpraxis",categories:[{id:"work",name:"工作时长",tasks:inputs}]}]}],
degreePlan:{name:"Test",requiredCredits:180,blocks:[],modules:[{id:"m",name:"IP",kind:"elective",courses:[{id:"ip",name:"Ingenieurpraxis",courseId:"learning",credits:6,tasks:[],exams:[],planEvents:[{id:"slot",type:"study",taskId:"p52",title:"工作安排",date:"2026-12-01",startTime:"09:00",endTime:"13:00",hours:4}]}]}]},
timer:{sessions:[{id:"old-session",taskId:"p51",taskName:inputs[0].title,startAt:Date.parse("2026-10-27T08:00:00Z"),endAt:Date.parse("2026-10-27T12:00:00Z"),durationMs:14400000}],calendarItems:[],scheduleStartMinute:0,scheduleEndMinute:0}};
const state=()=>page.evaluate(()=>studyTrackerBridge.getState());
const raw=s=>s.semesters[0].courses[0].categories[0].tasks;
const content=s=>raw(s).map(({id,title,detail,done,note,attachments})=>({id,title,detail,done,note,attachments}));
const row=id=>page.locator('.task[data-task-id="'+id+'"]');
const progress=()=>page.evaluate(()=>studyTrackerBridge.openCourseProgress("learning"));
try{
 await page.clock.setFixedTime(new Date("2026-11-28T10:00:00+01:00"));
 await page.addInitScript(s=>{if(!localStorage.getItem("study-tracker-online-guest-v1"))localStorage.setItem("study-tracker-online-guest-v1",JSON.stringify(s));localStorage.setItem("study-tracker-language-v1","zh-CN");},fixture);
 await page.goto(process.env.STUDY_TRACKER_TEST_URL||"http://127.0.0.1:8096",{waitUntil:"networkidle"});await page.waitForFunction(()=>window.studyDegree);await progress();
 for(const task of inputs.filter(t=>t.detail)){assert.equal(await row(task.id).locator(".task-detail").textContent(),task.detail);assert.equal(await row(task.id).locator(".task-detail").isVisible(),true);}
 assert.equal(await row("p51").locator(".task-schedule-summary").count(),0,"Completed records do not acquire unscheduled prompts");
 assert.equal(await row("p53").locator(".task-schedule-summary").count(),0,"Typed dates never become schedule metadata");
 assert.ok((await row("p52").locator(".task-schedule-summary").innerText()).includes("2026-12-01"));
 assert.equal(await row("p52").locator(".task-name .task-schedule-summary").count(),0);
 assert.equal(await row("p54").locator('[data-action="update-task-detail"]').isVisible(),true);
 assert.deepEqual(content(await state()),content(fixture),"Rendering changes no user content");
 await row("p51").locator('[data-action="toggle-task-details"]').click();
 assert.equal(await row("p51").locator(".task-note").inputValue(),inputs[0].note);assert.equal(await row("p51").locator(".attachment a").textContent(),"my-note.txt");
 await row("p51").locator('[data-action="toggle-task-details"]').click();assert.equal(await row("p51").locator(".task-detail").isVisible(),true);
 await page.evaluate(async()=>{const {patchStudyScheduleEntry}=await import("/study-plan-core.js");const s=studyTrackerBridge.getState();patchStudyScheduleEntry(s,"ip","plan-event:slot:2026-12-01","2026-12-01",{date:"2026-12-02",startTime:"10:00",endTime:"14:00"});studyTrackerBridge.replaceState(s);});
 await progress();assert.deepEqual(content(await state()),content(fixture),"Moving schedule keeps detail, notes, attachments and completion");
 assert.ok((await row("p52").locator(".task-schedule-summary").innerText()).includes("2026-12-02"));
 await row("p53").locator('[data-action="edit-task"]').click();assert.equal(await page.locator('#editModal [name="detail"]').inputValue(),inputs[2].detail);
 await page.locator('#editModal [name="detail"]').fill("2026-11-06 09:00–13:00 — 用户补充");await page.locator("#editForm").evaluate(f=>f.requestSubmit());
 const expected=structuredClone(inputs);expected[2].detail="2026-11-06 09:00–13:00 — 用户补充";
 assert.deepEqual(content(await state()),expected,"Editing second field preserves all other user fields");
 const popupPromise=page.waitForEvent("popup");await page.locator("#exportBtn").click();const report=await popupPromise;await report.waitForLoadState("domcontentloaded");
 for(const task of expected){const tr=report.locator("tbody tr").filter({hasText:task.title});assert.equal(await tr.count(),1);if(task.detail)assert.ok((await tr.innerText()).includes(task.detail),"PDF keeps second-field text");assert.ok((await tr.innerText()).includes(task.note),"PDF keeps notes");}
 await report.close();
 await page.reload({waitUntil:"networkidle"});await page.waitForFunction(()=>window.studyDegree);await progress();
 const s=await state();assert.deepEqual(content(s),expected);assert.equal(s.timer.sessions.length,1);assert.equal(s.timer.sessions[0].id,"old-session");
 await page.setViewportSize({width:400,height:850});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await mkdir("test-results",{recursive:true});await page.screenshot({path:"test-results/progress-detail-preservation.png",fullPage:true});
 assert.deepEqual(errors,[]);console.log("PASS user detail preservation: date/text fields always visible, ordinary records independent of schedule, collapsed notes and attachments intact, reschedule/edit/PDF/reload and existing actual records");
}finally{await browser.close();}
