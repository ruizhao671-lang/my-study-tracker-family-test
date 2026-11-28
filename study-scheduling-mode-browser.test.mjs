import assert from "node:assert/strict";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1150},timezoneId:"Europe/Berlin"});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
const fixture={ownerName:"Scheduling test",semesters:[{id:"stage",name:"Winter",courses:[{id:"learning",name:"K&C",categories:[
{id:"lectures",name:"Vorlesung",tasks:[{id:"lecture7",title:"Week 7",estimatedHours:3,weekOf:"2026-11-23",teachingWeek:7,planSeriesKey:"task:lecture",done:false,note:"Keep note",attachments:[{name:"keep.pdf"}]},
{id:"lecture8",title:"Week 8",estimatedHours:3,weekOf:"2026-11-30",teachingWeek:8,planSeriesKey:"task:lecture",done:false}]},
{id:"homework",name:"Hausaufgabe",tasks:[{id:"homework7",title:"Week 7",estimatedHours:4,weekOf:"2026-11-23",done:false}]}]}]}],
degreePlan:{examSource:"tum-ei",name:"TUM",requiredCredits:180,blocks:[],modules:[{id:"m",name:"Electives",kind:"elective",courses:[
{id:"kc",name:"K&C",code:"EI04001",credits:6,courseId:"learning",tasks:[],exams:[],planRange:{start:"2026-11-23",end:"2026-12-13"},planEvents:[
{id:"class",importKey:"event:class",type:"class",title:"Weekly class",date:"2026-11-25",startTime:"13:15",endTime:"16:15",taskSeriesKey:"task:lecture",repeat:{frequency:"weekly",weekdays:[3],until:"2026-12-02",exceptDates:[]},completedDates:[]},
{id:"homework-session",type:"study",title:"Exercise",date:"2026-11-26",startTime:"18:00",endTime:"20:00",taskId:"homework7",hours:2,userScheduled:true}]}]}]},
timer:{sessions:[{id:"record",taskId:"lecture7",courseId:"learning",startAt:Date.parse("2026-11-24T10:00:00+01:00"),endAt:Date.parse("2026-11-24T11:00:00+01:00"),durationMs:3600000}],calendarItems:[],scheduleStartMinute:0,scheduleEndMinute:0}};
const get=()=>page.evaluate(()=>studyTrackerBridge.getState());
const tasks=s=>s.semesters[0].courses[0].categories.flatMap(c=>c.tasks);
const brick=id=>page.locator('[data-task-source="'+id+'"]');
const row=id=>page.locator('[data-task-row="'+id+'"]');
const save=()=>page.locator('#degreeDialog button[type="submit"]').click();
try{
 await page.clock.setFixedTime(new Date("2026-11-25T10:00:00+01:00"));
 await page.addInitScript(s=>{if(!localStorage.getItem("study-tracker-online-guest-v1"))localStorage.setItem("study-tracker-online-guest-v1",JSON.stringify(s));localStorage.setItem("study-tracker-language-v1","zh-CN");},fixture);
 await page.goto(process.env.STUDY_TRACKER_TEST_URL||"http://127.0.0.1:8096",{waitUntil:"networkidle"});
 await page.waitForFunction(()=>window.studyDegree?.openSchedule);
 await page.locator("#degreePanelBtn").click();
 await page.locator('#degreePanel [data-degree="schedule"]').click();
 await page.locator("[data-schedule-filter]").selectOption("kc");
 assert.equal(await page.locator("[data-schedule-version]").innerText(),"v2026.11.28.3");
 assert.ok((await page.locator("[data-calendar-week]").innerText()).includes("校历第 7 周"));
 assert.ok((await page.locator("[data-calendar-week]").innerText()).includes("KW 48"));

 assert.equal(await brick("lecture7").count(),0);assert.equal(await brick("lecture8").count(),0);
 assert.equal(await brick("homework7").count(),0,"Already scheduled tasks leave pending");
 let fixed=page.locator(".schedule-day-grid .schedule-event.class");
 assert.equal(await fixed.getAttribute("draggable"),"true");
 assert.equal(await fixed.locator("[data-drag-entry],[data-resize-entry]").count(),0);
 await fixed.locator("[data-schedule-execute]").check();
 assert.equal(tasks(await get()).find(t=>t.id==="lecture7").done,false,"Execution remains separate from task completion");
 await fixed.locator(".schedule-event-open").click();
 assert.equal(await page.locator('#degreeDialog [name="schedulingMode"]').inputValue(),"fixed");
 await page.locator('#degreeDialog [name="schedulingMode"]').selectOption("flexible");await save();

 assert.equal(await brick("lecture7").count(),0,"Scheduled tasks never return to pending merely because mode changes");
 fixed=page.locator(".schedule-day-grid .schedule-event.class");
 assert.equal(await fixed.getAttribute("draggable"),"true");
 assert.equal(await fixed.locator("[data-drag-entry]").count(),1);
 assert.equal(tasks(await get()).find(t=>t.id==="lecture7").schedulingMode,"flexible");
 await page.locator("[data-schedule-date]").fill("2026-11-30");await page.locator("[data-schedule-date]").dispatchEvent("change");
 assert.equal(await page.locator(".schedule-day-grid .schedule-event.class").getAttribute("draggable"),"true","The next week stays fixed");
 await page.evaluate(()=>studyDegree.openCourseStudyPlan("kc"));
 assert.equal(await row("lecture7").locator('[data-field="schedulingMode"]').inputValue(),"flexible");
 await row("lecture7").locator('[data-field="schedulingMode"]').selectOption("fixed");
 await page.locator('[data-plan-action="save-schedule"]').click();
 assert.equal(await brick("lecture7").count(),0);
 assert.equal(await page.locator(".schedule-day-grid .schedule-event.class").getAttribute("draggable"),"true");
 await page.locator('.schedule-day-grid [data-entry="plan-event:homework-session:2026-11-26"] .schedule-event-open').click();
 await page.locator('#degreeDialog [name="schedulingMode"]').selectOption("fixed");await save();
 assert.equal(await brick("homework7").count(),0);
 const homework=page.locator('.schedule-day-grid [data-entry="plan-event:homework-session:2026-11-26"]');
 assert.equal(await homework.getAttribute("draggable"),"true");
 await homework.locator(".schedule-event-open").click();
 await page.locator('#degreeDialog [name="schedulingMode"]').selectOption("flexible");await save();
 assert.equal(await brick("homework7").count(),0);
 assert.equal(await homework.getAttribute("draggable"),"true");
 await homework.locator("[data-drag-entry]").dragTo(page.locator('.schedule-day-grid[data-drop-date="2026-11-27"]'),{targetPosition:{x:60,y:112}});
 assert.equal((await get()).degreePlan.modules[0].courses[0].planEvents.find(e=>e.id==="homework-session").date,"2026-11-27");
 await page.evaluate(()=>studyDegree.openCourseStudyPlan("kc"));
 await page.locator('[data-plan-action="add-task"]').click();
 const added=page.locator("[data-task-row]").last();
 const id=await added.getAttribute("data-task-row");
 await added.locator('[data-field="title"]').fill("Fixed project meeting");
 await added.locator('[data-field="schedulingMode"]').selectOption("fixed");
 await page.locator('[data-plan-action="save-schedule"]').click();
 assert.ok((await page.locator('#degreeDialog [role="status"]').innerText()).includes("需要日期"));
 assert.equal(tasks(await get()).length,3,"Missing fixed time is rejected without creating a task");
 await row(id).locator('.plan-fixed-fields [data-field="date"]').fill("2026-11-27");
 await row(id).locator('.plan-fixed-fields [data-field="startTime"]').fill("10:00");
 await row(id).locator('.plan-fixed-fields [data-field="endTime"]').fill("11:00");
 await page.locator('[data-plan-action="save-schedule"]').click();
 assert.equal(await brick(id).count(),0);
 assert.equal(await page.locator('.schedule-day-grid [data-entry="plan-task:'+id+'"]').getAttribute("draggable"),"true");
 await page.evaluate(()=>studyDegree.openSchedule("kc","2027-01-01"));
 assert.ok((await page.locator("[data-calendar-week]").innerText()).includes("KW 53 · 2026"));
 assert.ok((await page.locator("[data-calendar-week]").innerText()).includes("停课"));
 await page.reload();await page.waitForFunction(()=>window.studyDegree?.openSchedule);
 await page.evaluate(()=>studyDegree.openCourseStudyPlan("kc"));
 assert.equal(await row("lecture7").locator('[data-field="schedulingMode"]').inputValue(),"fixed");
 assert.equal(await row("homework7").locator('[data-field="schedulingMode"]').inputValue(),"flexible");
 const state=await get();assert.equal(tasks(state).find(t=>t.id==="lecture7").note,"Keep note");assert.equal(state.timer.sessions.length,1);
 assert.equal(tasks(state).find(t=>t.id==="lecture7").attachments[0].name,"keep.pdf");
 await page.locator("#degreeDialog [data-close]").click();
 const update={course:"EI04001",period:{start:"2026-11-23",end:"2026-12-13"},tasks:[],events:[{id:"class",schedulingMode:"flexible"}]};
 await page.evaluate(hash=>{location.hash=hash;},"#study-plan-v2="+Buffer.from(JSON.stringify(update)).toString("base64url"));
 await page.locator(".plan-preview").waitFor();
 assert.equal(await row("lecture8").locator('[data-field="schedulingMode"]').inputValue(),"flexible","Preview derives task modes from the reviewed event update, rather than the stale original event");
 await page.locator('[data-plan-action="pane-events"]').click();
 await page.locator('[data-review-event] [data-conflict-choice]').selectOption("apply");
 await page.locator('[data-plan-action="save-schedule"]').click();

 assert.equal(await brick("lecture8").count(),0,"Already scheduled tasks leave future pending");
 assert.equal(await brick("lecture8").count(),0);
 await page.evaluate(()=>studyDegree.openSchedule("kc","2026-11-30"));
 assert.equal(await page.locator(".schedule-day-grid .schedule-event.class").getAttribute("draggable"),"true");
 await page.evaluate(()=>studyDegree.openCourseStudyPlan("kc"));
 await page.setViewportSize({width:390,height:844});
 await row("homework7").locator('[data-field="schedulingMode"]').scrollIntoViewIfNeeded();
 await page.screenshot({path:process.env.TEMP+"/studytracker-fixed-flexible-mobile.png"});
 assert.ok(await page.locator("#degreeDialog").evaluate(el=>el.scrollWidth<=el.clientWidth+2));
 await page.locator('[data-plan-action="save-schedule"]').click();
 assert.ok(await page.locator(".study-schedule").evaluate(el=>el.scrollWidth<=el.clientWidth+2));
 await page.setViewportSize({width:1500,height:1150});
 await page.evaluate(()=>studyDegree.openSchedule("kc","2026-11-23"));
 await page.locator(".schedule-controls").scrollIntoViewIfNeeded();
 await page.screenshot({path:process.env.TEMP+"/studytracker-fixed-flexible-week.png"});
 assert.deepEqual(errors,[]);
 console.log("PASS A/B scheduling UI: fixed classes absent from bricks and locked, completed execution separate, per-week A/B switching, scheduled B remains movable, fixed task requires time, same tasks/records/notes survive reload, official calendar weeks and ISO KW, mobile");
}finally{await browser.close();}
