import { studyPlanFocusDate, studyScheduleEntries, courseStudyTasks, taskActualHours, addPlanDays, planWeek } from "./study-plan-core.js";
const en=()=>window.studyI18n?.getLanguage?.()==="en";
const w=(zh,english)=>en()?english:zh;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
const clock=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
const typeLabel=e=>e.kind==="task"?w("任务","Task"):({class:w("上课","Class"),workshop:"Workshop",deadline:w("截止","Deadline"),milestone:w("重要日期","Milestone"),study:w("计划学习","Planned study")})[e.type];
const btn=(label,action)=>`<button class="btn secondary" type="button" data-schedule="${action}">${esc(label)}</button>`;
let selectedDate=today(), filter="",mode="week",dragging="";
export function selectStudySchedule(courseId="",date=""){filter=courseId;selectedDate=date||today();}
export function planCalendarItems(state,date){
  return studyScheduleEntries(state,date,date).filter(e=>e.date===date).map(e=>{
    const bound=e.taskId?courseStudyTasks(e.course,state.semesters).find(t=>t.id===e.taskId):null;
    return {...e,done:bound?.done ?? e.done,canonical:bound?.canonical ?? e.canonical,type:"study",title:e.course.name+" · "+e.title,degreeCourseId:e.course.id,
    endTime:e.endTime|| (e.startTime && e.hours>0 && minutes(e.startTime)+e.hours*60<1440?clock(Math.round(minutes(e.startTime)+e.hours*60)):""),details:e.detail||"",privatePlanTask:true};});
}
export function renderStudySchedule(state){
  const courses=state.degreePlan.modules.flatMap(m=>m.courses);
  if(filter&&!courses.some(c=>c.id===filter))filter="";
  const first=mode==="week"?planWeek(selectedDate):selectedDate;
  const last=addPlanDays(first,mode==="week"?6:0);
  const dates=Array.from({length:mode==="week"?7:1},(_,i)=>addPlanDays(first,i));
  const entries=studyScheduleEntries(state,first,last).filter(e=>!filter||e.course.id===filter);
  const flexible=entries.filter(e=>!e.date);
  const sessions=(state.timer?.sessions||[]).filter(s=>{
    const d=new Date(s.startAt);const date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
    return date>=first&&date<=last&&courses.some(c=>c.courseId===s.courseId&&(!filter||c.id===filter));
  });
  const duration=e=>e.endTime&&e.startTime?(minutes(e.endTime)-minutes(e.startTime))/60:(e.hours??0);
  const scheduledHours=entries.filter(e=>e.date).reduce((sum,e)=>sum+duration(e),0);
  const flexibleHours=flexible.reduce((sum,e)=>sum+(e.hours??0),0);
  const actual=sessions.reduce((n,s)=>n+s.durationMs/3600000,0);
  const timeEntries=entries.filter(e=>e.startTime&&e.date);
  let begin=Math.min(8,...timeEntries.map(e=>Math.floor(minutes(e.startTime)/60)),...sessions.map(s=>new Date(s.startAt).getHours()));
  let end=Math.min(24,Math.max(20,...timeEntries.map(e=>Math.ceil((e.endTime?minutes(e.endTime):minutes(e.startTime)+Math.max(0.5,e.hours||0.5)*60)/60)),...sessions.map(s=>new Date(s.endAt).getHours()+1)));
  const height=(end-begin)*56;
  function card(e,timed=false,style=""){
    return `<button type="button" class="schedule-event ${esc(e.kind==="task"?"plan-task":e.type)} ${e.done?"done":""}" draggable="true" data-entry="${esc(e.id)}" style="${style}" title="${esc(e.title)}">
      <span class="schedule-type">${esc(typeLabel(e))}${e.done?" ✓":""}</span>
      <strong>${esc(e.title)}</strong><span>${esc(e.course.name)}</span>
      <b>${e.startTime?esc(e.startTime+(e.endTime?"–"+e.endTime:"")):e.kind==="task"?(e.hours==null?w("未估算","Not estimated"):e.hours+" h"):w("全天 / 待定时间","All day / time TBD")}</b></button>`;
  }
  return `<section class="study-schedule"><header class="schedule-controls"><div>${btn("‹","prev")}${btn(w("今天","Today"),"today")}${btn("›","next")}</div>
      <strong>${esc(first)} — ${esc(last)}</strong><div>${btn(w("周视图","Week"),"week")}${btn(w("日视图","Day"),"day")}</div>
      <label>${w("课程","Course")}<select class="input" data-schedule-filter><option value="">${w("全部课程","All courses")}</option>${courses.map(c=>`<option value="${esc(c.id)}" ${filter===c.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select></label>
      <label>${w("跳到日期","Go to date")}<input class="input" type="date" data-schedule-date value="${selectedDate}"></label>
      ${filter?btn(w("编辑这门课计划","Edit course plan"),"edit-course"):""}</header>
    <div class="schedule-summary"><span>${w("已安排","Scheduled")} <b>${scheduledHours.toFixed(1)} h</b></span><span>${w("待安排工作量","Flexible workload")} <b>${flexibleHours.toFixed(1)} h</b></span><span>${w("实际学习记录","Actual study")} <b>${actual.toFixed(1)} h</b></span><span>${w("时间差（实际 − 已安排）","Difference (actual − scheduled)")} <b>${(actual-scheduledHours).toFixed(1)} h</b></span></div>
    <p class="degree-help">${w("彩色块为计划，虚线块为实际记录。拖动可安排日期和时间；点击可编辑或开始任务计时。每周未定时间的作业保留在下方。","Colored blocks are plans; dashed blocks are actual records. Drag to schedule, click to edit or time a task. Flexible weekly work stays below.")}</p>
    <div class="schedule-scroll"><div class="schedule-table" style="--days:${dates.length};min-width:${dates.length===1?300:960}px">
      <div class="schedule-day-head schedule-axis">${w("时间","Time")}</div>${dates.map(d=>`<button class="schedule-day-head ${d===today()?"is-today":""}" data-day="${d}">${esc(new Intl.DateTimeFormat(en()?"en-GB":"zh-CN",{weekday:"short",month:"numeric",day:"numeric"}).format(new Date(d+"T12:00:00")))}</button>`).join("")}
      <div class="schedule-all-day schedule-axis">${w("全天","All day")}</div>${dates.map(d=>`<div class="schedule-all-day" data-drop-date="${d}">${entries.filter(e=>e.date===d&&!e.startTime).map(e=>card(e)).join("")}</div>`).join("")}
      <div class="schedule-axis schedule-hours" style="height:${height}px">${Array.from({length:end-begin},(_,i)=>`<span style="top:${i*56}px">${clock((begin+i)*60)}</span>`).join("")}</div>
      ${dates.map(d=>{
        const timed=entries.filter(e=>e.date===d&&e.startTime).sort((a,b)=>a.startTime.localeCompare(b.startTime));
        const placed=timed.map(e=>({e,start:minutes(e.startTime),end:Math.min(1440,e.endTime?minutes(e.endTime):minutes(e.startTime)+Math.max(0.5,e.hours||0.5)*60)}));
        let group=[],groupEnd=0;
        for(const item of placed){if(item.start>=groupEnd){group=[];groupEnd=0;}item.lane=0;while(group.some(g=>g.end>item.start&&g.lane===item.lane))item.lane++;group.push(item);groupEnd=Math.max(groupEnd,item.end);const lanes=Math.max(...group.map(g=>g.lane))+1;for(const member of group)member.lanes=Math.max(member.lanes||1,lanes);}
        return `<div class="schedule-day-grid" data-drop-date="${d}" data-start-hour="${begin}" style="height:${height}px">
          ${placed.map(({e,start,end,lane,lanes})=>card(e,true,`top:${(start-begin*60)*56/60}px;height:${Math.max(44,(end-start)*56/60-3)}px;left:${lane*100/lanes}%;width:${100/lanes}%;`)).join("")}
          ${sessions.filter(s=>{const local=new Date(s.startAt);return local.getFullYear()+"-"+String(local.getMonth()+1).padStart(2,"0")+"-"+String(local.getDate()).padStart(2,"0")===d;}).map(s=>{
            const st=new Date(s.startAt),et=new Date(s.endAt),start=st.getHours()*60+st.getMinutes(),end=et.getHours()*60+et.getMinutes();
            return `<button type="button" class="schedule-actual" data-actual-date="${d}" style="top:${Math.max(0,(start-begin*60)*56/60)}px;height:${Math.max(36,(end-start)*56/60-3)}px">${w("实际","Actual")} ${(s.durationMs/3600000).toFixed(1)} h · ${esc(s.taskName||s.courseName)}</button>`;
          }).join("")}</div>`;
      }).join("")}</div></div>
    <section class="schedule-flexible"><h3>${w("本周待安排与未定日期任务","Flexible weekly work & undated tasks")}</h3><div class="schedule-flexible-grid" data-unschedule="true">${flexible.map(e=>card(e)).join("")||`<p class="degree-help">${w("本周没有待安排任务。","No flexible tasks this week.")}</p>`}</div></section>
  </section>`;
}

export function bindStudySchedule(panel,{bridge,showDialog,render}){
  const root=panel.querySelector(".study-schedule");if(!root)return;
  const state=bridge.getState();
  const first=mode==="week"?planWeek(selectedDate):selectedDate,last=addPlanDays(first,mode==="week"?6:0);
  const entries=studyScheduleEntries(state,first,last);
  const find=id=>entries.find(e=>e.id===id);
  function saveEntry(entry,values){
    const current=bridge.getDegreeWorkspace();if(!current.editable)return;
    const course=current.plan.modules.flatMap(m=>m.courses).find(c=>c.id===entry.course.id);
    const tasks=courseStudyTasks(course,current.semesters),events=structuredClone(course.planEvents||[]);
    if(entry.sourceTask){const task=tasks.find(t=>t.id===entry.taskId);task.deadline=values.date;}
    else if(entry.kind==="task"){const task=tasks.find(t=>t.id===entry.taskId);Object.assign(task,values,{userScheduled:true});}
    else {
      const event=events.find(e=>e.id===entry.id.split(":")[1]);
      if(event.repeat){
        if(!event.repeat.exceptDates.includes(entry.date))event.repeat.exceptDates.push(entry.date);
        events.push({...event,...values,id:crypto.randomUUID(),repeat:undefined,date:values.date||entry.date,importKey:"moved:"+event.id+":"+entry.date});
      }else Object.assign(event,values);
    }
    bridge.saveCourseStudyPlan(course.id,{tasks,events,link:course.courseId||"",range:course.planRange});
  }
  function openEntry(entry){
    const task=entry.taskId?courseStudyTasks(entry.course,state.semesters).find(t=>t.id===entry.taskId):null;
    const field=(label,key,value,type="text")=>`<label>${esc(label)}<input class="input" name="${key}" type="${type}" value="${esc(value)}"></label>`;
    const form=showDialog(entry.course.name+" · "+entry.title,`<p>${esc(typeLabel(entry))}${entry.repeat?" · "+w("本次修改只影响这一天；整组重复请编辑课程计划。","Changes affect this occurrence. Edit the course plan for the full series."):""}</p>
      <div class="degree-fields">${field(w("日期（任务可留空）","Date (optional for tasks)"),"date",entry.date||"","date")}${field(w("开始","Start"),"startTime",entry.startTime||"","time")}${field(w("结束","End"),"endTime",entry.endTime||"","time")}</div>
      ${task?`<h4>${esc(task.group||"")} · ${esc(task.title)}</h4><p>${esc(task.detail||"")}</p><p>${w("预计","Estimate")} ${task.hours==null?w("未估算","Not estimated"):task.hours+" h"} · ${w("实际","Actual")} ${taskActualHours(state,task.id).toFixed(1)} h</p>
      <label><input type="checkbox" name="done" ${task.done?"checked":""}> ${w("任务已完成（同步学习进度）","Task completed (sync progress)")}</label>${task.canonical?btn(w("开始此任务计时","Start task timer"),"task-timer"):""}`:""}
      <p>${esc(entry.detail||"")}</p>${entry.migratedTaskId?`<p>${w("旧文字清单状态：","Original checklist status: ")}${entry.legacyTaskDone?w("已完成","Completed"):w("未完成","Incomplete")}</p>`:""}${btn(w("编辑整门课计划","Edit course plan"),"edit-source")}`,data=>{
        if(entry.kind!=="task"&&!data.get("date"))throw new Error(w("请填写日期。","Date is required."));
        const values={date:data.get("date"),startTime:data.get("startTime"),endTime:data.get("endTime")};
        if(entry.kind==="task")values.done=data.has("done");
        saveEntry(entry,values);
        if(task&&entry.kind!=="task")bridge.setPlannedTaskDone(entry.course.id,task.id,data.has("done"));
      },w("保存","Save"));
    form.querySelector('[data-schedule="edit-source"]').onclick=()=>window.studyDegree.openCourseStudyPlan(entry.course.id);
    const timer=form.querySelector('[data-schedule="task-timer"]');
    if(timer)timer.onclick=()=>{document.querySelector("#degreeDialog").close();bridge.startPlannedTaskTimer(entry.course.id,task.id);};
  }
  root.addEventListener("click",e=>{
    const card=e.target.closest("[data-entry]");if(card){openEntry(find(card.dataset.entry));return;}
    const day=e.target.closest("[data-day]");if(day){selectedDate=day.dataset.day;mode="day";render();return;}
    const actual=e.target.closest("[data-actual-date]");if(actual){bridge.openStudyCalendar(actual.dataset.actualDate);return;}
    const action=e.target.closest("[data-schedule]")?.dataset.schedule;
    if(!action)return;
    if(action==="edit-course"){window.studyDegree.openCourseStudyPlan(filter);return;}
    if(action==="prev"||action==="next")selectedDate=addPlanDays(selectedDate,(action==="next"?1:-1)*(mode==="week"?7:1));
    if(action==="today")selectedDate=today();
    if(action==="week"||action==="day")mode=action;
    render();
  });
  root.addEventListener("change",e=>{if(e.target.matches("[data-schedule-filter]")){filter=e.target.value;const course=state.degreePlan.modules.flatMap(m=>m.courses).find(c=>c.id===filter);if(course)selectedDate=studyPlanFocusDate(course,state.semesters,today());render();}if(e.target.matches("[data-schedule-date]")&&e.target.value){selectedDate=e.target.value;render();}});
  root.addEventListener("dragstart",e=>{const card=e.target.closest("[data-entry]");if(card){dragging=card.dataset.entry;e.dataTransfer.setData("text/study-plan",dragging);e.stopPropagation();}});
  root.addEventListener("dragend",()=>{dragging="";});
  root.addEventListener("dragover",e=>{if(dragging&&e.target.closest("[data-drop-date],[data-unschedule]"))e.preventDefault();});
  root.addEventListener("drop",e=>{
    if(!dragging)return;e.preventDefault();e.stopPropagation();
    const entry=find(dragging);dragging="";if(!entry)return;
    const cell=e.target.closest("[data-drop-date],[data-unschedule]");if(!cell)return;
    if(cell.dataset.unschedule){if(entry.kind==="task")saveEntry(entry,{date:"",startTime:"",endTime:""});return;}
    let startTime="",endTime="";
    if(cell.matches(".schedule-day-grid")){
      const minute=Math.max(0,Math.min(23*60+45,Number(cell.dataset.startHour)*60+Math.round((e.clientY-cell.getBoundingClientRect().top)/56*4)*15));
      startTime=clock(minute);const span=entry.startTime&&entry.endTime?minutes(entry.endTime)-minutes(entry.startTime):(entry.hours||1)*60;
      if(minute+span<1440)endTime=clock(Math.round(minute+span));
    }
    saveEntry(entry,{date:cell.dataset.dropDate,startTime,endTime});
  });
}
