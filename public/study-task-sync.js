import {scheduleCourses,ensureStudyCourse,matchingStudyCourse} from "./study-workspace.js";
// Linked courses use the progress tree as the only active task store.
export function studyTaskIndex(state){
  const tasks={};
  for(const semester of state.semesters||[])for(const course of semester.courses||[])for(const category of course.categories||[])for(const task of category.tasks||[])
    tasks[task.id]={id:task.id,raw:structuredClone(task),group:category.name,categoryId:category.id,courseId:course.id,courseName:course.name,semesterId:semester.id,semesterName:semester.name,title:task.title||task.name||""};
  return {tasks};
}
export function findStudyTask(state,id){
  for(const semester of state.semesters||[])for(const course of semester.courses||[])for(const category of course.categories||[]){const task=category.tasks.find(t=>t.id===id);if(task)return {semester,course,category,task};}
  for(const course of state.degreePlan?.modules.flatMap(m=>m.courses)||[])if(!course.courseId){const task=course.tasks?.find(t=>t.id===id);if(task)return {course,task};}
  return null;
}
export function setStudyTaskDone(state,id,done,degreeCourseId=""){
  const degreeCourse=state.degreePlan?.modules.flatMap(m=>m.courses).find(c=>c.id===degreeCourseId);
  const independent=degreeCourse&&!degreeCourse.courseId;
  const found=independent?{task:degreeCourse.tasks?.find(t=>t.id===id)}:findStudyTask(state,id);if(!found?.task)return false;
  found.task.done=done===true;
  if(!independent&&!done&&state.timer?.active?.taskId===id)state.timer.active.markTaskDone=false;
  return true;
}
const dayBefore=date=>{const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);};
const weekOf=date=>{const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);};
const localToday=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
const shortTask=task=>({id:task.id,title:task.title||task.raw?.title||task.raw?.name||"",group:task.group||""});
function archive(course,meta){
  if(!meta?.id)return;
  course.planTaskArchive ||= [];
  const existing=course.planTaskArchive.find(a=>a.task.id===meta.id);
  if(!existing)course.planTaskArchive.push({group:meta.group||"",task:structuredClone(meta.raw||meta)});
}
function migrateLocalTasks(state,course,linked){
  if(!course.tasks?.length)return;
  const all=studyTaskIndex(state).tasks;
  for(const task of course.tasks){
    let id=task.id;
    if(all[id]?.courseId===linked.id)continue;
    if(all[id])id=crypto.randomUUID();
    let category=linked.categories.find(c=>c.name===(task.group||"未分组"));
    if(!category){category={id:crypto.randomUUID(),name:task.group||"未分组",tasks:[],degreePlanGenerated:true};linked.categories.push(category);}
    category.tasks.push({...structuredClone(task),legacyPlanTask:true,id,title:task.title||task.name,done:task.done===true,estimatedHours:task.hours??task.estimatedHours??null,
      plannedDate:task.date||task.plannedDate||"",plannedStart:task.startTime||"",plannedEnd:task.endTime||"",planImportKey:task.importKey||"",planSeriesKey:task.seriesKey||"",privatePlanTask:true,note:task.note||"",attachments:task.attachments||[]});
    for(const event of course.planEvents||[])if(event.taskId===task.id)event.taskId=id;
  }
  course.tasks=[];
}
export function reconcileLinkedTasks(state,before=null,today=localToday()){
  const previous=before?.tasks||{};
  const degree=state.degreePlan?.modules.flatMap(m=>m.courses)||[];
  for(const course of degree){const match=!course.courseId&&matchingStudyCourse(state,course);if(course.tasks?.length||match&&!degree.some(c=>c.courseId===match.id))ensureStudyCourse(state,course);}
  const courses=scheduleCourses(state);
  for(const course of courses){const linked=state.semesters?.flatMap(s=>s.courses).find(c=>c.id===course.courseId);if(linked)migrateLocalTasks(state,course,linked);}
  const current=studyTaskIndex(state).tasks;
  for(const course of courses){
    const linked=state.semesters?.flatMap(s=>s.courses).find(c=>c.id===course.courseId);
    const active=new Map(Object.values(current).filter(t=>t.courseId===course.courseId).map(t=>[t.id,t]));
    for(const task of course.tasks||[])active.set(task.id,{id:task.id,raw:task,title:task.title||task.name,group:task.group||""});
    const old=Object.values(previous).filter(t=>t.courseId===course.courseId);
    for(const task of old)if(!active.has(task.id))archive(course,task);
    const removed=[...old,...(course.planTaskArchive||[]).map(a=>({id:a.task.id,raw:a.task,title:a.task.title||a.task.name,group:a.group}))].filter(t=>!active.has(t.id));
    const kept=[];
    for(const source of course.planEvents||[]){
      const event=source;
      if(event.taskId){
        const task=active.get(event.taskId);
        if(task){
          const oldTask=previous[task.id];
          if(event.autoTaskTitle||oldTask&&[oldTask.title,[oldTask.group,oldTask.title].filter(Boolean).join(" · ")].includes(event.title))
            event.title=[task.group,task.title].filter(Boolean).join(" · ");
          event.taskSnapshot=shortTask(task);
        }else{
          const meta=removed.find(t=>t.id===event.taskId)||{id:event.taskId,title:event.taskSnapshot?.title||event.title,group:event.taskSnapshot?.group||""};
          archive(course,meta.raw?meta:null);
          course.planEventArchive ||= [];
          if(!course.planEventArchive.some(a=>a.event.id===event.id))course.planEventArchive.push({event:structuredClone(event),reason:"deleted-task"});
          continue;
        }
      }
      if(event.taskWeekLinks){
        for(const [week,id]of Object.entries(event.taskWeekLinks))if(!active.has(id)){
          const meta=removed.find(t=>t.id===id)||{id,title:event.taskSnapshot?.title||event.title,group:""};
          (event.removedTaskWeeks ||= {})[week]=shortTask(meta);
          if(event.repeat){
            const skip=new Set(event.repeat.exceptDates||[]);
            for(let date=event.date;date<=event.repeat.until;date=new Date(Date.parse(date+"T12:00:00Z")+86400000).toISOString().slice(0,10))
              if(weekOf(date)===week)skip.add(date);
            event.repeat.exceptDates=[...skip];
          }
          if(!event.repeat&&weekOf(event.date)===week)event.deletedTaskOccurrence=true;
          delete event.taskWeekLinks[week];
        }
      }
      if(event.taskSeriesKey){
        const missing=removed.filter(t=>(t.raw.planSeriesKey||t.raw.seriesKey)===event.taskSeriesKey&&(t.raw.weekOf||""));
        if(missing.length){
          event.removedTaskWeeks={...(event.removedTaskWeeks||{})};
          const liveSeries=[...active.values()].some(t=>(t.raw.planSeriesKey||t.raw.seriesKey)===event.taskSeriesKey);
          for(const task of missing){
            const week=task.raw.weekOf;event.removedTaskWeeks[week]=shortTask(task);
            if(event.repeat){
              const skip=new Set(event.repeat.exceptDates||[]);
              for(let date=event.date;date<=event.repeat.until;){if(weekOf(date)===week&&event.repeat.weekdays.includes(new Date(date+"T12:00:00Z").getUTCDay()||7))skip.add(date);
                const next=new Date(date+"T12:00:00Z");next.setUTCDate(next.getUTCDate()+1);date=next.toISOString().slice(0,10);}
              event.repeat={...event.repeat,exceptDates:[...skip]};
            }
          }
          if(!liveSeries){course.planEventArchive ||= [];if(!course.planEventArchive.some(a=>a.event.id===event.id))course.planEventArchive.push({event:structuredClone(source),reason:"deleted-task"});continue;}
        }
      }
      if(!event.deletedTaskOccurrence)kept.push(event);
    }
    course.planEvents=kept;
    if(course.courseId&&!linked){course.courseId="";course.passTaskId="";for(const rule of course.weeklyRules||[])rule.enabled=false;}
    if(linked)for(const rule of course.weeklyRules||[]){const category=linked.categories.find(c=>c.id===rule.categoryId);if(category)rule.categoryName=category.name;else rule.enabled=false;}
    const ids=new Set(active.keys());if(course.planTaskArchive)course.planTaskArchive=course.planTaskArchive.filter(a=>!ids.has(a.task.id));
  }
  const active=state.timer?.active;
  if(active?.taskId){
    const task=current[active.taskId];
    if(task){active.semesterId=task.semesterId;active.courseId=task.courseId;active.categoryId=task.categoryId;delete active.archivedTask;}
    else if(previous[active.taskId]){const meta=previous[active.taskId];active.archivedTask={semesterId:meta.semesterId,semesterName:meta.semesterName,courseId:meta.courseId,courseName:meta.courseName,categoryId:meta.categoryId,categoryName:meta.group,taskId:meta.id,taskName:meta.title};active.markTaskDone=false;}
  }
  return studyTaskIndex(state);
}
