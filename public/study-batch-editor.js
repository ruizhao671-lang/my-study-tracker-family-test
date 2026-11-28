import {weeklyCategories,previewWeeklyRule,weeklyConflicts,weeklyRowsOverlap} from "./study-batch-core.js";
import {addPlanDays,planWeek,studyTaskItems,validPlanDate} from "./study-plan-core.js";
import {scheduleCourses} from "./study-workspace.js";
const en=()=>window.studyI18n?.getLanguage?.()==="en";
const w=(zh,english)=>en()?english:zh;
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const options=(items,value)=>items.map(([id,label])=>`<option value="${esc(id)}" ${id===value?"selected":""}>${esc(label)}</option>`).join("");
const field=(label,key,value,type="text")=>`<label>${esc(label)}<input class="input" name="${key}" type="${type}" value="${esc(value)}" required></label>`;
export function openWeeklyPlanner({bridge,showDialog,date,courseId="",categoryId="",preset={}}){
  const state=bridge.getState(),categories=weeklyCategories(state),courses=scheduleCourses(state).filter(c=>categories.some(g=>g.courseId===c.id));
  if(!courses.length){bridge.showToast(w("先在学习进度里添加课程任务。","Add course tasks in learning progress first."));return;}
  let course=courses.find(c=>c.id===courseId)||courses[0],rule=null,preview=null,rows=[];
  const form=showDialog(w("分类每周安排","Schedule a category weekly"),`
    <p class="degree-help">${w("选一个起始任务和开始周，之后每周安排下一个任务。日期自动填写；不会修改任务本身的完成范围。","Choose a first task and a first week. The next task follows each week. Dates are filled automatically; task completion windows stay unchanged.")}</p>
    <div class="degree-fields" data-weekly-config>
      <label>${w("课程","Course")}<select class="input" name="courseId">${options(courses.map(c=>[c.id,c.name]),course.id)}</select></label>
      <label>${w("分类","Category")}<select class="input" name="categoryId"></select></label>
      <label>${w("已保存规则","Saved rule")}<select class="input" name="ruleId"></select></label>
      <label>${w("从哪个任务开始","First task")}<select class="input" name="startTaskId" required></select></label>
      ${field(w("从哪一周开始（选该周任意一天）","First week (any date in that week)"),"fromWeek",planWeek(date),"date")}
      ${field(w("安排到哪一天","Schedule until"),"untilWeek",addPlanDays(planWeek(date),84),"date")}
      <label>${w("每周","Every week")}<select class="input" name="weekday">${options([1,2,3,4,5,6,7].map((n,i)=>[String(n),[w("周一","Monday"),w("周二","Tuesday"),w("周三","Wednesday"),w("周四","Thursday"),w("周五","Friday"),w("周六","Saturday"),w("周日","Sunday")][i]]),"3")}</select></label>
      ${field(w("开始时间","Start"),"startTime","19:00","time")}${field(w("结束时间","End"),"endTime","21:00","time")}
    </div>
    <details class="plan-row-details" data-weekly-config><summary>${w("更多设置","More settings")}</summary>
      <label>${w("跳过这些周（日期，逗号分隔）","Skip these weeks (dates, comma separated)")}<input class="input" name="skipWeeks"></label>
      <label class="plan-check"><input type="checkbox" name="enabled" checked>${w("以后新增同类任务也延续这条规则；冲突时留待安排","Apply this rule to future tasks too; leave conflicts unscheduled")}</label>
    </details>
    <div class="degree-actions"><button class="btn secondary" type="button" data-weekly-preview>${w("预览每周安排","Preview weekly sessions")}</button><span class="degree-help" data-weekly-hint></span></div>
    <p class="degree-help" data-weekly-error role="alert"></p><div class="weekly-preview" data-weekly-results aria-live="polite"></div>
  `,()=>{
    if(!preview)throw new Error(w("请先预览。","Preview first."));
    readRows();
    const accepted=form.querySelector("[data-weekly-confirm]")?.checked;
    const result=bridge.applyWeeklyRule(course.id,preview.rule,rows.filter(r=>r.include&&!r.blocked).map(r=>({...r,confirmConflicts:accepted===true})));
    bridge.showToast(w("已安排 "+result.count+" 项；待安排区已同步。","Scheduled "+result.count+" tasks; the pending area is updated."));
  },w("保存每周安排","Save weekly sessions"));
  const results=form.querySelector("[data-weekly-results]"),error=form.querySelector("[data-weekly-error]"),hint=form.querySelector("[data-weekly-hint]"),submit=form.querySelector('[type="submit"]');
  submit.disabled=true;
  function reset(){preview=null;rows=[];submit.disabled=true;results.replaceChildren();error.textContent="";hint.textContent="";}
  function taskChoices(value=""){
    const tasks=studyTaskItems(bridge.getState(),"0001-01-01","9999-12-31").filter(t=>t.course.id===course.id&&t.categoryId===form.elements.categoryId.value&&t.schedulingMode!=="fixed");
    tasks.sort((a,b)=>a.title.localeCompare(b.title,"en",{numeric:true}));
    const chosen=tasks.find(t=>t.taskId===value)||tasks.find(t=>!t.done&&!t.allocations.length)||tasks[0];
    form.elements.startTaskId.innerHTML=options(tasks.map(t=>[t.taskId,t.title]),chosen?.taskId||"");
    const last=course.planRange?.end||tasks.map(t=>t.window.end||t.weekOf).filter(validPlanDate).sort().at(-1);
    if(last&&last>=form.elements.fromWeek.value)form.elements.untilWeek.value=last;
  }
  function fillRules(){
    const list=(course.weeklyRules||[]).filter(r=>r.categoryId===form.elements.categoryId.value);
    form.elements.ruleId.innerHTML=options([["",w("新建每周安排","New weekly schedule")],...list.map(r=>[r.id,r.startTime+"–"+r.endTime+" · "+r.fromWeek])],"");
    rule=null;taskChoices();reset();
  }
  function fillCategories(id=""){form.elements.categoryId.innerHTML=options(categories.filter(c=>c.courseId===course.id).map(c=>[c.categoryId,c.name]),id);fillRules();}
  function useRule(id){
    rule=course.weeklyRules?.find(r=>r.id===id)||null;
    if(rule){for(const key of ["weekday","startTime","endTime","fromWeek","untilWeek"])form.elements[key].value=rule[key];form.elements.skipWeeks.value=(rule.skipWeeks||[]).join(", ");form.elements.enabled.checked=rule.enabled!==false;taskChoices(rule.startTaskId);}
    reset();
  }
  function input(){return {...(rule||{}),mappingMode:"sequence",id:rule?.id||crypto.randomUUID(),categoryId:form.elements.categoryId.value,startTaskId:form.elements.startTaskId.value,fromWeek:form.elements.fromWeek.value,untilWeek:form.elements.untilWeek.value,weekday:form.elements.weekday.value,startTime:form.elements.startTime.value,endTime:form.elements.endTime.value,skipWeeks:form.elements.skipWeeks.value.split(/[,，\s]+/).filter(Boolean),enabled:form.elements.enabled.checked};}
  function readRows(){for(const node of results.querySelectorAll("[data-weekly-row]")){const row=rows[Number(node.dataset.weeklyRow)];row.include=node.querySelector("[data-include]").checked;for(const key of ["date","startTime","endTime"])row[key]=node.querySelector('[data-slot="'+key+'"]').value;}}
  function check(){
    readRows();let conflicts=false;
    for(const [i,row]of rows.entries()){
      const node=results.querySelector('[data-weekly-row="'+i+'"]');if(!node)continue;
      const names=weeklyConflicts(bridge.getState(),row,row.existingId),duplicate=rows.some(other=>other!==row&&other.include&&row.include&&weeklyRowsOverlap(row,other)),collision=row.include&&(names.length||duplicate);
      conflicts ||= !!collision;node.classList.toggle("has-conflict",!!collision);node.querySelector("[data-row-conflict]").textContent=collision?w("时间重叠：","Overlaps: ")+names.join("；")+(duplicate?w(" 与本次其他时段重叠"," Another selected session overlaps"):""):"";
    }
    const confirm=results.querySelector("[data-weekly-confirm-wrap]");if(confirm)confirm.hidden=!conflicts;
    const selected=rows.filter(r=>r.include&&!r.blocked);
    submit.disabled=selected.some(r=>!validPlanDate(r.date)||!r.startTime||!r.endTime||r.endTime<=r.startTime);
    hint.textContent=w("将安排 "+selected.length+" 项。","Schedule "+selected.length+" tasks.");
  }
  function showPreview(){
    try{
      if(!form.elements.startTaskId.value)throw new Error(w("此分类没有可自由安排的任务。","No flexible tasks in this category."));
      preview=previewWeeklyRule(bridge.getState(),course.id,input());rows=preview.rows;
      const visible=rows.map((r,i)=>({r,i})).filter(({r})=>!r.blocked&&r.week);
      results.innerHTML=`<div class="weekly-preview-heading"><strong>${esc(form.elements.categoryId.selectedOptions[0].textContent)}</strong><span>${w("日期已自动填好，可以修改；未勾选不写入。已有安排、已完成和固定课程保持原样。","Dates are filled in and editable. Unchecked tasks are not saved; existing sessions, completed tasks and fixed classes stay intact.")}</span></div>
      <div class="weekly-preview-rows">${visible.map(({r,i})=>`<article class="weekly-preview-row" data-weekly-row="${i}"><label class="plan-check"><input type="checkbox" data-include ${r.include?"checked":""}>${esc(r.title)}</label><small>${esc(r.reason||"")}</small><div class="weekly-row-times">${["date","startTime","endTime"].map((key,n)=>`<label>${[w("日期","Date"),w("开始","Start"),w("结束","End")][n]}<input class="input" type="${n?"time":"date"}" data-slot="${key}" value="${esc(r[key])}"></label>`).join("")}</div><small class="weekly-conflict" data-row-conflict></small></article>`).join("")||`<p class="plan-empty">${w("这个范围内没有需要新安排的任务。","No tasks need new sessions in this range.")}</p>`}</div>
      <label class="plan-check weekly-conflict-confirm" data-weekly-confirm-wrap hidden><input type="checkbox" data-weekly-confirm>${w("已核对并接受所选时间重叠","I reviewed and accept these overlaps")}</label>`;
      error.textContent="";submit.disabled=false;check();
    }catch(e){preview=null;submit.disabled=true;error.textContent=e.message;}
  }
  form.elements.courseId.onchange=()=>{course=courses.find(c=>c.id===form.elements.courseId.value);fillCategories();};
  form.elements.categoryId.onchange=fillRules;form.elements.ruleId.onchange=()=>useRule(form.elements.ruleId.value);
  form.querySelector("[data-weekly-preview]").onclick=showPreview;
  form.addEventListener("input",e=>{if(e.target.closest("[data-weekly-row]"))check();else if(e.target.closest("[data-weekly-config]"))reset();});
  form.addEventListener("change",e=>{if(e.target.closest("[data-weekly-row]"))check();else if(e.target.closest("[data-weekly-config]")&&!["courseId","categoryId","ruleId"].includes(e.target.name))reset();});
  fillCategories(categoryId);
  const existing=(course.weeklyRules||[]).find(r=>r.categoryId===form.elements.categoryId.value);
  if(existing){form.elements.ruleId.value=existing.id;useRule(existing.id);}
  for(const key of ["weekday","startTime","endTime"])if(preset[key])form.elements[key].value=preset[key];
}
