import { suggestProgressCourse, studyPlanFromLink } from "./degree-core.js";
import { courseStudyTasks, parseCoursePlan, mergeImportedPlan, scheduleOccurrences, taskActualHours, addPlanDays, studySessionHours } from "./study-plan-core.js";
const en=()=>window.studyI18n?.getLanguage?.()==="en";
const w=(zh,english)=>en()?english:zh;
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
const btn=(label,action,extra="")=>`<button class="btn secondary" type="button" data-plan-action="${action}" ${extra}>${esc(label)}</button>`;
const field=(label,key,value="",type="text",extra="")=>`<label>${esc(label)}<input class="input" type="${type}" data-field="${key}" value="${esc(value)}" ${extra}></label>`;
const opts=(items,value)=>items.map(([id,label])=>`<option value="${esc(id)}" ${id===value?"selected":""}>${esc(label)}</option>`).join("");
const types=()=>[["study",w("学习时段","Study session")],["class",w("上课","Class")],["workshop","Workshop"],["milestone",w("重要日期","Milestone")],["deadline",w("截止日期","Deadline")]];
const describe=t=>[t.group,t.title,t.weekOf||t.date].filter(Boolean).join(" · ");
const taskMatch=(task,existing)=>existing.find(t=>t.importKey&&t.importKey===task.importKey) ||
  existing.find(t=>t.id===task.id) ||
  (existing.filter(t=>t.title===task.title&&(t.group||"")===(task.group||"")&&(t.weekOf||"")===(task.weekOf||"")&&(t.date||"")===(task.date||"")).length===1 ?
    existing.find(t=>t.title===task.title&&(t.group||"")===(task.group||"")&&(t.weekOf||"")===(task.weekOf||"")&&(t.date||"")===(task.date||"")):null);
function rangeFor(course,plan,received){
  const start=received?.period?.start||course.planRange?.start||today();
  let end=received?.period?.end||course.planRange?.end;
  if(!end&&typeof received?.tasks==="string"){
    const match=[...received.tasks.matchAll(/(\d{1,2})月(\d{1,2})日[^；;）)\n]*(?:最终|结束|final)/gi)].at(-1);
    if(match){end=start.slice(0,4)+"-"+match[1].padStart(2,"0")+"-"+match[2].padStart(2,"0");if(end<start)end=String(Number(start.slice(0,4))+1)+end.slice(4);}
  }
  return {start,end:end||plan.blocks.find(b=>b.id===course.blockId&&b.end>=start)?.end||addPlanDays(start,90),exceptDates:received?.period?.exceptDates||course.planRange?.exceptDates||[]};
}
export function openPlanEditor({course,plan,semesters,received,showDialog,bridge,onSaved}){
  let tasks=courseStudyTasks(course,semesters).map(t=>({...t})),events=structuredClone(course.planEvents||[]);
  let preview=null,previewText="",pane="tasks",destination="",additions=null;
  const range=rangeFor(course,plan,received);
  const links=[["",w("独立任务，不写入学习进度","Independent tasks")],["__new",w("为这门课新建学习进度","Create course progress")],
    ...semesters.flatMap(s=>s.courses.map(c=>[c.id,s.name+" / "+c.name]))];
  const body=`<div class="plan-editor-intro"><span class="plan-eyebrow">${w("任务与时间，分开管理","Tasks and time, connected")}</span>
    <p>${w("先核对要学什么，再安排什么时候学。预览中的内容可以直接修改；按下保存后才会写入。","Review what to study, then plan when. Edit the preview directly; nothing is written until you save.")}</p>
    <label>${w("学习任务保存到","Save study tasks to")}<select class="input" name="progressLink">${opts(links,course.courseId||suggestProgressCourse(course.name,semesters)?.id||"__new")}</select></label>
    <p class="plan-target-note"></p></div>
    <details class="plan-import" ${received?"open":""}><summary>${w("导入 ChatGPT 计划","Import a ChatGPT plan")}</summary>
      <p class="degree-help">${w("粘贴导入链接、JSON 或旧版四列清单。预览后可以修改、忽略或合并重复项。","Paste a link, JSON or legacy four-column list. Then edit, exclude or merge items in the preview.")}</p>
      <div class="degree-fields">${field(w("重复开始日期","Recurrence starts"),"rangeStart",range.start,"date")}${field(w("重复结束日期","Recurrence ends"),"rangeEnd",range.end,"date")}</div>
      ${field(w("停课日期，逗号分隔","Excluded dates, comma separated"),"excludeDates",range.exceptDates.join(", "))}
      <textarea class="input plan-paste" name="paste" rows="4" placeholder="JSON / https://…/#study-plan-v2=…"></textarea>
      <div class="degree-actions">${btn(w("生成可编辑预览","Preview & edit"),"preview")}${btn(w("复制给 ChatGPT 的导入要求","Copy instructions for ChatGPT"),"copy-format")}</div>
    </details>
    <p class="plan-error" role="alert"></p>
    <nav class="plan-section-nav" aria-label="${w("计划内容","Plan sections")}">${btn(w("1 · 学习任务","1 · Study tasks"),"pane-tasks")}${btn(w("2 · 学习时间安排","2 · Time plans"),"pane-events")}</nav>
    <div class="plan-preview"></div>
    <section class="plan-draft-section" data-plan-pane="tasks"><div class="plan-section-title"><div><h3>${w("这门课的学习任务","Course study tasks")}</h3><p class="degree-help">${w("这些任务就是学习进度里的同一份任务。完成状态与实际计时共用，不会再建一份副本。","These are the same tasks used by learning progress and the timer.")}</p></div>${btn(w("添加学习任务","Add task"),"add-task")}</div>
      <label class="plan-search">${w("查找现有任务","Find an existing task")}<input class="input" type="search" data-task-search placeholder="${w("任务名或章节","Task or chapter")}"></label><details class="plan-existing-tasks" open><summary>${w("查看 / 修改现有任务","View / edit existing tasks")}</summary><div class="plan-tasks"></div></details></section>
    <section class="plan-draft-section" data-plan-pane="events"><div class="plan-section-title"><div><h3>${w("学习时间安排","Time plans")}</h3><p class="degree-help">${w("例如周一晚上预留 2 小时。可关联一个内容任务，也可不关联；「已按计划执行」只记录这段安排的执行情况。","For example, reserve two hours on Monday evening. Linking a task is optional; execution is tracked separately.")}</p></div>${btn(w("添加时间安排","Add time plan"),"add-event")}</div><div class="plan-events"></div></section>`;
  const form=showDialog(course.name+" · "+w("学习计划","Study plan"),body,()=>save(),w("保存计划","Save plan"));
  let activeLink=form.elements.progressLink.value;
  const initialTarget=semesters.flatMap(stage=>stage.courses).find(target=>target.id===activeLink);
  if(initialTarget && initialTarget.id!==course.courseId)tasks=[...courseStudyTasks({...course,tasks:[],courseId:initialTarget.id,passTaskId:""},semesters),...tasks.filter(task=>!task.canonical)];
  const linkedDrafts=new Map([[activeLink,tasks.filter(task=>task.canonical).map(task=>({...task}))]]);
  form.noValidate=true;
  document.querySelector("#degreeDialog").classList.add("degree-study-plan-dialog");
  const timetable=document.createElement("button");timetable.type="button";timetable.className="btn secondary";timetable.dataset.planAction="save-schedule";timetable.textContent=w("保存并查看时间表","Save & view timetable");
  form.querySelector(".degree-dialog-footer").insertBefore(timetable,form.querySelector("[data-close]"));
  form.querySelector('[type="submit"]').onclick=()=>{destination="";};
  function readRange(){const q=key=>form.querySelector('[data-field="'+key+'"]').value;return {start:q("rangeStart"),end:q("rangeEnd"),exceptDates:q("excludeDates").split(/[,，\s]+/).filter(Boolean)};}
  function readNumber(input){if(input.validity.badInput)throw new Error(w("请输入有效的预计小时，未知可留空。","Enter valid hours or leave blank."));if(input.value==="")return null;const value=Number(input.value);if(!Number.isFinite(value)||value<0||value>1000)throw new Error(w("预计小时需在 0 到 1000 之间。","Hours must be between 0 and 1000."));return value;}
  function readTaskRow(row,task){for(const el of row.querySelectorAll("[data-field]")){
    if(el.validity?.badInput)throw new Error(w("请检查日期、时间或小时的输入。","Check the date, time or hours."));
    task[el.dataset.field]=el.type==="checkbox"?el.checked:el.dataset.field==="hours"?readNumber(el):el.value;
  }}
  function readEventRow(row,event){
    for(const el of row.querySelectorAll("[data-field]")){
      const key=el.dataset.field;if(["repeatUntil","weekdays","exceptDates","taskLink"].includes(key))continue;
      if(el.validity?.badInput)throw new Error(w("请检查日期、时间或小时的输入。","Check the date, time or hours."));
      event[key]=el.type==="checkbox"?el.checked:key==="hours"?readNumber(el):el.value;
    }
    const link=row.querySelector('[data-field="taskLink"]').value;
    event.taskId=link.startsWith("series:")?"":link;event.taskSeriesKey=link.startsWith("series:")?link.slice(7):"";
    const until=row.querySelector('[data-field="repeatUntil"]').value;
    event.repeat=until?{frequency:"weekly",until,weekdays:row.querySelector('[data-field="weekdays"]').value.split(/[,，\s]+/).filter(Boolean).map(Number),exceptDates:row.querySelector('[data-field="exceptDates"]').value.split(/[,，\s]+/).filter(Boolean)}:undefined;
  }
  function readRows(){
    for(const row of form.querySelectorAll("[data-task-row]"))readTaskRow(row,tasks.find(t=>t.id===row.dataset.taskRow));
    for(const row of form.querySelectorAll("[data-event-row]"))readEventRow(row,events.find(t=>t.id===row.dataset.eventRow));
    if(preview){
      for(const row of form.querySelectorAll("[data-review-task]")){
        const t=preview.tasks.find(t=>t.id===row.dataset.reviewTask);t.include=row.querySelector("[data-include]").checked;if(!t.include)continue;readTaskRow(row,t);
        const action=row.querySelector("[data-merge]").value;t.mergeIntoId=!["auto","copy"].includes(action)?action:"";t.forceNew=action==="copy";
      }
      for(const row of form.querySelectorAll("[data-review-event]")){
        const e=preview.events.find(e=>e.id===row.dataset.reviewEvent);e.include=row.querySelector("[data-include]").checked;if(!e.include)continue;readEventRow(row,e);
        const action=row.querySelector("[data-merge]").value;e.mergeIntoId=!["auto","copy"].includes(action)?action:"";e.forceNew=action==="copy";
      }
    }
  }
  function taskFields(t){
    return `<div class="plan-task-main">${field(w("任务名称","Task"),"title",t.title)}${field(w("章节 / 类型","Chapter / type"),"group",t.group)}${field(w("预计小时","Estimated hours"),"hours",t.hours??"","number",'min="0" step="any" placeholder="'+w("未估算","Unknown")+'"')}</div>
      <details class="plan-row-details"><summary>${w("说明、日期与完成状态","Details, dates and completion")}</summary>
      <div class="degree-fields">${field(w("所属周（待安排）","Flexible week"),"weekOf",t.weekOf,"date")}${field(w("截止日期","Deadline"),"deadline",t.deadline,"date")}
        ${field(w("计划日期（兼容已有安排）","Planned date"),"date",t.date,"date")}${field(w("开始","Start"),"startTime",t.startTime,"time")}${field(w("结束","End"),"endTime",t.endTime,"time")}</div>
      <label>${w("任务说明","Details")}<textarea class="input" data-field="detail" rows="2">${esc(t.detail)}</textarea></label>
      <label class="plan-check"><input type="checkbox" data-field="done" ${t.done?"checked":""}> ${w("内容任务已完成（同步学习进度）","Content task completed (sync progress)")}</label></details>`;
  }
  function taskLinks(selected){
    const available=[...tasks,...(preview?.tasks||[])];const seen=new Set(),series=new Map();
    const result=[["",w("不关联内容任务","No task association")]];
    for(const t of available){if(!seen.has(t.id)){result.push([t.id,describe(t)]);seen.add(t.id);}if(t.seriesKey)series.set(t.seriesKey,[t.group,t.title].filter(Boolean).join(" · "));}
    for(const [key,title] of series)result.push(["series:"+key,title+" · "+w("按周关联","match each week")]);
    if(selected&&!result.some(item=>item[0]===selected))result.push([selected,w("原关联任务不在此课程，请重新选择","Previous task is not in this course; choose again")]);
    return opts(result,selected);
  }
  function eventFields(e){
    const selected=e.taskSeriesKey?"series:"+e.taskSeriesKey:e.taskId||"";
    const executable=["study","class","workshop"].includes(e.type);
    return `<div class="plan-event-main">${field(w("安排名称","Time plan"),"title",e.title)}<label>${w("类型","Type")}<select class="input" data-field="type">${opts(types(),e.type)}</select></label>
      ${field(w("预计小时","Planned hours"),"hours",e.hours??"","number",'min="0" step="any" placeholder="'+w("未估算","Unknown")+'"')}</div>
      <div class="degree-fields">${field(w("日期（学习时段可待定）","Date (optional for study)"),"date",e.date,"date")}${field(w("时段备注，例如晚上","Period, e.g. evening"),"period",e.period)}
        ${field(w("开始时间（可选）","Start (optional)"),"startTime",e.startTime,"time")}${field(w("结束时间（可选）","End (optional)"),"endTime",e.endTime,"time")}</div>
      <label>${w("关联学习任务（可选）","Link a task (optional)")}<select class="input" data-field="taskLink">${taskLinks(selected)}</select></label>
      ${executable&&e.repeat?`<p class="degree-help">${w("已按计划执行 "+(e.completedDates||[]).length+" 次；每次可在时间表单独勾选。",(e.completedDates||[]).length+" occurrences executed; check each in the timetable.")}</p>`:executable?`<label class="plan-check execution-check"><input type="checkbox" data-field="executed" ${e.executed?"checked":""}> ${w("这段安排已按计划执行","This time plan was executed")}</label>`:""}
      <details class="plan-row-details"><summary>${w("重复、停课与详细说明","Recurrence, exceptions and details")}</summary><div class="degree-fields">
        ${field(w("所属周（日期待定时可选）","Flexible week"),"weekOf",e.weekOf,"date")}
        ${field(w("每周重复至（留空为一次）","Repeat weekly until"),"repeatUntil",e.repeat?.until,"date")}
        ${field(w("星期几：1 到 7，逗号分隔","Weekdays 1–7, comma separated"),"weekdays",(e.repeat?.weekdays||[e.date?new Date(e.date+"T12:00:00Z").getUTCDay()||7:1]).join(","))}</div>
        ${field(w("跳过日期，逗号分隔","Skip dates, comma separated"),"exceptDates",(e.repeat?.exceptDates||[]).join(", "))}
        <label>${w("说明","Details")}<textarea class="input" data-field="detail" rows="2">${esc(e.detail)}</textarea></label></details>`;
  }
  function draw(){
    const state=bridge.getState();
    form.querySelector(".plan-tasks").innerHTML=tasks.map(t=>`<article class="plan-edit-row plan-task-editor" data-task-row="${esc(t.id)}"><div class="plan-row-top"><span class="plan-row-badge">${t.canonical?w("学习进度任务","Progress task"):w("计划任务","Plan task")}</span><span>${esc(t.weekOf||t.date||w("待安排","Unscheduled"))} · ${w("实际","Actual")} ${taskActualHours(state,t.id).toFixed(1)} h</span>${btn(w("移除","Remove"),"delete-task")}</div>
      ${taskFields(t)}${t.canonical?btn(w("保存后计时","Save & start timer"),"timer"):""}</article>`).join("")||`<div class="plan-empty">${w("还没有内容任务。可以手动添加，或从 ChatGPT 导入后在这里预览。","No content tasks yet. Add one or import a ChatGPT plan.")}</div>`;
    form.querySelector(".plan-events").innerHTML=events.map(e=>`<article class="plan-edit-row" data-event-row="${esc(e.id)}"><div class="plan-row-top"><span class="plan-row-badge">${w("时间计划","Time plan")}</span>${btn(w("移除","Remove"),"delete-event")}</div>${eventFields(e)}</article>`).join("")||`<div class="plan-empty">${w("还没有安排学习时间。可以先写「周一晚上，预计 2 小时」，任务关联可留空。","No time plans yet. Reserve an evening and optional task association.")}</div>`;
    drawPreview();showPane();
    form.querySelector("[data-task-search]").dispatchEvent(new Event("input"));
    form.querySelector(".plan-target-note").textContent=form.elements.progressLink.value?w("确认后，学习任务会写入所选课程的学习进度；已有完成状态和计时会保留。","On save, tasks go to the selected course progress; existing completion and time are retained."):w("当前为独立任务。要同步到学习进度，请在上方选择课程。","Independent tasks. Select a course above to sync learning progress.");
  }
  function drawPreview(){
    const root=form.querySelector(".plan-preview");
    if(!preview){root.replaceChildren();return;}
    const selectedTasks=preview.tasks.filter(t=>t.include!==false),selectedEvents=preview.events.filter(e=>e.include!==false);
    const estimate=mergeImportedPlan(tasks,events,{tasks:selectedTasks,events:selectedEvents});
    root.innerHTML=`<div class="plan-preview-header"><span class="plan-eyebrow">${w("待确认导入 · 可直接编辑","Editable import preview")}</span>
      <strong>${w("新增 "+estimate.addedTasks+" 个任务，"+estimate.addedEvents+" 项时间安排；匹配的项目会合并。","Add "+estimate.addedTasks+" tasks and "+estimate.addedEvents+" time plans; matching items will merge.")}</strong>
      <span>${w("取消勾选即可忽略；重复项可以选择合并到已有任务。修改完点底部保存。","Uncheck to exclude; merge duplicates into existing tasks. Save when ready.")}</span></div>
      <div data-plan-pane="tasks" class="plan-review-tasks">${preview.tasks.map(t=>{
        const match=tasks.find(old=>old.id===t.mergeIntoId)||taskMatch(t,tasks),operation=t.mergeIntoId||(t.forceNew?"copy":match?.id||"auto");
        const similar=tasks.some(old=>old.title===t.title);
        return `<article class="plan-review-row ${t.include===false?"is-excluded":""}" data-review-task="${esc(t.id)}">
          <div class="plan-row-top"><label class="plan-check"><input type="checkbox" data-include ${t.include===false?"":"checked"}> ${w("导入这项任务","Import this task")}</label><span class="plan-row-badge ${match||similar?"possible-duplicate":""}">${match?w("匹配已有任务","Matches existing task"):similar?w("发现同名任务，请核对","Similar title; review"):w("新增任务","New task")}</span><span>${esc(t.weekOf?t.weekOf+" "+w("所在周 · 待安排","week · flexible"):t.date||w("日期待安排","Unscheduled"))}</span></div>
          ${taskFields(t)}<label>${w("重复项处理","Duplicate handling")}<select class="input" data-merge>${opts([["auto",w("自动合并 / 新增","Auto merge / add")],["copy",w("明确新增为另一项任务","Add as a separate task")],...tasks.map(old=>[old.id,w("合并到：","Merge into: ")+describe(old)])],operation)}</select></label></article>`;
      }).join("")||`<p class="degree-help">${w("本次没有内容任务。","No content tasks in this import.")}</p>`}</div>
      <div data-plan-pane="events" class="plan-review-events">${preview.events.map(e=>{
        const match=events.find(old=>old.importKey===e.importKey||old.id===e.mergeIntoId),operation=e.mergeIntoId||(e.forceNew?"copy":match?.id||"auto");
        return `<article class="plan-review-row ${e.include===false?"is-excluded":""}" data-review-event="${esc(e.id)}">
          <div class="plan-row-top"><label class="plan-check"><input type="checkbox" data-include ${e.include===false?"":"checked"}> ${w("导入这项安排","Import this time plan")}</label><span class="plan-row-badge">${match?w("更新已有安排","Update existing plan"):w("新增安排","New time plan")}</span></div>
          ${eventFields(e)}<label>${w("重复项处理","Duplicate handling")}<select class="input" data-merge>${opts([["auto",w("自动合并 / 新增","Auto merge / add")],["copy",w("明确新增为另一项安排","Add as a separate plan")],...events.map(old=>[old.id,w("合并到：","Merge into: ")+old.title+" · "+(old.date||old.weekOf||"")])],operation)}</select></label></article>`;
      }).join("")||`<p class="degree-help">${w("本次没有固定时段；有预计工时的任务仍可保留为待安排。","No fixed time plans; estimated tasks can remain flexible.")}</p>`}</div>`;
    for(const row of root.querySelectorAll(".is-excluded"))disableReview(row,true);
  }
  function refreshPreviewSummary(){
    if(!preview)return;
    readRows();
    const merged=mergeImportedPlan(tasks,events,{tasks:preview.tasks.filter(t=>t.include!==false),events:preview.events.filter(e=>e.include!==false)});
    const summary=form.querySelector(".plan-preview-header strong");
    if(summary)summary.textContent=w("新增 "+merged.addedTasks+" 个任务，"+merged.addedEvents+" 项时间安排；匹配的项目会合并.","Add "+merged.addedTasks+" tasks and "+merged.addedEvents+" time plans; matching items will merge.");
  }
  function disableReview(row,disabled){for(const el of row.querySelectorAll("input,select,textarea"))if(!el.hasAttribute("data-include"))el.disabled=disabled;row.classList.toggle("is-excluded",disabled);}
  function showPane(){
    for(const section of form.querySelectorAll("[data-plan-pane]"))section.hidden=section.dataset.planPane!==pane;
    for(const button of form.querySelectorAll(".plan-section-nav button"))button.setAttribute("aria-pressed",String(button.dataset.planAction==="pane-"+pane));
  }
  function showPreview(){
    try{
      readRows();const raw=form.elements.paste.value.trim();const hash=raw.match(/#study-plan-v[12]=[A-Za-z0-9_-]+/)?.[0];
      const input=hash?studyPlanFromLink(hash):raw.replace(/^```(?:json)?\s*|\s*```$/g,"").startsWith("{")?JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,"")):{tasks:raw};
      if(raw!==previewText.trim()&&input.period){if(input.period.start)form.querySelector('[data-field="rangeStart"]').value=input.period.start;if(input.period.end)form.querySelector('[data-field="rangeEnd"]').value=input.period.end;if(Array.isArray(input.period.exceptDates))form.querySelector('[data-field="excludeDates"]').value=input.period.exceptDates.join(", ");}
      preview=parseCoursePlan(input,course,plan,readRange());previewText=form.elements.paste.value;
      for(const t of preview.tasks){const match=taskMatch(t,tasks);t.include=true;t.mergeIntoId=match?.id||"";if(match)t.done=match.done===true;}
      for(const e of preview.events){const match=events.find(old=>old.importKey===e.importKey);e.include=true;e.mergeIntoId=match?.id||"";if(match){e.executed=match.executed===true;e.completedDates=[...(match.completedDates||[])];}}
      form.querySelector(".plan-error").textContent="";drawPreview();showPane();form.querySelector(".plan-existing-tasks").open=false;
      form.querySelector(".plan-preview").scrollIntoView({block:"nearest"});
    }catch(error){preview=null;form.querySelector(".plan-preview").replaceChildren();showError(w("无法预览，请检查格式和日期：","Check format and dates: ")+error.message);}
  }
  function selectedDraft(){
    readRows();
    if(form.elements.paste.value.trim()&&(!preview||form.elements.paste.value!==previewText))throw new Error(w("导入内容已变化，请先重新生成预览。","Import changed. Generate the preview again."));
    const imported=preview?{tasks:preview.tasks.filter(t=>t.include!==false),events:preview.events.filter(e=>e.include!==false)}:{tasks:[],events:[]};
    const merged=mergeImportedPlan(tasks,events,imported);
    for(const event of merged.events)if(event.taskId&&!merged.tasks.some(t=>t.id===event.taskId||t.importKey==="task:"+event.taskId))throw new Error(w("「"+event.title+"」关联的任务未选入。请勾选该任务，或将安排设为不关联。","The linked task for "+event.title+" is excluded. Include it or unlink the time plan."));
    return merged;
  }
  function persist(){
    const merged=selectedDraft();additions={tasks:merged.addedTasks,events:merged.addedEvents};
    bridge.saveCourseStudyPlan(course.id,{tasks:merged.tasks,events:merged.events,link:form.elements.progressLink.value,range:readRange(),replaceLinkedTasks:true});
    onSaved?.();return merged;
  }
  function save(){
    const merged=persist();
    if(destination==="schedule"){window.studyDegree.openSchedule(course.id,readRange().start);return;}
    setTimeout(()=>{
      const current=bridge.getDegreeWorkspace();const saved=current.plan?.modules.flatMap(m=>m.courses).find(c=>c.id===course.id);if(!saved)return;
      const count=courseStudyTasks(saved,current.semesters).length;
      const success=showDialog(w("学习计划已保存","Study plan saved"),`<div class="plan-save-success"><strong>${esc(course.name)}</strong><p>${w("当前有 "+count+" 个学习任务、"+merged.events.length+" 项时间安排 / 重要日期。","Saved "+count+" tasks and "+merged.events.length+" time plans / dates.")}</p><p>${w("本次新增 "+additions.tasks+" 个任务、"+additions.events+" 项安排；匹配项已合并。","Added "+additions.tasks+" tasks and "+additions.events+" time plans; matches merged.")}</p><p class="degree-help">${w("学习任务的完成与时间安排的执行已分开，预计小时也不会变成实际计时。","Content completion, plan execution and recorded time are separate.")}</p>${btn(w("查看时间计划","Open timetable"),"schedule")} ${saved.courseId?btn(w("查看学习进度","Open learning progress"),"progress"):""}</div>`,()=>{},w("完成","Done"));
      success.querySelector('[data-plan-action="schedule"]').onclick=()=>{document.querySelector("#degreeDialog").close();window.studyDegree.openSchedule(course.id,readRange().start);};
      const progress=success.querySelector('[data-plan-action="progress"]');if(progress)progress.onclick=()=>{document.querySelector("#degreeDialog").close();bridge.openCourseProgress(saved.courseId);};
      success.querySelector("[data-close]").textContent=w("关闭","Close");
    },0);
  }
  function showError(message){const error=form.querySelector(".plan-error");error.textContent=message;error.scrollIntoView({block:"nearest"});}
  form.addEventListener("click",event=>{
    const action=event.target.closest("[data-plan-action]")?.dataset.planAction;if(!action)return;
    try{
      if(action==="preview"){showPreview();return;}
      if(action==="copy-format"){
        const example={course:course.code||"",period:readRange(),tasks:[{id:"chapter-3",title:"学习第三章",group:"章节",hours:null}],
          events:[{id:"evening-session",type:"study",title:"晚间学习",date:readRange().start,period:"晚上",hours:2,taskId:"chapter-3"}]};
        const prompt="请按我们已确认的内容生成 StudyTracker v2 导入链接和原始 JSON。结构示例（替换为实际内容）："+JSON.stringify(example)+
          "\\n tasks 是学习进度里的内容任务；events 是时间安排。时段 type:study，可填 date、period（如晚上）、hours、可选 startTime/endTime；taskId 可关联 tasks 的稳定 id，不关联则留空。"+
          "预计工时未知用 null，不编造日期或工时。每周任务可用 repeat:{from,until,exceptDates:[]}，只保留每周工作量；重复日程用 repeat:{frequency:'weekly',weekdays:[1],until,exceptDates:[]}。"+
          "上课用 class，Workshop 用 workshop，重要日期用 milestone，截止日期用 deadline。替代课在原重复安排的 exceptDates 中排除。任务 id、事件 id 在更新时保持不变。不要给计划勾完成或生成实际计时。"+
          "请实际计算 JSON 的 UTF-8 Base64URL（去掉 =），反向解码校验，链接为 "+location.origin+"/#study-plan-v2=<encoded>。";
        navigator.clipboard.writeText(prompt).then(()=>{form.querySelector(".plan-error").textContent=w("已复制，可发给制定计划的 ChatGPT。","Copied for your planning chat.");}).catch(()=>showError(w("复制失败，请检查剪贴板权限。","Clipboard permission unavailable.")));return;
      }
      if(action==="save-schedule"){destination="schedule";form.requestSubmit();return;}
      if(action==="timer"){
        const id=event.target.closest("[data-task-row]").dataset.taskRow;persist();document.querySelector("#degreeDialog").close();bridge.startPlannedTaskTimer(course.id,id);return;
      }
      readRows();
      if(action.startsWith("pane-")){pane=action.slice(5);draw();const section=preview?form.querySelector(".plan-preview"):form.querySelector('.plan-draft-section[data-plan-pane="'+pane+'"]');section?.scrollIntoView({block:"start"});return;}
      if(action==="add-task"){tasks.push({id:crypto.randomUUID(),title:"",group:"",hours:null,done:false});pane="tasks";form.querySelector(".plan-existing-tasks").open=true;}
      if(action==="add-event"){events.push({id:crypto.randomUUID(),title:"",type:"study",date:"",weekOf:"",hours:null,period:"",executed:false});pane="events";}
      if(action==="delete-task"){const id=event.target.closest("[data-task-row]").dataset.taskRow;tasks=tasks.filter(t=>t.id!==id);for(const e of events)if(e.taskId===id)e.taskId="";}
      if(action==="delete-event")events=events.filter(e=>e.id!==event.target.closest("[data-event-row]").dataset.eventRow);
      draw();
    }catch(error){showError(error.message);}
  });
  form.addEventListener("change",event=>{
    const reviewTask=event.target.closest("[data-review-task]"),reviewEvent=event.target.closest("[data-review-event]");
    if(reviewTask && event.target.dataset.field==="done")preview.tasks.find(t=>t.id===reviewTask.dataset.reviewTask).doneEdited=true;
    if(reviewEvent && event.target.dataset.field==="executed")preview.events.find(e=>e.id===reviewEvent.dataset.reviewEvent).executionEdited=true;
    if(["type","repeatUntil"].includes(event.target.dataset.field)){try{readRows();draw();}catch(error){showError(error.message);}return;}
    if(event.target.matches("[data-include]")){disableReview(event.target.closest(".plan-review-row"),!event.target.checked);try{refreshPreviewSummary();}catch(error){showError(error.message);}return;}
    if(event.target.closest(".plan-review-row")){
      try{
        refreshPreviewSummary();
        if(reviewTask && event.target.matches("[data-merge]")){
          const task=preview.tasks.find(t=>t.id===reviewTask.dataset.reviewTask),target=tasks.find(t=>t.id===task.mergeIntoId);
          if(target&&!task.doneEdited){task.done=target.done===true;reviewTask.querySelector('[data-field="done"]').checked=task.done;}
        }
        if(reviewEvent && event.target.matches("[data-merge]")){
          const plan=preview.events.find(e=>e.id===reviewEvent.dataset.reviewEvent),target=events.find(e=>e.id===plan.mergeIntoId);
          if(target&&!plan.executionEdited){plan.executed=target.executed===true;const check=reviewEvent.querySelector('[data-field="executed"]');if(check)check.checked=plan.executed;}
        }
      }catch(error){showError(error.message);}return;
    }
    if(event.target.name==="progressLink"){
      try{
        readRows();linkedDrafts.set(activeLink,tasks.filter(task=>task.canonical).map(task=>({...task})));
        if(preview)for(const task of preview.tasks){task.targetLinks ||= {};task.targetLinks[activeLink]={id:task.mergeIntoId,forceNew:task.forceNew};}
        const local=tasks.filter(task=>!task.canonical),target=semesters.flatMap(s=>s.courses).find(c=>c.id===event.target.value);
        const linked=target ? linkedDrafts.get(target.id)||courseStudyTasks({...course,tasks:[],courseId:target.id,passTaskId:target.id===course.courseId?course.passTaskId:""},semesters) : [];
        tasks=[...linked.map(task=>({...task})),...local];activeLink=event.target.value;
        if(preview)for(const task of preview.tasks){
          const cached=task.targetLinks?.[activeLink];
          const match=cached?.id?tasks.find(old=>old.id===cached.id):taskMatch(task,tasks);
          task.mergeIntoId=match?.id||"";task.forceNew=cached?.forceNew===true;
          if(match&&!task.doneEdited)task.done=match.done===true;
        }
        draw();
      }catch(error){showError(error.message);}
    }
  });
  form.querySelector("[data-task-search]").addEventListener("input",event=>{const query=event.target.value.trim().toLowerCase();for(const row of form.querySelectorAll("[data-task-row]")){const t=tasks.find(t=>t.id===row.dataset.taskRow);const title=row.querySelector('[data-field="title"]').value,group=row.querySelector('[data-field="group"]').value;row.hidden=!(title+" "+group+" "+(t.weekOf||"")).toLowerCase().includes(query);}});
  draw();
  if(received){form.elements.paste.value=typeof received.tasks==="string"?received.tasks:JSON.stringify(received,null,2);showPreview();form.querySelector(".plan-import").open=false;}
}
