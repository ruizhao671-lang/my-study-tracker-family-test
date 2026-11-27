import {weeklyCategories,previewWeeklyRule,weeklyConflicts,weeklyRowsOverlap} from "./study-batch-core.js";
import {addPlanDays,planWeek,validPlanDate,studyTaskItems,studyWeekLabel} from "./study-plan-core.js";
const en=()=>window.studyI18n?.getLanguage?.()==="en";
const w=(zh,english)=>en()?english:zh;
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const field=(label,key,value,type="text",extra="")=>`<label>${esc(label)}<input class="input" name="${key}" value="${esc(value??"")}" type="${type}" ${extra}></label>`;
const options=(items,value)=>items.map(([id,label])=>`<option value="${esc(id)}" ${id===value?"selected":""}>${esc(label)}</option>`).join("");
export function openWeeklyPlanner({bridge,showDialog,date,courseId="",categoryId="",preset={}}){
  const state=bridge.getState(),categories=weeklyCategories(state),courses=state.degreePlan.modules.flatMap(m=>m.courses).filter(c=>categories.some(g=>g.courseId===c.id));
  if(!courses.length){bridge.showToast(w("先关联学习进度中的课程和分类，再使用每周安排。","Link course progress and a category before scheduling weekly."));return;}
  let course=courses.find(c=>c.id===courseId)||courses[0],rule=null,preview=null,rows=[];
  const form=showDialog(w("分类每周安排","Schedule a category weekly"),`
    <p class="degree-help">${w("把同一分类的每周任务安排到固定位置；任务本身仍可单独拖动。先预览，确认后保存。","Place weekly tasks from one category into a recurring time slot. Each session remains movable. Preview before saving.")}</p>
    <div class="degree-fields" data-weekly-config>
      <label>${w("课程","Course")}<select class="input" name="courseId">${options(courses.map(c=>[c.id,c.name]),course.id)}</select></label>
      <label>${w("分类","Category")}<select class="input" name="categoryId"></select></label>
      <label>${w("已保存规则","Saved rule")}<select class="input" name="ruleId"></select></label>
      <label>${w("每周","Every week")}<select class="input" name="weekday">${options([1,2,3,4,5,6,7].map((n,i)=>[String(n),[w("周一","Monday"),w("周二","Tuesday"),w("周三","Wednesday"),w("周四","Thursday"),w("周五","Friday"),w("周六","Saturday"),w("周日","Sunday")][i]]),"1")}</select></label>
      ${field(w("开始时间","Start"),"startTime","19:00","time","required")}
      ${field(w("结束时间","End"),"endTime","21:00","time","required")}
      ${field(w("从哪一周起（选该周任意日期）","First week (any date in week)"),"fromWeek",planWeek(date),"date","required")}
      ${field(w("到哪一周结束","Last week"),"untilWeek",addPlanDays(planWeek(date),84),"date","required")}
      ${field(w("课程第几周（任务已有日期可留空）","Course week number (optional if dated)"),"anchorWeekNumber","","number",'min="1" max="100"')}
      ${field(w("这一个课程周对应哪周（选该周任意日期）","That course week falls on (any date in week)"),"anchorWeekDate",planWeek(date),"date")}
    </div>
    <details class="plan-row-details" data-weekly-config><summary>${w("跳过周与后续任务","Skip weeks & future tasks")}</summary>
      ${field(w("跳过这些周（填日期，逗号分隔）","Skip these weeks (dates, comma separated)"),"skipWeeks","")}
      <label class="plan-check"><input type="checkbox" name="enabled" checked>${w("以后新增且日期/周次明确的同类任务也按此规则安排；冲突保留待安排","Apply to new matching tasks with a known week; leave conflicts unscheduled")}</label>
    </details>
    <div class="degree-actions"><button class="btn secondary" type="button" data-weekly-preview>${w("预览每周安排","Preview weekly sessions")}</button><span class="degree-help" data-weekly-hint></span></div>
    <p class="degree-help" data-weekly-error role="alert"></p>
    <div class="weekly-preview" data-weekly-results aria-live="polite"></div>
  `,()=>{
    if(!preview)throw new Error(w("请先预览每周安排。","Preview weekly sessions first."));
    readRows();
    const selected=rows.filter(r=>r.include&&!r.blocked),accept=form.querySelector("[data-weekly-confirm]")?.checked;
    const slots=selected.map(r=>({...r,confirmConflicts:accept===true}));
    const result=bridge.applyWeeklyRule(course.id,preview.rule,slots);
    bridge.showToast(w("已保存 "+result.count+" 个学习时段；任务仍与学习进度共用。","Saved "+result.count+" sessions linked to the original progress tasks."));
  },w("保存每周安排","Save weekly sessions"));
  const submit=form.querySelector('[type="submit"]'),results=form.querySelector("[data-weekly-results]"),error=form.querySelector("[data-weekly-error]"),hint=form.querySelector("[data-weekly-hint]");
  submit.disabled=true;
  function resetPreview(){preview=null;rows=[];submit.disabled=true;results.replaceChildren();hint.textContent=w("设置改变后请重新预览。","Preview again after changing settings.");error.textContent="";}
  function fillCategories(id=""){form.elements.categoryId.innerHTML=options(categories.filter(c=>c.courseId===course.id).map(c=>[c.categoryId,c.name]),id);fillRules();}
  function fillRules(){const list=(course.weeklyRules||[]).filter(r=>r.categoryId===form.elements.categoryId.value);form.elements.ruleId.innerHTML=options([["",w("新建每周安排","New weekly schedule")],...list.map(r=>[r.id,r.startTime+"–"+r.endTime+" · "+r.fromWeek+" — "+r.untilWeek+(r.enabled?"":w(" · 自动安排已停用"," · automation off"))])],"");rule=null;form.elements.anchorWeekNumber.value="";form.elements.anchorWeekDate.value=planWeek(form.elements.fromWeek.value);resetPreview();}
  function useRule(id){
    rule=course.weeklyRules?.find(r=>r.id===id)||null;
    if(rule){for(const key of ["weekday","startTime","endTime","fromWeek","untilWeek","anchorWeekNumber"])form.elements[key].value=rule[key]??"";form.elements.anchorWeekDate.value=rule.anchorWeekDate||rule.fromWeek;form.elements.skipWeeks.value=(rule.skipWeeks||[]).join(", ");form.elements.enabled.checked=rule.enabled!==false;}
    resetPreview();
  }
  function readInput(){return {...(rule||{}),id:rule?.id||crypto.randomUUID(),categoryId:form.elements.categoryId.value,weekday:form.elements.weekday.value,startTime:form.elements.startTime.value,endTime:form.elements.endTime.value,
    fromWeek:form.elements.fromWeek.value,untilWeek:form.elements.untilWeek.value,anchorWeekNumber:form.elements.anchorWeekNumber.value,anchorWeekDate:form.elements.anchorWeekDate.value,skipWeeks:form.elements.skipWeeks.value.split(/[,，\s]+/).filter(Boolean),enabled:form.elements.enabled.checked};}
  function readRows(){
    for(const node of results.querySelectorAll("[data-weekly-row]")){
      const row=rows[Number(node.dataset.weeklyRow)];row.include=node.querySelector("[data-include]").checked;
      for(const key of ["date","startTime","endTime"]){const input=node.querySelector('[data-slot="'+key+'"]');if(input)row[key]=input.value;}
    }
  }
  function checkConflicts(){
    readRows();let hasConflicts=false;
    for(const [i,row]of rows.entries()){
      const names=row.blocked?[]:weeklyConflicts(bridge.getState(),row,row.existingId),duplicate=rows.some(other=>other!==row&&other.include&&row.include&&weeklyRowsOverlap(row,other));
      const node=results.querySelector('[data-weekly-row="'+i+'"]');
      if(!node)continue;
      const collisions=names.length||duplicate;hasConflicts ||= !!(row.include&&collisions);
      node.querySelector("[data-row-conflict]").textContent=collisions?w("时间重叠：","Overlaps: ")+names.join("；")+(duplicate?w(" · 本次安排也有重叠"," · another selected session overlaps"):""):"";
      node.classList.toggle("has-conflict",!!(row.include&&collisions));
    }
    const confirm=results.querySelector("[data-weekly-confirm-wrap]");if(confirm)confirm.hidden=!hasConflicts;
    const missing=rows.filter(r=>r.include&&!r.blocked&&!validPlanDate(r.date)).length;
    submit.disabled=missing>0;
    error.textContent=missing?w("所选 "+missing+" 项还没有日期，请先确认周次对应关系，或填写日期。","Dates are missing for "+missing+" selected tasks. Confirm the week mapping or enter dates."):"";
    hint.textContent=w("将安排 "+rows.filter(r=>r.include&&!r.blocked).length+" 项，未选项目保持原样。","Schedule "+rows.filter(r=>r.include&&!r.blocked).length+" items; unchecked items stay unchanged.");
  }
  function showPreview(){
    try{
      preview=previewWeeklyRule(bridge.getState(),course.id,readInput());rows=preview.rows;
      const undated=rows.filter(r=>!r.blocked&&!validPlanDate(r.date)&&r.ordinal),firstUndated=undated[0];
      results.innerHTML=`${firstUndated?`<section class="weekly-anchor-help" data-anchor-help><strong>${w("只需确认一次课程周次","Confirm the course week once")}</strong><p>${w("这 "+undated.length+" 项任务只有 Week 编号。确认一周的实际日期，即可自动填好其余周；不会改动已有任务或完成状态。","These "+undated.length+" tasks only have week numbers. Confirm one actual week to fill the remaining dates; existing tasks and completion stay intact.")}</p><div class="degree-fields"><label>${w("课程第几周","Course week")}<input class="input" type="number" min="1" max="100" value="${firstUndated.ordinal}" data-anchor-number></label><label>${w("对应哪周（选该周任意日期）","Falls on (any date in week)")}<input class="input" type="date" value="${esc(form.elements.fromWeek.value)}" data-anchor-date></label></div><button class="btn" type="button" data-anchor-apply>${w("确认并自动补齐每周日期","Confirm & fill weekly dates")}</button></section>`:""}<div class="weekly-preview-heading"><strong>${esc(form.elements.categoryId.selectedOptions[0].textContent)}</strong><span>${w("日期和时刻可逐项修改；未勾选不会写入。","Edit dates and times here; unchecked rows are not saved.")}</span></div>
      <div class="weekly-preview-rows">${rows.map((r,i)=>`<article class="weekly-preview-row ${r.blocked?"is-blocked":""}" data-weekly-row="${i}">
        <label class="plan-check"><input type="checkbox" data-include ${r.include?"checked":""} ${r.blocked?"disabled":""}>${esc(r.title)}</label>
        <small>${esc(r.ordinal?w("课程第 "+r.ordinal+" 周","Course week "+r.ordinal):r.week?studyWeekLabel(r.week,state.degreePlan,en(),{dates:false}):w("周次未定","Week TBD"))}${r.reason?" · "+esc(r.reason):""}</small>
        ${r.blocked&&!r.date?`<small>${w("保留原状态，本次不安排时段。","Keep the current state; no session will be added.")}</small>`:`<div class="weekly-row-times">${["date","startTime","endTime"].map((key,n)=>`<label>${[w("日期","Date"),w("开始","Start"),w("结束","End")][n]}<input class="input" type="${n?"time":"date"}" data-slot="${key}" value="${esc(r[key])}" ${r.blocked?"disabled":""}></label>`).join("")}</div>`}<small class="weekly-conflict" data-row-conflict></small>
      </article>`).join("")||`<p class="plan-empty">${w("此分类目前没有任务。可保存规则，之后新增且日期明确的任务会自动安排。","No tasks in this category yet. Save the rule to schedule new dated tasks later.")}</p>`}</div>
      <label class="plan-check weekly-conflict-confirm" data-weekly-confirm-wrap hidden><input type="checkbox" data-weekly-confirm>${w("已核对并接受所选时间重叠","I reviewed and accept the selected overlaps")}</label>`;
      error.textContent="";submit.disabled=false;checkConflicts();(results.querySelector("[data-anchor-help]")||results.querySelector(".weekly-preview-heading"))?.scrollIntoView({block:"start"});
    }catch(e){preview=null;submit.disabled=true;error.textContent=e.message;}
  }
  form.elements.courseId.onchange=()=>{course=courses.find(c=>c.id===form.elements.courseId.value);fillCategories();};
  form.elements.categoryId.onchange=fillRules;
  form.elements.ruleId.onchange=()=>useRule(form.elements.ruleId.value);
  form.querySelector("[data-weekly-preview]").onclick=showPreview;
  results.addEventListener("click",event=>{
    if(!event.target.closest("[data-anchor-apply]"))return;
    const number=Number(results.querySelector("[data-anchor-number]").value),anchorDate=results.querySelector("[data-anchor-date]").value;
    if(!Number.isInteger(number)||number<1||number>100||!validPlanDate(anchorDate)){error.textContent=w("请填写有效的课程周次和对应日期。","Enter a valid course week and its date.");error.scrollIntoView({block:"nearest"});return;}
    form.elements.anchorWeekNumber.value=String(number);
    form.elements.anchorWeekDate.value=anchorDate;
    showPreview();
  });
  form.addEventListener("input",e=>{if(e.target.closest("[data-weekly-row]")){checkConflicts();return;}if(e.target.closest("[data-weekly-config]"))resetPreview();});
  form.addEventListener("change",e=>{if(e.target.closest("[data-weekly-row]"))checkConflicts();else if(e.target.closest("[data-weekly-config]")&&!["courseId","categoryId","ruleId"].includes(e.target.name))resetPreview();});
  fillCategories(categoryId);
  const existing=(course.weeklyRules||[]).find(r=>r.categoryId===form.elements.categoryId.value);
  if(existing){form.elements.ruleId.value=existing.id;useRule(existing.id);}
  else {
    const items=studyTaskItems(state,"0001-01-01","9999-12-31").filter(t=>t.course.id===course.id&&t.categoryId===form.elements.categoryId.value),dates=items.map(t=>t.weekOf||t.windowStart).filter(validPlanDate).sort();
    const finish=course.planRange?.end||dates.at(-1)||addPlanDays(planWeek(date),84);
    form.elements.untilWeek.value=finish>=form.elements.fromWeek.value?finish:form.elements.fromWeek.value;
  }
  for(const key of ["weekday","startTime","endTime"])if(preset[key])form.elements[key].value=preset[key];
}
