import assert from "node:assert/strict";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1100},timezoneId:"Europe/Berlin"});
const errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("dialog",d=>d.accept());
const fixture={ownerName:"Class repair QA",semesters:[{id:"s",name:"Winter",courses:[{id:"learning",name:"K&C",categories:[
{id:"vl",name:"Vorlesung",tasks:[7,8,9,10].map(n=>({id:"v"+n,title:"Week "+n,estimatedHours:3,done:false,note:"Keep notes",attachments:[{name:"keep.pdf"}]}))},
{id:"ha",name:"Hausaufgabe",tasks:[{id:"ha",title:"Week 8",estimatedHours:2,weekOf:"2026-11-30",done:false}]}
]}]}],degreePlan:{name:"TUM",requiredCredits:180,blocks:[],modules:[{id:"m",name:"Elective",kind:"elective",requiredCredits:30,courses:[
{id:"kc",name:"Komputer & Creativität",code:"EI04001",credits:6,courseId:"learning",tasks:[],exams:[],planRange:{start:"2026-10-14",end:"2026-12-16"},planEvents:[
{id:"class",title:"Komputer & Creativität 上课",type:"class",date:"2026-10-14",startTime:"13:15",endTime:"16:15",repeat:{until:"2026-12-09",weekdays:[3],exceptDates:[]}},
{id:"duplicate",title:"Vorlesung · Week 7",type:"study",taskId:"v7",date:"2026-11-25",startTime:"13:15",endTime:"16:30",executed:true,userScheduled:true}
]}]}]},timer:{calendarItems:[],sessions:[{id:"actual",taskId:"v7",courseId:"learning",startAt:Date.parse("2026-11-25T10:00:00+01:00"),endAt:Date.parse("2026-11-25T11:00:00+01:00"),durationMs:3600000}],scheduleStartMinute:0,scheduleEndMinute:0}};
fixture.semesters[0].courses[0].categories[0].tasks.push({id:"orphan",title:"Week 7",schedulingMode:"flexible",estimatedHours:3,done:false});
const get=()=>page.evaluate(()=>studyTrackerBridge.getState());
const raw=s=>s.semesters[0].courses[0].categories.flatMap(c=>c.tasks);
const course=s=>s.degreePlan.modules[0].courses[0];
const brick=id=>page.locator('[data-task-source="'+id+'"]');
const card=date=>page.locator('.schedule-day-grid [data-entry="plan-event:class:'+date+'"]');
const save=()=>page.locator('#degreeDialog [type="submit"]').click();
try{
 await page.clock.setFixedTime(new Date("2026-11-28T11:00:00+01:00"));
 await page.addInitScript(s=>{if(!localStorage.getItem("study-tracker-online-guest-v1"))localStorage.setItem("study-tracker-online-guest-v1",JSON.stringify(s));localStorage.setItem("study-tracker-language-v1","zh-CN");},fixture);
 await page.goto(process.env.STUDY_TRACKER_TEST_URL||"http://127.0.0.1:8096",{waitUntil:"networkidle"});await page.waitForFunction(()=>window.studyDegree);
 await page.evaluate(()=>studyDegree.openSchedule("kc","2026-11-23"));await page.locator('[data-task-bucket="all"]').click();
 assert.equal(await brick("orphan").count(),0);assert.equal(await page.locator('[data-fixed-task="orphan"]').count(),1);
 assert.equal(await brick("v7").count(),0);assert.equal(await brick("v8").count(),0);assert.equal(await brick("ha").count(),1);
 assert.equal(await page.locator(".schedule-day-grid .schedule-event").count(),1,"Only one copy of the real class is displayed");
 assert.equal(await card("2026-11-25").getAttribute("draggable"),"false");assert.equal(course(await get()).planEventArchive[0].event.id,"duplicate");
 assert.ok((await page.locator(".schedule-link-status").innerText()).includes("Vorlesung · Week 7"));
 await card("2026-11-25").locator(".schedule-event-open").click();
 assert.equal(await page.locator('#degreeDialog [name="endTime"]').inputValue(),"16:15");
 assert.equal(await page.locator('#degreeDialog [name="hours"]').inputValue(),"3");
 await save();assert.equal(course(await get()).planEvents.filter(e=>e.type==="class").length,1,"Saving a fixed session without changes does not detach or duplicate it");
 await card("2026-11-25").locator(".schedule-event-open").click();
 assert.equal(await page.locator('#degreeDialog [data-schedule="unschedule"]').isVisible(),true,"Fixed classes can be canceled");
 await page.locator('#degreeDialog [data-schedule="edit-task"]').click();
 await page.locator('#degreeDialog [name="hours"]').fill("3.5");await save();
 assert.equal(raw(await get()).find(t=>t.id==="v7").estimatedHours,3.5);assert.equal(raw(await get()).find(t=>t.id==="v7").note,"Keep notes");
 assert.equal((await get()).timer.sessions.length,1);
 await brick("ha").locator("[data-edit-task]").click();await page.locator('#degreeDialog [name="title"]').fill("Week 8 exercises");await save();
 assert.equal(raw(await get()).find(t=>t.id==="ha").title,"Week 8 exercises");
 await page.locator('[data-schedule-date]').fill("2026-11-30");await page.locator('[data-schedule-date]').dispatchEvent("change");
 await card("2026-12-02").locator(".schedule-event-open").click();await page.locator('#degreeDialog [data-schedule="unschedule"]').click();
 assert.ok(raw(await get()).some(t=>t.id==="v8"),"Canceling a session keeps the task");
 const held=page.locator('[data-fixed-task="v8"]');assert.equal(await held.count(),1);
 await held.locator("[data-fixed-delete]").click();assert.ok(!raw(await get()).some(t=>t.id==="v8"));
 await page.evaluate(()=>studyDegree.openSchedule("kc","2026-12-07"));
 await card("2026-12-09").locator(".schedule-event-open").click();await page.locator('#degreeDialog [data-schedule="delete-linked-task"]').click();
 assert.ok(!raw(await get()).some(t=>t.id==="v9"));assert.equal(await card("2026-12-09").count(),0);
 await page.evaluate(()=>studyDegree.openSchedule("kc","2026-11-30"));await page.locator('[data-task-bucket="all"]').click();
 await brick("ha").locator("[data-plan-task-time]").click();await page.locator('#degreeDialog [name="date"]').fill("2026-12-04");await page.locator('#degreeDialog [name="startTime"]').fill("19:00");await page.locator('#degreeDialog [name="endTime"]').fill("21:00");await save();
 await brick("ha").locator("[data-delete-task]").click();
 assert.ok(!raw(await get()).some(t=>t.id==="ha"));assert.ok(!course(await get()).planEvents.some(e=>e.taskId==="ha"));
 assert.equal((await get()).timer.sessions.length,1);
 await page.evaluate(()=>studyDegree.openCourseStudyPlan("kc"));await page.locator('[data-plan-action="pane-events"]').click();
 assert.equal(await page.locator('[data-event-row] [data-field="taskLink"]').inputValue(),"week-map");
 await page.locator('[data-plan-action="save-schedule"]').click();
 const fixed=page.locator('[data-fixed-task="v10"]');await fixed.locator("[data-fixed-schedule]").click();
 assert.equal(await page.locator('#degreeDialog [name="schedulingMode"]').inputValue(),"fixed");
 await page.locator('#degreeDialog [name="date"]').fill("2026-12-16");await page.locator('#degreeDialog [name="startTime"]').fill("13:15");await page.locator('#degreeDialog [name="endTime"]').fill("16:15");await save();
 assert.ok(course(await get()).planEvents.some(e=>e.taskId==="v10"));
 await page.reload({waitUntil:"networkidle"});await page.waitForFunction(()=>window.studyDegree);await page.evaluate(()=>studyDegree.openSchedule("kc","2026-11-23"));
 assert.equal(await page.locator(".schedule-day-grid .schedule-event").count(),1);assert.equal((await get()).timer.sessions.length,1);
 await page.setViewportSize({width:390,height:844});await card("2026-11-25").locator(".schedule-event-open").click();
 assert.ok(await page.locator("#degreeDialog").evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 await page.screenshot({path:process.env.TEMP+"/studytracker-class-edit-delete-mobile.png",fullPage:false});
 await page.locator("#degreeDialog [data-dialog-close]").click();
 await page.evaluate(()=>studyTrackerBridge.openStudyCalendar("2026-11-25"));
 await page.locator('[data-action="delete-planned-task"]').first().click();
 assert.ok(!raw(await get()).some(t=>t.id==="v7"));assert.equal((await get()).timer.sessions.length,1);
 assert.equal(course(await get()).planTaskArchive.find(a=>a.task.id==="v7").task.note,"Keep notes");
 assert.deepEqual(errors,[]);
 console.log("PASS live UI class repair: linked fixed lectures, duplicate cleanup, task edit/delete on bricks and calendar, cancel fixed slot without deleting task, fixed pending controls, repeated save/reload, preserved actual time/notes, and mobile");
}finally{await browser.close();}
