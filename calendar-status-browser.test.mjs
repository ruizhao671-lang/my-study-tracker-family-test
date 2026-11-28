import assert from "node:assert/strict";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const url=process.env.STUDY_TRACKER_TEST_URL||"http://127.0.0.1:8096";
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1050},timezoneId:"Europe/Berlin"});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
const course={id:"kc",name:"Komputer & Creativität",code:"EI04001",credits:6,passed:false,courseId:"learning",passTaskId:"",blockId:"winter",examTerm:"",tasks:[],
 exams:[{id:"exam",date:"2026-11-20",time:"16:00",location:"Garching"}],
 planEvents:[
 {id:"missed",type:"study",title:"Missed evening",date:"2026-11-18",startTime:"19:00",endTime:"21:00",hours:2,taskId:"linked-lecture",executed:false},
 {id:"executed",type:"class",title:"Executed class",date:"2026-11-17",startTime:"13:15",endTime:"16:15",hours:3,executed:true},
 {id:"future",type:"study",title:"Sunday evening",date:"2026-11-22",startTime:"19:00",endTime:"21:00",hours:2,taskId:"linked-homework",executed:false},
 {id:"date",type:"milestone",title:"Project milestone",date:"2026-11-19"}]};
const fixture={ownerName:"Calendar test",semesters:[{id:"stage",name:"Winter",courses:[{id:"learning",name:course.name,categories:[
{id:"lecture",name:"Vorlesung",tasks:[{id:"done",title:"Week 1",done:true,estimatedHours:2,schedulingMode:"flexible",classDefaultMode:false},{id:"linked-lecture",title:"Chapter 2",done:true,estimatedHours:2}]},
{id:"homework",name:"Hausaufgabe",tasks:[{id:"pending",title:"Week 1",done:false,estimatedHours:2},{id:"linked-homework",title:"Übung 2",done:false,estimatedHours:2},
{id:"overdue",title:"Übungsblatt",done:false,deadline:"2026-11-18"}]}]}]}],
degreePlan:{name:"Test",requiredCredits:180,modules:[{id:"m",name:"Electives",kind:"elective",requiredCredits:30,courses:[course,
{id:"other",name:"Other course",credits:5,code:"OTHER",passed:false,courseId:"",blockId:"winter",exams:[],tasks:[],planEvents:[
{id:"other-session",type:"study",title:"Other time plan",date:"2026-11-19",hours:1}]}]}],
blocks:[{id:"winter",name:"Winter",start:"2026-10-12",end:"2027-02-05"}]},
timer:{sessions:[{id:"actual",courseId:"learning",semesterId:"stage",categoryId:"homework",taskId:"pending",courseName:course.name,semesterName:"Winter",categoryName:"Hausaufgabe",taskName:"Week 1",startAt:Date.parse("2026-11-21T10:00:00+01:00"),endAt:Date.parse("2026-11-21T11:00:00+01:00"),durationMs:3600000,source:"manual"}],
calendarItems:[{id:"saved-exam",type:"exam",title:course.name,date:"2026-11-20",startTime:"16:00",endTime:"17:00",courseId:"learning",degreeCourseId:"kc",degreeExamId:"exam",location:"Garching",requirements:"Bring calculator"}],
scheduleStartMinute:0,scheduleEndMinute:0}};
const get=()=>page.evaluate(()=>studyTrackerBridge.getState());
try{
 await page.clock.setFixedTime(new Date("2026-11-22T16:00:00Z"));
 await page.addInitScript(f=>{if(!localStorage.getItem("study-tracker-online-guest-v1"))localStorage.setItem("study-tracker-online-guest-v1",JSON.stringify(f));localStorage.setItem("study-tracker-language-v1","zh-CN");},fixture);
 await page.goto(url,{waitUntil:"networkidle"});
 await page.waitForFunction(()=>window.studyDegree?.openSchedule);
 await page.evaluate(()=>studyDegree.openSchedule("kc","2026-11-18"));
 await page.locator('[data-task-bucket="all"]').first().click();
 const flexible=page.locator(".schedule-flexible");
 assert.ok((await flexible.innerText()).includes("Vorlesung · Week 1"));
 assert.ok((await flexible.innerText()).includes("Hausaufgabe · Week 1"));
 assert.equal(await flexible.locator('[data-entry="plan-task:done"]').getAttribute("data-study-status"),"complete");
 assert.equal(await flexible.locator('[data-entry="plan-task:pending"]').getAttribute("data-study-status"),"pending");
 assert.equal(await flexible.locator('[data-entry="plan-task:overdue"]').getAttribute("data-study-status"),"overdue");
 const card=id=>page.locator('.schedule-day-grid [data-entry="plan-event:'+id+':'+({missed:"2026-11-18",executed:"2026-11-17",future:"2026-11-22"}[id])+'"]');
 assert.equal(await card("missed").getAttribute("data-study-status"),"overdue");
 assert.equal(await card("executed").getAttribute("data-study-status"),"complete");
 assert.equal(await card("future").getAttribute("data-study-status"),"pending");
 assert.equal(await page.locator(".schedule-event.exam").count(),1,"Saved and planned exams must deduplicate");
 assert.equal(await page.locator(".schedule-event.exam").getAttribute("data-study-status"),"exam");
 assert.equal(await page.locator(".schedule-actual.study-status-record").count(),1);
 assert.ok((await page.locator(".schedule-actual").innerText()).includes("Hausaufgabe · Week 1"));
 assert.ok((await page.locator('.schedule-agenda-item[data-entry="plan-event:missed:2026-11-18"]').innerText()).includes("Vorlesung · Chapter 2"));
 const colors=await Promise.all([card("missed"),card("executed"),card("future"),page.locator(".schedule-event.exam"),page.locator(".schedule-actual")].map(l=>l.evaluate(el=>getComputedStyle(el).backgroundColor)));
 assert.equal(new Set(colors).size,5,"Five states must use visibly different colors");
 assert.equal(await page.locator(".study-calendar-legend .study-legend-item").count(),6);
 await card("missed").scrollIntoViewIfNeeded();
 assert.ok(await card("missed").evaluate(el=>el.querySelector("[data-schedule-execute]").getBoundingClientRect().bottom<=el.getBoundingClientRect().bottom),"Checkbox must fit");
 await page.screenshot({path:process.env.TEMP+"/studytracker-calendar-status.png",fullPage:true});
 await page.locator('.schedule-agenda-item[data-entry="plan-event:missed:2026-11-18"] [data-schedule-execute]').check();
 assert.equal(await card("missed").getAttribute("data-study-status"),"complete");
 let state=await get();assert.equal(state.semesters[0].courses[0].categories[0].tasks[0].done,true);
 assert.equal(state.semesters[0].courses[0].categories[1].tasks[0].done,false);
 assert.equal(state.timer.sessions.length,1);
 await card("future").locator(".schedule-event-open").click();
 assert.equal(await page.locator('#degreeDialog [name="taskLink"]').inputValue(),"linked-homework");
 assert.ok((await page.locator('#degreeDialog [name="taskLink"] option:checked').innerText()).includes("Hausaufgabe · Übung 2"));
 assert.ok((await page.locator('#degreeDialog [data-linked-task-label]').innerText()).includes("Hausaufgabe · Übung 2"));
 await page.locator("#degreeDialog [data-dialog-close]").click();
 await page.locator("[data-schedule-filter]").selectOption("");
 assert.equal(await page.locator(".schedule-event").filter({hasText:"Other time plan"}).count(),1);
 await page.locator("[data-schedule-filter]").selectOption("other");
 assert.equal(await page.locator(".schedule-event.exam").count(),0);
 await page.evaluate(()=>studyDegree.openSchedule("kc","2026-11-18"));
 await page.locator(".schedule-event.exam .schedule-event-open").click();
 assert.ok((await page.locator("#degreeDialog").innerText()).includes("Bring calculator"));
 assert.equal(await page.locator("#degreeDialog [data-schedule-execute]").count(),0);
 await page.locator("#degreeDialog button[type=submit]").click();
 await page.locator('#timerPanel:not([hidden])').waitFor();
 assert.equal(await page.locator('.calendar-exam-name.study-status-exam[data-item-id="saved-exam"]').count(),1);
 assert.equal(await page.locator('#timerCalendarLegend .study-legend-item').count(),6);
 assert.ok((await page.locator('[data-calendar-item-id="saved-exam"]').getAttribute("class")).includes("study-status-exam"));
 await page.evaluate(()=>studyTrackerBridge.openStudyCalendar("2026-11-22"));
 const timerPlan=page.locator('[data-calendar-item-id="plan-event:future:2026-11-22"]');
 assert.ok((await timerPlan.getAttribute("class")).includes("study-status-pending"));
 assert.ok((await timerPlan.innerText()).includes("Hausaufgabe · Übung 2"));
 await timerPlan.locator('[data-action="execute-planned-session"]').check();
 assert.ok((await timerPlan.getAttribute("class")).includes("study-status-complete"));
 state=await get();assert.equal(state.semesters[0].courses[0].categories[1].tasks[0].done,false);
 await page.evaluate(()=>studyTrackerBridge.openStudyCalendar("2026-11-21"));
 assert.equal(await page.locator(".time-block.study-status-record").count(),1);
 assert.equal(await page.locator(".time-block.study-status-record").evaluate(el=>getComputedStyle(el).borderTopStyle),"dashed");
 await page.reload({waitUntil:"networkidle"});await page.waitForFunction(()=>window.studyDegree?.openSchedule);
 await page.evaluate(()=>studyDegree.openSchedule("kc","2026-11-18"));
 assert.equal(await card("future").getAttribute("data-study-status"),"complete","Execution survives reload");
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.equal(await page.locator(".study-schedule .study-calendar-legend .study-legend-item").count(),6);
 await page.screenshot({path:process.env.TEMP+"/studytracker-calendar-status-mobile.png",fullPage:true});
 assert.deepEqual(errors,[]);
 console.log("PASS calendar status/category: linked task paths, complete/overdue/pending/exam/actual colors, execution in both calendars, all/individual courses, exam details, reload and mobile");
}finally{await browser.close();}
