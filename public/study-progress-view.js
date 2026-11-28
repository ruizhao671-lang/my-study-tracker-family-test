import {studyTaskItems,validPlanDate} from "./study-plan-core.js";
// Read the same task allocations used by the planner. Never parse notes as schedule data.
export function progressTaskName(task){
  return [task.title||task.name||"",task.detail||""].filter(Boolean).join(" ");
}
const todayKey=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
export function progressTaskScheduleIndex(state,today=todayKey()){
  const result=new Map();
  for(const task of studyTaskItems(state,"0001-01-01","9999-12-31")){
    const slots=[...task.allocations].sort((a,b)=>a.date.localeCompare(b.date)||(a.startTime||"").localeCompare(b.startTime||""));
    const focus=slots.find(s=>s.date>=today)||slots.at(-1);
    result.set(task.taskId,{taskId:task.taskId,courseId:task.course.id,title:task.title,group:task.group,done:task.done===true,
      mode:task.schedulingMode,slots:slots.map(s=>({id:s.id,date:s.date,startTime:s.startTime||"",endTime:s.endTime||"",period:s.period||""})),
      window:task.window,deadline:task.deadline||"",plannedHours:task.plannedHours,actualHours:task.actualHours,
      focusDate:focus?.date||[task.window.start,task.window.end,task.deadline,today].find(validPlanDate)});
  }
  return result;
}
export function taskSchedulePresentation(task,english=false){
  const w=(zh,en)=>english?en:zh;
  const slotText=slot=>[slot.date,slot.startTime?slot.startTime+(slot.endTime?"–"+slot.endTime:""):slot.period||w("时刻未定","Time TBD")].join(" ");
  const times=task.slots.map(slotText);
  if(!times.length&&task.mode!=="fixed"&&!task.deadline&&!task.window.start&&!task.window.end)return {text:"",tooltip:""};
  let text=times.length?w("已安排：","Scheduled: ")+times.slice(0,2).join(" / ")+(times.length>2?w(" 等 "+times.length+" 段"," · "+times.length+" sessions"):""):
    task.mode==="fixed"?w("固定课程：时间待定","Fixed class: time TBD"):w("待安排学习时间","Study time unscheduled");
  if(task.deadline)text+=" · "+w("截止：","Due: ")+task.deadline;
  if(!times.length&&task.window.start)text+=" · "+w("完成范围：","Completion window: ")+task.window.start+(task.window.end&&task.window.end!==task.window.start?" — "+task.window.end:"");
  return {text,tooltip:[...times,w("点击查看同一任务的日历安排","Open this task on the calendar")].join("\n")};
}
