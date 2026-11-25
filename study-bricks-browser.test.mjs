import assert from "node:assert/strict";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const url=process.env.STUDY_TRACKER_TEST_URL||"http://127.0.0.1:8096";
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1800},timezoneId:"Europe/Berlin"});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
const course={id:"demo",name:"Signaltheorie",code:"EI00330",credits:5,passed:false,courseId:"learning",passTaskId:"",blockId:"winter",exams:[],tasks:[]};
const fixture={ownerName:"Bricks test",semesters:[{id:"stage",name:"Winter",courses:[{id:"learning",name:course.name,categories:[{id:"chapter",name:"Chapter",tasks:[
{id:"original",title:"Chapter 3",done:false,estimatedHours:4,weekOf:"2026-11-23",note:"Keep notes",attachments:[{name:"keep.pdf",data:"test"}]},
{id:"backlog",title:"Old work",done:false,estimatedHours:1,weekOf:"2026-11-16"},
{id:"future",title:"Future work",done:false,estimatedHours:1,weekOf:"2026-11-30"},
{id:"unknown",title:"Unknown project",done:false,estimatedHours:null},
{id:"done",title:"Completed work",done:true,estimatedHours:1,weekOf:"2026-11-23"}
]}]}]}],degreePlan:{name:"Test",requiredCredits:180,modules:[{id:"m",name:"Required",kind:"required",requiredCredits:120,courses:[course,
{id:"other",name:"Other course",code:"OTHER",credits:5,passed:false,exams:[],tasks:[],courseId:"",blockId:"winter",planEvents:[{id:"other-event",title:"Other work",type:"study",date:"2026-11-24",hours:1}]}]}],
blocks:[{id:"winter",name:"Winter",start:"2026-10-12",end:"2027-02-05"}]},timer:{sessions:[],calendarItems:[],scheduleStartMinute:0,scheduleEndMinute:0}};
const input={course:"EI00330",period:{start:"2026-11-23",end:"2026-12-13"},tasks:[
{id:"chapter-3",title:"Chapter 3",group:"Chapter",hours:4,weekOf:"2026-11-23",teachingWeek:7},
{id:"lecture",title:"Lecture",group:"Vorlesung",hours:3,repeat:{from:"2026-11-23",until:"2026-12-13"}}
],events:[{id:"class",title:"Weekly class",type:"class",date:"2026-11-25",startTime:"13:15",endTime:"16:15",taskId:"lecture",repeat:{weekdays:[3],until:"2026-12-13",exceptDates:["2026-12-02"]}}]};
const hash="#study-plan-v2="+Buffer.from(JSON.stringify(input)).toString("base64url");
const get=()=>page.evaluate(()=>studyTrackerBridge.getState());
const brick=id=>page.locator('[data-task-source="'+id+'"]');
const save=()=>page.locator('#degreeDialog button[type="submit"]').click();
const slots=s=>s.degreePlan.modules[0].courses[0].planEvents.filter(e=>e.taskId==="original");
const allTasks=s=>s.semesters[0].courses[0].categories.flatMap(c=>c.tasks);
try{
 await page.clock.setFixedTime(new Date("2026-11-25T10:00:00+01:00"));
 await page.addInitScript(s=>{if(!localStorage.getItem("study-tracker-online-guest-v1"))localStorage.setItem("study-tracker-online-guest-v1",JSON.stringify(s));localStorage.setItem("study-tracker-language-v1","zh-CN");},fixture);
 await page.goto(url+"/"+hash,{waitUntil:"networkidle"});
 await page.locator(".plan-preview").waitFor();
 assert.equal(await page.locator('[data-review-task] [data-field="weekOf"]').first().inputValue(),"2026-11-23");
 assert.equal(await page.locator('[data-review-task] [data-field="teachingWeek"]').first().inputValue(),"7");
 await page.locator("[data-review-task]").first().locator("[data-merge]").selectOption("original");
 const choices=page.locator('[data-plan-pane="tasks"] [data-conflict-choice]');for(let i=0;i<await choices.count();i++)if(await choices.nth(i).inputValue()==="")await choices.nth(i).selectOption("apply");
 await page.locator('[data-plan-action="save-schedule"]').click();
 await page.locator(".study-schedule").waitFor();
 assert.equal(await brick("original").count(),1);
 assert.equal(await brick("backlog").count(),0);assert.equal(await brick("future").count(),0);assert.equal(await brick("done").count(),0);
 assert.ok((await brick("original").innerText()).includes("课程第 7 周"));
 assert.equal(await page.locator(".schedule-event.class").count(),1);
 assert.equal((await get()).degreePlan.modules[0].courses[0].planEvents.length,1);
 assert.equal(allTasks(await get()).find(t=>t.id==="original").plannedDate,"");
 await page.locator('[data-task-bucket="overdue"]').first().click();assert.equal(await brick("backlog").count(),1);
 await page.locator('[data-task-bucket="future"]').first().click();assert.equal(await brick("future").count(),1);
 await page.locator('[data-task-bucket="complete"]').first().click();assert.equal(await brick("done").count(),1);
 await page.locator('[data-task-bucket="unscoped"]').first().click();assert.equal(await brick("unknown").count(),1);
 assert.ok((await brick("unknown").innerText()).includes("未估算"));
 await page.locator('[data-task-bucket="all"]').first().click();await page.locator("[data-task-week]").selectOption("date:2026-11-30");
 assert.equal(await brick("future").count(),1);assert.equal(await brick("original").count(),0);
 await page.locator("[data-task-week]").selectOption("");await page.locator("[data-task-status]").selectOption("done");
 assert.equal(await page.locator("[data-task-source]").count(),1);
 await page.locator('[data-task-bucket="current"]').first().click();
 await brick("original").locator("[data-plan-task-time]").click();
 assert.equal(await page.locator('#degreeDialog [name="date"]').inputValue(),"");
 assert.equal(await page.locator('#degreeDialog [name="hours"]').inputValue(),"2");
 await page.locator('#degreeDialog [name="date"]').fill("2026-11-23");
 await page.locator('#degreeDialog [name="startTime"]').fill("10:00");
 await page.locator('#degreeDialog [name="endTime"]').fill("12:00");await save();
 assert.equal(slots(await get()).length,1);
 assert.equal(await page.locator('[data-task-bucket="scheduled"]').getAttribute("aria-pressed"),"true","Partial allocation moves to Scheduled");
 assert.equal(await brick("original").count(),1);
 assert.ok((await brick("original").innerText()).includes("尚未分配：2 h"));
 await brick("original").locator("[data-plan-task-time]").click();
 await page.locator('#degreeDialog [name="date"]').fill("2026-11-28");
 await page.locator('#degreeDialog [name="startTime"]').fill("14:00");
 await page.locator('#degreeDialog [name="endTime"]').fill("16:00");await save();
 let state=await get();assert.equal(slots(state).length,2);assert.equal(allTasks(state).find(t=>t.id==="original").estimatedHours,4);
 assert.equal(allTasks(state).find(t=>t.id==="original").plannedDate,"");assert.equal(allTasks(state).find(t=>t.id==="original").done,false);
 await page.locator('[data-task-bucket="scheduled"]').first().click();assert.equal(await brick("original").count(),1);
 const first=slots(state)[0],card=()=>page.locator('.schedule-day-grid [data-entry="plan-event:'+first.id+':2026-11-23"]');
 await card().locator(".schedule-event-open").click();
 await page.locator('#degreeDialog [name="endTime"]').fill("11:00");await page.locator('#degreeDialog [name="endTime"]').blur();await save();
 assert.equal(slots(await get())[0].hours,1);
 await card().locator("[data-resize-entry]").scrollIntoViewIfNeeded();
 const handle=await card().locator("[data-resize-entry]").boundingBox();
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2+56,{steps:5});await page.mouse.up();
 assert.equal(slots(await get())[0].hours,2,"Resize handle changes planned duration");
 await card().locator("[data-drag-entry]").dragTo(page.locator('.schedule-all-day[data-drop-date="2026-11-24"]'));
 state=await get();assert.equal(slots(state)[0].date,"2026-11-24");assert.equal(allTasks(state).find(t=>t.id==="original").weekOf,"2026-11-23");
 await page.locator('[data-task-bucket="scheduled"]').first().click();
 await brick("original").locator("[data-plan-task-time]").click();
 await page.locator('#degreeDialog [name="hours"]').fill("1");await page.locator('#degreeDialog [name="date"]').fill("2026-11-26");
 await page.locator('#degreeDialog [name="startTime"]').fill("18:00");await page.locator('#degreeDialog [name="endTime"]').fill("19:00");await save();
 assert.equal(slots(await get()).length,3);
 const newSlot=slots(await get()).at(-1);
 await page.locator('.schedule-day-grid [data-entry="plan-event:'+newSlot.id+':2026-11-26"] [data-drag-entry]').dragTo(page.locator(".schedule-flexible").locator("h3"));
 assert.equal(slots(await get()).length,2,"Dragging a slot back removes only the allocation");
 const count=allTasks(await get()).length;
 await brick("original").locator("strong").first().dragTo(page.locator('.schedule-day-grid[data-drop-date="2026-11-27"]'),{targetPosition:{x:50,y:112}});
 state=await get();assert.equal(slots(state).length,3,"Task drag adds a slot instead of moving the task");
 assert.equal(slots(state).at(-1).startTime,"10:00");
 assert.equal(allTasks(state).length,count);assert.equal(allTasks(state).find(t=>t.id==="original").plannedDate,"");
 await brick("original").locator("[data-task-window]").click();
 await page.locator('#degreeDialog [name="windowEnd"]').fill("2026-12-06");await save();
 assert.equal(allTasks(await get()).find(t=>t.id==="original").windowEnd,"2026-12-06");
 await brick("original").locator("[data-brick-timer]").click();
 if(await page.locator("#restModal.open").count())await page.locator("#restExtendBtn").click();
 await page.waitForFunction(()=>studyTrackerBridge.getState().timer.active);
 assert.equal(await page.locator("#timerTask").inputValue(),"original");assert.equal(await page.locator("#timerCompleteTask").isChecked(),false);
 await page.waitForTimeout(1100);await page.locator("#timerFinishBtn").click();
 state=await get();assert.equal(state.timer.sessions.at(-1).taskId,"original");assert.equal(allTasks(state).find(t=>t.id==="original").done,false);
 await page.evaluate(()=>studyDegree.openSchedule("demo","2026-11-23"));await page.locator('[data-task-bucket="scheduled"]').click();assert.equal(await page.locator(".schedule-actual").count(),1);
 await brick("original").locator("[data-task-done]").click();
 state=await get();assert.equal(allTasks(state).find(t=>t.id==="original").done,true);
 assert.ok(slots(state).every(e=>!e.executed));
 await page.locator('[data-task-bucket="complete"]').first().click();assert.equal(await brick("original").count(),1);
 await page.reload({waitUntil:"networkidle"});await page.waitForFunction(()=>window.studyDegree);
 await page.evaluate(()=>studyDegree.openSchedule("demo","2026-11-23"));await page.locator('[data-task-bucket="complete"]').first().click();
 assert.equal(await brick("original").count(),1);state=await get();
 assert.equal(slots(state).length,3);assert.equal(allTasks(state).find(t=>t.id==="original").note,"Keep notes");
 assert.equal(allTasks(state).find(t=>t.id==="original").attachments[0].name,"keep.pdf");
 await page.locator('[data-schedule-filter]').selectOption("");assert.equal(await page.locator(".schedule-event").filter({hasText:"Other work"}).count(),1);
 const colors=await page.locator(".schedule-day-grid .schedule-event,.schedule-all-day .schedule-event").evaluateAll(els=>[...new Set(els.map(el=>getComputedStyle(el).borderTopColor))]);
 assert.ok(colors.length>=2);
 const otherColor=await page.locator('.schedule-all-day [data-entry="plan-event:other-event:2026-11-24"]').evaluate(el=>getComputedStyle(el).getPropertyValue("--study-course-color"));
 const lectureColor=await page.locator(".schedule-day-grid .schedule-event.class").evaluate(el=>getComputedStyle(el).getPropertyValue("--study-course-color"));
 assert.notEqual(otherColor,lectureColor,"Different courses retain different color markers");
 await page.screenshot({path:process.env.TEMP+"/studytracker-task-bricks.png",fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:process.env.TEMP+"/studytracker-task-bricks-mobile.png",fullPage:true});
 assert.deepEqual(errors,[]);
 console.log("PASS browser task bricks: v2 editable windows, canonical IDs/notes, current/backlog/future/scheduled/completed/week filters, split sessions, move, resize, unschedule, task drag, task timer, actual records, manual completion, reload, course colors and mobile");
}finally{await browser.close();}
