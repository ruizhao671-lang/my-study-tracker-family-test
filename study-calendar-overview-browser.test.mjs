import assert from "node:assert/strict";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1100},timezoneId:"Europe/Berlin"});
const url=process.env.STUDY_TRACKER_TEST_URL||"http://127.0.0.1:8096";
const errors=[];page.on("pageerror",e=>errors.push(e.message));
const c1={id:"c1",name:"Signaltheorie",code:"EI00330",credits:5,passed:false,courseId:"l1",blockId:"winter",tasks:[],exams:[{id:"exam",date:"2026-11-27",time:"14:00",location:"München"}],
planEvents:[{id:"slot",type:"study",title:"Chapter 3 study",date:"2026-11-26",startTime:"18:00",endTime:"20:00",hours:2,taskId:"t1"}]};
const c2={id:"c2",name:"Komputer & Creativität",code:"EI04001",credits:6,passed:false,courseId:"l2",blockId:"winter",tasks:[],exams:[],planEvents:[{id:"class",type:"class",title:"K&C class",date:"2026-11-25",startTime:"13:15",endTime:"16:15",hours:3,taskId:"t2"}]};
const fixture={ownerName:"Hub test",semesters:[{id:"s",name:"Winter",courses:[
{id:"l1",name:c1.name,categories:[{id:"cat1",name:"Vorlesung",tasks:[{id:"t1",title:"Chapter 3",estimatedHours:4,done:false,weekOf:"2026-11-23"}]}]},
{id:"l2",name:c2.name,categories:[{id:"cat2",name:"Hausaufgabe",tasks:[{id:"t2",title:"Week 7",estimatedHours:2,done:false,weekOf:"2026-11-23"},{id:"future",title:"Week 8",estimatedHours:2,done:false,weekOf:"2026-11-30"}]}]},
{id:"ordinary",name:"Independent course",categories:[]}]}],degreePlan:{name:"Test",requiredCredits:180,modules:[{id:"m",name:"Required",kind:"required",requiredCredits:120,courses:[c1,c2]}],blocks:[{id:"winter",name:"Winter",start:"2026-10-12",end:"2027-02-05"}]},
timer:{selectedDate:"2026-11-25",calendarMonth:"2026-11",dayOpen:false,scheduleStartMinute:0,scheduleEndMinute:0,
calendarItems:[{id:"appointment",type:"reminder",title:"Office appointment",date:"2026-11-24",startTime:"09:00",endTime:"09:30",details:"Bring papers"}],
sessions:[{id:"record",courseId:"ordinary",courseName:"Independent course",startAt:Date.parse("2026-11-25T08:00:00+01:00"),endAt:Date.parse("2026-11-25T09:00:00+01:00"),durationMs:3600000}]}};
const get=()=>page.evaluate(()=>studyTrackerBridge.getState());
try{
 await page.clock.setFixedTime(new Date("2026-11-25T10:00:00+01:00"));
 await page.addInitScript(s=>{if(!localStorage.getItem("study-tracker-online-guest-v1"))localStorage.setItem("study-tracker-online-guest-v1",JSON.stringify(s));localStorage.setItem("study-tracker-language-v1","zh-CN");},fixture);
 await page.goto(url,{waitUntil:"networkidle"});await page.waitForFunction(()=>window.studyDegree?.calendarOverviewItems);
 await page.locator("#timerPanelBtn").click();
 assert.equal(await page.locator("#timerWeekPlanBtn").isVisible(),true);
 assert.equal(await page.locator('.calendar-plan-name[data-item-id="plan-event:slot:2026-11-26"]').count(),1);
 assert.equal(await page.locator('.calendar-exam-name[data-item-id="plan-exam:c1:exam"]').count(),1);
 assert.ok(await page.locator("#timerTaskWeeks [data-open-study-week]").count()>=2);
 assert.equal((await get()).timer.calendarItems.length,1,"Opening the overview does not save virtual exams or plans");
 await page.locator('.calendar-plan-name[data-item-id="plan-event:slot:2026-11-26"]').click();
 const block=page.locator('[data-calendar-item-id="plan-event:slot:2026-11-26"]');
 await block.waitFor();assert.equal((await get()).timer.selectedDate,"2026-11-26");
 await block.locator('[data-action="execute-planned-session"]').check();
 assert.equal((await get()).degreePlan.modules[0].courses[0].planEvents[0].executed,true);
 await page.locator('.calendar-exam-name[data-item-id="plan-exam:c1:exam"]').click();
 const exam=page.locator('[data-calendar-item-id="plan-exam:c1:exam"]');await exam.waitFor();
 assert.equal(await exam.evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(241, 234, 255)");
 assert.equal(await exam.locator('[data-action="delete-calendar-item"]').count(),0);
 await exam.locator('[data-action="edit-calendar-item"]').click();
 await page.locator("#editModal.open").waitFor();await page.locator("#cancelEditBtn").click();
 assert.equal((await get()).timer.calendarItems.length,1);
 await page.screenshot({path:process.env.TEMP+"/studytracker-calendar-hub-month.png",fullPage:true});
 await page.locator('#timerTaskWeeks [data-open-study-week="2026-11-23"]').click();
 await page.locator("#degreePanel .study-schedule").waitFor();
 assert.equal(await page.locator("[data-schedule-filter]").inputValue(),"");
 assert.equal(await page.locator(".schedule-event.study").count(),1);
 assert.equal(await page.locator(".schedule-event.class").count(),1);
 assert.equal(await page.locator(".schedule-event.exam").count(),1);
 assert.equal(await page.locator(".schedule-event.reminder").count(),1);
 assert.equal(await page.locator(".schedule-actual").count(),1,"All-courses view includes actual records from ordinary courses");
 await page.locator(".schedule-event.reminder .schedule-event-open").click();
 assert.ok((await page.locator("#degreeDialog").innerText()).includes("Bring papers"));
 await page.locator("#degreeDialog [data-dialog-close]").click();
 await page.locator(".schedule-event.study .schedule-event-open").click();
 await page.locator('#degreeDialog [name="endTime"]').fill("21:00");await page.locator('#degreeDialog [name="endTime"]').blur();
 await page.locator('#degreeDialog button[type="submit"]').click();
 assert.equal((await get()).degreePlan.modules[0].courses[0].planEvents[0].hours,3);
 await page.screenshot({path:process.env.TEMP+"/studytracker-calendar-hub-week.png",fullPage:true});
 await page.locator('[data-schedule="timer-calendar"]').click();await page.locator("#timerPanel:not([hidden])").waitFor();
 await page.locator('.calendar-plan-name[data-item-id="plan-event:slot:2026-11-26"]').click();
 assert.ok((await page.locator('[data-calendar-item-id="plan-event:slot:2026-11-26"]').innerText()).includes("21:00"));
 const state=await get();assert.equal(state.timer.calendarItems.length,1);assert.equal(state.timer.sessions.length,1);
 assert.deepEqual(state.semesters[0].courses[0].categories[0].tasks.map(t=>t.id),["t1"]);
 await page.locator("#systemPanelBtn").click();
 await page.locator('.course[data-course-id="l1"] [data-action="open-linked-study-schedule"]').click();
 assert.equal(await page.locator("[data-schedule-filter]").inputValue(),"c1");
 assert.equal(await page.locator(".schedule-event.class").count(),0);
 assert.equal(await page.locator(".schedule-event.reminder").count(),0);
 await page.evaluate(()=>studyTrackerBridge.openStudyCalendar("2026-12-02"));
 await page.locator('#timerTaskWeeks [data-open-study-week="2026-12-01"]').click();
 assert.equal(await page.locator("[data-schedule-filter]").inputValue(),"");
 await page.locator('[data-schedule="timer-calendar"]').click();
 assert.equal((await get()).timer.calendarMonth,"2026-12","Leading cross-month weeks return to the chosen month");
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:process.env.TEMP+"/studytracker-calendar-hub-mobile.png",fullPage:true});
 await page.reload({waitUntil:"networkidle"});await page.waitForFunction(()=>window.studyDegree?.calendarOverviewItems);
 assert.equal((await get()).degreePlan.modules[0].courses[0].planEvents[0].hours,3);
 assert.equal((await get()).timer.calendarItems.length,1);
 assert.deepEqual(errors,[]);
 console.log("PASS unified calendar entries: month plans/exams/tasks, all-course week shortcut, per-course progress shortcut, reminders and all actual records, shared edits/IDs, no duplicate data, virtual exam safety, cross-month return, reload and mobile");
}finally{await browser.close();}
