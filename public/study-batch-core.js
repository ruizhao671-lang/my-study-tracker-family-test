import {scheduleCourses,findScheduleCourse} from "./study-workspace.js";
import {studyTaskItems,studyTaskWindow,studyCalendarEntries,taskSchedulingMode,studySessionHours,validPlanDate,addPlanDays,planWeek} from "./study-plan-core.js";
import {captureCoursePlan,recordCoursePlanChange} from "./study-plan-history.js";
const todayKey=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
const mins=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
const validTime=value=>typeof value==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const getCourse=findScheduleCourse;
export function weeklyCategories(state,courseId=""){
  const result=[];
  for(const course of scheduleCourses(state)){
    if(courseId&&course.id!==courseId)continue;
    const learning=state.semesters?.flatMap(s=>s.courses).find(c=>c.id===course.courseId);
    if(learning)for(const category of learning.categories)result.push({courseId:course.id,courseName:course.name,categoryId:category.id,name:category.name,count:category.tasks.length});
  }
  return result;
}
// The picker and its task dropdown must use the same scheduling-mode projection.
export function weeklyPlannerCategories(state){
  const available=new Set(studyTaskItems(state,"0001-01-01","9999-12-31").filter(t=>t.schedulingMode!=="fixed"&&t.categoryId).map(t=>JSON.stringify([t.course.id,t.categoryId])));
  return weeklyCategories(state).filter(c=>available.has(JSON.stringify([c.courseId,c.categoryId])));
}
export function normalizeWeeklyRule(state,courseId,input){
  const category=weeklyCategories(state,courseId).find(c=>c.categoryId===input.categoryId);
  if(!category)throw new Error("请先关联学习进度，并选择课程中的分类。");
  const weekday=Number(input.weekday),anchor= input.anchorWeekNumber===""||input.anchorWeekNumber==null?null:Number(input.anchorWeekNumber);
  if(!Number.isInteger(weekday)||weekday<1||weekday>7||!validTime(input.startTime)||!validTime(input.endTime)||input.endTime<=input.startTime)throw new Error("请填写同一天内有效的每周时间。");
  if(!validPlanDate(input.fromWeek)||!validPlanDate(input.untilWeek))throw new Error("请填写一年以内的开始与结束日期。");
  const fromWeek=planWeek(input.fromWeek),untilWeek=planWeek(input.untilWeek),anchorWeekDate=input.anchorWeekDate||fromWeek;
  if(untilWeek<fromWeek||untilWeek>addPlanDays(fromWeek,366))throw new Error("请填写一年以内的开始与结束日期。");
  if(!validPlanDate(anchorWeekDate))throw new Error("请填写课程周次对应的日期。");
  if(anchor!==null&&(!Number.isInteger(anchor)||anchor<1||anchor>100))throw new Error("课程起始周次需为 1 到 100，未知可留空。");
  const skipWeeks=[...new Set((input.skipWeeks||[]).map(value=>{if(!validPlanDate(value))throw new Error("跳过周的日期无效。");return planWeek(value);} ))];
  return {id:input.id||crypto.randomUUID(),categoryId:category.categoryId,categoryName:category.name,weekday,startTime:input.startTime,endTime:input.endTime,fromWeek,untilWeek,anchorWeekNumber:anchor,anchorWeekDate:planWeek(anchorWeekDate),skipWeeks,enabled:input.enabled!==false,mappingMode:input.mappingMode==="sequence"?"sequence":"window",...(input.compactSelection===true?{compactSelection:true}:{}),startTaskId:input.startTaskId||"",sequenceTaskIds:Array.isArray(input.sequenceTaskIds)?[...new Set(input.sequenceTaskIds)]:[],excludedTaskIds:[...new Set(Array.isArray(input.excludedTaskIds)?input.excludedTaskIds:[])].slice(-1000)};
}
function taskWeek(rule,task){
  if(task.weekOf)return planWeek(task.weekOf);
  if(task.windowStart&&(!task.windowEnd||planWeek(task.windowStart)===planWeek(task.windowEnd)))return planWeek(task.windowStart);
  const ordinal=studyTaskWindow(task).teachingWeek;
  if(ordinal&&rule.anchorWeekNumber!==null)return addPlanDays(rule.anchorWeekDate||rule.fromWeek,(ordinal-rule.anchorWeekNumber)*7);
  if(task.deadline&&!task.windowStart)return planWeek(task.deadline);
  return "";
}
export function weeklyRowsOverlap(a,b){
  return validPlanDate(a.date)&&a.date===b.date&&validTime(a.startTime)&&validTime(a.endTime)&&a.startTime<a.endTime&&
    validTime(b.startTime)&&validTime(b.endTime)&&b.startTime<b.endTime&&a.startTime<b.endTime&&a.endTime>b.startTime;
}
export function weeklyConflicts(state,row,ignoreId=""){
  if(!validPlanDate(row.date)||!validTime(row.startTime)||!validTime(row.endTime)||row.endTime<=row.startTime)return [];
  return studyCalendarEntries(state,row.date,row.date).filter(e=>{
    if(ignoreId&&e.id==="plan-event:"+ignoreId+":"+row.date)return false;
    if(e.kind==="task"&&!e.date||!e.startTime)return false;
    const start=mins(e.startTime),span=e.endTime?mins(e.endTime):start+(studySessionHours(e)||0)*60;
    return span>start?start<mins(row.endTime)&&span>mins(row.startTime):start>=mins(row.startTime)&&start<mins(row.endTime);
  }).map(e=>[e.course?.name,e.title].filter(Boolean).join(" · "));
}
function previewCompactWeekly(state,course,rule,items,input,today){
  const start=items.findIndex(t=>t.taskId===rule.startTaskId);
  if(start<0)throw new Error("起始任务已变化，请重新选择。");
  const selected=Array.isArray(input.selectedTaskIds)?new Set(input.selectedTaskIds):null;
  const owned=(course.planEvents||[]).filter(e=>e.batchRuleId===rule.id);
  const positions=[];
  for(let week=rule.fromWeek;week<=rule.untilWeek;week=addPlanDays(week,7)){
    if(rule.skipWeeks.includes(week))continue;
    const date=addPlanDays(week,rule.weekday-1);
    if(input.automatic&&date<today)continue;
    if(owned.some(e=>weeklyRowsOverlap({date,startTime:rule.startTime,endTime:rule.endTime},e)))continue;
    positions.push({week,date});
  }
  let cursor=0;
  const rows=items.slice(start).map(task=>{
    const blocked=task.done?"已完成，保留":taskSchedulingMode(task,course.planEvents)==="fixed"?"固定时间，保留":task.allocations.length?"已有安排，保留":"";
    const include=!blocked&&(selected?selected.has(task.taskId):!rule.excludedTaskIds.includes(task.taskId)&&cursor<positions.length);
    const position=include?positions[cursor++]:null;
    const row={taskId:task.taskId,title:task.title,group:task.group,ordinal:studyTaskWindow(task).teachingWeek,
      week:position?.week||"",date:position?.date||"",startTime:rule.startTime,endTime:rule.endTime,
      templateDate:position?.date||"",templateStart:rule.startTime,templateEnd:rule.endTime,
      existingId:"",blocked:!!blocked,include,reason:blocked||(!include?"未选，保持待安排":!position?"本次时段不足，请延长结束周或减少任务":""),conflicts:[]};
    if(include&&position){
      row.conflicts=weeklyConflicts(state,row);
      if(row.conflicts.length)row.reason="时间冲突，待确认";
      else if(row.date<today)row.reason="日期已过去，请核对";
      else if(task.deadline&&row.date>task.deadline)row.reason="晚于截止日期，请核对";
    }
    return row;
  });
  return {rule,rows};
}
export function previewWeeklyRule(state,courseId,input,today=todayKey()){
  const course=getCourse(state,courseId);if(!course)throw new Error("课程不存在。");
  const rule=normalizeWeeklyRule(state,courseId,input),items=studyTaskItems(state,rule.fromWeek,addPlanDays(rule.untilWeek,6)).filter(t=>t.course.id===courseId&&t.categoryId===rule.categoryId);
  if(rule.compactSelection)return previewCompactWeekly(state,course,rule,items,input,today);
  const ordered=[...items].sort((a,b)=>a.title.localeCompare(b.title,"en",{numeric:true}));
  if(rule.mappingMode==="sequence")rule.sequenceTaskIds=[...rule.sequenceTaskIds,...ordered.filter(t=>!rule.sequenceTaskIds.includes(t.taskId)).map(t=>t.taskId)];
  const start=rule.sequenceTaskIds.indexOf(rule.startTaskId),weeks=[];
  for(let day=rule.fromWeek;day<=rule.untilWeek;day=addPlanDays(day,7))if(!rule.skipWeeks.includes(day))weeks.push(day);
  const rows=(rule.mappingMode==="sequence"?ordered:items).map(task=>{
    const sequenceIndex=rule.sequenceTaskIds.indexOf(task.taskId)-start;
    const week=rule.mappingMode==="sequence"?(start>=0&&sequenceIndex>=0?weeks[sequenceIndex]||"":""):taskWeek(rule,task),date=week?addPlanDays(week,rule.weekday-1):"",owned=(course.planEvents||[]).find(e=>e.batchRuleId===rule.id&&e.taskId===task.taskId),other=task.allocations.some(e=>e.batchRuleId!==rule.id||e.userScheduled);
    let reason="";
    if(task.done)reason="已完成，保留";
    else if(taskSchedulingMode(task,course.planEvents)==="fixed")reason="固定时间，保留";
    else if(owned&&(owned.userScheduled||owned.executed||owned.date<today))reason="手动调整或历史安排，保留";
    else if(other)reason="已有安排，保留";
    else if(!week)reason=rule.mappingMode==="sequence"?"不在本次安排范围":"需要确认对应日期";
    else if(week<rule.fromWeek||week>rule.untilWeek)reason="不在本次日期范围";
    else if(rule.skipWeeks.includes(week))reason="本周已跳过";
    else if(rule.excludedTaskIds.includes(task.taskId))reason="此前已取消自动安排";
    const row={taskId:task.taskId,title:task.title,group:task.group,week,ordinal:studyTaskWindow(task).teachingWeek,date,startTime:rule.startTime,endTime:rule.endTime,existingId:owned?.id||"",blocked:reason==="已完成，保留"||reason==="固定时间，保留"||reason==="手动调整或历史安排，保留"||reason==="已有安排，保留",reason,include:!reason};
    if(row.blocked){const retained=owned||task.allocations[0];row.date=retained?.date||"";row.startTime=retained?.startTime||"";row.endTime=retained?.endTime||"";}
    row.conflicts=row.blocked?[]:weeklyConflicts(state,row,owned?.id);
    if(!reason&&row.conflicts.length){row.reason="时间冲突，待确认";row.include=false;}
    if(!reason&&date<today){row.reason="日期已过去，待确认";row.include=false;}
    if(!reason&&task.deadline&&date>task.deadline){row.reason="晚于截止日期，待确认";row.include=false;}
    return row;
  });
  for(const row of rows)if(!row.blocked&&row.date&&rows.some(other=>other!==row&&!other.blocked&&other.date===row.date)){row.reason="同周有多项任务，请分配时段";row.include=false;}
  return {rule,rows};
}
function upsertRuleEvent(course,rule,row){
  const existing=(course.planEvents||[]).find(e=>e.batchRuleId===rule.id&&e.taskId===row.taskId);
  const value={id:existing?.id||crypto.randomUUID(),type:"study",title:[row.group,row.title].filter(Boolean).join(" · "),taskId:row.taskId,taskSeriesKey:"",date:row.date,startTime:row.startTime,endTime:row.endTime,
    hours:(mins(row.endTime)-mins(row.startTime))/60,weekOf:"",period:"",schedulingMode:"flexible",executed:existing?.executed===true,completedDates:[],autoTaskTitle:true,userScheduled:row.manualOverride===true||row.date!==(row.templateDate||addPlanDays(row.week||planWeek(row.date),rule.weekday-1))||row.startTime!==(row.templateStart||rule.startTime)||row.endTime!==(row.templateEnd||rule.endTime),batchRuleId:rule.id,importKey:existing?.importKey||"batch:"+rule.id+":"+row.taskId,detail:existing?.detail||""};
  if(existing)Object.assign(existing,value);else (course.planEvents ||= []).push(value);
  return value.id;
}
export function applyWeeklyRule(state,courseId,input,selectedRows,today=todayKey()){
  const course=getCourse(state,courseId),before=captureCoursePlan(state,courseId),preview=previewWeeklyRule(state,courseId,input.compactSelection?{...input,selectedTaskIds:selectedRows.filter(r=>r.include!==false).map(r=>r.taskId)}:input,today);
  if(!course)throw new Error("课程不存在。");
  const rule=preview.rule,allowed=new Map(preview.rows.map(r=>[r.taskId,r])),seen=new Set();
  const chosen=selectedRows.filter(r=>r.include!==false).map(row=>{
    const original=allowed.get(row.taskId);
    if(!original||original.blocked||seen.has(row.taskId))throw new Error("请重新预览，已有安排或任务内容已经变化。");
    seen.add(row.taskId);
    if(!validPlanDate(row.date)||!validTime(row.startTime)||!validTime(row.endTime)||row.endTime<=row.startTime)throw new Error("请填写所选任务的有效日期与开始、结束时间。");
    return {...original,date:row.date,startTime:row.startTime,endTime:row.endTime,manualOverride:row.manualOverride===true};
  });
  for(const row of chosen){
    const overlap=chosen.some(other=>other!==row&&weeklyRowsOverlap(row,other));
    if((weeklyConflicts(state,row,row.existingId).length||overlap)&&!selectedRows.find(r=>r.taskId===row.taskId)?.confirmConflicts)throw new Error("所选时间存在重叠，请在预览中确认后保存。");
  }
  course.weeklyRules ||= [];
  const old=course.weeklyRules.find(r=>r.id===rule.id);
  // Every unchecked existing task stays unchecked on future automatic refreshes.
  const exclusions=new Set(rule.excludedTaskIds);
  for(const row of preview.rows)if(!row.blocked){if(seen.has(row.taskId))exclusions.delete(row.taskId);else exclusions.add(row.taskId);}
  rule.excludedTaskIds=[...exclusions];
  if(old)Object.assign(old,rule);else course.weeklyRules.push(rule);
  for(const row of chosen)upsertRuleEvent(course,rule,row);
  recordCoursePlanChange(state,courseId,before,"分类每周安排");
  return {count:chosen.length,ruleId:rule.id};
}
export function refreshWeeklyRules(state,today=todayKey()){
  let added=0;
  for(const course of scheduleCourses(state))for(const input of course.weeklyRules||[]){
    if(!input.enabled)continue;
    let preview;try{preview=previewWeeklyRule(state,course.id,{...input,automatic:true},today);}catch{continue;}
    for(const row of preview.rows){
      if(!row.include||row.existingId||row.date<today||row.conflicts?.length)continue;
      upsertRuleEvent(course,preview.rule,row);added++;
    }
  }
  return added;
}
