// Repair orphan attendance tasks using existing class dates, never generate a second class.
const dateOK=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s));
const day=(s,n)=>{const d=new Date(s+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const week=s=>day(s,-((new Date(s+"T12:00:00Z").getUTCDay()+6)%7));
const ordinal=t=>Number(t.teachingWeek||String(t.title||t.name||"").match(/(?:\bweek\s*|第\s*)(\d+)\s*(?:周)?/i)?.[1])||0;
const lecture=name=>/^(vorlesung|lectures?|上课|课堂)$/i.test(String(name).trim());
function occurrences(e){
 if(!dateOK(e.date))return [];
 if(!e.repeat)return [e.date];
 const end=e.repeat.until;if(!dateOK(end)||end>day(e.date,366))return [];
 const result=[];for(let d=e.date;d<=end;d=day(d,1))if(e.repeat.weekdays.includes(new Date(d+"T12:00:00Z").getUTCDay()||7)&&!(e.repeat.exceptDates||[]).includes(d))result.push(d);
 return result;
}
export function repairFixedClassLinks(state){
 const before=JSON.stringify([state.degreePlan||null,state.semesters||[]]);
 for(const course of state.degreePlan?.modules.flatMap(m=>m.courses)||[]){
  const learning=state.semesters?.flatMap(s=>s.courses).find(c=>c.id===course.courseId);
  const tasks=learning?learning.categories.flatMap(c=>lecture(c.name)?c.tasks.map(raw=>({raw,group:c.name})):[]):(course.tasks||[]).filter(t=>lecture(t.group)).map(raw=>({raw,group:raw.group}));
  const numbered=tasks.filter(t=>ordinal(t.raw)>0);tasks.splice(0,tasks.length,...numbered);
  const sources=(course.planEvents||[]).filter(e=>["class","workshop"].includes(e.type)&&e.startTime&&!e.autoLinkDisabled);
  if(!tasks.length||!sources.length)continue;
  const defaultFixed=sources.some(e=>e.schedulingMode!=="flexible");
  for(const {raw:t}of tasks)if(!t.schedulingMode||t.classDefaultMode){t.classDefaultMode=true;t.schedulingMode=defaultFixed?"fixed":"flexible";t.fixedTimePending=defaultFixed&&!(t.plannedDate&&t.plannedStart||t.date&&t.startTime);}
  const anchors=new Set();
  for(const {raw:t}of tasks){
   const n=ordinal(t);if(!n)continue;
   let date=t.weekOf||t.windowStart;
   if(!dateOK(date)){const slot=(course.planEvents||[]).find(e=>e.taskId===t.id&&dateOK(e.date));date=slot?.date||t.plannedDate||t.date;}
   if(dateOK(date))anchors.add(day(week(date),(1-n)*7));
  }
  for(const rule of course.weeklyRules||[])if(rule.anchorWeekNumber&&dateOK(rule.anchorWeekDate||rule.fromWeek))anchors.add(day(week(rule.anchorWeekDate||rule.fromWeek),(1-rule.anchorWeekNumber)*7));
  if(!anchors.size&&tasks.some(({raw})=>ordinal(raw)===1)){
   const starts=sources.filter(e=>e.type==="class"&&e.repeat&&dateOK(e.date)).map(e=>e.date).sort();
   if(starts[0]&&dateOK(course.planRange?.start)&&week(starts[0])===week(course.planRange.start))anchors.add(week(starts[0]));
  }
  const anchor=anchors.size===1?[...anchors][0]:"",byWeek=new Map();
  for(const task of tasks){
   const t=task.raw,n=ordinal(t),date=t.weekOf||t.windowStart||t.plannedDate||t.date;
   const key=dateOK(date)?week(date):anchor&&n?day(anchor,(n-1)*7):"";
   if(key){if(!byWeek.has(key))byWeek.set(key,[]);byWeek.get(key).push(task);}
  }
  const options=new Map();
  for(const e of sources)for(const date of occurrences(e)){
   const key=week(date);if(!options.has(key))options.set(key,[]);options.get(key).push({e,date});
  }
  const duplicates=new Set();
  for(const [key,items]of byWeek){
   if(items.length!==1)continue;
   const {raw:t}=items[0];
   let slots=options.get(key)||[];
   // A dated workshop takes precedence only when the normal class is already excluded.
   if(slots.length!==1)continue;
   const {e,date}=slots[0],seriesMatch=e.taskSeriesKey&&(t.planSeriesKey||t.seriesKey)===e.taskSeriesKey;
   if(e.taskId&&e.taskId!==t.id||e.taskWeekLinks?.[key]&&e.taskWeekLinks[key]!==t.id)continue;
   if(!e.taskId&&!seriesMatch&&!e.taskWeekLinks?.[key]){
    if(e.repeat)(e.taskWeekLinks ||= {})[key]=t.id;else e.taskId=t.id;
    if(t.classDefaultMode)t.schedulingMode=e.schedulingMode==="flexible"?"flexible":"fixed";
    if(!t.weekOf&&!t.windowStart)t.weekOf=key;
   }
   if(e.taskId!==t.id&&!seriesMatch&&e.taskWeekLinks?.[key]!==t.id)continue;
   if(t.classDefaultMode)t.schedulingMode=e.schedulingMode==="flexible"?"flexible":"fixed";
   t.fixedTimePending=false;
   for(const other of course.planEvents||[]){
    if(other===e||other.type!=="study"||other.repeat||other.taskId!==t.id||other.date!==date||other.startTime!==e.startTime||other.autoLinkDisabled)continue;
    // Only duplicate attendance reservations; keep unrelated study blocks.
    const delta=e.endTime&&other.endTime?Math.abs(Date.parse(date+"T"+e.endTime)-Date.parse(date+"T"+other.endTime))/60000:0;
    if(delta>15)continue;
    if(other.executed){if(e.repeat)e.completedDates=[...new Set([...(e.completedDates||[]),date])];else e.executed=true;}
    course.planEventArchive ||= [];
    if(!course.planEventArchive.some(a=>a.event.id===other.id))course.planEventArchive.push({reason:"duplicate-class",targetId:e.id,event:structuredClone(other)});
    duplicates.add(other.id);
   }
   const planned=t.plannedDate||t.date;
   if(planned===date&&(t.plannedStart||t.startTime)===e.startTime){
    if(t.scheduleExecuted){if(e.repeat)e.completedDates=[...new Set([...(e.completedDates||[]),date])];else e.executed=true;}
    if(learning)Object.assign(t,{plannedDate:"",plannedStart:"",plannedEnd:"",scheduleHours:null,scheduleExecuted:false});
    else Object.assign(t,{date:"",startTime:"",endTime:"",scheduleHours:null,scheduleExecuted:false});
   }
  }
  if(duplicates.size)course.planEvents=course.planEvents.filter(e=>!duplicates.has(e.id));
 }
 return before!==JSON.stringify([state.degreePlan||null,state.semesters||[]]);
}
