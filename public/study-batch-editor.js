import {weeklyCategories,weeklyPlannerCategories,previewWeeklyRule,weeklyConflicts,weeklyRowsOverlap} from "./study-batch-core.js";
import {addPlanDays,planWeek,studyTaskItems,validPlanDate} from "./study-plan-core.js";
import {scheduleCourses} from "./study-workspace.js";
const en=()=>window.studyI18n?.getLanguage?.()==="en";
const w=(zh,english)=>en()?english:zh;
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const options=(items,value)=>items.map(([id,label])=>`<option value="${esc(id)}" ${id===value?"selected":""}>${esc(label)}</option>`).join("");
const dayLabel=n=>[w("周一","Monday"),w("周二","Tuesday"),w("周三","Wednesday"),w("周四","Thursday"),w("周五","Friday"),w("周六","Saturday"),w("周日","Sunday")][n-1]||"";
const field=(label,key,value,type="text")=>`<label>${esc(label)}<input class="input" name="${key}" type="${type}" value="${esc(value)}" required></label>`;
export function openWeeklyPlanner({bridge,showDialog,date,courseId="",categoryId="",preset={}}){
  const state=bridge.getState(),categories=weeklyPlannerCategories(state),allCourses=scheduleCourses(state),courses=allCourses.filter(c=>categories.some(g=>g.courseId===c.id));
  const requested=allCourses.find(c=>c.id===courseId),requestedCategory=weeklyCategories(state,courseId).find(c=>c.categoryId===categoryId);
  if(!courses.length||requested&&!courses.some(c=>c.id===requested.id)||requestedCategory&&!categories.some(c=>c.courseId===requestedCategory.courseId&&c.categoryId===requestedCategory.categoryId)){
    const target=requested||allCourses[0];
    const fixed=requestedCategory?.count>0;
    showDialog(w("没有可自由安排的任务","No flexible tasks to schedule"),`<p>${w(fixed?"这个分类的任务都是固定时间课程，请在日历中修改上课安排。":"当前没有可自由安排的任务。固定课程在日历中维护，空分类需要先添加任务。",fixed?"This category contains fixed classes. Edit their time on the calendar.":"There are no flexible tasks here. Manage fixed classes on the calendar, or add tasks to an empty category.")}</p>`,()=>{if(target)window.studyDegree.openSchedule(target.id,date);},target?w("查看课程时间表","Open course timetable"):w("知道了","OK"));
    return;
  }
  let course=courses.find(c=>c.id===courseId)||courses[0],rule=null,preview=null,rows=[],selectedTaskIds=null,draftId=crypto.randomUUID();
  const manualOverrides=new Map();
  const form=showDialog(w("分类每周安排","Schedule a category weekly"),`
    <p class="degree-help">${w("按勾选任务的原顺序，每周安排一项；取消勾选会自动向前补位。每次保存是独立的一次安排。","Selected tasks follow their progress-list order, one per week. Unchecking a task fills the gap automatically. Each save is a separate batch.")}</p><p class="degree-help">${w("这里只安排自由任务；固定课程请点日历时间块修改。","This schedules flexible tasks. Edit fixed classes directly on the calendar.")}</p>
    <div class="degree-fields" data-weekly-config>
      <label>${w("课程","Course")}<select class="input" name="courseId">${options(courses.map(c=>[c.id,c.name]),course.id)}</select></label>
      <label>${w("分类","Category")}<select class="input" name="categoryId"></select></label>
      <label>${w("复用时间设置","Reuse time settings")}<select class="input" name="ruleId"></select></label>
      <label>${w("从哪个任务开始","First task")}<select class="input" name="startTaskId" required></select><small data-weekly-empty role="status"></small></label>
      ${field(w("从哪一周开始（选该周任意一天）","First week (any date in that week)"),"fromWeek",planWeek(date),"date")}
      ${field(w("到哪一周结束","Last week"),"untilWeek",addPlanDays(planWeek(date),84),"date")}
      <label>${w("每周","Every week")}<select class="input" name="weekday">${options([1,2,3,4,5,6,7].map((n,i)=>[String(n),[w("周一","Monday"),w("周二","Tuesday"),w("周三","Wednesday"),w("周四","Thursday"),w("周五","Friday"),w("周六","Saturday"),w("周日","Sunday")][i]]),"3")}</select></label>
      ${field(w("开始时间","Start"),"startTime","19:00","time")}${field(w("结束时间","End"),"endTime","21:00","time")}
    </div>
    <details class="plan-row-details" data-weekly-config><summary>${w("更多设置","More settings")}</summary>
      <label>${w("跳过这些周（日期，逗号分隔）","Skip these weeks (dates, comma separated)")}<input class="input" name="skipWeeks"></label>
      <label class="plan-check"><input type="checkbox" name="enabled">${w("以后新增同类任务也延续这条规则；冲突时留待安排","Apply this rule to future tasks too; leave conflicts unscheduled")}</label>
    </details>
    <div class="degree-actions"><button class="btn secondary" type="button" data-weekly-preview>${w("预览每周安排","Preview weekly sessions")}</button><span class="degree-help" data-weekly-hint></span></div>
    <p class="degree-help" data-weekly-error role="alert"></p><div class="weekly-preview" data-weekly-results aria-live="polite"></div>
  `,()=>{
    if(!preview)throw new Error(w("请先预览。","Preview first."));
    readRows();
    const accepted=form.querySelector("[data-weekly-confirm]")?.checked;
    const result=bridge.applyWeeklyRule(course.id,{...preview.rule,selectedTaskIds:rows.filter(r=>r.include&&!r.blocked).map(r=>r.taskId)},rows.filter(r=>r.include&&!r.blocked).map(r=>({...r,confirmConflicts:accepted===true})));
    bridge.showToast(w("已安排 "+result.count+" 项；待安排区已同步。","Scheduled "+result.count+" tasks; the pending area is updated."));
  },w("保存每周安排","Save weekly sessions"));
  const results=form.querySelector("[data-weekly-results]"),error=form.querySelector("[data-weekly-error]"),hint=form.querySelector("[data-weekly-hint]"),submit=form.querySelector('[type="submit"]');
  submit.disabled=true;
  function reset(clear=false){if(preview)readRows();if(clear){selectedTaskIds=null;manualOverrides.clear();}preview=null;rows=[];submit.disabled=true;results.replaceChildren();error.textContent="";hint.textContent="";}
  function taskChoices(value="",updateEnd=false){
    const tasks=studyTaskItems(bridge.getState(),"0001-01-01","9999-12-31").filter(t=>t.course.id===course.id&&t.categoryId===form.elements.categoryId.value&&t.schedulingMode!=="fixed");
    const chosen=tasks.find(t=>t.taskId===value)||tasks.find(t=>!t.done&&!t.allocations.length)||tasks[0];
    form.elements.startTaskId.innerHTML=options(tasks.length?tasks.map(t=>[t.taskId,t.title]):[["",w("暂无可自由安排的任务","No flexible tasks available")]],chosen?.taskId||"");
    form.elements.startTaskId.disabled=!tasks.length;
    form.querySelector("[data-weekly-preview]").disabled=!tasks.length;
    form.querySelector("[data-weekly-empty]").textContent=tasks.length?"":w("任务可能已变为固定课程或被删除，请选择其他分类。","Tasks may have become fixed or been removed. Choose another category.");
    const last=course.planRange?.end||tasks.map(t=>t.window.end||t.weekOf).filter(validPlanDate).sort().at(-1);
    if(updateEnd&&last&&last>=form.elements.fromWeek.value)form.elements.untilWeek.value=last;
  }
  function fillRules(){
    const list=(course.weeklyRules||[]).filter(r=>r.categoryId===form.elements.categoryId.value);
    form.elements.ruleId.innerHTML=options([["",w("新建每周安排","New weekly schedule")],...list.map(r=>[r.id,dayLabel(r.weekday)+" "+r.startTime+"–"+r.endTime+" · "+r.fromWeek])],"");
    rule=null;draftId=crypto.randomUUID();taskChoices("",true);reset(true);
  }
  function fillCategories(id=""){form.elements.categoryId.innerHTML=options(categories.filter(c=>c.courseId===course.id).map(c=>[c.categoryId,c.name]),id);fillRules();}
  function useRule(id){
    const saved=course.weeklyRules?.find(r=>r.id===id);
    rule=saved?{...saved,id:crypto.randomUUID(),excludedTaskIds:[],sequenceTaskIds:[],enabled:false}:null;
    draftId=rule?.id||crypto.randomUUID();
    if(rule){for(const key of ["weekday","startTime","endTime","fromWeek","untilWeek"])form.elements[key].value=rule[key];form.elements.skipWeeks.value=(rule.skipWeeks||[]).join(", ");form.elements.enabled.checked=rule.enabled!==false;taskChoices(rule.startTaskId);}else taskChoices();
    reset(true);
  }
  function input(){return {...(rule||{}),mappingMode:"sequence",compactSelection:true,...(selectedTaskIds?{selectedTaskIds}:{}),id:rule?.id||draftId,categoryId:form.elements.categoryId.value,startTaskId:form.elements.startTaskId.value,fromWeek:form.elements.fromWeek.value,untilWeek:form.elements.untilWeek.value,weekday:form.elements.weekday.value,startTime:form.elements.startTime.value,endTime:form.elements.endTime.value,skipWeeks:form.elements.skipWeeks.value.split(/[,，\s]+/).filter(Boolean),enabled:form.elements.enabled.checked};}
  function readRows(){
    if(!preview)return;
    for(const node of results.querySelectorAll("[data-weekly-row]")){
      const row=rows[Number(node.dataset.weeklyRow)];row.include=node.querySelector("[data-include]").checked;
      for(const key of ["date","startTime","endTime"]){const field=node.querySelector('[data-slot="'+key+'"]');if(field)row[key]=field.value;}
    }
    selectedTaskIds=rows.filter(r=>r.include&&!r.blocked).map(r=>r.taskId);
  }
  function check(){
    readRows();let conflicts=false;
    for(const [i,row]of rows.entries()){
      const node=results.querySelector('[data-weekly-row="'+i+'"]');if(!node)continue;
      const names=weeklyConflicts(bridge.getState(),row,row.existingId),duplicate=rows.some(other=>other!==row&&other.include&&row.include&&weeklyRowsOverlap(row,other)),collision=row.include&&(names.length||duplicate);
      conflicts ||= !!collision;node.classList.toggle("has-conflict",!!collision);node.querySelector("[data-row-conflict]").textContent=collision?w("时间重叠：","Overlaps: ")+names.join("；")+(duplicate?w(" 与本次其他时段重叠"," Another selected session overlaps"):""):"";
    }
    const confirm=results.querySelector("[data-weekly-confirm-wrap]");if(confirm)confirm.hidden=!conflicts;
    const selected=rows.filter(r=>r.include&&!r.blocked);
    submit.disabled=!selected.length||selected.some(r=>!validPlanDate(r.date)||!r.startTime||!r.endTime||r.endTime<=r.startTime);
    hint.textContent=w("将安排 "+selected.length+" 项。","Schedule "+selected.length+" tasks.");
  }
  function showPreview(){
    try{
      if(!form.elements.startTaskId.value)throw new Error(w("此分类没有可自由安排的任务。","No flexible tasks in this category."));
      if(preview)readRows();
      preview=previewWeeklyRule(bridge.getState(),course.id,input());rows=preview.rows;
      for(const row of rows)if(row.include&&manualOverrides.has(row.taskId))Object.assign(row,manualOverrides.get(row.taskId),{manualOverride:true});
      const visible=rows.map((r,i)=>({r,i})).filter(({r})=>!r.blocked);
      results.innerHTML=`<div class="weekly-preview-heading"><strong>${esc(form.elements.categoryId.selectedOptions[0].textContent)}</strong><span>${w("勾选变化后日期自动补位。未选任务留待安排；已保存的安排保持原样。","Dates reflow when selection changes. Unchecked tasks stay pending; saved sessions stay unchanged.")}</span><div class="degree-actions"><button class="btn secondary" type="button" data-weekly-select="all">${w("全选","Select all")}</button><button class="btn secondary" type="button" data-weekly-select="none">${w("全不选","Select none")}</button></div></div>
      <div class="weekly-preview-rows">${visible.map(({r,i})=>`<article class="weekly-preview-row" data-weekly-row="${i}"><label class="plan-check"><input type="checkbox" data-include ${r.include?"checked":""}>${esc(r.title)}</label><small>${esc(r.reason||"")}</small>
      ${r.include?`<div class="weekly-row-times">${["date","startTime","endTime"].map((key,n)=>`<label>${[w("日期","Date"),w("开始","Start"),w("结束","End")][n]}<input class="input" type="${n?"time":"date"}" data-slot="${key}" value="${esc(r[key])}"></label>`).join("")}</div>`:""}
      ${manualOverrides.has(r.taskId)?`<button class="btn secondary" type="button" data-weekly-auto="${esc(r.taskId)}">${w("手动调整 · 恢复自动","Manual edit · restore automatic")}</button>`:""}<small class="weekly-conflict" data-row-conflict></small></article>`).join("")||`<p class="plan-empty">${w("目前没有待安排的自由任务。已保存的安排可以在日历修改。","No flexible tasks remain unscheduled. Edit saved sessions on the calendar.")}</p>`}</div>
      <label class="plan-check weekly-conflict-confirm" data-weekly-confirm-wrap hidden><input type="checkbox" data-weekly-confirm>${w("已核对并接受所选时间重叠","I reviewed and accept these overlaps")}</label>`;
      error.textContent="";submit.disabled=false;check();
    }catch(e){preview=null;submit.disabled=true;error.textContent=e.message;}
  }
  form.elements.courseId.onchange=()=>{course=courses.find(c=>c.id===form.elements.courseId.value);fillCategories();};
  form.elements.categoryId.onchange=fillRules;form.elements.ruleId.onchange=()=>useRule(form.elements.ruleId.value);
  form.querySelector("[data-weekly-preview]").onclick=showPreview;
  results.addEventListener("click",e=>{
    const action=e.target.closest("[data-weekly-select]"),automatic=e.target.closest("[data-weekly-auto]");
    if(automatic){manualOverrides.delete(automatic.dataset.weeklyAuto);showPreview();}
    if(action){selectedTaskIds=action.dataset.weeklySelect==="all"?rows.filter(r=>!r.blocked).map(r=>r.taskId):[];preview=null;showPreview();}
  });
  form.addEventListener("input",e=>{
    if(e.target.closest("[data-weekly-row]")){
      readRows();
      if(e.target.matches("[data-slot]")){const row=rows[Number(e.target.closest("[data-weekly-row]").dataset.weeklyRow)];manualOverrides.set(row.taskId,{date:row.date,startTime:row.startTime,endTime:row.endTime});}
      check();
    }else if(e.target.closest("[data-weekly-config]"))reset(e.target.name==="startTaskId");
  });
  form.addEventListener("change",e=>{
    if(e.target.matches("[data-include]")){readRows();showPreview();}
    else if(e.target.closest("[data-weekly-row]"))check();
    else if(e.target.closest("[data-weekly-config]")&&!["courseId","categoryId","ruleId"].includes(e.target.name))reset(e.target.name==="startTaskId");
  });
  fillCategories(categoryId);
  for(const key of ["weekday","startTime","endTime"])if(preset[key])form.elements[key].value=preset[key];
}
