import { suggestProgressCourse } from "./degree-core.js";
import { courseStudyTasks, parseCoursePlan, mergeImportedPlan, scheduleOccurrences, taskActualHours, addPlanDays, planWeek } from "./study-plan-core.js";

const en = () => window.studyI18n?.getLanguage?.() === "en";
const w = (zh, english) => en() ? english : zh;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
const today = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-"); };
const btn = (label, action) => `<button type="button" class="btn secondary" data-plan-action="${action}">${esc(label)}</button>`;
const input = (label, key, value="", type="text", extra="") => `<label>${esc(label)}<input class="input" type="${type}" data-field="${key}" value="${esc(value)}" ${extra}></label>`;
const opts = (items, value) => items.map(([id,label]) => `<option value="${esc(id)}" ${id===value?"selected":""}>${esc(label)}</option>`).join("");
const types = () => [["class",w("上课","Class")],["workshop","Workshop"],["milestone",w("重要日期","Milestone")],["deadline",w("截止日期","Deadline")],["study",w("学习时段","Study")]];
const hours = h => h == null ? w("未估算","Not estimated") : h + " h";

function initialRange(course, plan, received) {
  const start = received?.period?.start || course.planRange?.start || today();
  let end = received?.period?.end || course.planRange?.end;
  if (!end && typeof received?.tasks === "string") {
    const final = [...received.tasks.matchAll(/(\d{1,2})月(\d{1,2})日[^；;）)\n]*(?:最终|结束|final)/gi)].at(-1);
    if (final) { end = start.slice(0,4)+"-"+final[1].padStart(2,"0")+"-"+final[2].padStart(2,"0"); if (end < start) end = String(Number(start.slice(0,4))+1)+end.slice(4); }
  }
  end ||= plan.blocks.find(b => b.id===course.blockId && b.end>=start)?.end || addPlanDays(start,90);
  return {start, end, exceptDates: course.planRange?.exceptDates || received?.period?.exceptDates || []};
}

export function openPlanEditor({course,plan,semesters,received,showDialog,bridge,onSaved}) {
  let tasks = courseStudyTasks(course,semesters).map(t => ({...t}));
  let events = structuredClone(course.planEvents || []);
  const range = initialRange(course,plan,received);
  let preview = null;
  let additions = null;
  let previewText = "";
  const links = [["",w("独立计划，不关联进度","Independent plan")],["__new",w("新建这门课的学习记录","Create progress record for this course")],
    ...semesters.flatMap(s=>s.courses.map(c=>[c.id,s.name+" / "+c.name]))];
  const body = `<p class="degree-help">${w("任务与学习进度共用完成状态；预计工时与实际计时分别记录。保存后可直接查看时间表和学习进度。","Tasks share progress status. Estimates and recorded time stay separate. Open the timetable or progress after saving.")}</p>
    <label>${w("关联学习进度","Link learning progress")}<select class="input" name="progressLink">${opts(links,course.courseId || suggestProgressCourse(course.name,semesters)?.id || "__new")}</select></label>
    <details class="plan-import" ${received ? "open" : ""}><summary>${w("从 ChatGPT 导入计划","Import a ChatGPT plan")}</summary>
      <p class="degree-help">${w("支持旧版四列文本和 v2 JSON。每周任务未指定日期时，只放入该周待安排列表。请确认重复范围；只跳过你填写的停课日期。","Supports four-column text and v2 JSON. Flexible weekly tasks remain unscheduled. Confirm recurrence dates and explicit holidays.")}</p>
      <div class="degree-fields">${input(w("开始日期","Start"),"rangeStart",range.start,"date")}${input(w("结束日期（含当天）","End (inclusive)"),"rangeEnd",range.end,"date")}</div>
      ${input(w("停课日期，用逗号分隔","Excluded dates, comma separated"),"excludeDates",range.exceptDates.join(", "))}
      <textarea class="input plan-paste" name="paste" rows="5" placeholder="时间块 | 章节或类型 | 任务 | 预计小时"></textarea>
      ${btn(w("预览导入","Preview import"),"preview")} ${btn(w("复制给 ChatGPT 的导入要求","Copy import instructions for ChatGPT"),"copy-format")}<p class="plan-error" role="alert"></p><div class="plan-preview"></div>
    </details>
    <section><h3>${w("时间安排","Schedule")}</h3><p class="degree-help">${w("固定上课、重复安排、Workshop 和重要日期，不会当作已完成的学习任务。","Classes, recurring events and milestones are separate from task completion.")}</p><div class="plan-events"></div>${btn(w("添加时间安排","Add event"),"add-event")}</section>
    <section><h3>${w("内容任务","Study tasks")}</h3><p class="degree-help">${w("未填写日期＝待安排；未知预计小时留空。开始计时只记录实际时间，不会自动完成任务。","Blank date means unscheduled. Leave unknown estimates blank. Timing never automatically completes a task.")}</p><div class="plan-tasks"></div>${btn(w("添加任务","Add task"),"add-task")}</section>`;
  const form = showDialog(course.name+" · "+w("学习计划","Study plan"), body, () => {
    readRows();
    if (preview && form.elements.paste.value===previewText) { const merged = mergeImportedPlan(tasks,events,preview); additions={tasks:merged.addedTasks,events:merged.addedEvents}; tasks=merged.tasks; events=merged.events; }
    else if (form.elements.paste.value.trim() && form.elements.paste.value !== previewText) throw new Error(w("请先预览当前导入内容。","Preview the current import first."));
    const plannedRange = readRange();
    bridge.saveCourseStudyPlan(course.id,{tasks,events,link:form.elements.progressLink.value,range:plannedRange});
    onSaved?.();
    setTimeout(() => {
      const current = bridge.getDegreeWorkspace().plan?.modules.flatMap(m=>m.courses).find(c=>c.id===course.id);
      if (!current) return;
      const savedTasks=courseStudyTasks(current,bridge.getDegreeWorkspace().semesters);
      const dates = events.filter(e=>e.type==="deadline" || e.type==="milestone").length;
      const schedules = events.filter(e=>e.type!=="deadline" && e.type!=="milestone").reduce((n,e)=>n+scheduleOccurrences(e,plannedRange.start,plannedRange.end).length,0);
      const success = showDialog(w("学习计划已保存","Study plan saved"),`<p>${esc(course.name)}</p><p>${w("当前共 "+schedules+" 个课程/学习时段、"+savedTasks.length+" 个学习任务、"+dates+" 个重要/截止日期。","Saved: "+schedules+" scheduled occurrences, "+savedTasks.length+" tasks, "+dates+" milestones/deadlines.")}</p>
        ${additions ? `<p>${w("本次导入新增 "+additions.tasks+" 个任务、"+additions.events+" 条安排/日期规则；已有匹配内容已合并。","This import added "+additions.tasks+" tasks and "+additions.events+" event/date rules; matches were merged.")}</p>` : ""}
        <p class="degree-help">${current.courseId ? w("任务已经写入这门课的学习进度，后续只需维护同一份数据。","Tasks are saved in the linked course progress.") : w("当前为独立计划，可随时在学习计划里选择关联进度。","This plan is independent. You can link progress later.")}</p>
        ${btn(w("查看时间计划","Open timetable"),"schedule")} ${current.courseId ? btn(w("查看学习进度","Open learning progress"),"progress") : ""}`,()=>{},w("完成","Done"));
      success.querySelector('[data-plan-action="schedule"]').onclick = () => { document.querySelector("#degreeDialog").close(); window.studyDegree.openSchedule(course.id,plannedRange.start); };
      success.querySelector("[data-close]").textContent=w("关闭","Close");
      const progress=success.querySelector('[data-plan-action="progress"]');
      if(progress) progress.onclick=()=>{document.querySelector("#degreeDialog").close();bridge.openCourseProgress(current.courseId);};
    },0);
  },w("保存计划","Save plan"));
  document.querySelector("#degreeDialog").classList.add("degree-study-plan-dialog");
  function readRange() { const q = key=>form.querySelector('[data-field="'+key+'"]').value;
    return {start:q("rangeStart"),end:q("rangeEnd"),exceptDates:q("excludeDates").split(/[,，\s]+/).filter(Boolean)}; }
  function readRows() {
    for(const row of form.querySelectorAll("[data-task-row]")) {
      const task=tasks.find(t=>t.id===row.dataset.taskRow);
      for(const el of row.querySelectorAll("[data-field]")) task[el.dataset.field]=el.type==="checkbox"?el.checked:el.dataset.field==="hours"?(el.value===""?null:Number(el.value)):el.value;
    }
    for(const row of form.querySelectorAll("[data-event-row]")) {
      const event=events.find(t=>t.id===row.dataset.eventRow);
      for(const el of row.querySelectorAll("[data-field]")) {
        if(!["repeatUntil","weekdays","exceptDates"].includes(el.dataset.field)) event[el.dataset.field]=el.value;
      }
      const until=row.querySelector('[data-field="repeatUntil"]').value;
      event.repeat=until ? {frequency:"weekly",until,weekdays:row.querySelector('[data-field="weekdays"]').value.split(/[,，\s]+/).filter(Boolean).map(Number),
        exceptDates:row.querySelector('[data-field="exceptDates"]').value.split(/[,，\s]+/).filter(Boolean)} : undefined;
    }
  }
  function draw() {
    const state=bridge.getState();
    form.querySelector(".plan-tasks").innerHTML=tasks.map(t=>`<article class="plan-edit-row" data-task-row="${esc(t.id)}">
      <div class="degree-row"><label><input type="checkbox" data-field="done" ${t.done?"checked":""}> ${w("完成","Done")}</label><span>${t.weekOf?w("本周待安排：","Week of ")+esc(t.weekOf):""} · ${w("实际","Actual")} ${taskActualHours(state,t.id).toFixed(1)} h</span>${btn("×","delete-task")}</div>
      ${input(w("任务名称","Task"),"title",t.title)}
      <div class="degree-fields">${input(w("章节或类型","Chapter / type"),"group",t.group)}${input(w("预计小时","Estimated hours"),"hours",t.hours??"","number",'min="0" step="0.25"')}</div>
      <details><summary>${w("安排日期、时间与详细内容","Dates, times and details")}</summary>
      <div class="degree-fields">${input(w("计划日期（可选）","Planned date"),"date",t.date,"date")}${input(w("截止日期（可选）","Deadline"),"deadline",t.deadline,"date")}
      ${input(w("开始","Start"),"startTime",t.startTime,"time")}${input(w("结束","End"),"endTime",t.endTime,"time")}
      ${input(w("所属周（只预留工作量）","Week of (flexible workload)"),"weekOf",t.weekOf,"date")}
      <label>${w("时间块（可选）","Study period")}<select class="input" data-field="blockId">${opts([["",w("跟随课程","Follow course")],...plan.blocks.map(b=>[b.id,b.name])],t.blockId||"")}</select></label></div>
      <label>${w("任务说明","Details")}<textarea class="input" data-field="detail" rows="2">${esc(t.detail)}</textarea></label></details>
      ${t.canonical ? btn(w("开始计时","Start timer"),"timer") : ""}</article>`).join("") || `<p class="degree-help">${w("还没有内容任务。可以导入或手动添加。","No tasks yet. Import or add one.")}</p>`;
    form.querySelector(".plan-events").innerHTML=events.map(e=>`<article class="plan-edit-row" data-event-row="${esc(e.id)}">
      <div class="degree-row"><strong>${esc(types().find(t=>t[0]===e.type)?.[1])}</strong>${btn("×","delete-event")}</div>
      ${input(w("安排名称","Event"),"title",e.title)}
      <div class="degree-fields"><label>${w("类型","Type")}<select class="input" data-field="type">${opts(types(),e.type)}</select></label>
      ${input(w("日期 / 重复开始","Date / recurrence start"),"date",e.date,"date")}${input(w("开始","Start"),"startTime",e.startTime,"time")}${input(w("结束","End"),"endTime",e.endTime,"time")}</div>
      <details ${e.repeat?"open":""}><summary>${w("重复与关联","Recurrence and links")}</summary>
      <div class="degree-fields">${input(w("每周重复至（留空＝一次）","Repeat weekly until (blank = once)"),"repeatUntil",e.repeat?.until,"date")}
      ${input(w("星期几（1至7，用逗号分隔）","Weekdays (1–7, comma separated)"),"weekdays",(e.repeat?.weekdays || [new Date(e.date+"T12:00:00Z").getUTCDay()||7]).join(","))}</div>
      ${input(w("跳过日期（假期、替代课）","Skip dates (holidays, replacements)"),"exceptDates",(e.repeat?.exceptDates||[]).join(", "))}
      <label>${w("关联内容任务（可选）","Linked task")}<select class="input" data-field="taskId">${opts([["",w("不关联","No link")],...tasks.map(t=>[t.id,t.title])],e.taskId||"")}</select></label></details>
      <label>${w("说明","Details")}<textarea class="input" data-field="detail" rows="2">${esc(e.detail)}</textarea></label></article>`).join("") || `<p class="degree-help">${w("还没有固定时间安排。","No scheduled events yet.")}</p>`;
  }
  function showPreview() {
    const error=form.querySelector(".plan-error");
    try {
      readRows();
      const raw=form.elements.paste.value.trim();
      const input=raw.startsWith("{")?JSON.parse(raw):{tasks:raw};
      if(raw!==previewText.trim() && input.period){
        if(input.period.start)form.querySelector('[data-field="rangeStart"]').value=input.period.start;
        if(input.period.end)form.querySelector('[data-field="rangeEnd"]').value=input.period.end;
        if(Array.isArray(input.period.exceptDates))form.querySelector('[data-field="excludeDates"]').value=input.period.exceptDates.join(", ");
      }
      preview=parseCoursePlan(input,course,plan,readRange());
      previewText=form.elements.paste.value;
      const merged=mergeImportedPlan(tasks,events,preview);
      const current=readRange();
      const occurrences=preview.events.flatMap(e=>scheduleOccurrences(e,current.start,current.end)).sort((a,b)=>a.date.localeCompare(b.date));
      form.querySelector(".plan-preview").innerHTML=`<strong>${w("预览成功。保存时新增 ","Preview ready. On save add ")}${merged.addedTasks} ${w("个任务，","tasks, ")}${merged.addedEvents} ${w("条安排规则。相同内容不会重复添加。","event rules. Matching entries are merged.")}</strong>${merged.convertedTasks ? `<p>${w("将 "+merged.convertedTasks+" 个旧文字日程转成时间安排，保留原完成状态，不再重复列为内容任务。",merged.convertedTasks+" legacy schedule rows become events, keeping their original status.")}</p>` : ""}
        <ul>${occurrences.map(e=>`<li>${esc(e.date+" "+(e.startTime||"")+" "+e.title)}</li>`).join("")}</ul>
        <ul>${preview.tasks.map(t=>`<li>${esc(t.date || (t.weekOf ? t.weekOf+" "+w("所在周 · 待安排","week · flexible") : w("待安排","Unscheduled")))} · ${esc(t.title)} · ${esc(hours(t.hours))}</li>`).join("")}</ul>`;
      error.textContent="";
    } catch(reason) { preview=null; form.querySelector(".plan-preview").replaceChildren(); error.textContent=w("无法预览，请检查日期范围和输入格式：","Check dates and format: ")+reason.message; }
  }
  form.addEventListener("click",event=>{
    const action=event.target.closest("[data-plan-action]")?.dataset.planAction;
    if(!action)return;
    if(action==="preview"){showPreview();return;}
    if(action==="copy-format"){
      const format={course:course.code||"",period:readRange(),tasks:[{id:"stable-task-id",title:"任务名称",group:"章节或类型",hours:null,date:"",deadline:""}],
        events:[{id:"stable-event-id",title:"上课",type:"class",date:readRange().start,startTime:"13:15",endTime:"16:15",
          repeat:{frequency:"weekly",weekdays:[3],until:readRange().end,exceptDates:[]}}]};
      const instructions="请根据我们已确认的学习计划生成 StudyTracker v2 导入链接。不要编造日期或预计工时。以下仅为结构示例，请替换为我的实际计划："+JSON.stringify(format)+
        "\n任务 hours 未知用 null；没有确定日期的任务不填 date/startTime/endTime。每周未安排到具体日期的工作量用 task.repeat={from,until,exceptDates:[]}，exceptDates 为周一日期；"+
        "event.repeat.exceptDates 用具体停课日。截止日期用 task.deadline 或 type:deadline 的 event。事件可通过 taskId 关联同一任务，避免重复安排同一时段。"+
        "每条任务/事件使用稳定 id，便于再次导入更新。把 JSON 的 UTF-8 字节编码成无填充 Base64URL，链接为 "+location.origin+"/#study-plan-v2=<encoded>。同时给我可复制的 JSON。";
      navigator.clipboard.writeText(instructions).then(()=>{form.querySelector(".plan-error").textContent=w("已复制，可以发给制定计划的 ChatGPT 聊天。","Copied. Paste it into your planning chat.");})
        .catch(()=>{form.querySelector(".plan-error").textContent=w("复制失败，请检查浏览器剪贴板权限。","Copy failed. Check clipboard permissions.");});
      return;
    }
    if(action==="timer"){
      const task=tasks.find(t=>t.id===event.target.closest("[data-task-row]").dataset.taskRow);
      try{
        readRows();
        if(preview && form.elements.paste.value===previewText){const merged=mergeImportedPlan(tasks,events,preview);tasks=merged.tasks;events=merged.events;}
        else if(form.elements.paste.value.trim() && form.elements.paste.value!==previewText)throw new Error(w("请先预览当前导入内容。","Preview the current import first."));
        bridge.saveCourseStudyPlan(course.id,{tasks,events,link:form.elements.progressLink.value,range:readRange()});
        onSaved?.();
        document.querySelector("#degreeDialog").close();bridge.startPlannedTaskTimer(course.id,task.id);
      }catch(error){const status=form.querySelector(".plan-error");status.textContent=error.message;status.scrollIntoView({block:"nearest"});}
      return;
    }
    readRows();
    if(action==="add-task")tasks.push({id:crypto.randomUUID(),title:"",group:"",hours:null,date:"",done:false});
    if(action==="add-event")events.push({id:crypto.randomUUID(),title:"",type:"study",date:today(),startTime:"",endTime:""});
    if(action==="delete-task"){const id=event.target.closest("[data-task-row]").dataset.taskRow;tasks=tasks.filter(t=>t.id!==id);for(const e of events)if(e.taskId===id)e.taskId="";}
    if(action==="delete-event")events=events.filter(e=>e.id!==event.target.closest("[data-event-row]").dataset.eventRow);
    draw();
  });
  draw();
  if(received){form.elements.paste.value=typeof received.tasks==="string"?received.tasks:JSON.stringify(received,null,2);showPreview();}
}
