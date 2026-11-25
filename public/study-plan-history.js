import {matchImportedItem} from "./study-plan-update-core.js";
import {courseStudyTasks,applyCourseStudyPlan} from "./study-plan-core.js";
const findCourse=(state,id)=>{const course=state.degreePlan?.modules.flatMap(m=>m.courses).find(c=>c.id===id);if(!course)throw new Error("Course missing");return course;};
export function captureCoursePlan(state,courseId){
  const course=findCourse(state,courseId);
  return {link:course.courseId||"",range:structuredClone(course.planRange||null),tasks:courseStudyTasks(course,state.semesters).map(t=>{const {canonical,...task}=t;return task;}),events:structuredClone(course.planEvents||[]),weeklyRules:structuredClone(course.weeklyRules||[])};
}

export function planContent(value){
  return JSON.stringify(value, (key,v)=>["done","executed","completedDates","scheduleExecuted","doneEdited","executionEdited","providedFields","partial","canonical"].includes(key)?undefined:v);
}

export function snapshotPatch(before,after){
  const result={};
  for(const key of ["tasks","events"]){
    const old=new Map(before[key].map(t=>[t.id,t])),current=new Set(after[key].map(t=>t.id));
    result[key]={upsert:after[key].filter(t=>!old.has(t.id)||planContent(old.get(t.id))!==planContent(t)),remove:before[key].filter(t=>!current.has(t.id)).map(t=>t.id)};
  }
  if(planContent(before.range)!==planContent(after.range))result.range=after.range;
  if(before.link!==after.link)result.link=after.link;
  if(planContent(before.weeklyRules||[])!==planContent(after.weeklyRules||[]))result.weeklyRules=after.weeklyRules||[];
  return result;
}

export function applySnapshotPatch(snapshot,patch){
  const next=structuredClone(snapshot);
  for(const key of ["tasks","events"]){const values=new Map(next[key].map(t=>[t.id,t]));for(const id of patch[key]?.remove||[])values.delete(id);for(const item of patch[key]?.upsert||[])values.set(item.id,structuredClone(item));next[key]=[...values.values()];}
  for(const key of ["range","link","weeklyRules"])if(Object.hasOwn(patch,key))next[key]=structuredClone(patch[key]);
  return next;
}

export function coursePlanVersions(course){
  let snapshot;
  return (course.planHistory||[]).map(version=>{snapshot=version.snapshot?structuredClone(version.snapshot):applySnapshotPatch(snapshot,version.patch);return {...version,snapshot:structuredClone(snapshot)};});
}

export function recordCoursePlanChange(state,courseId,before,label="修改计划"){
  const course=findCourse(state,courseId),after=captureCoursePlan(state,courseId);
  if(planContent(before)===planContent(after))return;
  course.planHistory ||= [];
  const add=(snapshot,title)=>{
    const previous=coursePlanVersions(course).at(-1)?.snapshot;
    course.planHistory.push({id:crypto.randomUUID(),createdAt:new Date().toISOString(),label:title,
      ...(previous?{patch:snapshotPatch(previous,snapshot)}:{snapshot:structuredClone(snapshot)})});
  };
  if(!course.planHistory.length)add(before,"更新前");
  else if(planContent(coursePlanVersions(course).at(-1).snapshot)!==planContent(before))add(before,"更新前");
  add(after,label);
  const trim=target=>{const versions=coursePlanVersions(target);if(versions.length<=2)return false;target.planHistory.shift();target.planHistory[0].snapshot=versions[1].snapshot;delete target.planHistory[0].patch;return true;};
  while(course.planHistory.length>20||new TextEncoder().encode(JSON.stringify(course.planHistory)).length>131072){if(!trim(course))break;}
  const all=state.degreePlan.modules.flatMap(m=>m.courses);
  while(new TextEncoder().encode(JSON.stringify(all.map(c=>c.planHistory||[]))).length>524288){
    const oldest=all.filter(c=>c.planHistory?.length>2).sort((a,b)=>a.planHistory[0].createdAt.localeCompare(b.planHistory[0].createdAt))[0];
    if(!oldest||!trim(oldest))break;
  }
  if(new TextEncoder().encode(JSON.stringify(state)).length>2*1024*1024-8192)throw new Error("计划历史容量不足，请先导出备份并清理较大的附件。");
}

export function saveCoursePlanUpdate(state,courseId,input){
  const before=captureCoursePlan(state,courseId),oldTasks=new Map(before.tasks.map(t=>[t.id,t])),oldEvents=new Map(before.events.map(e=>[e.id,e]));
  const tasks=input.tasks.map(t=>({...t,...(oldTasks.has(t.id)&&!t.doneEdited?{done:oldTasks.get(t.id).done}:{})}));
  const events=input.events.map(e=>({...e,...(oldEvents.has(e.id)?{executed:e.executionEdited?e.executed:oldEvents.get(e.id).executed,
    completedDates:[...new Set([...(oldEvents.get(e.id).completedDates||[]),...(e.completedDates||[])])]}:{})}));
  applyCourseStudyPlan(state,courseId,{...input,tasks,events});
  recordCoursePlanChange(state,courseId,before,input.historyLabel||"修改计划");
}

export function coursePlanRestorePreview(state,courseId,versionId){
  const course=findCourse(state,courseId),target=coursePlanVersions(course).find(v=>v.id===versionId)?.snapshot;
  if(!target)throw new Error("计划版本不存在。");
  const current=captureCoursePlan(state,courseId);
  const remap=new Map();
  const targetTasks=target.tasks.map(t=>{const match=matchImportedItem({...t,mergeIntoId:""},current.tasks);if(match)remap.set(t.id,match.id);return {...t,id:match?.id||t.id};});
  const targetEvents=target.events.map(e=>({...e,taskId:remap.get(e.taskId)||e.taskId}));
  const targetIds=new Set(targetTasks.map(t=>t.id)),currentById=new Map(current.tasks.map(t=>[t.id,t]));
  const protectedTask=t=>t.done||(state.timer?.sessions||[]).some(s=>s.taskId===t.id)||state.timer?.active?.taskId===t.id||
    current.events.some(e=>e.taskId===t.id&&(e.userScheduled||e.executed||(e.completedDates||[]).length));
  const kept=current.tasks.filter(t=>!targetIds.has(t.id)&&protectedTask(t));
  const tasks=targetTasks.map(t=>({...t,done:currentById.get(t.id)?.done??course.planTaskArchive?.find(a=>a.task.id===t.id)?.task.done??t.done,doneEdited:false}));
  tasks.push(...kept);
  const targetEventIds=new Set(targetEvents.map(e=>e.id)),currentEvents=new Map(current.events.map(e=>[e.id,e]));
  const events=targetEvents.map(e=>({...e,executed:currentEvents.get(e.id)?.executed??e.executed,completedDates:[...new Set([...(e.completedDates||[]),...(currentEvents.get(e.id)?.completedDates||[])])]}));
  events.push(...current.events.filter(e=>!targetEventIds.has(e.id)&&(e.userScheduled||e.executed||e.completedDates?.length||kept.some(t=>t.id===e.taskId))));
  return {tasks,events,weeklyRules:target.weeklyRules||[],range:target.range,link:current.link,keptLink:target.link!==current.link,keptTasks:kept.length,changes:snapshotPatch(current,{...target,tasks,events}),versionId};
}

export function restoreCoursePlanVersion(state,courseId,versionId){
  const before=captureCoursePlan(state,courseId),course=findCourse(state,courseId),restore=coursePlanRestorePreview(state,courseId,versionId);
  const learning=state.semesters.flatMap(s=>s.courses).find(c=>c.id===restore.link);
  if(learning)for(const rule of restore.weeklyRules||[]){
    let category=learning.categories.find(c=>c.id===rule.categoryId);
    if(!category){category={id:rule.categoryId,name:rule.categoryName,tasks:[],degreePlanGenerated:true};learning.categories.push(category);}
    else category.name=rule.categoryName;
  }
  if(learning)for(const task of restore.tasks){
    if(learning.categories.some(c=>c.tasks.some(t=>t.id===task.id)))continue;
    const archived=course.planTaskArchive?.find(a=>a.task.id===task.id);if(!archived)continue;
    let category=learning.categories.find(c=>c.name===archived.group);
    if(!category){category={id:crypto.randomUUID(),name:archived.group,tasks:[],degreePlanGenerated:true};learning.categories.push(category);}
    category.tasks.push(structuredClone(archived.task));
  }
  applyCourseStudyPlan(state,courseId,{...restore,replaceLinkedTasks:true});
  if(restore.range===null)delete course.planRange;
  recordCoursePlanChange(state,courseId,before,"恢复历史版本");
}

export function preserveLiveHistory(restored,live,{preserveProgress=false}={}){
  restored.timer=structuredClone(live.timer);
  for(const course of restored.degreePlan?.modules.flatMap(m=>m.courses)||[]){
    const current=live.degreePlan?.modules.flatMap(m=>m.courses).find(c=>c.id===course.id);
    if(current?.planHistory)course.planHistory=structuredClone(current.planHistory);
    if(current?.planTaskArchive){const activeIds=new Set([...(course.tasks||[]),...restored.semesters.flatMap(s=>s.courses).flatMap(c=>c.categories).flatMap(c=>c.tasks)].map(t=>t.id));course.planTaskArchive=structuredClone(current.planTaskArchive.filter(a=>!activeIds.has(a.task.id)));}
  }
  if(preserveProgress){
    for(const stage of live.semesters||[])for(const course of stage.courses){
      const protectedTask=t=>t.done||(live.timer?.sessions||[]).some(s=>s.taskId===t.id)||live.timer?.active?.taskId===t.id;
      let target=restored.semesters.flatMap(s=>s.courses).find(c=>c.id===course.id);
      if(!target&&course.categories.some(c=>c.tasks.some(protectedTask))){
        let targetStage=restored.semesters.find(s=>s.id===stage.id);
        if(!targetStage){targetStage={...structuredClone(stage),courses:[]};restored.semesters.push(targetStage);}
        target={...structuredClone(course),categories:[]};targetStage.courses.push(target);
      }
      if(!target)continue;
      for(const category of course.categories)for(const task of category.tasks){
        const existing=target.categories.flatMap(c=>c.tasks).find(t=>t.id===task.id);
        if(existing)existing.done=task.done;
        else if(protectedTask(task)){
          let group=target.categories.find(c=>c.id===category.id);
          if(!group){group={...structuredClone(category),tasks:[]};target.categories.push(group);}
          group.tasks.push(structuredClone(task));
        }
      }
    }
    for(const course of restored.degreePlan?.modules.flatMap(m=>m.courses)||[]){
      const current=live.degreePlan?.modules.flatMap(m=>m.courses).find(c=>c.id===course.id);
      for(const task of course.tasks||[]){const old=current?.tasks.find(t=>t.id===task.id);if(old)task.done=old.done;}
      for(const task of current?.tasks||[])if(!course.tasks.some(t=>t.id===task.id)&&(task.done||(live.timer?.sessions||[]).some(s=>s.taskId===task.id)))course.tasks.push(structuredClone(task));
    }
  }
  return restored;

}
