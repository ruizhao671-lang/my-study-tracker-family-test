import assert from "node:assert/strict";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1100},timezoneId:"Europe/Berlin"});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
const fixture={ownerName:"Hierarchy test",semesters:[{id:"winter",name:"Winter",courses:[
 {id:"learning",name:"Komputer & Creativität",categories:[
  {id:"lectures",name:"Vorlesung",tasks:[{id:"lecture7",title:"Week 7",estimatedHours:3,weekOf:"2026-11-23",done:false,note:"Retain notes",attachments:[]},{id:"lecture8",title:"Week 8",estimatedHours:3,weekOf:"2026-11-30",done:false}]},
  {id:"homework",name:"Hausaufgabe",tasks:[{id:"homework7",title:"Week 7",estimatedHours:4,done:false}]}]},
 {id:"other-learning",name:"Other course",categories:[{id:"other-chapters",name:"Kapitel",tasks:[{id:"other-task",title:"Chapter 1",estimatedHours:2,done:false}]}]}
]}],degreePlan:{name:"Test",requiredCredits:180,blocks:[],modules:[{id:"m",name:"Electives",kind:"elective",courses:[
 {id:"kc",name:"Komputer & Creativität",code:"EI04001",credits:6,courseId:"learning",passed:false,tasks:[],exams:[],planEvents:[],planRange:{start:"2026-11-23",end:"2026-12-13"}},
 {id:"other",name:"Other course",code:"OTHER",credits:5,courseId:"",passed:false,tasks:[],exams:[],planEvents:[]}
]}]},timer:{sessions:[{id:"actual",taskId:"lecture7",courseId:"learning",courseName:"Komputer & Creativität",startAt:Date.parse("2026-11-24T10:00:00+01:00"),endAt:Date.parse("2026-11-24T11:00:00+01:00"),durationMs:3600000}],calendarItems:[],scheduleStartMinute:0,scheduleEndMinute:0}};
const get=()=>page.evaluate(()=>studyTrackerBridge.getState());
const tasks=s=>s.semesters[0].courses[0].categories.flatMap(c=>c.tasks);
const course=s=>s.degreePlan.modules[0].courses[0];
const row=id=>page.locator('[data-task-row="'+id+'"]');
const brick=id=>page.locator('[data-task-source="'+id+'"]');
try{
 await page.clock.setFixedTime(new Date("2026-11-25T10:00:00+01:00"));
 await page.addInitScript(s=>{if(!localStorage.getItem("study-tracker-online-guest-v1"))localStorage.setItem("study-tracker-online-guest-v1",JSON.stringify(s));localStorage.setItem("study-tracker-language-v1","zh-CN");},fixture);
 await page.goto(process.env.STUDY_TRACKER_TEST_URL||"http://127.0.0.1:8096",{waitUntil:"networkidle"});
 await page.waitForFunction(()=>window.studyDegree?.openCourseStudyPlan);
 await page.evaluate(()=>studyDegree.openCourseStudyPlan("kc"));
 assert.equal(await page.locator(".plan-tasks [data-plan-task-group]").count(),2);
 assert.equal(await page.locator('.plan-tasks [data-plan-task-group="Vorlesung"] [data-task-row]').count(),2);
 assert.equal(await page.locator('.plan-tasks [data-plan-task-group="Hausaufgabe"] [data-task-row]').count(),1);
 assert.ok((await page.locator(".plan-target-note").innerText()).includes("3 个任务"));
 assert.equal(await row("lecture7").locator("[data-task-editor-fields]").evaluate(el=>el.open),false,"Existing tasks start as compact rows");
 await row("lecture7").locator("[data-task-editor-fields]>summary").click();
 await row("lecture7").locator('[data-field="hours"]').fill("-1");
 await row("lecture7").locator('[data-field="group"]').dispatchEvent("change");
 assert.ok((await page.locator(".plan-error").innerText()).includes("预计小时"),"Invalid inputs display an error without breaking category controls");
 await row("lecture7").locator('[data-field="hours"]').fill("3.5");
 await page.locator('[data-plan-action="pane-events"]').click();
 await page.locator('[data-plan-action="pane-tasks"]').click();
 assert.equal(await row("lecture7").locator('[data-field="hours"]').inputValue(),"3.5");
 assert.equal(await row("lecture7").locator("[data-task-editor-fields]").evaluate(el=>el.open),true);
 await page.locator('[data-plan-action="save-progress"]').click();
 await page.locator('.task[data-task-id="lecture7"]').waitFor();
 assert.equal(tasks(await get()).find(t=>t.id==="lecture7").estimatedHours,3.5);
 await page.locator('.task[data-task-id="lecture7"] [data-action="toggle-task"]').check();
 await page.evaluate(()=>studyDegree.openCourseStudyPlan("kc"));
 assert.equal(await row("lecture7").locator("[data-task-quick-done]").isChecked(),true,"Progress completion appears in planner");
 await row("lecture7").locator("[data-task-quick-done]").uncheck();
 await page.locator('.plan-tasks [data-plan-task-group="Vorlesung"] [data-plan-action="add-group-task"]').click();
 const added=page.locator('[data-task-row]').filter({has:page.locator('[data-field="title"][value=""]')});
 assert.equal(await added.count(),1);assert.equal(await added.locator('[data-field="group"]').inputValue(),"Vorlesung");
 await added.locator('[data-field="title"]').fill("Week 9");
 await page.screenshot({path:process.env.TEMP+"/studytracker-course-task-groups.png"});
 await row("homework7").locator('[data-plan-action="schedule-task"]').click();
 await brick("homework7").waitFor();
 assert.equal(await brick("homework7").evaluate(el=>el.classList.contains("is-focused")),true);
 assert.equal(await page.locator('.task-shelf-category[data-task-category="Vorlesung"] [data-task-source]').count(),3);
 assert.equal(await page.locator('.task-shelf-category[data-task-category="Hausaufgabe"] [data-task-source]').count(),1);
 await brick("homework7").locator("strong").first().dragTo(page.locator('.schedule-day-grid[data-drop-date="2026-11-25"]'),{targetPosition:{x:70,y:112}});
 let state=await get();
 assert.equal(course(state).planEvents.length,1);assert.equal(course(state).planEvents[0].taskId,"homework7");
 assert.equal(course(state).planEvents[0].hours,2);assert.equal(tasks(state).length,4,"Scheduling reuses the progress task, with no copy");
 assert.equal(state.timer.sessions.length,1);assert.equal(tasks(state).find(t=>t.id==="lecture7").note,"Retain notes");
 await page.screenshot({path:process.env.TEMP+"/studytracker-grouped-task-bricks.png"});
 await brick("homework7").locator("[data-task-done]").check();
 await page.evaluate(()=>studyTrackerBridge.openCourseProgress("learning"));
 assert.equal(await page.locator('.task[data-task-id="homework7"] [data-action="toggle-task"]').isChecked(),true,"Planner completion updates progress");
 await page.evaluate(()=>studyDegree.openCourseStudyPlan("other"));
 await page.locator('[name="progressLink"]').selectOption("");
 assert.equal(await page.locator("[data-task-row]").count(),0);
 await page.locator('[name="progressLink"]').selectOption("other-learning");
 assert.equal(await page.locator('.plan-tasks [data-plan-task-group="Kapitel"] [data-task-row="other-task"]').count(),1);
 await page.locator('[data-plan-action="calendar-workspace"]').click();
 await brick("other-task").waitFor();
 assert.equal(await page.locator('[data-task-bucket="unscoped"][aria-pressed="true"]').count(),1,"Unscoped existing tasks are visible without discovering a hidden filter");
 assert.equal((await get()).degreePlan.modules[0].courses[1].courseId,"other-learning");
 await page.reload();await page.waitForFunction(()=>window.studyDegree?.openCourseStudyPlan);
 await page.evaluate(()=>studyDegree.openCourseStudyPlan("kc"));
 assert.equal(await row("homework7").locator("[data-task-quick-done]").isChecked(),true);
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:process.env.TEMP+"/studytracker-task-groups-mobile.png"});
 assert.ok(await page.locator("#degreeDialog").evaluate(el=>el.scrollWidth<=el.clientWidth+2));
 await page.locator('[data-plan-action="calendar-workspace"]').click();
 assert.ok(await page.locator(".study-schedule").evaluate(el=>el.scrollWidth<=el.clientWidth+2));
 assert.deepEqual(errors,[]);
 console.log("PASS grouped planning: progress categories and canonical tasks reused without import, compact editing, category add, two-way completion, direct task-to-drag calendar, split allocation, unscoped fallback, optional linking, notes/time retention, reload and mobile");
}finally{await browser.close();}
