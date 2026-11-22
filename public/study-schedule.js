import { studyEntryStatus, studyExamEntries, studyPlanFocusDate, studyScheduleEntries, courseStudyTasks, taskActualHours, addPlanDays, planWeek, studySessionHours } from "./study-plan-core.js";
const en=()=>window.studyI18n?.getLanguage?.()==="en";
const w=(zh,english)=>en()?english:zh;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
const number=n=>new Intl.NumberFormat(en()?"en-GB":"zh-CN",{maximumFractionDigits:2}).format(n);
const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
const clock=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
const typeLabel=e=>e.kind==="exam"?w("考试","Exam"):e.kind==="task"?w("学习任务","Study task"):({class:w("上课","Class"),workshop:"Workshop",deadline:w("截止","Deadline"),milestone:w("重要日期","Milestone"),study:w("学习时段","Study session")})[e.type];
const btn=(label,action)=>`<button class="btn secondary" type="button" data-schedule="${action}">${esc(label)}</button>`;
const canExecute=e=>e.kind==="task"?Boolean(e.date):["study","class","workshop"].includes(e.type);

const taskPath=e=>[e.group||e.taskGroup,e.kind==="task"||e.sourceTask?e.title:e.taskTitle].filter(Boolean).join(" · ");
export const calendarStatusClass=e=>"study-status-"+studyEntryStatus(e);
export function calendarStatusBadge(e,compact=false){
  const status=studyEntryStatus(e),content=(e.kind==="task"&&!e.date)||e.sourceTask;
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

let selectedDate=today(),filter="",mode="week",dragging="";
export function selectStudySchedule(courseId="",date=""){filter=courseId;selectedDate=date||today();}
export function planCalendarItems(state,date){
  return studyScheduleEntries(state,date,date).filter(e=>e.date===date).map(e=>{
    const task=e.taskId?courseStudyTasks(e.course,state.semesters).find(t=>t.id===e.taskId):null;
    return {...e,done:task?.done??e.done,canonical:task?.canonical??e.canonical,executionAvailable:canExecute(e),statusEndTime:e.endTime||"",planType:e.type,type:"study",title:[e.course.name,taskPath(e),e.kind==="task"||e.sourceTask?"":e.title].filter(Boolean).join(" · "),degreeCourseId:e.course.id,
      endTime:e.endTime||(e.startTime&&studySessionHours(e)>0&&minutes(e.startTime)+studySessionHours(e)*60<1440?clock(Math.round(minutes(e.startTime)+studySessionHours(e)*60)):""),details:e.detail||"",privatePlanTask:true};
  });
}
export function renderStudySchedule(state){
  const courses=state.degreePlan.modules.flatMap(m=>m.courses);
  if(filter&&!courses.some(c=>c.id===filter))filter="";
  const first=mode==="week"?planWeek(selectedDate):selectedDate,last=addPlanDays(first,mode==="week"?6:0),dates=Array.from({length:mode==="week"?7:1},(_,i)=>addPlanDays(first,i));
  const entries=[...studyScheduleEntries(state,first,last),...studyExamEntries(state,first,last)].filter(e=>!filter||e.course.id===filter),flexible=entries.filter(e=>e.kind==="task"&&!e.date),plans=entries.filter(canExecute),weekPlans=plans.filter(e=>e.date||e.weekOf);
  const localDate=time=>{const d=new Date(time);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
  const sessions=(state.timer?.sessions||[]).filter(s=>localDate(s.startAt)>=first&&localDate(s.startAt)<=last&&courses.some(c=>c.courseId===s.courseId&&(!filter||c.id===filter)));
  const timed=entries.filter(e=>e.date&&e.startTime);
  const begin=Math.min(8,...timed.map(e=>Math.floor(minutes(e.startTime)/60)),...sessions.map(s=>new Date(s.startAt).getHours()));
  const end=Math.min(24,Math.max(20,...timed.map(e=>Math.ceil((e.endTime?minutes(e.endTime):minutes(e.startTime)+Math.max(.5,studySessionHours(e)||.5)*60)/60)),...sessions.map(s=>new Date(s.endAt).getHours()+1))),height=(end-begin)*56;
  const execution=(e,compact=false)=>canExecute(e)?`<label class="schedule-execution"><input type="checkbox" data-schedule-execute ${e.executed?"checked":""}>${compact?w("已执行","Executed"):w("已按计划执行","Executed as planned")}</label>`:"";
  function card(e,style=""){
    return `<article class="schedule-event ${esc(e.kind==="task"?"plan-task":e.type)} ${e.done?"done":""} ${e.executed?"executed":""} ${calendarStatusClass(e)}" draggable="${e.kind!=="exam"}" data-study-status="${studyEntryStatus(e)}" data-entry="${esc(e.id)}" style="${style}">
      <button class="schedule-event-open" type="button" title="${esc([e.course.name,taskPath(e),e.kind==="task"||e.sourceTask?"":e.title].filter(Boolean).join(" · "))}"><span class="schedule-type">${esc(typeLabel(e))}</span><strong>${esc(e.kind==="task"||e.sourceTask?taskPath(e)||e.title:e.title)}</strong><span>${esc(e.course.name)}</span><b>${esc(e.startTime?e.startTime+(e.endTime?"–"+e.endTime:""):e.period||(e.date?w("全天","All day"):w("待安排","Unscheduled")))}${studySessionHours(e)>0?" · "+number(studySessionHours(e))+" h":""}</b></button>${calendarStatusBadge(e,true)}${execution(e,true)}
      ${e.kind==="task"&&!e.date?`<button class="btn secondary" type="button" data-plan-task-time>${w("安排学习时段","Plan a study session")}</button>`:""}</article>`;
  }
  return `<section class="study-schedule"><header class="schedule-controls"><div>${btn("‹","prev")}${btn(w("今天","Today"),"today")}${btn("›","next")}</div><strong>${first} — ${last}</strong><div>${btn(w("周视图","Week"),"week")}${btn(w("日视图","Day"),"day")}</div>
    <label>${w("课程","Course")}<select class="input" data-schedule-filter><option value="">${w("全部课程","All courses")}</option>${courses.map(c=>`<option value="${esc(c.id)}" ${filter===c.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select></label>
    <label>${w("跳到日期","Go to date")}<input class="input" type="date" data-schedule-date value="${selectedDate}"></label>${filter?btn(w("任务预览 / 导入","Review tasks / import"),"edit-course"):""}</header>
    <div class="schedule-summary"><span>${w("本周 / 当日计划","Planned this period")}<b>${number(weekPlans.reduce((n,e)=>n+studySessionHours(e),0))} h</b></span><span>${w("按计划执行","Plan execution")}<b>${weekPlans.filter(e=>e.executed).length} / ${weekPlans.length}</b></span><span>${w("实际学习计时","Actual study time")}<b>${number(sessions.reduce((n,s)=>n+s.durationMs/3600000,0))} h</b></span><span>${w("待安排任务预计","Flexible task estimates")}<b>${number(flexible.reduce((n,e)=>n+(e.hours??0),0))} h</b></span></div>
    <p class="degree-help">${w("彩色块是计划，虚线块是实际计时。执行勾选、内容任务完成和实际计时分别保存。","Colored blocks are plans; dashed blocks are actual time. Execution, task completion and actual time are saved separately.")}</p>
    ${renderCalendarLegend()}
    <div class="schedule-workspace"><aside class="schedule-plan-list"><div class="plan-section-title"><h3>${w("学习时间安排","Time plans")}</h3>${btn(w("+ 添加时段","＋ Add session"),"new-session")}</div><p class="degree-help">${w("例如周一晚上预计 2 小时。点安排可修改，按计划做到了就勾选；任务关联可留空。","Reserve an evening, click to edit, and check when executed. Task linking is optional.")}</p>
      ${plans.length?plans.sort((a,b)=>(a.date||a.weekOf||"9999").localeCompare(b.date||b.weekOf||"9999")||(a.startTime||"").localeCompare(b.startTime||"")).map(e=>`<article class="schedule-agenda-item ${e.executed?"executed":""} ${calendarStatusClass(e)}" data-study-status="${studyEntryStatus(e)}" data-entry="${esc(e.id)}"><button type="button" class="schedule-agenda-open"><span>${esc(e.date||(e.weekOf?e.weekOf+" "+w("所在周 · 日期待定","week · date TBD"):w("日期待安排","Date to arrange")))} ${esc(e.period||"")} ${esc(e.startTime||"")}${e.endTime?"–"+esc(e.endTime):""}</span><strong>${esc(e.title)}</strong><span>${esc(e.course.name)} · ${studySessionHours(e)>0?number(studySessionHours(e))+" h":w("工时未估算","Hours not estimated")}</span></button><small class="schedule-link-status">${e.taskId||e.taskSeriesKey?w("关联：","Linked: ")+esc(taskPath(e)||w("内容任务","Content task")):w("独立时段","Independent time plan")}</small>${calendarStatusBadge(e)}${execution(e)}</article>`).join(""):`<div class="plan-empty">${w("这段时间还没有学习时段。可以添加一晚的安排，或从下方任务开始安排。","No study sessions yet. Add one or schedule a task below.")}</div>`}</aside>
    <div class="schedule-scroll"><div class="schedule-table" style="--days:${dates.length};min-width:${dates.length===1?300:850}px">
      <div class="schedule-day-head schedule-axis">${w("时间","Time")}</div>${dates.map(d=>`<button class="schedule-day-head ${d===today()?"is-today":""}" data-day="${d}" type="button">${esc(new Intl.DateTimeFormat(en()?"en-GB":"zh-CN",{weekday:"short",month:"numeric",day:"numeric"}).format(new Date(d+"T12:00:00")))}</button>`).join("")}
      <div class="schedule-all-day schedule-axis">${w("全天","All day")}</div>${dates.map(d=>`<div class="schedule-all-day" data-drop-date="${d}">${entries.filter(e=>e.date===d&&!e.startTime).map(e=>card(e)).join("")}</div>`).join("")}
      <div class="schedule-axis schedule-hours" style="height:${height}px">${Array.from({length:end-begin},(_,i)=>`<span style="top:${i*56}px">${clock((begin+i)*60)}</span>`).join("")}</div>
      ${dates.map(d=>{
        const placed=entries.filter(e=>e.date===d&&e.startTime).sort((a,b)=>a.startTime.localeCompare(b.startTime)).map(e=>({e,start:minutes(e.startTime),end:Math.min(1440,e.endTime?minutes(e.endTime):minutes(e.startTime)+Math.max(.5,studySessionHours(e)||.5)*60)}));
        let group=[],groupEnd=0;for(const item of placed){if(item.start>=groupEnd){group=[];groupEnd=0;}item.lane=0;while(group.some(g=>g.end>item.start&&g.lane===item.lane))item.lane++;group.push(item);groupEnd=Math.max(groupEnd,item.end);const lanes=Math.max(...group.map(g=>g.lane))+1;for(const member of group)member.lanes=Math.max(member.lanes||1,lanes);}
        return `<div class="schedule-day-grid" data-drop-date="${d}" data-start-hour="${begin}" style="height:${height}px">${placed.map(({e,start,end,lane,lanes})=>card(e,`top:${(start-begin*60)*56/60}px;height:${Math.max(64,(end-start)*56/60-3)}px;left:${lane*100/lanes}%;width:${100/lanes}%;`)).join("")}
        ${sessions.filter(s=>localDate(s.startAt)===d).map(s=>{const st=new Date(s.startAt),et=new Date(s.endAt),start=st.getHours()*60+st.getMinutes(),end=et.getHours()*60+et.getMinutes();return `<button class="schedule-actual study-status-record" type="button" data-actual-date="${d}" style="top:${Math.max(0,(start-begin*60)*56/60)}px;height:${Math.max(36,(end-start)*56/60-3)}px">${w("实际","Actual")} ${number(s.durationMs/3600000)} h · ${esc([s.categoryName,s.taskName||s.courseName].filter(Boolean).join(" · "))}</button>`;}).join("")}</div>`;
      }).join("")}</div></div></div>
    <section class="schedule-flexible"><h3>${w("本周待安排与未定日期的内容任务","Flexible content tasks")}</h3><p class="degree-help">${w("安排时段不会另建一份进度任务。","Scheduling a session does not create a duplicate progress task.")}</p><div class="schedule-flexible-grid" data-unschedule="true">${flexible.map(e=>card(e)).join("")||`<p class="degree-help">${w("本周没有待安排的内容任务。","No flexible tasks this week.")}</p>`}</div></section></section>`;
}

export function bindStudySchedule(panel,{bridge,showDialog,render}){
  const root=panel.querySelector(".study-schedule");if(!root)return;
  const state=bridge.getState(),courses=state.degreePlan.modules.flatMap(m=>m.courses);
  const first=mode==="week"?planWeek(selectedDate):selectedDate,last=addPlanDays(first,mode==="week"?6:0);
  const entries=[...studyScheduleEntries(state,first,last),...studyExamEntries(state,first,last)],find=id=>entries.find(e=>e.id===id);
  const patch=(entry,changes)=>bridge.patchStudyScheduleEntry(entry.course.id,entry.id,entry.date||"",changes);
  function openSession(entry=null,plannedTask=null){
    if(entry?.kind==="exam"){showDialog(w("考试 · ","Exam · ")+entry.title,`<p>${esc(entry.date)} ${esc(entry.startTime||w("具体时间待公布","Time pending"))}${entry.endTime?"–"+esc(entry.endTime):""}</p>${entry.location?`<p>${esc(entry.location)}</p>`:""}<p>${esc(entry.detail||"")}</p><p class="degree-help">${w("考试来自毕业规划或学习计时日历，日历中会单独用紫色标识。","Exams come from the degree planner or timer calendar and are marked in purple.")}</p>`,()=>bridge.openStudyCalendar(entry.date),w("查看学习计时日历","Open timer calendar"));return;}
    let course=courses.find(c=>c.id===(entry?.course.id||plannedTask?.course.id||filter))||courses[0];
    if(!course)return;
    const isTask=entry?.kind==="task",isDeadline=entry?.sourceTask||["milestone","deadline"].includes(entry?.type);
    const field=(label,key,value="",type="text",extra="")=>`<label>${esc(label)}<input class="input" name="${key}" type="${type}" value="${esc(value)}" ${extra}></label>`;
    const initial={title:entry?.title||plannedTask?.title||w("学习时段","Study session"),date:entry?.date||"",period:entry?.period||"",weekOf:entry?(entry.weekOf||""):(plannedTask?.weekOf||planWeek(selectedDate)),startTime:entry?.startTime||"",endTime:entry?.endTime||"",hours:entry?(isTask?entry.scheduleHours??entry.hours:entry.hours):plannedTask?.hours??null,taskLink:entry?.taskSeriesKey?"series:"+entry.taskSeriesKey:entry?.taskId||plannedTask?.taskId||""};
    let timerAfterSave=false,linkedTask=null;
    const form=showDialog(entry?course.name+" · "+entry.title:w("添加学习时段","Add study session"),`<div class="session-editor-intro">${w("预计时间用于安排学习；执行勾选与内容任务的完成分别保存。任务关联可留空。","Plan time; execution and task completion are saved separately. Task linking is optional.")}</div>
      <label>${w("所属课程","Course")}<select class="input" name="courseId" ${entry?"disabled":""}>${courses.map(c=>`<option value="${esc(c.id)}" ${c.id===course.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select></label>
      ${field(w("安排名称","Time plan"),"title",initial.title,"text",isTask?"readonly":"")}
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
        if(linkedTask&&form.elements.done.checked!==linkedTask.done)values.taskDone=form.elements.done.checked;
        if(entry){if(isDeadline&&!values.date)throw new Error(w("请填写截止日期。","Deadline date required."));patch(entry,values);}
        else{
          const current=bridge.getDegreeWorkspace(),target=current.plan.modules.flatMap(m=>m.courses).find(c=>c.id===form.elements.courseId.value),events=structuredClone(target.planEvents||[]);
          const tasks=courseStudyTasks(target,current.semesters);
          if(typeof values.taskDone==="boolean" && linkedTask){const task=tasks.find(task=>task.id===linkedTask.id);if(task)task.done=values.taskDone;}
          const {taskDone,...session}=values;events.push({id:crypto.randomUUID(),type:"study",...session});
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
      form.elements.done.disabled=!linkedTask;form.elements.done.checked=linkedTask?.done===true;
      form.querySelector("[data-linked-task-label]").textContent=linkedTask?[linkedTask.group,linkedTask.title].filter(Boolean).join(" · ")+" · "+w("预计 ","Estimated ")+(linkedTask.hours==null?w("未估算","unknown"):number(linkedTask.hours)+" h")+" · "+w("实际 ","Actual ")+number(taskActualHours(state,linkedTask.id))+" h":w("当前不关联内容任务，执行勾选仍可独立使用。","No linked task; execution can still be tracked independently.");
      form.querySelector('[data-schedule="task-timer"]').disabled=!linkedTask?.canonical;
    }
    fillLinks(initial.taskLink);refreshLink();
    form.elements.courseId.onchange=()=>{course=courses.find(c=>c.id===form.elements.courseId.value);fillLinks();refreshLink();};
    if(form.elements.taskLink)form.elements.taskLink.onchange=refreshLink;
    form.elements.date.onchange=refreshLink;
    form.querySelector('[data-schedule="task-timer"]').onclick=()=>{timerAfterSave=true;form.requestSubmit();};
    form.querySelector('[type="submit"]').onclick=()=>{timerAfterSave=false;};
    const sourceButton=form.querySelector('[data-schedule="edit-source"]');if(sourceButton)sourceButton.onclick=()=>window.studyDegree.openCourseStudyPlan(entry.course.id);
  }
  root.addEventListener("click",e=>{
    if(e.target.closest(".schedule-execution"))return;
    const card=e.target.closest("[data-entry]");
    if(e.target.closest("[data-plan-task-time]")){openSession(null,find(card.dataset.entry));return;}
    if(card){openSession(find(card.dataset.entry));return;}
    const day=e.target.closest("[data-day]");if(day){selectedDate=day.dataset.day;mode="day";render();return;}
    const actual=e.target.closest("[data-actual-date]");if(actual){bridge.openStudyCalendar(actual.dataset.actualDate);return;}
    const action=e.target.closest("[data-schedule]")?.dataset.schedule;if(!action)return;
    if(action==="new-session"){openSession();return;}
    if(action==="edit-course"){window.studyDegree.openCourseStudyPlan(filter);return;}
    if(action==="prev"||action==="next")selectedDate=addPlanDays(selectedDate,(action==="next"?1:-1)*(mode==="week"?7:1));
    if(action==="today")selectedDate=today();if(action==="week"||action==="day")mode=action;render();
  });
  root.addEventListener("change",e=>{
    if(e.target.matches("[data-schedule-execute]")){const entry=find(e.target.closest("[data-entry]").dataset.entry);patch(entry,{executed:e.target.checked});return;}
    if(e.target.matches("[data-schedule-filter]")){filter=e.target.value;const course=courses.find(c=>c.id===filter);if(course)selectedDate=studyPlanFocusDate(course,state.semesters,today());render();}
    if(e.target.matches("[data-schedule-date]")&&e.target.value){selectedDate=e.target.value;render();}
  });
  root.addEventListener("dragstart",e=>{const card=e.target.closest("[data-entry]");if(card){if(find(card.dataset.entry)?.kind==="exam"){e.preventDefault();return;}dragging=card.dataset.entry;e.dataTransfer.setData("text/study-plan",dragging);e.stopPropagation();}});
  root.addEventListener("dragend",()=>{dragging="";});
  root.addEventListener("dragover",e=>{if(dragging&&e.target.closest("[data-drop-date],[data-unschedule]"))e.preventDefault();});
  root.addEventListener("drop",e=>{
    if(!dragging)return;e.preventDefault();e.stopPropagation();const entry=find(dragging);dragging="";if(!entry)return;
    const cell=e.target.closest("[data-drop-date],[data-unschedule]");if(!cell)return;
    if(cell.dataset.unschedule){if(entry.kind==="task")patch(entry,{date:"",startTime:"",endTime:""});return;}
    let startTime="",endTime="";
    if(cell.matches(".schedule-day-grid")){const minute=Math.max(0,Math.min(23*60+45,Number(cell.dataset.startHour)*60+Math.round((e.clientY-cell.getBoundingClientRect().top)/56*4)*15));startTime=clock(minute);const span=entry.startTime&&entry.endTime?minutes(entry.endTime)-minutes(entry.startTime):(studySessionHours(entry)||1)*60;if(minute+span<1440)endTime=clock(Math.round(minute+span));}
    patch(entry,{date:cell.dataset.dropDate,startTime,endTime});
  });
}
