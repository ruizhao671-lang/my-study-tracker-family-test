import {itemChanges} from "./study-plan-update-core.js";
import {coursePlanVersions,coursePlanRestorePreview,captureCoursePlan} from "./study-plan-history.js";
const en=()=>window.studyI18n?.getLanguage?.()==="en";
const w=(zh,english)=>en()?english:zh;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
export function changeTable(changes,taskNames={}){
  if(!changes.length)return `<p class="plan-diff-empty">${w("内容未变化","No content changes")}</p>`;
  const label=key=>({schedulingMode:w("安排方式","Scheduling"),title:w("名称","Title"),group:w("分类","Category"),detail:w("说明","Details"),hours:w("预计小时","Estimated hours"),
    date:w("日期","Date"),weekOf:w("完成周","Completion week"),deadline:w("期限","Deadline"),windowStart:w("范围开始","Window starts"),windowEnd:w("范围结束","Window ends"),teachingWeek:w("课程周次","Course week"),
    startTime:w("开始","Starts"),endTime:w("结束","Ends"),type:w("安排类型","Event type"),period:w("时段备注","Period"),taskId:w("关联任务","Linked task"),taskSeriesKey:w("按周关联任务","Weekly task association"),range:w("计划日期范围","Plan date range"),repeat:w("重复规则","Recurrence"),done:w("完成状态","Completion"),executed:w("执行状态","Execution")})[key]||key;

  const value=(v,key)=>{
    if(key==="schedulingMode"&&!v)return w("跟随日程类型","Follow session type");
    if(v===null||v===undefined||v==="")return w("空 / 未设置","Empty / unset");
    if(key==="schedulingMode")return v==="fixed"?w("固定时间","Fixed time"):w("自由安排","Flexible");
    if(key==="taskId")return taskNames[v]||w("关联任务（见任务列表）","Linked task (see task list)");
    if(key==="taskSeriesKey")return String(v).replace(/^task:/,"");
    if(key==="repeat"&&typeof v==="object"){
      const days=(v.weekdays||[]).map(day=>(en()?["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]:["周一","周二","周三","周四","周五","周六","周日"])[day-1]).join("、");
      return [w("每周 ","Weekly ")+days,w("截止 ","Until ")+(v.until||"—"),v.exceptDates?.length?w("排除：","Except: ")+v.exceptDates.join(", "):""].filter(Boolean).join(" · ");
    }
    if(key==="range"&&typeof v==="object")return [v.start+" — "+v.end,v.exceptDates?.length?w("排除：","Except: ")+v.exceptDates.join(", "):""].filter(Boolean).join(" · ");
    return typeof v==="boolean"?(v?w("是","Yes"):w("否","No")):typeof v==="object"?JSON.stringify(v):String(v);
  };
  return `<div class="plan-diff-scroll"><table class="plan-diff-table"><thead><tr><th>${w("字段","Field")}</th><th>${w("原内容","Previous")}</th><th>${w("新内容","Proposed")}</th></tr></thead><tbody>${changes.map(c=>`<tr><th>${esc(label(c.field))}</th><td>${esc(value(c.before,c.field))}</td><td>${esc(value(c.after,c.field))}</td></tr>`).join("")}</tbody></table></div>`;
}

export function decisionReview(item,previous,kind="task",taskNames={}){
  const changes=previous?itemChanges(previous,item,kind):[];
  return `${previous?changeTable(changes,taskNames):`<p class="plan-diff-empty">${w("新 ID：追加此项，已有内容保留。","New ID: append this item and keep existing data.")}</p>`}
    ${changes.length?`<label class="plan-conflict-choice">${w("请确认这一项的变更","Confirm this item's changes")}<select class="input" data-conflict-choice>
      <option value="" ${!item.decision?"selected":""}>${w("请选择：采用修改或保留原内容","Choose: apply changes or keep previous")}</option>
      <option value="apply" ${item.decision==="apply"?"selected":""}>${w("采用上方修改","Apply the proposed changes")}</option>
      <option value="keep" ${item.decision==="keep"?"selected":""}>${w("保留原内容","Keep previous content")}</option></select></label>`:""}`;
}

export function historyPanel(state,courseId,selected=""){
  const course=state.degreePlan.modules.flatMap(m=>m.courses).find(c=>c.id===courseId),versions=coursePlanVersions(course);
  if(!versions.length)return `<div class="plan-empty">${w("下一次保存计划时会自动记录修改前后的版本。已有计划和进度不会改变。","The next plan save will record before/after versions without changing existing progress.")}</div>`;
  let preview="";
  if(selected){
    const current=captureCoursePlan(state,courseId),version=versions.find(v=>v.id===selected);
    const restore=coursePlanRestorePreview(state,courseId,selected);
    const taskNames=Object.fromEntries([...current.tasks,...restore.tasks].map(t=>[t.id,t.title]));
    const groups=[];
    for(const key of ["tasks","events"]){
      const old=new Map(current[key].map(t=>[t.id,t]));
      for(const item of restore[key]){
        const previous=old.get(item.id),changes=itemChanges(previous||{},item,key==="tasks"?"task":"event");
        if(!previous||changes.length)groups.push(`<article class="plan-history-change"><strong>${esc(item.title)}</strong>${previous?changeTable(changes,taskNames):`<p>${w("恢复此项","Restore this item")}</p>`}</article>`);
      }
      for(const id of restore.changes[key].remove){const item=old.get(id);groups.push(`<article class="plan-history-change"><strong>${esc(item.title)}</strong><p>${w("移除此版本中不存在且无新增学习记录的项目","Remove this item, absent from this version and without protected learning activity")}</p></article>`);}
    }
    if(JSON.stringify(current.range)!==JSON.stringify(restore.range))groups.push(changeTable([{field:"range",before:current.range,after:restore.range}]));
    preview=`<div class="plan-history-preview"><h4>${w("与当前计划比较","Compare with current plan")} · ${esc(new Date(version.createdAt).toLocaleString())}</h4>${groups.join("")||`<p>${w("计划内容相同","Plan content is identical")}</p>`}
      <p class="degree-help">${w("实际计时、完成状态、备注附件及当前学习进度关联保留。有学习记录的新增任务会保留：","Actual time, completion, notes, attachments and current progress association stay intact. Protected added tasks kept: ")}${restore.keptTasks}</p>
      <label class="plan-check"><input type="checkbox" data-confirm-restore>${w("确认恢复计划内容，放弃当前未保存草稿；保留学习记录","Restore plan content and discard unsaved draft; keep learning records")}</label>
      <button type="button" class="btn" data-plan-action="restore-history" data-version-id="${esc(selected)}">${w("恢复此版本","Restore this version")}</button></div>`;
  }
  return `<p class="degree-help">${w("最近版本随账号保存（最多 20 个，按容量保留）。恢复有改动时会创建新版本，当前学习记录不会倒退。","Recent versions sync with your account (up to 20, subject to storage). Restoring creates another version and keeps learning records.")}</p>
    <div class="plan-history-list">${[...versions].reverse().map(v=>`<button type="button" class="btn secondary" data-plan-action="compare-history" data-version-id="${esc(v.id)}">${esc(new Date(v.createdAt).toLocaleString())} · ${esc(v.label)} · ${v.snapshot.tasks.length} ${w("任务","tasks")}</button>`).join("")}</div>${preview}`;
}
