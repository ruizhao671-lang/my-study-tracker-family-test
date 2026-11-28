import assert from "node:assert/strict";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
const page=await browser.newPage({viewport:{width:1400,height:1000},timezoneId:"Europe/Berlin"});
page.setDefaultTimeout(10000);const errors=[];page.on("pageerror",e=>errors.push(e.message));
const fixture={ownerName:"Weekly picker QA",semesters:[{id:"s",name:"Winter",courses:[
{id:"learning",name:"Komputer & Creativität",categories:[{id:"vl",name:"Vorlesung",tasks:[{id:"vl8",title:"Week 8",done:false}]},
{id:"empty",name:"Empty",tasks:[]},{id:"ha",name:"Hausaufgabe",tasks:[7,8].map(n=>({id:"h"+n,title:"Week "+n,estimatedHours:2,done:false}))}]},
{id:"fixed-learning",name:"Fixed only",categories:[{id:"fixed-cat",name:"Vorlesung",tasks:[{id:"fixed-task",title:"Week 8",schedulingMode:"fixed",fixedTimePending:true,done:false}]}]}
]}],degreePlan:{name:"Test",requiredCredits:180,blocks:[],modules:[{id:"m",name:"Electives",kind:"elective",courses:[
{id:"kc",name:"Komputer & Creativität",code:"EI04001",credits:6,courseId:"learning",tasks:[],exams:[],planRange:{start:"2027-01-04",end:"2027-01-27"},planEvents:[{id:"class",title:"Published class",taskId:"vl8",type:"class",date:"2027-01-13",startTime:"13:15",endTime:"16:15"}]},
{id:"fixed",name:"Fixed only",courseId:"fixed-learning",credits:5,tasks:[],exams:[],planEvents:[]}
]}]},timer:{sessions:[],calendarItems:[],scheduleStartMinute:0,scheduleEndMinute:0}};
const get=()=>page.evaluate(()=>studyTrackerBridge.getState());
const open=()=>page.locator('[data-schedule="weekly-category"]').click();
const save=()=>page.locator('#degreeDialog [type="submit"]').click();
try{
 await page.clock.setFixedTime(new Date("2026-11-28T10:00:00+01:00"));
 await page.addInitScript(s=>{if(!localStorage.getItem("study-tracker-online-guest-v1"))localStorage.setItem("study-tracker-online-guest-v1",JSON.stringify(s));localStorage.setItem("study-tracker-language-v1","zh-CN");},fixture);
 await page.goto(process.env.STUDY_TRACKER_TEST_URL||"http://127.0.0.1:8096",{waitUntil:"networkidle"});await page.waitForFunction(()=>window.studyDegree);
 await page.evaluate(()=>studyDegree.openSchedule("kc","2027-01-04"));await open();
 assert.equal(await page.locator('#degreeDialog [name="categoryId"]').inputValue(),"ha","Global button defaults to a category with flexible tasks");
 assert.equal(await page.locator('#degreeDialog [name="categoryId"] option').count(),1,"Fixed and empty categories are excluded");
 assert.equal(await page.locator('#degreeDialog [name="startTaskId"] option').count(),2);
 assert.equal(await page.locator('#degreeDialog [name="startTaskId"]').inputValue(),"h7");
 assert.equal(await page.locator('#degreeDialog [name="startTaskId"]').isEnabled(),true);
 assert.equal(await page.locator('#degreeDialog [name="courseId"] option').count(),1,"Fixed-only courses are excluded from the batch picker");
 await page.locator('#degreeDialog [name="untilWeek"]').fill("2027-01-20");
 await page.locator("[data-weekly-preview]").click();
 assert.deepEqual(await page.locator('[data-slot="date"]').evaluateAll(nodes=>nodes.map(n=>n.value)),["2027-01-06","2027-01-13"]);
 await save();let s=await get();assert.equal(s.degreePlan.modules[0].courses[0].planEvents[0].date,"2027-01-13","Published fixed class is unchanged");
 assert.equal(s.degreePlan.modules[0].courses[0].planEvents.filter(e=>e.batchRuleId).length,2);
 await open();assert.equal(await page.locator('#degreeDialog [name="untilWeek"]').inputValue(),"2027-01-18","Reloading a saved rule preserves its end week");
 await page.keyboard.press("Escape");
 await page.locator("[data-schedule-filter]").selectOption("fixed");await open();
 assert.equal(await page.locator('#degreeDialog [name="startTaskId"]').count(),0,"Fixed-only course gets a clear explanation instead of an empty picker");
 assert.ok((await page.locator("#degreeDialog").innerText()).includes("固定课程"));
 await save();assert.equal(await page.locator("[data-schedule-filter]").inputValue(),"fixed","The calendar shortcut stays on the requested course");
 await page.locator("[data-schedule-filter]").selectOption("kc");await open();
 // Simulate a task list changing while the dialog is open.
 await page.evaluate(()=>{studyTrackerBridge.getDegreeWorkspace().semesters[0].courses[0].categories.find(c=>c.id==="ha").tasks=[];});
 await page.locator('#degreeDialog [name="categoryId"]').dispatchEvent("change");
 assert.equal(await page.locator('#degreeDialog [name="startTaskId"]').isDisabled(),true);
 assert.ok((await page.locator("[data-weekly-empty]").innerText()).includes("删除"));
 assert.equal(await page.locator("[data-weekly-preview]").isDisabled(),true);
 await page.keyboard.press("Escape");await page.evaluate(s=>studyTrackerBridge.replaceState(s),fixture);
 await page.evaluate(()=>studyDegree.openSchedule("kc","2027-01-04"));await page.setViewportSize({width:400,height:850});await open();
 assert.ok(await page.locator("#degreeDialog").evaluate(e=>e.scrollWidth<=e.clientWidth+2));
 assert.equal(await page.locator('#degreeDialog [name="startTaskId"]').inputValue(),"h7");
 assert.deepEqual(errors,[]);
 console.log("PASS weekly picker: fixed-first course defaults to usable homework, fixed/empty categories omitted, automatic dates, fixed class untouched, saved range retained, no silent course switch, clear stale empty state and mobile");
}finally{await browser.close();}
