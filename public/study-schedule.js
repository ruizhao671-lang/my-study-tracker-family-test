import {openWeeklyPlanner} from "./study-batch-editor.js";
import { studyEntryStatus, studyExamEntries, studyPlanFocusDate, studyScheduleEntries, courseStudyTasks, taskActualHours, addPlanDays, planWeek, studySessionHours,studyTaskItems,studyTaskWindow,studyCalendarEntries,monthTaskWeeks,studyWeekLabel,eventSchedulingMode,taskSchedulingMode,studySchedulePeriod,shiftStudyScheduleDate,studyMonthEntries,studyCalendarWeek } from "./study-plan-core.js";
const SCHEDULE_VERSION="2026.11.28.1";
const en=()=>window.studyI18n?.getLanguage?.()==="en";
const w=(zh,english)=>en()?english:zh;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
const number=n=>new Intl.NumberFormat(en()?"en-GB":"zh-CN",{maximumFractionDigits:2}).format(n);
const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
const clock=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
const typeLabel=e=>e.kind==="exam"?w("考试","Exam"):e.kind==="task"?w("学习任务","Study task"):({class:w("上课","Class"),workshop:"Workshop",reminder:w("事项","Calendar item"),deadline:w("截止","Deadline"),milestone:w("重要日期","Milestone"),study:w("学习时段","Study session")})[e.type];
const btn=(label,action)=>`<button class="btn secondary" type="button" data-schedule="${action}">${esc(label)}</button>`;
const movable=e=>!["exam","calendar"].includes(e.kind)&&!["milestone","deadline","reminder"].includes(e.type)&&e.schedulingMode!=="fixed";
const canExecute=e=>e.kind==="task"?Boolean(e.date):["study","class","workshop"].includes(e.type);

const taskPath=e=>[e.group||e.taskGroup,e.kind==="task"||e.sourceTask?e.title:e.taskTitle].filter(Boolean).join(" · ");
export const calendarStatusClass=e=>"study-status-"+studyEntryStatus(e);
export function calendarStatusBadge(e,compact=false){
  const status=studyEntryStatus(e),content=e.contentTask||(e.kind==="task"&&!e.date)||e.sourceTask;
  const label=status==="complete"?(content?w("内容已完成","Task completed"):w("已执行","Executed")):
    status==="overdue"?(content?w("已过期未完成","Overdue task"):compact?w("已过期","Overdue"):w("已过期未执行","Missed time plan")):
    status==="exam"?w("考试","Exam"):status==="record"?w("实际计时","Actual time"):status==="date"?w("重要日期","Key date"):
    (content?w("内容待完成","Task pending"):!e.date&&!e.weekOf?w("待安排","Unscheduled"):w("待执行","Planned"));
  return `<span class="study-status-badge" data-status-badge>${esc(label)}</span>`;
}
export function renderCalendarLegend(){
  const items=[["complete",w("已完成 / 已执行","Completed / executed")],["overdue",w("已过期未完成","Overdue / missed")],["pending",w("待完成 / 待执行","Pending / planned")],["exam",w("考试","Exam")],["record",w("实际计时（虚线）","Actual time (dashed)")],["date",w("重要日期","Key date")]];
  return `<div class="study-calendar-legend" aria-label="${w("日历颜色说明","Calendar color legend")}">${items.map(([status,label])=>`<span class="study-legend-item study-status-${status}"><i aria-hidden="true"></i>${esc(label)}</span>`).join("")}</div>`;
}

export function renderMonthTaskWeeks(state,month){
  const weeks=monthTaskWeeks(state,month);
  if(!weeks.length)return "";
  return `<div class="timer-task-weeks"><strong>${w("按完成周看任务","Tasks by completion week")}</strong><div>${weeks.map(week=>`<button class="btn secondary" type="button" data-open-study-week="${week.date<month+"-01"?month+"-01":week.date}">${esc(week.date.slice(5).replace("-","/"))} ${w("周","week")} · ${week.count} ${w("项任务","tasks")}</button>`).join("")}</div></div>`;
}

export function calendarOverviewItems(state,date) {
  const exams=studyExamEntries(state,date,date).filter(exam=>!exam.sourceCalendarId).map(exam=>({...exam,
    virtualPlanExam:true,degreeCourseId:exam.course.id,degreeExamId:exam.examId,courseName:exam.course.name,requirements:exam.detail||""}));
  return [...(state.timer?.calendarItems||[]).filter(item=>item.date===date),...planCalendarItems(state,date),...exams];
}

let courseColorIds=[];
export function calendarCourseStyle(course){
  let value=0;for(const char of course?.id||course?.name||"")value=(value*31+char.charCodeAt(0))>>>0;
  const colors=["#386da6","#a35b34","#7854a6","#278778","#b14d7c","#7b7e30","#47748c","#8e6444","#b85e34","#426c43","#aa4488","#4e65ad","#327e92","#8b6535","#725e88","#668337","#a34e4e","#3e7e65","#865d9f","#7f7350"];
  const index=courseColorIds.indexOf(course?.id),color=index<0?colors[value%colors.length]:colors[index]||"hsl("+Math.round(index*137.508%360)+" 45% 38%)";
  return "--study-course-color:"+color+";";
}

function windowText(e){
  const range=e.window||studyTaskWindow(e),parts=[];
  if(range.teachingWeek)parts.push(w("课程第 "+range.teachingWeek+" 周","Course week "+range.teachingWeek));
  if(range.calendar?.teachingWeek)parts.push(w("校历第 "+range.calendar.teachingWeek+" 周","Calendar week "+range.calendar.teachingWeek));
  if(range.calendar)parts.push("KW "+range.calendar.isoWeek+" · "+range.calendar.isoYear);
  if(range.start||range.end)parts.push([range.start||"…",range.end||"…"].join(" — "));
  return parts.join(" · ")||w("完成范围待定","Completion window TBD");
}

function taskWeekKey(e){return e.weekOf||e.window.start?"date:"+planWeek(e.weekOf||e.window.start):e.window.teachingWeek?"week:"+e.window.teachingWeek:"";}

function fixedPendingList(items){
 const pending=items.filter(t=>t.schedulingMode==="fixed"&&!t.allocations.length&&!t.done);
 if(!pending.length)return "";
 return `<details class="fixed-pending-list" open><summary>${w("固定任务待排期","Fixed tasks awaiting a time")} · ${pending.length}</summary>${pending.map(t=>`<article data-fixed-task="${esc(t.taskId)}"><strong>${esc(t.course.name)} · ${esc(taskPath(t))}</strong><small>${w("固定时间，不能拖动；可设置时间或删除任务。","Fixed time; set a session or delete the task.")}</small><div class="degree-actions"><button class="btn secondary" type="button" data-fixed-schedule>${w("设置固定时间","Set fixed time")}</button><button class="btn secondary" type="button" data-fixed-edit>${w("编辑任务","Edit task")}</button><button class="btn secondary task-delete" type="button" data-fixed-delete>${w("删除任务","Delete task")}</button></div></article>`).join("")}</details>`;
}
const shelfBucket=e=>e.done?"complete":e.allocations.length?"scheduled":e.bucket;
function renderTaskShelf(items){
  const fixedPending=fixedPendingList(items);
  items=items.filter(task=>task.schedulingMode!=="fixed");
  const counts={all:items.length,scheduled:items.filter(e=>shelfBucket(e)==="scheduled").length};
  for(const key of ["current","overdue","future","unscoped","complete"])counts[key]=items.filter(e=>shelfBucket(e)===key).length;
  const buckets=[["current",mode==="month"?w("本月","This month"):w("本周待安排","This week · unscheduled")],["overdue",w("以前未完成","Backlog")],["future",w("未来","Future")],["scheduled",w("已安排","Scheduled")],["complete",w("已完成","Completed")],["unscoped",w("范围待定","No window")],["all",w("全部","All")]];
  const tasks=items.filter(e=>(taskBucket==="all"||shelfBucket(e)===taskBucket)&&
    (!taskWeekFilter||taskWeekKey(e)===taskWeekFilter)&&(taskStatusFilter==="all"||(taskStatusFilter==="done"?e.done:!e.done)));
  const groups=new Map();for(const task of tasks){if(!groups.has(task.course.id))groups.set(task.course.id,{course:task.course,categories:new Map()});const categories=groups.get(task.course.id).categories,name=task.group||w("未分组","Uncategorized");if(!categories.has(name))categories.set(name,[]);categories.get(name).push(task);}
  const weeks=new Map();for(const e of items){const key=taskWeekKey(e);if(key&&!weeks.has(key))weeks.set(key,windowText(e));}
  return `<section class="schedule-flexible" data-unschedule="true"><div class="plan-section-title"><h3>${w("可拖动的学习任务","Draggable study tasks")}</h3><div class="degree-actions">${btn(w("分类每周安排","Schedule category weekly"),"weekly-category")}${btn(w("+ 添加时段","＋ Add session"),"new-session")}</div></div>
    <nav class="task-bucket-tabs" aria-label="${w("任务范围","Task scope")}">${buckets.map(([key,label])=>`<button type="button" data-task-bucket="${key}" aria-pressed="${taskBucket===key}">${label} <b>${counts[key]}</b></button>`).join("")}</nav>
    <div class="task-brick-filters"><label>${w("周次 / 日期","Week / dates")}<select class="input" data-task-week><option value="">${w("全部周次","All weeks")}</option>${[...weeks].sort(([a],[b])=>a.localeCompare(b,"en",{numeric:true})).map(([key,label])=>`<option value="${esc(key)}" ${taskWeekFilter===key?"selected":""}>${esc(label)}</option>`).join("")}</select></label>
    <label>${w("完成状态","Completion")}<select class="input" data-task-status>${[["all",w("全部","All")],["pending",w("未完成","Incomplete")],["done",w("已完成","Completed")]].map(([key,label])=>`<option value="${key}" ${taskStatusFilter===key?"selected":""}>${label}</option>`).join("")}</select></label></div>
    <label class="task-drop-duration">${w("每次拖入安排","Duration when dropping")}<input class="input" data-drop-hours type="number" min=".25" max="12" step=".25" value="${dropHours}">h</label>
    <p class="degree-help">${w("这里只显示自由任务，点击「自由安排 ▾」可修改方式。固定日程带 🔒，点击日历中的时间块修改；不参与拖动。","Only flexible tasks appear here. Click Flexible ▾ to change scheduling. Fixed sessions show 🔒; click their calendar block to edit. Fixed sessions cannot be dragged.")}</p>
    ${fixedPending}
    ${taskBucket==="current"&&counts.unscoped?`<button type="button" class="task-unscoped-note" data-task-bucket="unscoped">${w("另有 ","Also ")+counts.unscoped+w(" 项任务未指定完成范围，查看"," tasks without a completion window; view")}</button>`:""}
    <div class="schedule-flexible-grid" data-unschedule="true">${[...groups.values()].map(group=>`<section class="task-shelf-course"><h4 style="${calendarCourseStyle(group.course)}">${esc(group.course.name)}</h4>${[...group.categories].map(([name,children])=>`<section class="task-shelf-category" data-task-category="${esc(name)}"><header ${children[0].categoryId?`draggable="true" data-weekly-drag data-weekly-course="${esc(group.course.id)}" data-weekly-category="${esc(children[0].categoryId)}"`:""}><h5>${esc(name)}</h5><small>${children.length} ${w("项任务","tasks")}</small>${children[0].categoryId?`<button class="btn secondary weekly-category-button" type="button" data-weekly-open data-weekly-course="${esc(group.course.id)}" data-weekly-category="${esc(children[0].categoryId)}">${w("⠿ 每周安排","⠿ Schedule weekly")}</button>`:""}</header><div class="task-group-grid">${children.map(e=>`<article class="schedule-event plan-task task-brick ${e.done?"done":""} ${e.taskId===focusTaskId?"is-focused":""} ${calendarStatusClass(e)}" data-task-source="${esc(e.taskId)}" data-entry="${esc(e.id)}" data-study-status="${studyEntryStatus(e)}" draggable="true" style="${calendarCourseStyle(e.course)}">
      <div class="task-brick-head"><span class="schedule-course-chip">${e.canonical?w("↔ 学习进度共用","↔ Shared progress task"):w("独立任务","Independent task")}</span><button type="button" class="task-mode-button" data-task-mode title="${w("修改固定时间或自由安排","Change fixed or flexible scheduling")}">${w("自由安排","Flexible")} ▾</button><label class="task-brick-done"><input type="checkbox" data-task-done ${e.done?"checked":""}>${w("完成","Done")}</label></div>
      <strong>${esc(taskPath(e))}</strong><button class="task-window-label" type="button" data-task-window title="${w("修改完成范围，不会安排具体时段","Edit completion window without reserving time")}">${esc(windowText(e))} ✎</button>
      <div class="task-hour-stats"><span>${w("预计","Estimate")}<b>${e.hours==null?w("未估算","Unknown"):number(e.hours)+" h"}</b></span><span>${w("已安排","Scheduled")}<b>${number(e.plannedHours)} h</b></span><span>${w("实际","Actual")}<b>${number(e.actualHours)} h</b></span></div>
      ${calendarStatusBadge(e)}<small>${e.remainingHours==null?w("可分次安排，预计工时仍未估算","Multiple sessions allowed; estimate remains unknown"):e.plannedHours>e.hours?w("安排时长超过预计，可按需要调整","Scheduled time exceeds estimate; adjust as needed"):w("尚未分配：","Unallocated: ")+number(e.remainingHours)+" h"}</small>
      ${e.allocations.length?`<details class="task-allocation-list"><summary>${w("已安排时段","Scheduled sessions")} · ${e.allocations.length}</summary>${e.allocations.map(slot=>`<button type="button" data-open-allocation="${esc(slot.id)}" data-allocation-date="${slot.date}">${esc(slot.date)} ${esc(slot.startTime||slot.period||w("时刻待定","Time TBD"))} · ${number(studySessionHours(slot))} h</button>`).join("")}</details>`:""}
      <div class="task-brick-actions"><button class="btn secondary" type="button" data-edit-task>${w("编辑任务","Edit task")}</button><button class="btn secondary task-delete" type="button" data-delete-task>${w("删除任务","Delete task")}</button><button class="btn secondary" type="button" data-plan-task-time>${w("+ 安排学习时段","＋ Schedule session")}</button><button class="btn secondary" type="button" data-brick-timer>${e.canonical?w("开始计时","Start timer"):w("关联进度后计时","Link progress to time")}</button></div><span class="task-drag-hint" aria-hidden="true">⠿ ${w("拖动这块到日历","Drag this block onto the calendar")}</span>
    </article>`).join("")}</div></section>`).join("")}</section>`).join("")||`<div class="plan-empty">${w("这个筛选下没有任务。可切换范围，或清除周次、状态筛选。","No matching tasks. Change scope or clear week/completion filters.")}</div>`}</div></section>`;
}

let selectedDate=today(),filter="",mode="week",dragging="",taskBucket="current",taskWeekFilter="",taskStatusFilter="all",dropHours=2,autoTaskScope=true,focusTaskId="";
export function selectStudySchedule(courseId="",date="",{view="week",taskId=""}={}){filter=courseId;selectedDate=date||today();mode=["month","week","day"].includes(view)?view:"week";focusTaskId=taskId;taskBucket=taskId?"all":"current";autoTaskScope=!taskId;taskWeekFilter="";taskStatusFilter="all";}
export function planCalendarItems(state,date){
  courseColorIds=state.degreePlan?.modules.flatMap(m=>m.courses.map(c=>c.id))||[];
  return studyScheduleEntries(state,date,date).filter(e=>e.date===date).map(e=>{
    const task=e.taskId?courseStudyTasks(e.course,state.semesters).find(t=>t.id===e.taskId):null;
    return {...e,done:task?.done??e.done,canonical:task?.canonical??e.canonical,executionAvailable:canExecute(e),statusEndTime:e.endTime||"",planType:e.type,type:"study",title:[e.course.name,taskPath(e),e.kind==="task"||e.sourceTask?"":e.title].filter(Boolean).join(" · "),degreeCourseId:e.course.id,
      endTime:e.endTime||(e.startTime&&studySessionHours(e)>0&&minutes(e.startTime)+studySessionHours(e)*60<1440?clock(Math.round(minutes(e.startTime)+studySessionHours(e)*60)):""),details:e.detail||"",privatePlanTask:true};
  });
}

function renderScheduleMonth(state,first,last,entries,sessions){
  const gridStart=planWeek(first),gridEnd=addPlanDays(planWeek(last),6),count=1+Math.round((Date.parse(gridEnd)-Date.parse(gridStart))/86400000);
  const weeks=new Map(monthTaskWeeks(state,first.slice(0,7),filter).map(week=>[week.date,week.count]));
  const localDate=time=>{const date=new Date(time);return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");};
  const days=new Map();
  for(const entry of entries){if(!entry.date)continue;if(!days.has(entry.date))days.set(entry.date,[]);days.get(entry.date).push(entry);}
  for(const items of days.values())items.sort((a,b)=>(a.startTime||"").localeCompare(b.startTime||"")||a.title.localeCompare(b.title));
  const actual=new Map();for(const session of sessions){const date=localDate(session.startAt);actual.set(date,(actual.get(date)||0)+(Number(session.durationMs)||0)/3600000);}
  let cells=`<div class="schedule-month-weekday month-kw-head">KW</div>`+Array.from({length:7},(_,i)=>`<div class="schedule-month-weekday">${esc(new Intl.DateTimeFormat(en()?"en-GB":"zh-CN",{weekday:"short"}).format(new Date(addPlanDays("2026-11-23",i)+"T12:00:00")))}</div>`).join("");
  for(let i=0;i<count;i++){
    const date=addPlanDays(gridStart,i),outside=date<first||date>last;
    if(i%7===0){const week=studyCalendarWeek(date,state.degreePlan);cells+=`<button class="schedule-month-week" type="button" data-month-week="${date}" title="${esc(studyWeekLabel(date,state.degreePlan,en()))}">${week.isoWeek}${week.isoYear!==Number(first.slice(0,4))?`<small>${week.isoYear}</small>`:""}${weeks.get(date)?`<small>${weeks.get(date)} ${w("任务","tasks")}</small>`:""}</button>`;}
    const events=outside?[]:days.get(date)||[];
    cells+=`<div class="schedule-month-day ${outside?"is-outside":""} ${date===today()?"is-today":""}" data-month-date="${date}" ${outside?"":'data-drop-date="'+date+'"'}>
      <button type="button" class="schedule-month-date" data-day="${date}" aria-label="${date} · ${w("查看日视图","Open day view")}">${Number(date.slice(8))}</button>
      <div class="schedule-month-events">${events.slice(0,3).map(e=>{const title=[e.schedulingMode==="fixed"?"🔒":"",e.startTime||typeLabel(e),e.course.name,taskPath(e)||e.title].filter(Boolean).join(" · ");return `<button type="button" class="schedule-month-entry ${calendarStatusClass(e)}" style="${calendarCourseStyle(e.course)}" data-entry="${esc(e.id)}" data-scheduling-mode="${esc(e.schedulingMode||"")}" draggable="${movable(e)}" title="${esc(title)}" aria-label="${esc(title)}">${e.schedulingMode==="fixed"?"🔒 ":""}${e.startTime?`<b>${esc(e.startTime)}</b> `:""}${esc([e.course.name,taskPath(e)||e.title].filter(Boolean).join(" · "))}</button>`;}).join("")}
      ${events.length>3?`<button type="button" class="schedule-month-more" data-day="${date}">+${events.length-3} ${w("项，查看当天","more; open day")}</button>`:""}</div>
      ${actual.get(date)?`<button class="schedule-month-actual study-status-record" type="button" data-actual-date="${date}">${w("实际","Actual")} ${number(actual.get(date))} h</button>`:""}</div>`;
  }
  return `<div class="schedule-month" aria-label="${w("学习时间表月视图","Monthly study timetable")}">${cells}</div><p class="schedule-month-help">${w("点击日期看具体时段；左侧 KW 旁是该周待完成任务数。没有日期的任务仍留在待安排区。","Click a date for time slots. The KW column shows incomplete tasks for each week. Undated tasks stay in the task shelf.")}</p>`;
}

export function renderStudySchedule(state){
  const courses=state.degreePlan.modules.flatMap(m=>m.courses);courseColorIds=courses.map(c=>c.id);
  if(filter&&!courses.some(c=>c.id===filter))filter="";
  const {first,last,dates}=studySchedulePeriod(selectedDate,mode);
  const entries=(mode==="month"?studyMonthEntries(state,first,last):studyCalendarEntries(state,first,last)).filter(e=>!filter||e.course.id===filter),allTasks=studyTaskItems(state,first,last).filter(e=>!filter||e.course.id===filter),plans=entries.filter(canExecute),weekPlans=plans.filter(e=>e.date||e.weekOf);
  if(autoTaskScope){taskBucket=["current","unscoped","overdue","future","scheduled","complete"].find(bucket=>allTasks.some(t=>t.schedulingMode!=="fixed"&&shelfBucket(t)===bucket))||"current";autoTaskScope=false;}
  const localDate=time=>{const d=new Date(time);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
  const sessions=(state.timer?.sessions||[]).filter(s=>localDate(s.startAt)>=first&&localDate(s.startAt)<=last&&(!filter||courses.some(c=>c.courseId===s.courseId&&c.id===filter)));
  const timed=entries.filter(e=>e.date&&e.startTime);
  const begin=Math.min(8,...timed.map(e=>Math.floor(minutes(e.startTime)/60)),...sessions.map(s=>new Date(s.startAt).getHours()));
  const end=Math.min(24,Math.max(20,...timed.map(e=>Math.ceil((e.endTime?minutes(e.endTime):minutes(e.startTime)+Math.max(.5,studySessionHours(e)||.5)*60)/60)),...sessions.map(s=>new Date(s.endAt).getHours()+1))),height=(end-begin)*56;
  const execution=(e,compact=false)=>canExecute(e)?`<label class="schedule-execution"><input type="checkbox" data-schedule-execute ${e.executed?"checked":""}>${compact?w("已执行","Executed"):w("已按计划执行","Executed as planned")}</label>`:"";
  function card(e,style=""){
    return `<article class="schedule-event ${esc(e.kind==="task"?"plan-task":e.type)} ${e.done?"done":""} ${e.executed?"executed":""} ${calendarStatusClass(e)}" draggable="${movable(e)}" data-scheduling-mode="${esc(e.schedulingMode||"")}" data-study-status="${studyEntryStatus(e)}" data-entry="${esc(e.id)}" style="${calendarCourseStyle(e.course)}${style}">
      ${movable(e)?`<button type="button" class="schedule-drag-grip" data-drag-entry draggable="true" aria-label="${w("拖动此时段","Drag this session")}">⠿</button>`:""}<button class="schedule-event-open" type="button" title="${esc([e.course.name,taskPath(e),e.kind==="task"||e.sourceTask?"":e.title].filter(Boolean).join(" · "))}"><span class="schedule-type">${e.schedulingMode==="fixed"?"🔒 "+w("固定时间","Fixed time")+" · ":""}${esc(typeLabel(e))}</span><strong>${e.schedulingMode==="fixed"?"🔒 ":""}${esc(e.kind==="task"||e.sourceTask?taskPath(e)||e.title:e.title)}</strong><span>${esc(e.course.name)}</span><b>${esc(e.startTime?e.startTime+(e.endTime?"–"+e.endTime:""):e.period||(e.date?w("全天","All day"):w("待安排","Unscheduled")))}${studySessionHours(e)>0?" · "+number(studySessionHours(e))+" h":""}</b></button>${calendarStatusBadge(e,true)}${execution(e,true)}${movable(e)&&canExecute(e)&&e.date&&e.startTime?`<button type="button" draggable="false" class="schedule-resize" data-resize-entry aria-label="${w("拖动调整时长；也可点击时段编辑","Drag to resize, or click the session to edit")}"></button>`:""}
      ${e.kind==="task"&&!e.date?`<button class="btn secondary" type="button" data-plan-task-time>${w("安排学习时段","Plan a study session")}</button>`:""}</article>`;
  }
  return `<section class="study-schedule ${mode==="month"?"is-month-view":""}"><header class="schedule-controls"><div>${btn("‹","prev")}${btn(w("今天","Today"),"today")}${btn("›","next")}</div><div class="schedule-week-heading"><strong>${mode==="month"?esc(new Intl.DateTimeFormat(en()?"en-GB":"zh-CN",{year:"numeric",month:"long"}).format(new Date(first+"T12:00:00"))):first+" — "+last}</strong><small data-calendar-week>${mode==="month"?w("点击日期查看具体时段","Click a date for time slots"):esc(studyWeekLabel(selectedDate,state.degreePlan,en(),{dates:false}))}</small></div><div class="schedule-view-switch">${[["month",w("月视图","Month")],["week",w("周视图","Week")],["day",w("日视图","Day")]].map(([value,label])=>`<button class="btn secondary" type="button" data-schedule="${value}" aria-pressed="${mode===value}">${label}</button>`).join("")}</div>
    <label>${w("课程","Course")}<select class="input" data-schedule-filter><option value="">${w("全部课程","All courses")}</option>${courses.map(c=>`<option value="${esc(c.id)}" ${filter===c.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select></label>
    <label>${w("跳到日期","Go to date")}<input class="input" type="date" data-schedule-date value="${selectedDate}"></label>${filter?btn(w("按分类查看任务","Tasks by category"),"edit-course"):""}${btn(w("返回学习计时","Back to study timer"),"timer-calendar")}<small class="schedule-version" data-schedule-version title="${w("当前载入的时间表版本","Loaded timetable version")}">v${SCHEDULE_VERSION}</small></header>
    <div class="schedule-summary"><span>${mode==="month"?w("本月计划","Planned this month"):w("本周 / 当日计划","Planned this period")}<b>${number(weekPlans.reduce((n,e)=>n+studySessionHours(e),0))} h</b></span><span>${w("按计划执行","Plan execution")}<b>${weekPlans.filter(e=>e.executed).length} / ${weekPlans.length}</b></span><span>${w("实际学习计时","Actual study time")}<b>${number(sessions.reduce((n,s)=>n+s.durationMs/3600000,0))} h</b></span><span>${mode==="month"?w("本月未完成任务预计","This month’s incomplete task estimates"):w("本周未完成任务预计","This week’s incomplete task estimates")}<b>${number(allTasks.filter(e=>e.bucket==="current").reduce((n,e)=>n+(e.hours??0),0))} h</b></span></div>
    <div class="schedule-workflow"><strong>${w("从现有任务开始安排","Plan from your existing tasks")}</strong><span>${w("任务按课程和分类展示，已关联的任务与学习进度共用。拖一块到日历，或点「安排学习时段」；任务可分次安排。","Tasks are grouped by course and category; linked tasks are shared with progress. Drag one onto the calendar or choose Schedule session; a task can span several sessions.")}</span>${filter?btn(w("查看 / 关联学习进度任务","View / link progress tasks"),"link-tasks"):""}</div>
    <p class="degree-help">${w("彩色块是计划，虚线块是实际计时。执行勾选、内容任务完成和实际计时分别保存。","Colored blocks are plans; dashed blocks are actual time. Execution, task completion and actual time are saved separately.")}</p>
    ${renderCalendarLegend()}<p class="course-color-note">${w("每门课用不同顶边颜色；侧边与状态文字表示是否完成。","Each course has a different top color; side colors and labels show status.")}</p>
    <div class="schedule-workspace"><aside class="schedule-plan-list">${renderTaskShelf(allTasks)}<details class="schedule-session-list" ${mode==="month"?"":"open"}><summary>${mode==="month"?w("本月安排清单","This month’s sessions"):w("已排时段清单","Scheduled sessions")}</summary><div class="plan-section-title"><h3>${w("学习时间安排","Time plans")}</h3></div><p class="degree-help">${w("例如周一晚上预计 2 小时。点安排可修改，按计划做到了就勾选；任务关联可留空。","Reserve an evening, click to edit, and check when executed. Task linking is optional.")}</p>
      ${plans.length?plans.sort((a,b)=>(a.date||a.weekOf||"9999").localeCompare(b.date||b.weekOf||"9999")||(a.startTime||"").localeCompare(b.startTime||"")).map(e=>`<article class="schedule-agenda-item ${e.executed?"executed":""} ${calendarStatusClass(e)}" data-study-status="${studyEntryStatus(e)}" data-entry="${esc(e.id)}" style="${calendarCourseStyle(e.course)}"><button type="button" class="schedule-agenda-open"><span>${esc(e.date||(e.weekOf?e.weekOf+" "+w("所在周 · 日期待定","week · date TBD"):w("日期待安排","Date to arrange")))} ${esc(e.period||"")} ${esc(e.startTime||"")}${e.endTime?"–"+esc(e.endTime):""}</span><strong>${esc(e.title)}</strong><span>${esc(e.course.name)} · ${studySessionHours(e)>0?number(studySessionHours(e))+" h":w("工时未估算","Hours not estimated")}</span></button><small class="schedule-link-status">${e.taskId||e.taskSeriesKey?w("关联：","Linked: ")+esc(taskPath(e)||w("内容任务","Content task")):w("独立时段","Independent time plan")}</small>${calendarStatusBadge(e)}${execution(e)}</article>`).join(""):`<div class="plan-empty">${w("这段时间还没有学习时段。可以添加一晚的安排，或从下方任务开始安排。","No study sessions yet. Add one or schedule a task below.")}</div>`}</details></aside>
    ${mode==="month"?`<div class="schedule-scroll schedule-month-scroll">${renderScheduleMonth(state,first,last,entries,sessions)}</div>`:`<div class="schedule-scroll"><div class="schedule-table" style="--days:${dates.length};min-width:${dates.length===1?300:850}px">
      <div class="schedule-day-head schedule-axis">${w("时间","Time")}</div>${dates.map(d=>`<button class="schedule-day-head ${d===today()?"is-today":""}" data-day="${d}" type="button">${esc(new Intl.DateTimeFormat(en()?"en-GB":"zh-CN",{weekday:"short",month:"numeric",day:"numeric"}).format(new Date(d+"T12:00:00")))}</button>`).join("")}
      <div class="schedule-all-day schedule-axis">${w("全天","All day")}</div>${dates.map(d=>`<div class="schedule-all-day" data-drop-date="${d}">${entries.filter(e=>e.date===d&&!e.startTime).map(e=>card(e)).join("")}</div>`).join("")}
      <div class="schedule-axis schedule-hours" style="height:${height}px">${Array.from({length:end-begin},(_,i)=>`<span style="top:${i*56}px">${clock((begin+i)*60)}</span>`).join("")}</div>
      ${dates.map(d=>{
        const placed=entries.filter(e=>e.date===d&&e.startTime).sort((a,b)=>a.startTime.localeCompare(b.startTime)).map(e=>({e,start:minutes(e.startTime),end:Math.min(1440,e.endTime?minutes(e.endTime):minutes(e.startTime)+Math.max(.5,studySessionHours(e)||.5)*60)}));
        let group=[],groupEnd=0;for(const item of placed){if(item.start>=groupEnd){group=[];groupEnd=0;}item.lane=0;while(group.some(g=>g.end>item.start&&g.lane===item.lane))item.lane++;group.push(item);groupEnd=Math.max(groupEnd,item.end);const lanes=Math.max(...group.map(g=>g.lane))+1;for(const member of group)member.lanes=Math.max(member.lanes||1,lanes);}
        return `<div class="schedule-day-grid" data-drop-date="${d}" data-start-hour="${begin}" style="height:${height}px">${placed.map(({e,start,end,lane,lanes})=>card(e,`top:${(start-begin*60)*56/60}px;height:${Math.max(70,(end-start)*56/60-3)}px;left:${lane*100/lanes}%;width:${100/lanes}%;`)).join("")}
        ${sessions.filter(s=>localDate(s.startAt)===d).map(s=>{const st=new Date(s.startAt),et=new Date(s.endAt),start=st.getHours()*60+st.getMinutes(),end=et.getHours()*60+et.getMinutes();return `<button class="schedule-actual study-status-record" type="button" data-actual-date="${d}" style="top:${Math.max(0,(start-begin*60)*56/60)}px;height:${Math.max(36,(end-start)*56/60-3)}px">${w("实际","Actual")} ${number(s.durationMs/3600000)} h · ${esc([s.categoryName,s.taskName||s.courseName].filter(Boolean).join(" · "))}</button>`;}).join("")}</div>`;
      }).join("")}</div></div>`}</div>
    </section>`;
}

export function bindStudySchedule(panel,{bridge,showDialog,render}){
  const root=panel.querySelector(".study-schedule");if(!root)return;
  const state=bridge.getState(),courses=state.degreePlan.modules.flatMap(m=>m.courses);
  const {first,last}=studySchedulePeriod(selectedDate,mode);
  const items=studyTaskItems(state,first,last);
  const entries=mode==="month"?studyMonthEntries(state,first,last):studyCalendarEntries(state,first,last),find=id=>entries.find(e=>e.id===id)||items.find(e=>e.id===id)||studyScheduleEntries(state,"0001-01-01","9999-12-31").find(e=>e.id===id);
  const patch=(entry,changes)=>bridge.patchStudyScheduleEntry(entry.course.id,entry.id,entry.date||"",changes);
  function deleteTask(task){
    if(!confirm(w("删除任务「"+task.title+"」及它的未来安排？实际计时记录会保留。","Delete "+task.title+" and its future sessions? Actual time records will be kept.")))return;
    bridge.removeCourseStudyTask(task.course.id,task.taskId||task.id);document.querySelector("#degreeDialog").close();
  }
  function editTask(task){
    const current=bridge.getDegreeWorkspace(),course=current.plan.modules.flatMap(m=>m.courses).find(c=>c.id===task.course.id),taskId=task.taskId||task.id;
    const list=courseStudyTasks(course,current.semesters),original=list.find(t=>t.id===taskId);if(!original)return;
    const field=(label,key,value="",type="text",extra="")=>`<label>${esc(label)}<input class="input" name="${key}" type="${type}" value="${esc(value??"")}" ${extra}></label>`;
    const form=showDialog(w("编辑任务 · ","Edit task · ")+original.title,`
      <div class="degree-fields">${field(w("任务名称","Task name"),"title",original.title,"text","required")}${field(w("分类","Category"),"group",original.group)}${field(w("预计小时（未知可留空）","Estimated hours (optional)"),"hours",original.hours??"","number",'min="0" max="1000" step="any"')}</div>
      <label class="plan-check"><input name="done" type="checkbox" ${original.done?"checked":""}>${w("内容任务已完成","Content task completed")}</label>
      <label>${w("任务说明","Task description")}<textarea class="input" name="detail" rows="3">${esc(original.detail)}</textarea></label>
      <details class="plan-row-details"><summary>${w("完成周次与期限（可选）","Completion week and deadline (optional)")}</summary><div class="degree-fields">
      ${field(w("课程第几周","Course week"),"teachingWeek",original.teachingWeek||"","number",'min="1" max="100"')}
      ${field(w("所属周","Week of"),"weekOf",original.weekOf,"date")}${field(w("范围开始","Window starts"),"windowStart",original.windowStart,"date")}${field(w("范围结束","Window ends"),"windowEnd",original.windowEnd,"date")}${field(w("截止日期","Deadline"),"deadline",original.deadline,"date")}</div></details>
      <p class="degree-help">${w("这里编辑的是学习进度中的同一个任务。具体日期、时刻和固定/自由方式，请点日历时间块修改。","This edits the same progress task. Click its calendar block to change the session time or fixed/flexible mode.")}</p>
      <button class="btn secondary task-delete" type="button" data-delete-editing-task>${w("删除这个任务","Delete this task")}</button>`,data=>{
        const workspace=bridge.getDegreeWorkspace(),target=workspace.plan.modules.flatMap(m=>m.courses).find(c=>c.id===course.id),tasks=courseStudyTasks(target,workspace.semesters),value=tasks.find(t=>t.id===taskId);
        if(!value)throw new Error(w("任务已删除，请重新打开。","This task was removed. Reopen the planner."));
        const hours=data.get("hours")===""?null:Number(data.get("hours"));
        if(hours!==null&&(!Number.isFinite(hours)||hours<0||hours>1000))throw new Error(w("请填写有效的预计小时。","Enter valid estimated hours."));
        const title=String(data.get("title")).trim();if(!title)throw new Error(w("请填写任务名称。","Enter a task name."));
        Object.assign(value,{title,group:data.get("group"),detail:data.get("detail"),hours,done:data.has("done"),doneEdited:data.has("done")!==original.done});
        for(const key of ["weekOf","windowStart","windowEnd","deadline","teachingWeek"])value[key]=data.get(key);
        bridge.saveCourseStudyPlan(target.id,{tasks,events:target.planEvents||[],link:target.courseId||"",range:target.planRange});
      },w("保存任务","Save task"));
    form.querySelector("[data-delete-editing-task]").onclick=()=>deleteTask({...task,title:original.title});
  }
function editWindow(task){
  const field=(label,key,value="",type="date")=>`<label>${esc(label)}<input class="input" name="${key}" value="${esc(value)}" type="${type}"></label>`;
  showDialog(w("任务完成范围 · ","Completion window · ")+task.title,
    `<p class="degree-help">${w("这里只改任务应在哪个范围完成，不会创建或移动日历时段。","This changes when the task should be completed, without creating or moving sessions.")}</p><div class="degree-fields">${field(w("课程周次（可选）","Course week (optional)"),"teachingWeek",task.window.teachingWeek||"","number")}${field(w("所属周（周一）","Week of (Monday)"),"weekOf",task.weekOf)}${field(w("范围开始（可选）","Window starts (optional)"),"windowStart",task.windowStart)}${field(w("范围结束（可选）","Window ends (optional)"),"windowEnd",task.windowEnd)}${field(w("截止日期（可选）","Deadline (optional)"),"deadline",task.deadline)}</div>`,
    data=>{
      const current=bridge.getDegreeWorkspace(),course=current.plan.modules.flatMap(m=>m.courses).find(c=>c.id===task.course.id),tasks=courseStudyTasks(course,current.semesters);
      Object.assign(tasks.find(t=>t.id===task.taskId),Object.fromEntries(["teachingWeek","weekOf","windowStart","windowEnd","deadline"].map(key=>[key,data.get(key)])));
      bridge.saveCourseStudyPlan(course.id,{tasks,events:course.planEvents||[],link:course.courseId||"",range:course.planRange});
    });
}
  function openSession(entry=null,plannedTask=null,preset={}){
    if(entry?.kind==="calendar"){showDialog(w("事项 · ","Calendar item · ")+entry.title,`<p>${esc(entry.date)} ${esc(entry.startTime||w("全天","All day"))}${entry.endTime?"–"+esc(entry.endTime):""}</p><p>${esc(entry.detail||"")}</p>`,()=>bridge.openStudyCalendar(entry.date),w("查看学习计时日历","Open timer calendar"));return;}
    if(entry?.kind==="exam"){showDialog(w("考试 · ","Exam · ")+entry.title,`<p>${esc(entry.date)} ${esc(entry.startTime||w("具体时间待公布","Time pending"))}${entry.endTime?"–"+esc(entry.endTime):""}</p>${entry.location?`<p>${esc(entry.location)}</p>`:""}<p>${esc(entry.detail||"")}</p><p class="degree-help">${w("考试来自毕业规划或学习计时日历，日历中会单独用紫色标识。","Exams come from the degree planner or timer calendar and are marked in purple.")}</p>`,()=>bridge.openStudyCalendar(entry.date),w("查看学习计时日历","Open timer calendar"));return;}
    let course=courses.find(c=>c.id===(entry?.course.id||plannedTask?.course.id||filter))||courses[0];
    if(!course)return;
    const isTask=entry?.kind==="task",isDeadline=entry?.sourceTask||["milestone","deadline"].includes(entry?.type);
    const field=(label,key,value="",type="text",extra="")=>`<label>${esc(label)}<input class="input" name="${key}" type="${type}" value="${esc(value)}" ${extra}></label>`;
    const initial={title:entry?.title||plannedTask?.title||w("学习时段","Study session"),date:entry?.date||"",period:entry?.period||"",weekOf:entry?(entry.weekOf||""):(plannedTask?.weekOf||planWeek(selectedDate)),startTime:entry?.startTime||"",endTime:entry?.endTime||"",hours:entry?(isTask?entry.scheduleHours??entry.hours:entry.hours??(entry.startTime&&entry.endTime?studySessionHours(entry):null)):plannedTask?.hours??null,taskLink:entry?.taskSeriesKey?"series:"+entry.taskSeriesKey:entry?.taskId||plannedTask?.taskId||""};
    Object.assign(initial,preset);if(plannedTask&&!Object.hasOwn(preset,"hours"))initial.hours=plannedTask.remainingHours==null?null:plannedTask.remainingHours>0?Math.min(dropHours,plannedTask.remainingHours):dropHours;
    let timerAfterSave=false,linkedTask=null,modeEdited=false,linkEdited=false;
    const form=showDialog(entry?course.name+" · "+entry.title:w("添加学习时段","Add study session"),`<div class="session-editor-intro">${w("预计时间用于安排学习；执行勾选与内容任务的完成分别保存。任务关联可留空。","Plan time; execution and task completion are saved separately. Task linking is optional.")}</div>
      <div class="session-task-actions">${entry&&!entry.sourceTask?btn(w("取消这个时段，保留任务","Cancel this session, keep task"),"unschedule"):""}<div class="session-task-actions">${btn(w("编辑关联任务","Edit linked task"),"edit-task")}${btn(w("删除关联任务","Delete linked task"),"delete-linked-task")}</div></div>
      <label>${w("所属课程","Course")}<select class="input" name="courseId" ${entry?"disabled":""}>${courses.map(c=>`<option value="${esc(c.id)}" ${c.id===course.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select></label>
      ${field(w("安排名称","Time plan"),"title",initial.title,"text",isTask?"readonly":"")}
      ${!isDeadline?`<label>${w("安排方式","Scheduling")}<select class="input" name="schedulingMode"><option value="fixed" ${(entry?.schedulingMode||plannedTask?.schedulingMode)==="fixed"?"selected":""}>${w("固定时间","Fixed time")}</option><option value="flexible" ${(entry?.schedulingMode||plannedTask?.schedulingMode)!=="fixed"?"selected":""}>${w("自由安排","Flexible")}</option></select></label>`:""}
      <div class="degree-fields">${field(w("日期（可稍后安排）","Date (optional)"),"date",initial.date,"date")}${field(w("时段备注，例如晚上","Period, e.g. evening"),"period",initial.period)}${field(w("预计小时","Planned hours"),"hours",initial.hours??"","number",'min="0" max="1000" step="any" placeholder="'+w("未估算","Unknown")+'"')}</div>
      <div class="degree-fields">${field(w("开始时间（可选）","Start (optional)"),"startTime",initial.startTime,"time")}${field(w("结束时间（可选）","End (optional)"),"endTime",initial.endTime,"time")}</div>
      ${isTask?"":`<label>${w("关联内容任务（可选）","Content task (optional)")}<select class="input" name="taskLink"></select></label>`}
      <p data-linked-task-label class="session-linked-task"></p>
      ${!isDeadline?`<label class="session-execution-check"><input type="checkbox" name="executed" ${entry?.executed?"checked":""}>${w("这段安排已按计划执行","Executed this time plan")}</label>`:""}
      ${entry?.repeat?`<p class="degree-help">${w("只修改这一次；整组重复可在课程计划里编辑。","Edits affect this occurrence. Edit the course plan for the full series.")}</p>`:""}
      <details class="plan-row-details"><summary>${w("关联任务的内容进度与计时","Linked task progress and timing")}</summary><label class="plan-check"><input type="checkbox" name="done">${w("内容任务已完成（与执行勾选分开）","Content task completed (separate from execution)")}</label>${btn(w("保存并开始任务计时","Save & start task timer"),"task-timer")}</details>
      <details class="plan-row-details"><summary>${w("所属周和详细说明","Flexible week and details")}</summary>${field(w("所属周（日期待定时使用）","Week of (if date TBD)"),"weekOf",initial.weekOf,"date")}<label>${w("说明","Details")}<textarea class="input" name="detail" rows="3">${esc(entry?.detail||"")}</textarea></label></details>
      ${entry?btn(w("编辑整门课任务 / 重复规则","Edit course tasks / recurrence"),"edit-source"):""}`,data=>{
        const hours=data.get("hours")===""?null:Number(data.get("hours"));if(hours!==null&&(!Number.isFinite(hours)||hours<0||hours>1000))throw new Error(w("请填写有效的预计小时。","Enter valid planned hours."));
        const values={date:data.get("date"),startTime:data.get("startTime"),endTime:data.get("endTime"),period:data.get("period"),hours,executed:data.has("executed"),weekOf:data.get("weekOf"),detail:data.get("detail")};
        if(!isTask){values.title=data.get("title");const link=data.get("taskLink")||"";values.taskId=link.startsWith("series:")?"":link;values.taskSeriesKey=link.startsWith("series:")?link.slice(7):"";}
        if(data.has("schedulingMode")&&(modeEdited||!entry))values.schedulingMode=data.get("schedulingMode");
        if(linkEdited)values.autoLinkDisabled=!(data.get("taskLink")||"");
        if(linkedTask&&form.elements.done.checked!==linkedTask.done)values.taskDone=form.elements.done.checked;
        if(entry){if(isDeadline&&!values.date)throw new Error(w("请填写截止日期。","Deadline date required."));patch(entry,values);}
        else{
          const current=bridge.getDegreeWorkspace(),target=current.plan.modules.flatMap(m=>m.courses).find(c=>c.id===form.elements.courseId.value),events=structuredClone(target.planEvents||[]);
          const tasks=courseStudyTasks(target,current.semesters);
          if(typeof values.taskDone==="boolean" && linkedTask){const task=tasks.find(task=>task.id===linkedTask.id);if(task){task.done=values.taskDone;task.doneEdited=true;}}
          if(linkedTask&&values.schedulingMode){const task=tasks.find(t=>t.id===linkedTask.id);task.schedulingMode=values.schedulingMode;if(modeEdited)task.classDefaultMode=false;}
          const {taskDone,...session}=values;events.push({id:crypto.randomUUID(),type:"study",...session});
          if(linkedTask&&!linkedTask.done&&values.schedulingMode!=="fixed"){taskBucket="scheduled";taskWeekFilter="";}
          bridge.saveCourseStudyPlan(target.id,{tasks,events,link:target.courseId||"",range:target.planRange});
        }
        if(timerAfterSave&&linkedTask){document.querySelector("#degreeDialog").close();bridge.startPlannedTaskTimer(course.id,linkedTask.id);}
      },w("保存时间安排","Save time plan"));
    function fillLinks(value=""){
      const selector=form.elements.taskLink;if(!selector)return;
      const tasks=courseStudyTasks(course,state.semesters),series=new Map();
      const list=[["",w("不关联内容任务","No task association")],...tasks.map(t=>[t.id,[t.group,t.title,t.weekOf].filter(Boolean).join(" · ")])];
      for(const t of tasks)if(t.seriesKey)series.set(t.seriesKey,[t.group,t.title].filter(Boolean).join(" · "));
      for(const [key,title]of series)list.push(["series:"+key,title+" · "+w("按周关联","match each week")]);
      selector.innerHTML=list.map(([id,label])=>`<option value="${esc(id)}">${esc(label)}</option>`).join("");selector.value=list.some(item=>item[0]===value)?value:"";
    }
    function refreshLink(){
      const tasks=courseStudyTasks(course,state.semesters),key=isTask?entry.taskId:form.elements.taskLink?.value||"";
      linkedTask=key.startsWith("series:")?tasks.find(t=>t.seriesKey===key.slice(7)&&t.weekOf===planWeek(form.elements.date.value||form.elements.weekOf.value||today())):tasks.find(t=>t.id===key);
      if(form.elements.schedulingMode&&linkedTask&&!modeEdited)form.elements.schedulingMode.value=taskSchedulingMode(linkedTask,course.planEvents);
      form.elements.done.disabled=!linkedTask;form.elements.done.checked=linkedTask?.done===true;
      form.querySelector("[data-linked-task-label]").textContent=linkedTask?[linkedTask.group,linkedTask.title].filter(Boolean).join(" · ")+" · "+w("预计 ","Estimated ")+(linkedTask.hours==null?w("未估算","unknown"):number(linkedTask.hours)+" h")+" · "+w("实际 ","Actual ")+number(taskActualHours(state,linkedTask.id))+" h":w("当前不关联内容任务，执行勾选仍可独立使用。","No linked task; execution can still be tracked independently.");
      form.querySelector('[data-schedule="task-timer"]').disabled=!linkedTask?.canonical;
      for(const action of ["edit-task","delete-linked-task"])form.querySelector('[data-schedule="'+action+'"]').disabled=!linkedTask;
    }
    fillLinks(initial.taskLink);refreshLink();
    if(form.elements.schedulingMode)form.elements.schedulingMode.onchange=()=>{modeEdited=true;};
    const syncHours=()=>{if(form.elements.startTime.value&&form.elements.endTime.value&&form.elements.endTime.value>form.elements.startTime.value)form.elements.hours.value=String((minutes(form.elements.endTime.value)-minutes(form.elements.startTime.value))/60);};
    const syncEnd=()=>{const start=form.elements.startTime.value,hours=Number(form.elements.hours.value);if(start&&form.elements.hours.value!==""&&hours>0&&minutes(start)+hours*60<1440)form.elements.endTime.value=clock(Math.round(minutes(start)+hours*60));};
    form.elements.startTime.addEventListener("change",()=>{if(form.elements.endTime.value)syncHours();else syncEnd();});
    form.elements.endTime.addEventListener("change",syncHours);
    form.elements.hours.addEventListener("change",syncEnd);
    const remove=form.querySelector('[data-schedule="unschedule"]');if(remove)remove.onclick=()=>{bridge.removeStudyScheduleEntry(entry.course.id,entry.id,entry.date||"");document.querySelector("#degreeDialog").close();};
    form.elements.courseId.onchange=()=>{course=courses.find(c=>c.id===form.elements.courseId.value);fillLinks();refreshLink();};
    if(form.elements.taskLink)form.elements.taskLink.onchange=()=>{linkEdited=true;refreshLink();};
    form.querySelector('[data-schedule="edit-task"]').onclick=()=>{if(linkedTask)editTask({...linkedTask,taskId:linkedTask.id,course});};
    form.querySelector('[data-schedule="delete-linked-task"]').onclick=()=>{if(linkedTask)deleteTask({...linkedTask,taskId:linkedTask.id,course});};
    form.elements.date.onchange=refreshLink;
    form.querySelector('[data-schedule="task-timer"]').onclick=()=>{timerAfterSave=true;form.requestSubmit();};
    form.querySelector('[type="submit"]').onclick=()=>{timerAfterSave=false;};
    const sourceButton=form.querySelector('[data-schedule="edit-source"]');if(sourceButton)sourceButton.onclick=()=>window.studyDegree.openCourseStudyPlan(entry.course.id);
  }
  const weekly=(courseId=filter,categoryId="",date=selectedDate,preset={})=>openWeeklyPlanner({bridge,showDialog,courseId,categoryId,date,preset});
  root.addEventListener("click",e=>{
    const weeklyButton=e.target.closest("[data-weekly-open]");if(weeklyButton){weekly(weeklyButton.dataset.weeklyCourse,weeklyButton.dataset.weeklyCategory);return;}
    if(e.target.closest(".schedule-execution,[data-resize-entry],[data-drag-entry],[data-task-done]"))return;
    const bucket=e.target.closest("[data-task-bucket]");if(bucket){taskBucket=bucket.dataset.taskBucket;taskWeekFilter="";taskStatusFilter="all";render();return;}
    const fixed=e.target.closest("[data-fixed-task]");if(fixed){const task=items.find(t=>t.taskId===fixed.dataset.fixedTask);if(!task)return;if(e.target.closest("[data-fixed-delete]"))deleteTask(task);else if(e.target.closest("[data-fixed-schedule]"))openSession(null,task);else editTask(task);return;}
    const brick=e.target.closest("[data-task-source]");
    if(brick){
      const task=items.find(t=>t.taskId===brick.dataset.taskSource);if(!task)return;
      if(e.target.closest("[data-edit-task]")||e.target.closest("strong")){editTask(task);return;}
      if(e.target.closest("[data-delete-task]")){deleteTask(task);return;}
      const allocation=e.target.closest("[data-open-allocation]");if(allocation){openSession(find(allocation.dataset.openAllocation));return;}
      if(e.target.closest("[data-task-mode]")){const slot=task.allocations.find(e=>e.date>=first&&e.date<=last)||task.allocations[0];openSession(slot||null,slot?null:task);return;}
      if(e.target.closest("[data-task-window]")){editWindow(task);return;}
      if(e.target.closest("[data-brick-timer]")){if(task.canonical)bridge.startPlannedTaskTimer(task.course.id,task.taskId);else window.studyDegree.openCourseStudyPlan(task.course.id);return;}
      if(e.target.closest("[data-plan-task-time]"))openSession(null,task);
      return;
    }
    const card=e.target.closest("[data-entry]");
    if(e.target.closest("[data-plan-task-time]")){openSession(null,find(card.dataset.entry));return;}
    if(card){openSession(find(card.dataset.entry));return;}
    const actual=e.target.closest("[data-actual-date]");if(actual){bridge.openStudyCalendar(actual.dataset.actualDate);return;}
    const week=e.target.closest("[data-month-week]");if(week){selectedDate=week.dataset.monthWeek;mode="week";taskWeekFilter="";autoTaskScope=true;render();return;}
    const day=e.target.closest("[data-day],[data-month-date]");if(day){selectedDate=day.dataset.day||day.dataset.monthDate;mode="day";render();return;}
    const action=e.target.closest("[data-schedule]")?.dataset.schedule;if(!action)return;
    if(action==="timer-calendar"){bridge.openStudyCalendar(selectedDate);return;}
    if(action==="new-session"){openSession();return;}
    if(action==="weekly-category"){weekly();return;}
    if(action==="edit-course"||action==="link-tasks"){window.studyDegree.openCourseStudyPlan(filter);return;}
    if(action==="prev"||action==="next")selectedDate=shiftStudyScheduleDate(selectedDate,mode,action==="next"?1:-1);
    if(action==="today")selectedDate=today();if(["month","week","day"].includes(action)){mode=action;autoTaskScope=true;}render();
  });
  root.addEventListener("change",e=>{
    if(e.target.matches("[data-task-done]")){const task=items.find(t=>t.taskId===e.target.closest("[data-task-source]").dataset.taskSource);bridge.setPlannedTaskDone(task.course.id,task.taskId,e.target.checked);return;}
    if(e.target.matches("[data-task-week]")){taskWeekFilter=e.target.value;render();return;}
    if(e.target.matches("[data-task-status]")){taskStatusFilter=e.target.value;render();return;}
    if(e.target.matches("[data-drop-hours]")){const value=Number(e.target.value);if(value>=.25&&value<=12)dropHours=value;else e.target.value=dropHours;return;}
    if(e.target.matches("[data-schedule-execute]")){const entry=find(e.target.closest("[data-entry]").dataset.entry);patch(entry,{executed:e.target.checked});return;}
    if(e.target.matches("[data-schedule-filter]")){filter=e.target.value;taskWeekFilter="";autoTaskScope=true;focusTaskId="";render();}
    if(e.target.matches("[data-schedule-date]")&&e.target.value){selectedDate=e.target.value;render();}
  });
  root.addEventListener("dragstart",e=>{
    if(e.target.closest("[data-resize-entry],input")){e.preventDefault();return;}
    const category=e.target.closest("[data-weekly-drag]");if(category&&!e.target.closest("[data-task-source]")){dragging="category:"+JSON.stringify([category.dataset.weeklyCourse,category.dataset.weeklyCategory]);e.dataTransfer.setData("text/study-plan",dragging);e.stopPropagation();return;}
    const brick=e.target.closest("[data-task-source]"),card=e.target.closest("[data-entry]");
    if(!card)return;if(!movable(brick?items.find(t=>t.taskId===brick.dataset.taskSource):find(card.dataset.entry))){e.preventDefault();return;}
    dragging=brick?"task-brick:"+brick.dataset.taskSource:card.dataset.entry;
    e.dataTransfer.setData("text/study-plan",dragging);e.stopPropagation();
  });
  root.addEventListener("dragend",()=>{dragging="";root.querySelectorAll(".schedule-drop-over").forEach(el=>el.classList.remove("schedule-drop-over"));});
  root.addEventListener("dragover",e=>{if(dragging&&e.target.closest("[data-drop-date],[data-unschedule]")){e.preventDefault();const cell=e.target.closest("[data-drop-date],[data-unschedule]");root.querySelectorAll(".schedule-drop-over").forEach(el=>{if(el!==cell)el.classList.remove("schedule-drop-over");});cell.classList.add("schedule-drop-over");}});
  root.addEventListener("drop",e=>{
    if(!dragging)return;e.preventDefault();e.stopPropagation();
    const source=dragging;dragging="";root.querySelectorAll(".schedule-drop-over").forEach(el=>el.classList.remove("schedule-drop-over"));
    if(source.startsWith("category:")){
      const cell=e.target.closest("[data-drop-date]");if(!cell)return;
      const ids=JSON.parse(source.slice(9)),preset={weekday:String(new Date(cell.dataset.dropDate+"T12:00:00Z").getUTCDay()||7)};
      if(cell.matches(".schedule-day-grid")){const minute=Math.max(0,Math.min(23*60,Number(cell.dataset.startHour)*60+Math.round((e.clientY-cell.getBoundingClientRect().top)/56*4)*15));preset.startTime=clock(minute);preset.endTime=clock(Math.min(1439,Math.round(minute+dropHours*60)));}
      weekly(ids[0],ids[1],cell.dataset.dropDate,preset);return;
    }
    const brick=source.startsWith("task-brick:"),entry=brick?items.find(t=>t.taskId===source.slice(11)):find(source);
    const cell=e.target.closest("[data-drop-date],[data-unschedule]");if(!cell||!entry||!movable(entry))return;
    if(cell.dataset.unschedule){if(!brick&&canExecute(entry))bridge.removeStudyScheduleEntry(entry.course.id,entry.id,entry.date||"");return;}
    let startTime=cell.dataset.monthDate&&!brick?entry.startTime||"":"",endTime=cell.dataset.monthDate&&!brick?entry.endTime||"":"",hours=brick?Math.min(dropHours,entry.remainingHours>0?entry.remainingHours:dropHours):studySessionHours(entry)||dropHours;
    if(cell.matches(".schedule-day-grid")){
      const minute=Math.max(0,Math.min(23*60+45,Number(cell.dataset.startHour)*60+Math.round((e.clientY-cell.getBoundingClientRect().top)/56*4)*15));
      startTime=clock(minute);if(minute+hours*60<1440)endTime=clock(Math.round(minute+hours*60));
      if(minute+hours*60>1440){openSession(brick?null:entry,brick?entry:null,{date:cell.dataset.dropDate,startTime,hours,endTime:""});bridge.showToast(w("请调整时长，或把跨午夜安排拆成两段。","Adjust the duration, or split a midnight-crossing session."));return;}
    }
    try{if(brick){taskBucket="scheduled";taskWeekFilter="";bridge.createTaskStudySession(entry.course.id,entry.taskId,{date:cell.dataset.dropDate,startTime,endTime,hours});}
    else patch(entry,{date:cell.dataset.dropDate,startTime,endTime,hours,viaDrag:true});}catch(error){bridge.showToast(error.message);}
  });
  root.addEventListener("pointerdown",e=>{
    const handle=e.target.closest("[data-resize-entry]");if(!handle)return;e.preventDefault();e.stopPropagation();dragging="";
    const card=handle.closest("[data-entry]"),entry=find(card.dataset.entry);if(!entry?.startTime||!movable(entry))return;
    const start=minutes(entry.startTime),original=(studySessionHours(entry)||1)*60,origin=e.clientY;let span=original;
    handle.setPointerCapture(e.pointerId);
    const move=ev=>{span=Math.max(15,Math.min(1440-start,Math.round((original+(ev.clientY-origin)*60/56)/15)*15));card.style.height=Math.max(70,span*56/60-3)+"px";handle.title=number(span/60)+" h";};
    const finish=ev=>{handle.releasePointerCapture(ev.pointerId);handle.removeEventListener("pointermove",move);handle.removeEventListener("pointerup",finish);handle.removeEventListener("pointercancel",cancel);if(span!==original)patch(entry,{hours:span/60,endTime:start+span<1440?clock(start+span):"",viaDrag:true});};
    const cancel=ev=>{handle.releasePointerCapture(ev.pointerId);handle.removeEventListener("pointermove",move);handle.removeEventListener("pointerup",finish);handle.removeEventListener("pointercancel",cancel);render();};
    handle.addEventListener("pointermove",move);handle.addEventListener("pointerup",finish);handle.addEventListener("pointercancel",cancel);
  });
}
