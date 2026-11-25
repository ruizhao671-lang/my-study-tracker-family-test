import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const url=process.env.STUDY_TRACKER_TEST_URL || "http://127.0.0.1:8096";
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1050}});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
const course={id:"kc",name:"Komputer & Creativität",code:"EI04001",credits:6,passed:false,courseId:"",passTaskId:"",blockId:"winter",examTerm:"",exams:[],examId:"",tasks:[]};
const fixture={ownerName:"Plan test",semesters:[],courseTemplates:[],degreePlan:{name:"Test",requiredCredits:180,term:"WS 2026/27",modules:[{id:"elective",name:"Electives",requiredCredits:30,kind:"elective",courses:[course]}],blocks:[{id:"winter",name:"Winter",start:"2026-10-12",end:"2027-02-05"}]},timer:{sessions:[],calendarItems:[],scheduleStartMinute:0,scheduleEndMinute:0}};
const input={course:"",tasks:"每周三 13:15–16:15 | 课堂 | 参加 Komputer & Creativität 课程（12月2日项目 Kickoff/Pitch；1月13日中期展示；1月27日最终展示） | 3\n跟随课程 | 作业 | 完成当周作业 | 2\n2026-12-09 13:15–16:30 | Workshop | 参加必修 Improtheater-Workshop III（替代当周常规课堂，不额外累计） | 3.25"};
course.tasks=[
  {id:"legacy-class",title:input.tasks.split("\n")[0].split("|")[2].trim(),group:"课堂",hours:3,done:true,blockId:"winter"},
  {id:"legacy-workshop",title:input.tasks.split("\n")[2].split("|")[2].trim(),group:"Workshop",hours:3.25,done:false,blockId:"winter"},
  {id:"legacy-homework",title:"完成当周作业",group:"作业",hours:2,done:false,blockId:"winter"}
];
const hash="#study-plan-v1="+Buffer.from(JSON.stringify(input)).toString("base64url");
async function confirmSave(){
  for(const key of ["tasks","events"]){
    if(await page.locator(".plan-preview [data-review-task],.plan-preview [data-review-event]").count()){
      await page.locator('[data-plan-action="pane-'+key+'"]').click();
      const choices=page.locator('.plan-preview [data-plan-pane="'+key+'"] [data-conflict-choice]');
      for(let i=0;i<await choices.count();i++)if(await choices.nth(i).inputValue()==="")await choices.nth(i).selectOption("apply");
    }
  }
  await page.locator('#degreeDialog button[type="submit"]').click();
}
async function openTaskDetails(){
  const details=page.locator('#degreeDialog details').filter({has:page.locator('[name="done"]')});
  if(await details.count() && !await details.evaluate(el=>el.open))await details.locator("summary").click();
}
try{
  await page.addInitScript(f=>{if(!localStorage.getItem("study-tracker-online-guest-v1"))localStorage.setItem("study-tracker-online-guest-v1",JSON.stringify(f));localStorage.setItem("study-tracker-language-v1","zh-CN");},fixture);
  await page.goto(url+"/"+hash,{waitUntil:"networkidle"});
  await page.locator('#degreeDialog[open] select[name="course"]').selectOption("kc");
  await confirmSave();
  await page.locator('.plan-preview').waitFor();
  await page.locator('.plan-import > summary').click();
  assert.equal(await page.locator('[data-field="rangeEnd"]').inputValue(),"2027-01-27");
  await page.locator('[data-field="rangeStart"]').fill("2026-11-23");
  await page.locator('[data-plan-action="preview"]').click();
  assert.ok((await page.locator(".plan-preview").innerText()).includes("待安排"));
  assert.equal(await page.locator('[name="progressLink"]').inputValue(),"__new");
  await confirmSave();
  await page.locator('[data-plan-action="schedule"]').waitFor();
  assert.equal(await page.evaluate(()=>studyTrackerBridge.getState().degreePlan.modules[0].courses[0].planEvents.find(e=>e.type==="class").legacyTaskDone),true);
  assert.equal(await page.evaluate(()=>{const s=studyTrackerBridge.getState(),id=s.degreePlan.modules[0].courses[0].courseId;return s.semesters.flatMap(s=>s.courses).find(c=>c.id===id).categories.flatMap(c=>c.tasks).length;}),11);
  console.log("PASS browser: legacy saved rows migrate to events without duplicate tasks; original status preserved");
  await page.locator('[data-plan-action="schedule"]').click();
  await page.locator(".study-schedule").waitFor();
  await page.locator("[data-schedule-date]").fill("2026-12-07");
  await page.locator("[data-schedule-date]").dispatchEvent("change");
  assert.equal(await page.locator('.schedule-day-grid .schedule-event.workshop').count(),1);
  assert.equal(await page.locator('.schedule-day-grid .schedule-event.class').count(),0);
  assert.equal(await page.locator('.schedule-flexible .schedule-event.plan-task').count(),1);
  await page.screenshot({path:process.env.TEMP+"/studytracker-week-plan.png",fullPage:true});
  const flexibleId=await page.locator(".schedule-flexible [data-task-source]").first().getAttribute("data-task-source");
  await page.locator(".schedule-flexible .schedule-event.plan-task [data-plan-task-time]").click();
  await page.locator('#degreeDialog [name="date"]').fill("2026-12-08");
  await page.locator('#degreeDialog [name="startTime"]').fill("10:00");
  await page.locator('#degreeDialog [name="endTime"]').fill("12:00");
  await openTaskDetails();
  await page.locator('#degreeDialog [name="done"]').check();
  await confirmSave();
  assert.equal(await page.locator('.schedule-day-grid .schedule-event.study').count(),1);
  const canonical=await page.evaluate(id=>{const s=studyTrackerBridge.getState(),c=s.degreePlan.modules[0].courses[0];return s.semesters.flatMap(s=>s.courses).find(l=>l.id===c.courseId).categories.flatMap(k=>k.tasks).find(t=>t.id===id);},flexibleId);
  assert.equal(canonical.plannedDate,"");
  assert.equal(canonical.done,true);assert.equal(canonical.estimatedHours,2);
  console.log("PASS browser: dates and completion save through the shared task");
  await page.locator('.schedule-day-grid .schedule-event.study .schedule-event-open').click();
  await openTaskDetails();
  await page.locator('#degreeDialog [name="done"]').uncheck();
  await confirmSave();
  await page.locator('.schedule-day-grid .schedule-event.study .schedule-event-open').click();
  await openTaskDetails();
  await page.locator('[data-schedule="task-timer"]').click();
  if(await page.locator("#restModal.open").count())await page.locator("#restExtendBtn").click();
  await page.waitForFunction(()=>window.studyTrackerBridge.getState().timer.active);
  assert.equal(await page.locator("#timerCompleteTask").isChecked(),false);
  assert.equal(await page.locator("#timerTask").inputValue(),canonical.id);
  await page.waitForTimeout(1100);
  await page.locator("#timerFinishBtn").click();
  const timed=await page.evaluate(()=>studyTrackerBridge.getState().timer.sessions.at(-1));
  assert.equal(timed.taskId,canonical.id);assert.equal(timed.markTaskDone,false);
  assert.equal(await page.evaluate(id=>studyTrackerBridge.getState().semesters.flatMap(s=>s.courses).flatMap(c=>c.categories).flatMap(c=>c.tasks).find(t=>t.id===id).done,canonical.id),false);
  await page.evaluate(id=>studyTrackerBridge.setPlannedTaskDone("kc",id,true),canonical.id);
  await page.evaluate(()=>studyTrackerBridge.openStudyCalendar("2026-12-09"));
  assert.equal(await page.locator('[data-calendar-item-id^="plan-event:"]').count(),1);
  await page.locator('[data-action="edit-plan-source"]').first().click();
  const tasksBefore=await page.evaluate(()=>studyTrackerBridge.getState().semesters.flatMap(s=>s.courses).flatMap(c=>c.categories).flatMap(c=>c.tasks).filter(t=>t.planImportKey).map(t=>t.id));
  await page.locator("#degreeDialog [data-close]").click();
  await page.evaluate(hash=>{location.hash=hash;},hash);
  await page.locator('#degreeDialog[open] select[name="course"]').selectOption("kc");
  await confirmSave();
  await page.locator(".plan-import > summary").click();
  await page.locator('[data-plan-action="preview"]').click();
  assert.ok((await page.locator(".plan-preview").innerText()).includes("新增 0"));
  await confirmSave();
  await page.locator('[data-plan-action="schedule"]').waitFor();
  const tasksAfter=await page.evaluate(()=>studyTrackerBridge.getState().semesters.flatMap(s=>s.courses).flatMap(c=>c.categories).flatMap(c=>c.tasks).filter(t=>t.planImportKey).map(t=>t.id));
  assert.deepEqual(tasksAfter,tasksBefore);
  await page.locator('[data-plan-action="progress"]').click();
  assert.ok(await page.locator('[data-task-id="'+canonical.id+'"] input[type="checkbox"]').isChecked());
  console.log("PASS browser: task timer, calendar source link, repeat import and progress completion");
  await page.reload({waitUntil:"networkidle"});
  const reloaded=await page.evaluate(id=>{const s=studyTrackerBridge.getState();return s.semesters.flatMap(s=>s.courses).flatMap(c=>c.categories).flatMap(c=>c.tasks).find(t=>t.id===id);},canonical.id);
  assert.equal(reloaded.id,canonical.id);assert.equal(reloaded.done,true);
  await page.evaluate(()=>studyDegree.openSchedule("kc","2026-12-07"));
  const source=page.locator('.schedule-day-grid .schedule-event.study');
  await source.locator('[data-drag-entry]').dragTo(page.locator('.schedule-all-day[data-drop-date="2026-12-10"]'));
  assert.equal(await page.locator('.schedule-all-day[data-drop-date="2026-12-10"] .study').count(),1);
  await page.locator('[data-schedule="day"]').click();
  assert.equal(await page.locator(".schedule-day-grid").count(),1);
  await page.locator('[data-schedule="week"]').click();
  assert.equal(await page.locator(".schedule-day-grid").count(),7);
  console.log("PASS browser: drag reschedules the shared task; day/week views");
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await page.screenshot({path:process.env.TEMP+"/studytracker-week-plan-mobile.png",fullPage:true});
  const v2={course:"EI04001",period:{start:"2026-12-14",end:"2026-12-27"},tasks:[{id:"ch3",title:"Chapter 3",group:"Chapter",hours:null,deadline:"2026-12-20"}],
    events:[{id:"ch3-session",title:"Chapter session",type:"study",date:"2026-12-16",startTime:"10:00",endTime:"12:00",taskId:"ch3"}]};
  await page.evaluate(hash=>{location.hash=hash;},"#study-plan-v2="+Buffer.from(JSON.stringify(v2)).toString("base64url"));
  await page.locator(".plan-preview").waitFor();
  assert.equal(await page.locator('[data-review-task] [data-field="hours"]').first().inputValue(),"");
  await confirmSave();
  await page.locator('[data-plan-action="schedule"]').click();
  await page.locator('.schedule-event.study .schedule-event-open').click();
  assert.ok((await page.locator('#degreeDialog').innerText()).includes("Chapter 3"));
  assert.equal(await page.locator('[data-schedule="task-timer"]').count(),1);
  console.log("PASS browser: v2 linked time block opens its content task with unknown estimate");
  await page.locator("#degreeDialog [data-dialog-close]").click();
  await page.evaluate(()=>{
    const s=studyTrackerBridge.getState(),linked=s.degreePlan.modules[0].courses[0].courseId;
    const learning=s.semesters.flatMap(stage=>stage.courses).find(c=>c.id===linked);
    learning.categories.push({id:"long-list",name:"Chapters",tasks:Array.from({length:36},(_,i)=>({id:"long-task-"+i,title:"Kapitel "+(i+1),done:false,detail:"",note:"",attachments:[],privatePlanTask:true}))});
    studyTrackerBridge.replaceState(s);
  });
  async function assertDialogControls(){
    const controls=await page.locator('#degreeDialog').evaluate(dialog=>{
      const bounds=dialog.getBoundingClientRect();
      return [...dialog.querySelectorAll('[data-dialog-close],.degree-dialog-footer button')].map(button=>{
        const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return {visible:r.top>=bounds.top && r.bottom<=bounds.bottom && r.top>=0 && r.bottom<=innerHeight,
          clickable:hit===button || button.contains(hit)};
      });
    });
    assert.ok(controls.every(c=>c.visible&&c.clickable),"Close, Save and Cancel must stay visible and clickable without scrolling");
  }
  for(const viewport of [{width:1440,height:900},{width:390,height:700}]){
    await page.setViewportSize(viewport);
    await page.evaluate(()=>studyDegree.openCourseStudyPlan("kc"));
    await assertDialogControls();
    await page.locator(".plan-tasks [data-task-editor-fields]>summary").first().click();
  await page.locator('.plan-tasks [data-field="title"]').first().fill("Unsaved draft only");
    await page.locator('.degree-dialog-body').evaluate(body=>{body.scrollTop=body.scrollHeight;});
    await assertDialogControls();
    if(viewport.width===390)await page.screenshot({path:process.env.TEMP+"/studytracker-dialog-controls.png"});
    await page.locator('#degreeDialog [data-dialog-close]').click();
    assert.equal(await page.locator('#degreeDialog[open]').count(),0);
    assert.equal(await page.evaluate(()=>studyTrackerBridge.getState().semesters.flatMap(s=>s.courses).flatMap(c=>c.categories).flatMap(c=>c.tasks).some(t=>t.title==="Unsaved draft only")),false);
    await page.evaluate(()=>studyDegree.openCourseStudyPlan("kc"));
    await page.keyboard.press("Escape");
    assert.equal(await page.locator('#degreeDialog[open]').count(),0);
  }
  await page.evaluate(()=>studyDegree.openCourseStudyPlan("kc"));
  await page.locator('[data-plan-action="save-schedule"]').click();
  assert.equal(await page.locator('#degreeDialog[open]').count(),0);
  assert.ok(await page.locator(".study-schedule").isVisible());
  await page.locator('[data-task-bucket="all"]').first().click();
  assert.ok(await page.locator(".schedule-flexible .schedule-event").count()>=36);
  console.log("PASS browser: long editor keeps close/save/cancel visible on desktop and mobile; closing discards drafts; Escape and Save & view timetable work");
  await page.setViewportSize({width:1440,height:900});
  await page.locator('[data-degree="timeline"]').click();
  const savedCourse=page.locator('.degree-course[data-course="kc"]').first();
  assert.ok((await savedCourse.locator("[data-saved-plan-summary]").innerText()).includes("已保存"));
  await savedCourse.locator('[data-degree="view-study-plan"]').click();
  await page.waitForFunction(()=>{const r=document.querySelector(".schedule-controls")?.getBoundingClientRect();return r&&r.top>=0&&r.top<innerHeight;});
  assert.ok(await page.locator(".schedule-day-grid .schedule-event,.schedule-all-day .schedule-event").count()>0);
  console.log("PASS browser: course card shows saved content and opens a populated week with controls scrolled into view");
  assert.deepEqual(errors,[]);
  console.log("PASS browser: reload persists all associations; mobile layout fits; no page errors");
}finally{await browser.close();}
