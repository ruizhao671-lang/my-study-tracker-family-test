import assert from "node:assert/strict";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1000},timezoneId:"Europe/Berlin"});
page.setDefaultTimeout(10000);const errors=[];page.on("pageerror",e=>errors.push(e.message));
const fixture={ownerName:"Compaction QA",semesters:[{id:"s",name:"Winter",courses:[{id:"learning",name:"Ingenieurpraxis · Teil 2",categories:[{id:"work",name:"工作时长",tasks:Array.from({length:10},(_,i)=>({id:"t"+(72+i),title:"工作日（半天 4h）"+(72+i),done:false,note:"Keep "+i,attachments:[]}))}]}]}],degreePlan:{name:"Test",requiredCredits:180,blocks:[],modules:[{id:"m",name:"IP",kind:"elective",courses:[{id:"ip",name:"Ingenieurpraxis · Teil 2",credits:6,courseId:"learning",tasks:[],exams:[],planEvents:[],planRange:{start:"2026-11-30",end:"2026-12-27"}}]}]},timer:{sessions:[],calendarItems:[],scheduleStartMinute:0,scheduleEndMinute:0}};
const get=()=>page.evaluate(()=>studyTrackerBridge.getState());
const course=s=>s.degreePlan.modules[0].courses[0];
const row=id=>page.locator("[data-weekly-row]").filter({has:page.locator('input[data-include]')}).filter({hasText:"工作日（半天 4h）"+id});
const check=id=>row(id).locator("[data-include]");
const date=id=>row(id).locator('[data-slot="date"]').inputValue();
const save=()=>page.locator('#degreeDialog [type="submit"]').click();
async function open(){await page.locator('[data-schedule="weekly-category"]').click();}
async function configure(weekday,start,end){await page.locator('#degreeDialog [name="weekday"]').selectOption(String(weekday));await page.locator('#degreeDialog [name="startTime"]').fill(start);await page.locator('#degreeDialog [name="endTime"]').fill(end);await page.locator("[data-weekly-preview]").click();}
async function select(ids){await page.locator('[data-weekly-select="none"]').click();for(const id of ids)await check(id).check();}
try{
 await page.clock.setFixedTime(new Date("2026-11-28T10:00:00+01:00"));
 await page.addInitScript(s=>{if(!localStorage.getItem("study-tracker-online-guest-v1"))localStorage.setItem("study-tracker-online-guest-v1",JSON.stringify(s));localStorage.setItem("study-tracker-language-v1","zh-CN");},fixture);
 await page.goto(process.env.STUDY_TRACKER_TEST_URL||"http://127.0.0.1:8096",{waitUntil:"networkidle"});await page.waitForFunction(()=>window.studyDegree);
 await page.evaluate(()=>studyDegree.openSchedule("ip","2026-11-30"));await open();assert.equal(await page.locator('#degreeDialog [name="enabled"]').isChecked(),false);
 await configure(1,"09:00","13:00");assert.equal(await page.locator("[data-weekly-row]").count(),10);
 await page.locator('[data-weekly-select="all"]').click();assert.equal(await page.locator('#degreeDialog [type="submit"]').isDisabled(),true,"Too many selected tasks cannot be silently dropped");
 await select([72,73,77]);assert.deepEqual([await date(72),await date(73),await date(77)],["2026-11-30","2026-12-07","2026-12-14"]);
 await check(73).uncheck();assert.equal(await date(77),"2026-12-07");assert.equal(await row(73).locator('[data-slot="date"]').count(),0);
 await row(77).locator('[data-slot="date"]').fill("2026-12-10");await check(72).uncheck();assert.equal(await date(77),"2026-12-10","Manual changes survive reflow");
 await row(77).locator("[data-weekly-auto]").click();assert.equal(await date(77),"2026-11-30");
 await check(72).check();assert.equal(await date(77),"2026-12-07");assert.equal(course(await get()).planEvents.length,0,"Preview is not saved");
 await save();let s=await get();const original=structuredClone(course(s).planEvents);assert.equal(original.length,2);
 const remaining=[
 {day:1,start:"14:00",end:"18:00",ids:[73,78]},
 {day:2,start:"09:00",end:"13:00",ids:[74,79]},
 {day:2,start:"14:00",end:"18:00",ids:[75,80]},
 {day:3,start:"09:00",end:"13:00",ids:[76,81]}
 ];
 for(const [index,batch]of remaining.entries()){
   await open();assert.equal(await page.locator('#degreeDialog [name="ruleId"]').inputValue(),"","Reopening starts a separate batch");
   assert.equal(await page.locator('#degreeDialog [name="startTaskId"]').inputValue(),"t"+batch.ids[0]);
   if(index===1){const saved=course(await get()).weeklyRules[0];await page.locator('#degreeDialog [name="ruleId"]').selectOption(saved.id);}
   await configure(batch.day,batch.start,batch.end);await select(batch.ids);await save();
   s=await get();assert.deepEqual(course(s).planEvents.slice(0,2),original);
 }
 s=await get();assert.equal(course(s).planEvents.length,10);assert.equal(course(s).weeklyRules.length,5);
 for(const week of ["2026-11-30","2026-12-07"]){const end=new Date(Date.parse(week)+6*86400000).toISOString().slice(0,10),events=course(s).planEvents.filter(e=>e.date>=week&&e.date<=end);assert.equal(events.length,5);assert.equal(events.reduce((n,e)=>n+e.hours,0),20);}
 assert.equal(s.semesters[0].courses[0].categories[0].tasks.length,10);assert.equal(s.timer.sessions.length,0);assert.ok(s.semesters[0].courses[0].categories[0].tasks.every(t=>!t.done));
 assert.equal(await page.locator("[data-task-source]").count(),0,"Saved tasks leave the pending area");
 await page.reload({waitUntil:"networkidle"});await page.waitForFunction(()=>window.studyDegree);s=await get();assert.equal(course(s).planEvents.length,10);assert.equal(course(s).weeklyRules.length,5);
 await page.evaluate(s=>studyTrackerBridge.replaceState(s),fixture);await page.evaluate(()=>studyDegree.openSchedule("ip","2026-11-30"));await page.setViewportSize({width:400,height:850});await open();await configure(1,"09:00","13:00");await select([72,77]);await check(72).uncheck();assert.equal(await date(77),"2026-11-30");
 assert.ok(await page.locator("#degreeDialog").evaluate(e=>e.scrollWidth<=e.clientWidth+2));assert.deepEqual(errors,[]);
 console.log("PASS weekly reflow UI: live checkbox compaction, manual edit preservation/restore, explicit overflow, five separate batches, reuse without overwrite, 20h weeks, stable tasks/progress/records, reload and mobile");
}finally{await browser.close();}
