import {scheduleCourses,findScheduleCourse,ensureStudyCourse} from "./study-workspace.js";
import {repairFixedClassLinks} from "./study-class-links.js";
import {studyTaskIndex,reconcileLinkedTasks} from "./study-task-sync.js";
import {TASK_FIELDS,EVENT_FIELDS,importFields,matchImportedItem,hydrateImportedItem,itemIdentity,validateImportIds} from "./study-plan-update-core.js";
import { creditNumber, parseStudyTasks, setProgressLink, nextExam, isEarned, TUM_TERMS } from "./degree-core.js";

export function validPlanDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function addPlanDays(date, count) {
  const next = new Date(date + "T12:00:00Z");
  next.setUTCDate(next.getUTCDate() + count);
  return next.toISOString().slice(0, 10);
}
export function planWeek(date) {
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  return addPlanDays(date, -((day + 6) % 7));
}
const text = (value, maximum = 1000) => String(value ?? "").trim().slice(0, maximum);
const sourceKey = fields => JSON.stringify(fields);
const validTime = time => !time || /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
const planHours = value => value === null || value === undefined || String(value).trim() === "" ||
  /^(?:待定|待估算|未知|未估算|tbd|unknown|\?)$/i.test(String(value).trim()) ? null : creditNumber(value);
const taskKey = task => task.importKey || sourceKey([task.group || "", task.title, task.date || "", task.weekOf || "", task.startTime || ""]);

export function courseStudyTasks(course, semesters) {
  const result = (course.tasks || []).map(task => ({ ...task, canonical: false }));
  const linked = semesters.flatMap(stage => stage.courses).find(item => item.id === course.courseId);
  for (const category of linked?.categories || []) {
    for (const task of category.tasks) {
      result.push({
        id: task.id, categoryId:category.id, canonical: true,legacyPlanTask:task.legacyPlanTask===true,classDefaultMode:task.classDefaultMode===true,fixedTimePending:task.fixedTimePending===true, schedulingMode:explicitMode(task.schedulingMode), title: task.title || task.name, group: category.name,
        detail: task.detail || "", hours: task.estimatedHours ?? null, done: task.done,
        date: task.plannedDate || "", startTime: task.plannedStart || "", endTime: task.plannedEnd || "",
        weekOf: task.weekOf || "", deadline: task.deadline || "", blockId: task.planBlockId || "",
        windowStart:task.windowStart||"",windowEnd:task.windowEnd||"",teachingWeek:task.teachingWeek||null,
        importKey: task.planImportKey || "",importAliases:task.planImportAliases||[], userScheduled: task.userScheduled === true,
        seriesKey: task.planSeriesKey || "", scheduleExecuted: task.scheduleExecuted === true,
        scheduleHours: task.scheduleHours ?? null, period: task.plannedPeriod || ""
      });
    }
  }
  return result;
}


const explicitMode=value=>["fixed","flexible"].includes(value)?value:"";
export function eventSchedulingMode(event,task){
  return explicitMode(task?.schedulingMode)||explicitMode(event.schedulingMode)||(["class","workshop"].includes(event.type)?"fixed":"flexible");
}
export function taskScheduleEvents(task,events){
  return events.filter(event=>event.taskId===task.id||Object.values(event.taskWeekLinks||{}).includes(task.id)||event.taskId&&task.importKey==="task:"+event.taskId||event.taskSeriesKey&&event.taskSeriesKey===task.seriesKey&&
    (!task.weekOf||scheduleOccurrences(event,task.weekOf,addPlanDays(task.weekOf,6)).length));
}
export function taskSchedulingMode(task,events=[]){
  const linked=events.filter(event=>event.taskId===task.id||Object.values(event.taskWeekLinks||{}).includes(task.id)||event.taskId&&task.importKey==="task:"+event.taskId||event.taskSeriesKey&&event.taskSeriesKey===task.seriesKey);
  if(!task.classDefaultMode&&explicitMode(task.schedulingMode))return task.schedulingMode;
  return linked.length?(linked.some(event=>eventSchedulingMode(event)==="fixed")?"fixed":"flexible"):explicitMode(task.schedulingMode)||"flexible";
}
export function studyCalendarWeek(date,plan={}){
  if(!validPlanDate(date))return null;
  const start=planWeek(date),end=addPlanDays(start,6),thursday=new Date(addPlanDays(start,3)+"T12:00:00Z"),isoYear=thursday.getUTCFullYear();
  const isoWeek=1+Math.round((Date.parse(start)-Date.parse(planWeek(isoYear+"-01-04")))/604800000);
  const term=plan.examSource==="tum-ei"?TUM_TERMS.find(t=>t.lectureStart<=end&&t.lectureEnd>=start):null;
  const block=term?{start:term.lectureStart,end:term.lectureEnd,name:term.term}:plan.examSource==="tum-ei"?null:(plan.blocks||[]).find(b=>b.kind==="lecture"&&b.start<=end&&b.end>=start);
  const holiday=term?.lectureBreaks?.some(b=>b.start<=end&&b.end>=start)===true;
  return {start,end,isoYear,isoWeek,teachingWeek:block?1+Math.round((Date.parse(start)-Date.parse(planWeek(block.start)))/604800000):null,term:block?.name||"",holiday};
}
export function studyWeekLabel(date,plan={},english=false,{dates=true}={}){
  const week=studyCalendarWeek(date,plan);if(!week)return "";
  return [week.teachingWeek?(english?"Calendar week ":"校历第 ")+week.teachingWeek+(english?"":" 周"):"",
    "KW "+week.isoWeek+" · "+week.isoYear,dates?week.start+" — "+week.end:"",week.holiday?(english?"Includes lecture-free days":"本周含校历停课日"):""].filter(Boolean).join(" · ");
}
function validateFixedTasks(tasks,events){
  for(const task of tasks)if(task.schedulingMode==="fixed"&&!task.fixedTimePending&&!(task.date&&task.startTime)&&
    !taskScheduleEvents(task,events).some(event=>event.date&&event.startTime))
    throw new Error("固定时间任务「"+task.title+"」需要日期和开始时间，或关联已有固定日程。");
  for(const event of events)if(event.schedulingMode==="fixed"&&eventSchedulingMode(event,tasks.find(t=>t.id===event.taskId))==="fixed"&&["study","class","workshop"].includes(event.type)&&!(event.date&&event.startTime))
    throw new Error("固定安排「"+event.title+"」需要日期和开始时间。");
}

export function studyPlanFocusDate(course, semesters, currentDate) {
  const dated = new Set();
  for (const event of course.planEvents || []) {
    if (!validPlanDate(event.date)) continue;
    for (const occurrence of scheduleOccurrences(event,event.date,event.repeat?.until || event.date)) dated.add(occurrence.date);
  }
  const tasks=courseStudyTasks(course,semesters);
  for(const task of tasks)for(const date of [task.date,task.deadline])if(validPlanDate(date))dated.add(date);
  const dates=[...dated].sort();
  if(dates.length)return dates.find(date=>date>=currentDate) || dates.at(-1);
  const weeks=[...new Set(tasks.map(task=>task.weekOf).filter(validPlanDate))].sort();
  if(weeks.length)return weeks.find(week=>week>=planWeek(currentDate)) || weeks.at(-1);
  return validPlanDate(course.planRange?.start) ? course.planRange.start : currentDate;
}

function normalizeTask(task) {
  if(task.schedulingMode&&!explicitMode(task.schedulingMode))throw new Error("Invalid scheduling mode");
  const title = text(task.title, 180);
  const rawHours = task.estimatedHours ?? task.hours;
  const hours = planHours(rawHours);
  const date = text(task.date || task.plannedDate, 10);
  const startTime = text(task.startTime, 5);
  const endTime = text(task.endTime, 5);
  const weekOf = text(task.weekOf, 10);
  const deadline = text(task.deadline, 10);
  const windowStart=text(task.windowStart,10),windowEnd=text(task.windowEnd,10),teachingWeek=task.teachingWeek==null||task.teachingWeek===""?null:Number(task.teachingWeek);
  if([windowStart,windowEnd].some(value=>value&&!validPlanDate(value)) || (windowStart&&windowEnd&&windowEnd<windowStart) ||
    (teachingWeek!==null&&(!Number.isInteger(teachingWeek)||teachingWeek<1||teachingWeek>100)))throw new Error("Invalid task completion window");
  if ((!title&&!task.partial) || [date, weekOf, deadline].some(value => value && !validPlanDate(value)) ||
    !validTime(startTime) || !validTime(endTime) || (startTime && !date&&!task.partial) ||
    (endTime && (!startTime || endTime <= startTime)&&!task.partial)) throw new Error(title || "Invalid task");
  if (hours === null && rawHours !== null && rawHours !== undefined && text(rawHours) &&
    !/^(?:待定|待估算|未知|未估算|tbd|unknown|\?)$/i.test(text(rawHours))) throw new Error(title);
  return {
    id: task.id || crypto.randomUUID(),partial:task.partial===true,providedFields:task.providedFields||importFields(task),doneEdited:task.doneEdited===true,importAliases:task.importAliases||[], title, categoryId:text(task.categoryId,100), group: text(task.group, 100), detail: text(task.detail, 4000),
    schedulingMode:explicitMode(task.schedulingMode),classDefaultMode:task.classDefaultMode===true,fixedTimePending:task.fixedTimePending===true,hours, date, startTime, endTime, windowStart,windowEnd,teachingWeek,weekOf:weekOf?planWeek(weekOf):"", deadline, blockId: task.blockId ?? "",
    canonical: task.canonical === true,legacyPlanTask:task.legacyPlanTask===true, done: task.done === true, importKey: text(task.importKey, 1000), userScheduled: task.userScheduled === true,
    seriesKey: text(task.seriesKey,1000), scheduleExecuted: task.scheduleExecuted === true,
    scheduleHours: planHours(task.scheduleHours), period:text(task.period,80)
  };
}

function normalizeEvent(event) {
  if(event.schedulingMode&&!explicitMode(event.schedulingMode))throw new Error("Invalid scheduling mode");
  const title = text(event.title, 180);
  const date = text(event.date, 10);
  const startTime = text(event.startTime, 5);
  const endTime = text(event.endTime, 5);
  const type = ["class", "workshop", "deadline", "milestone", "study"].includes(event.type) ? event.type : "study";
  const weekOf=text(event.weekOf,10);
  const rawHours=event.hours ?? event.estimatedHours;
  const hours=planHours(rawHours);
  if(hours===null && rawHours!==null && rawHours!==undefined && text(rawHours) &&
    !/^(?:待定|待估算|未知|未估算|tbd|unknown|\?)$/i.test(text(rawHours)))throw new Error("Invalid planned hours");
  if(startTime&&!endTime&&hours!=null&&Number(startTime.slice(0,2))*60+Number(startTime.slice(3))+hours*60>1440)throw new Error("Split a midnight-crossing session into two dates");
  if ((!title&&!event.partial) || (date ? !validPlanDate(date) : type!=="study"&&!event.partial) || (weekOf && !validPlanDate(weekOf)) || !validTime(startTime) || !validTime(endTime) ||
    (startTime&&!date&&!event.partial) || (endTime && (!startTime || endTime <= startTime)&&!event.partial)) throw new Error(title || "Invalid event");
  let repeat;
  if (event.repeat) {
    if(!date&&!event.partial)throw new Error("Repeating events require a start date");
    if(event.repeat.frequency && event.repeat.frequency!=="weekly")throw new Error("Only weekly recurrence is supported");
    const until = event.repeat.until || "";
    const weekdays = event.repeat.weekdays || (date||until ? [new Date((date||until) + "T12:00:00Z").getUTCDay() || 7] : []);
    const exceptDates = event.repeat.exceptDates || event.repeat.excludeDates || [];
    if ((until ? !validPlanDate(until) : !event.partial) || (date&&until&&until < date) || (date&&until&&until > addPlanDays(date, 366)) || !Array.isArray(weekdays) || (!weekdays.length&&!event.partial) ||
      weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7) ||
      !Array.isArray(exceptDates) || exceptDates.some(day => !validPlanDate(day))) throw new Error(title);
    repeat = { frequency: "weekly", until, weekdays: [...new Set(weekdays)], exceptDates: [...new Set(exceptDates)] };
  }
  return { id: event.id || crypto.randomUUID(),partial:event.partial===true,providedFields:event.providedFields||importFields(event,"event"),importAliases:event.importAliases||[],executionEdited:event.executionEdited===true,repeatProvidedFields:event.repeatProvidedFields, title, type, date, startTime, endTime,
    schedulingMode:explicitMode(event.schedulingMode),detail: text(event.detail, 4000), taskId: text(event.taskId, 100), taskSeriesKey:text(event.taskSeriesKey,1000), repeat,
    hours,userScheduled:event.userScheduled===true,batchRuleId:text(event.batchRuleId,100),autoTaskTitle:event.autoTaskTitle===true,
    taskWeekLinks:event.taskWeekLinks,autoLinkDisabled:event.autoLinkDisabled===true,
    taskSnapshot:event.taskSnapshot,archivedTask:event.archivedTask,removedTaskWeeks:event.removedTaskWeeks,weekOf:weekOf?planWeek(weekOf):"",period:text(event.period,80),executed:event.executed===true,
    completedDates: [...new Set((event.completedDates || []).filter(validPlanDate))].slice(0,500),
    importKey: text(event.importKey, 1000) || sourceKey([type, title, date, startTime]),
    ...(event.migratedTaskId ? {migratedTaskId:text(event.migratedTaskId,100),legacyTaskDone:event.legacyTaskDone===true} : {}) };
}

export function scheduleOccurrences(event, from, until) {
  if (!event.repeat) return event.date && event.date >= from && event.date <= until ? [{ ...event, occurrenceId: event.id + ":" + event.date, executed:event.executed===true }] : [];
  const result = [];
  const last = until < event.repeat.until ? until : event.repeat.until;
  const first = from > event.date ? from : event.date;
  for (let date = first; date <= last; date = addPlanDays(date, 1)) {
    const weekday = new Date(date + "T12:00:00Z").getUTCDay() || 7;
    if (event.repeat.weekdays.includes(weekday) && !event.repeat.exceptDates.includes(date)) {
      result.push({ ...event, date, occurrenceId: event.id + ":" + date, executed:(event.completedDates || []).includes(date) });
    }
  }
  return result;
}

export function parseCoursePlan(input, course, plan, range) {
  const events = [];
  const tasks = [];
  const weeklyTasks = [];
  const blocks = (plan?.blocks||[]).map(block => ({ ...block, aliases: [
    block.name.replace("Vorlesungszeit", "上课期间").replace("Vorlesungsfreie Zeit", "假期"),
    block.name.replace("Vorlesungszeit", "Teaching period").replace("Vorlesungsfreie Zeit", "Semester break")
  ] }));
  const start = range.start;
  const end = range.end;
  if (!validPlanDate(start) || !validPlanDate(end) || end < start || end > addPlanDays(start, 366)) throw new Error("计划日期范围");
  const addEvent = event => events.push(normalizeEvent(event));
  if (Array.isArray(input.tasks)) {
    validateImportIds(input.tasks,"task");validateImportIds(input.events||[],"event");
    for (const raw of input.tasks) {
      if(raw.repeat?.frequency && raw.repeat.frequency!=="weekly")throw new Error("Only weekly recurrence is supported");
      const task = normalizeTask({ ...raw,partial:Boolean(raw.id),providedFields:[...importFields(raw),...(raw.repeat?["weekOf","seriesKey"]:[])],doneEdited:false,importAliases:[], id: crypto.randomUUID(), importKey: raw.id ? "task:" + raw.id : raw.importKey, seriesKey:raw.repeat ? "task:"+(raw.id || raw.title) : raw.seriesKey||"" });
      if (raw.repeat) weeklyTasks.push({ task, from: raw.repeat.from || start, until: raw.repeat.until || end,
        exceptDates: raw.repeat.exceptDates || [] });
      else tasks.push(task);
    }
    for (const raw of input.events || []) addEvent({ ...raw,partial:Boolean(raw.id),providedFields:importFields(raw,"event"),repeatProvidedFields:raw.repeat?Object.keys(raw.repeat).map(k=>k==="excludeDates"?"exceptDates":k):undefined,executionEdited:false,importAliases:[], id: crypto.randomUUID(), importKey: raw.id ? "event:" + raw.id : raw.importKey });
  } else {
    for (const raw of String(input.tasks || "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith(String.fromCharCode(96))) continue;
      const columns = line.replace(/^[|｜]|[|｜]$/g, "").split(/[|｜]/).map(part => part.trim());
      if (columns.every(column => /^:?-{2,}:?$/.test(column)) || /^(时间块|study period)$/i.test(columns[0])) continue;
      if (columns.length !== 4) {
        tasks.push(...parseStudyTasks(line, blocks).map(normalizeTask));
        continue;
      }
      const [when, group, title, hours] = columns;
      const weekly = when.match(/^每周([一二三四五六日天])(?:\s+(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2}))?$/);
      const dated = when.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2}))?$/);
      if (weekly || dated) {
        const firstTime = weekly?.[2] || dated?.[2] || "";
        const lastTime = weekly?.[3] || dated?.[3] || "";
        const timeFields = { startTime: firstTime ? firstTime.padStart(5, "0") : "", endTime: lastTime ? lastTime.padStart(5, "0") : "" };
        const type = /workshop|讲座|课堂|上课|课程/i.test(group) ? /workshop/i.test(group) ? "workshop" : "class" :
          /截止|deadline/i.test(group) ? "deadline" : "";
        if (weekly || type) {
          addEvent({ title, type: type || "study", date: weekly ? start : dated[1], ...timeFields,
            importKey: sourceKey([when, group, title]),
            repeat: weekly ? { until: end, weekdays: [weekly[1] === "天" ? 7 : "一二三四五六日".indexOf(weekly[1]) + 1],
              exceptDates: range.exceptDates || [] } : undefined });
        } else {
          tasks.push(normalizeTask({ title, group, hours: hours.replace(/\s*(h|小时)$/i, ""), date: dated[1], ...timeFields }));
        }
      } else {
        const parsed = parseStudyTasks(line, blocks)[0];
        if (!parsed) continue;
        if (/当周|每周|weekly/i.test(title)) weeklyTasks.push({ task: normalizeTask(parsed), from: start, until: end, exceptDates: [] });
        else tasks.push(normalizeTask(parsed));
      }
    }
    for (const event of [...events]) {
      if (!event.repeat) continue;
      for (const match of event.title.matchAll(/(\d{1,2})月(\d{1,2})日([^；;）)]+)/g)) {
        let year = Number(start.slice(0, 4));
        let date = year + "-" + match[1].padStart(2, "0") + "-" + match[2].padStart(2, "0");
        if (date < start) date = ++year + date.slice(4);
        if (validPlanDate(date) && date <= end) addEvent({ title: match[3].trim(), type: "milestone", date,
          importKey: sourceKey(["milestone", date, match[3]]) });
      }
    }
  }
  for (const weekly of weeklyTasks) {
    if (!validPlanDate(weekly.from) || !validPlanDate(weekly.until) || weekly.until < weekly.from ||
      weekly.until > addPlanDays(weekly.from, 366)) throw new Error(weekly.task.title);
    for (let week = planWeek(weekly.from); week <= weekly.until; week = addPlanDays(week, 7)) {
      if (weekly.exceptDates.includes(week)) continue;
      tasks.push({ ...weekly.task, id: crypto.randomUUID(), weekOf: week, date: "",windowStart:"",windowEnd:"",
        teachingWeek:weekly.task.teachingWeek==null?null:weekly.task.teachingWeek+Math.round((Date.parse(week)-Date.parse(planWeek(weekly.from)))/604800000),
        importKey: weekly.task.seriesKey?sourceKey([weekly.task.seriesKey,week]):sourceKey([weekly.task.importKey || weekly.task.title, weekly.task.group, week]) });
    }
  }
  for(const event of events){
    const bound=tasks.find(task=>task.id===event.taskId || task.importKey==="task:"+event.taskId);
    if(bound)event.taskId=bound.id;
    else if(event.taskId && tasks.some(task=>task.seriesKey==="task:"+event.taskId)){
      event.taskSeriesKey="task:"+event.taskId;event.taskId="";
    }
  }
  for (const event of events.filter(event => !event.repeat && /替代|replaces?/i.test(event.title + " " + event.detail))) {
    for (const recurring of events.filter(item => item.repeat && item.type === "class")) {
      if (scheduleOccurrences(recurring, event.date, event.date).length) {
        recurring.repeat.exceptDates = [...new Set([...recurring.repeat.exceptDates, event.date])];
      }
    }
  }
  for (const task of tasks) {
    if (task.date) task.blockId = (plan?.blocks||[]).find(block => block.start <= task.date && block.end >= task.date)?.id || "";
  }
  return { tasks, events };
}

export function mergeImportedPlan(existingTasks,existingEvents,imported){
  let convertedTasks=0;
  const importedEvents=imported.events.map(e=>({...e}));
  const tasks=existingTasks.filter(task=>{
    if(task.canonical!==false&&!task.legacyPlanTask)return true;
    const type=/workshop/i.test(task.group||"")?"workshop":/^(课堂|上课|课程|class|lecture)$/i.test(task.group||"")?"class":"";
    const event=type&&importedEvents.find(e=>e.type===type&&e.title===task.title);
    if(!event)return true;
    event.migratedTaskId=task.id;event.legacyTaskDone=task.done===true;convertedTasks++;return false;
  }).map(t=>({...t}));
  const events=existingEvents.map(e=>({...e})),taskIds=new Map();
  let addedTasks=0,addedEvents=0;
  const aliases=(old,incoming,kind)=>[...new Set([...(old.importAliases||[]),...(incoming.importAliases||[]),itemIdentity(old,kind)])].filter(key=>key!==itemIdentity(incoming,kind)).slice(-40);
  for(const task of imported.tasks){
    const previous=matchImportedItem(task,tasks);
    taskIds.set(task.id,previous?.id||task.id);
    if(previous){
      if(task.decision==="keep")continue;
      const value=hydrateImportedItem(task,previous),fields=task.providedFields||importFields(task);
      const patch=Object.fromEntries(fields.filter(key=>TASK_FIELDS.includes(key)).map(key=>[key,value[key]]));
      const arranged=previous.userScheduled&&task.decision!=="apply"?Object.fromEntries(["date","startTime","endTime","userScheduled"].map(key=>[key,previous[key]])):{};
      Object.assign(previous,patch,{importAliases:aliases(previous,task,"task"),importKey:task.importKey||previous.importKey,
        done:task.doneEdited?task.done===true:previous.done,doneEdited:task.doneEdited||previous.doneEdited,
        classDefaultMode:fields.includes("schedulingMode")?false:previous.classDefaultMode,
        canonical:previous.canonical,scheduleExecuted:previous.scheduleExecuted===true,scheduleHours:previous.scheduleHours??task.scheduleHours},arranged);
    }else{tasks.push({...task,...(task.forceNew?{importKey:"copy:"+task.id}:{})});addedTasks++;}
  }
  for(const event of importedEvents){
    if(taskIds.has(event.taskId))event.taskId=taskIds.get(event.taskId);
    const previous=matchImportedItem(event,events,"event");
    if(previous){
      if(event.decision==="keep")continue;
      const value=hydrateImportedItem(event,previous,"event"),fields=event.providedFields||importFields(event,"event");
      const patch=Object.fromEntries(fields.filter(key=>EVENT_FIELDS.includes(key)).map(key=>[key,value[key]]));
      if(patch.repeat){if(event.repeatProvidedFields)patch.repeat={...(previous.repeat||{}),...Object.fromEntries(event.repeatProvidedFields.map(key=>[key,patch.repeat[key]]))};patch.repeat={...patch.repeat,exceptDates:[...new Set([...(previous.repeat?.exceptDates||[]),...(patch.repeat.exceptDates||[])])]};}
      const arranged=previous.userScheduled&&!event.arrangementEdited&&event.decision!=="apply"?
        Object.fromEntries(["date","startTime","endTime","hours","weekOf","period","userScheduled"].map(key=>[key,previous[key]])):{};
      Object.assign(previous,patch,{importAliases:aliases(previous,event,"event"),importKey:event.importKey||previous.importKey,
        executed:event.executionEdited?event.executed===true:previous.executed===true,executionEdited:event.executionEdited||previous.executionEdited,
        completedDates:[...new Set([...(previous.completedDates||[]),...(event.completedDates||[])])]},arranged);
    }else{events.push({...event,...(event.forceNew?{importKey:"copy:"+event.id}:{})});addedEvents++;}
  }
  return {tasks,events,addedTasks,addedEvents,convertedTasks};
}

export function applyCourseStudyPlan(state, courseId, input) {
  const taskSnapshot=studyTaskIndex(state);
  const course = findScheduleCourse(state,courseId);
  if (!course) throw new Error("Course missing");
  if (input.range && (!validPlanDate(input.range.start) || !validPlanDate(input.range.end) || input.range.end < input.range.start ||
    input.range.end > addPlanDays(input.range.start,366) || (input.range.exceptDates || []).some(day=>!validPlanDate(day)))) throw new Error("Invalid plan range");
  input={...input,link:ensureStudyCourse(state,course,input.link,false).id};
  let tasks = input.tasks.map(task=>normalizeTask({...task,partial:false}));
  const events = input.events.map(event=>normalizeEvent({...event,partial:false}));
  const previousTasks=courseStudyTasks(course,state.semesters);
  for(const task of tasks)if(task.schedulingMode==="fixed"&&!(task.date&&task.startTime)&&!taskScheduleEvents(task,events).some(e=>e.date&&e.startTime)&&previousTasks.some(t=>t.id===task.id&&taskSchedulingMode(t,course.planEvents)==="fixed"))task.fixedTimePending=true;
  validateFixedTasks(tasks,events);
  {
    let learning = state.semesters.flatMap(stage => stage.courses).find(item => item.id === input.link);
    if (!learning) {
      let stage = state.semesters.find(stage => stage.studyPlanStage);
      if (!stage) {
        stage = { id: crypto.randomUUID(), name: "学习计划", kind: "module", courses: [], studyPlanStage: true };
        state.semesters.push(stage);
      }
      learning = { id: crypto.randomUUID(), name: course.name, categories: [], label: "", degreePlanGenerated: true };
      stage.courses.push(learning);
    }
    if(!input.replaceLinkedTasks && course.courseId!==learning.id && learning.categories.some(category=>category.tasks.length)) {
      const target=courseStudyTasks({...course,tasks:[],courseId:learning.id,passTaskId:""},state.semesters);
      tasks=mergeImportedPlan(target,[],{tasks,events:[]}).tasks;
    }
    const before = courseStudyTasks({...course,tasks:[],courseId:learning.id}, state.semesters).filter(task => task.canonical);
    const remapped = new Map();
    for(const task of tasks) {
      if(!learning.categories.some(category=>category.tasks.some(item=>item.id===task.id)) &&
        state.semesters.some(stage=>stage.courses.some(item=>item.id!==learning.id && item.categories.some(category=>category.tasks.some(other=>other.id===task.id))))) {
        const old=task.id;task.id=crypto.randomUUID();remapped.set(old,task.id);
      }
    }
    for(const event of events)if(remapped.has(event.taskId))event.taskId=remapped.get(event.taskId);
    const retained = new Set(tasks.map(task => task.id));
    const removed = new Set(before.filter(task => !retained.has(task.id)).map(task => task.id));
    course.planTaskArchive ||= [];
    for(const category of learning.categories)for(const task of category.tasks)if(removed.has(task.id)){
      course.planTaskArchive=course.planTaskArchive.filter(a=>a.task.id!==task.id);
      course.planTaskArchive.push({group:category.name,task:structuredClone(task)});
    }
    for (const category of learning.categories) category.tasks = category.tasks.filter(task => !removed.has(task.id));
    for (const task of tasks) {
      const previousCategory = learning.categories.find(category => category.tasks.some(item => item.id === task.id));
      const previous = previousCategory?.tasks.find(item => item.id === task.id);
      let category = learning.categories.find(item => item.id===task.categoryId&&item.name===(task.group||"未分组"))||learning.categories.find(item => item.name === (task.group || "未分组"));
      if (!category) {
        category = { id: crypto.randomUUID(), name: task.group || "未分组", tasks: [], degreePlanGenerated: true };
        learning.categories.push(category);
      }
      const saved = { ...previous, id: previous?.id || task.id, title: task.title, name: task.title,
        schedulingMode:task.schedulingMode,classDefaultMode:task.classDefaultMode,legacyPlanTask:task.legacyPlanTask,fixedTimePending:task.fixedTimePending,detail: task.detail, done: task.done, estimatedHours: task.hours, plannedDate: task.date,
        plannedStart: task.startTime, plannedEnd: task.endTime, weekOf: task.weekOf,
        deadline: task.deadline,windowStart:task.windowStart,windowEnd:task.windowEnd,teachingWeek:task.teachingWeek, planBlockId: task.blockId, planImportKey: task.importKey,planImportAliases:task.importAliases||[], userScheduled: task.userScheduled,
        planSeriesKey:task.seriesKey,scheduleExecuted:task.scheduleExecuted,scheduleHours:task.scheduleHours,plannedPeriod:task.period,
        privatePlanTask: previous ? previous.privatePlanTask === true : true,
        note: previous?.note || "", attachments: previous?.attachments || [], collapsed: previous?.collapsed ?? true };
      if (previousCategory) previousCategory.tasks = previousCategory.tasks.filter(item => item.id !== saved.id);
      category.tasks.push(saved);
      if(course.planTaskArchive)course.planTaskArchive=course.planTaskArchive.filter(a=>a.task.id!==saved.id);
    }
    setProgressLink(course, learning.id, course.courseId === learning.id ? course.passTaskId : "", state.semesters);
    course.tasks = [];
  }
  const savedTasks = courseStudyTasks(course, state.semesters);
  for (const event of events) {
    const bound = savedTasks.find(task => task.id === event.taskId || task.importKey === "task:" + event.taskId);
    event.taskId = bound?.id || (taskSnapshot.tasks[event.taskId]||course.planTaskArchive?.some(a=>a.task.id===event.taskId)?event.taskId:"");
  }
  course.planEvents = events.map(({partial,providedFields,executionEdited,repeatProvidedFields,...event})=>event);
  if (input.range) course.planRange = input.range;
  if(Array.isArray(input.weeklyRules))course.weeklyRules=structuredClone(input.weeklyRules);
  reconcileLinkedTasks(state,taskSnapshot);
  repairFixedClassLinks(state);
}

export function studyScheduleEntries(state, from, until) {
  const entries = [];
  const seen = new Set();
  for (const course of scheduleCourses(state)) {
    const tasks=courseStudyTasks(course,state.semesters);
    for (const event of course.planEvents || []) {
      const occurrences=event.date ? scheduleOccurrences(event,from,until) :
        (!event.weekOf || (event.weekOf<=until && addPlanDays(event.weekOf,6)>=from)) ? [{...event,executed:event.executed===true}] : [];
      for (const occurrence of occurrences) {
        const mapped=event.taskWeekLinks?.[planWeek(occurrence.date||occurrence.weekOf||from)];
        const task=mapped?tasks.find(t=>t.id===mapped):event.taskSeriesKey ? tasks.find(task=>task.seriesKey===event.taskSeriesKey && task.weekOf===planWeek(occurrence.date || occurrence.weekOf || from)) : tasks.find(task=>task.id===occurrence.taskId);
        const archived=event.archivedTask||event.removedTaskWeeks?.[planWeek(occurrence.date||occurrence.weekOf||from)];
        entries.push({ ...occurrence,archivedTask:archived, schedulingMode:task?taskSchedulingMode(task,course.planEvents):eventSchedulingMode(occurrence),taskId:task?.id || occurrence.taskId, taskGroup:task?.group||archived?.group||"", taskTitle:task?.title||archived?.title||"", contentDone:task?.done===true, course, kind: "event", id: "plan-event:" + event.id + ":" + (occurrence.date || "flexible") });
      }
    }
    for (const task of tasks) {
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      if(task.deadline && task.deadline>=from && task.deadline<=until) entries.push({...task,kind:"event",type:"deadline",sourceTask:true,date:task.deadline,startTime:"",endTime:"",course,taskId:task.id,id:"plan-deadline:"+task.id});
      if (task.date && (task.date < from || task.date > until)) continue;
      if (!task.date && task.weekOf && (addPlanDays(task.weekOf, 6) < from || task.weekOf > until)) continue;
      if(!task.date && entries.some(entry=>entry.course.id===course.id && entry.kind==="event" && entry.taskId===task.id &&
        entry.type==="study")) continue;
      entries.push({ ...task, schedulingMode:taskSchedulingMode(task,course.planEvents),taskId: task.id, executed:task.scheduleExecuted===true, course, kind: "task", id: "plan-task:" + task.id });
    }
  }
  return entries;
}

export function taskActualHours(state, taskId, from, until) {
  const start = from ? new Date(from + "T00:00:00").getTime() : -Infinity;
  const end = until ? new Date(addPlanDays(until, 1) + "T00:00:00").getTime() : Infinity;
  return (state.timer?.sessions || []).filter(session => session.taskId === taskId).reduce((sum, session) => {
    const overlap = Math.max(0, Math.min(end, session.endAt) - Math.max(start, session.startAt));
    const span = Math.max(1, session.endAt - session.startAt);
    return sum + Math.min(session.durationMs, overlap * session.durationMs / span) / 3600000;
  }, 0);
}

export function studySessionHours(entry) {
  if(entry.startTime && entry.endTime){
    const minutes=time=>Number(time.slice(0,2))*60+Number(time.slice(3));
    return Math.max(0,(minutes(entry.endTime)-minutes(entry.startTime))/60);
  }
  if(entry.kind==="task" && entry.scheduleHours!=null)return entry.scheduleHours;
  if(entry.hours!=null)return Number(entry.hours)||0;
  return 0;
}

export function patchStudyScheduleEntry(state,courseId,entryId,date,changes) {
  const course=findScheduleCourse(state,courseId);
  if(!course)throw new Error("Course missing");
  const tasks=courseStudyTasks(course,state.semesters),events=structuredClone(course.planEvents||[]);
  const [kind,id]=entryId.split(":");
  const {taskDone,viaDrag,...scheduleChanges}=changes;
  const sourceEntry=studyScheduleEntries(state,date||"0001-01-01",date||"9999-12-31").find(entry=>entry.id===entryId);
  if(viaDrag&&sourceEntry?.schedulingMode==="fixed")throw new Error("固定时间不能拖动，请先切换为自由安排。");
  if("schedulingMode" in changes){const target=tasks.find(task=>task.id===(kind==="plan-task"?id:sourceEntry?.taskId));if(target){target.schedulingMode=changes.schedulingMode;target.classDefaultMode=false;}}
  changes=scheduleChanges;
  if(typeof taskDone==="boolean"){
    const entry=studyScheduleEntries(state,date||"0001-01-01",date||"9999-12-31").find(entry=>entry.id===entryId);
    const target=tasks.find(task=>task.id===(kind==="plan-task"?id:entry?.taskId));
    if(target){target.done=taskDone;target.doneEdited=true;}
  }
  if(kind==="plan-task" || kind==="plan-deadline"){
    const task=tasks.find(task=>task.id===id);
    if(!task)throw new Error("Task missing");
    if(kind==="plan-deadline"){if("date" in changes)task.deadline=changes.date;}
    else{
      for(const key of ["date","startTime","endTime","period"])if(key in changes)task[key]=changes[key];
      if("hours" in changes)task.scheduleHours=changes.hours;
      if("executed" in changes)task.scheduleExecuted=changes.executed===true;
      task.userScheduled=true;
    }
  }else{
    const event=events.find(event=>event.id===id);
    if(!event)throw new Error("Time plan missing");
    if(event.repeat){
      const before={...event,hours:event.hours??(event.startTime&&event.endTime?studySessionHours(event):null),date,taskId:event.taskSeriesKey?event.taskId:sourceEntry?.taskId||event.taskId,taskSeriesKey:event.taskSeriesKey,executed:(event.completedDates||[]).includes(date)};
      changes=Object.fromEntries(Object.entries(changes).filter(([key,value])=>JSON.stringify(value??"")!==JSON.stringify(before[key]??"")));
    }
    if(event.repeat && Object.keys(changes).every(key=>key==="executed")){
      const dates=new Set(event.completedDates||[]);
      if("executed" in changes){if(changes.executed)dates.add(date);else dates.delete(date);}
      event.completedDates=[...dates];
    }else if(event.repeat){
      const already=(event.completedDates||[]).includes(date);
      event.repeat.exceptDates=[...new Set([...event.repeat.exceptDates,date])];
      const task=tasks.find(t=>t.id===sourceEntry?.taskId)|| (event.taskSeriesKey ? tasks.find(task=>task.seriesKey===event.taskSeriesKey && task.weekOf===planWeek(date)) : null);
      events.push({...event,...changes,id:crypto.randomUUID(),date:changes.date??date,repeat:undefined,
        taskId:changes.taskId??task?.id??event.taskId,taskSeriesKey:"",taskWeekLinks:undefined,executed:changes.executed??already,completedDates:[],
        importKey:"moved:"+event.id+":"+date});
    }else Object.assign(event,changes);
    if(Object.keys(changes).some(key=>["date","startTime","endTime","hours","weekOf","period"].includes(key)))event.userScheduled=true;
  }
  applyCourseStudyPlan(state,courseId,{tasks,events,link:course.courseId||"",range:course.planRange});
}

export function studyEntryStatus(entry,now=new Date()) {
  const type=entry.planType || entry.type;
  if(entry.kind==="exam" || type==="exam")return "exam";
  if(entry.kind==="record" || type==="record")return "record";
  const content=entry.contentTask || (entry.kind==="task" && !entry.date) || entry.sourceTask;
  if((type==="milestone" || type==="deadline" || type==="reminder") && !entry.sourceTask)return "date";
  if(content ? entry.done : entry.executed)return "complete";
  const current=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
  const due=content ? [entry.deadline,entry.windowEnd||(entry.weekOf?addPlanDays(entry.weekOf,6):"")].filter(validPlanDate).sort()[0] || entry.date || "" :
    entry.date || (entry.weekOf?addPlanDays(entry.weekOf,6):"");
  if(validPlanDate(due) && due<current)return "overdue";
  const endTime=entry.statusEndTime??entry.endTime;
  if(due===current && endTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)){
    const end=Number(endTime.slice(0,2))*60+Number(endTime.slice(3));
    if(end<=now.getHours()*60+now.getMinutes())return "overdue";
  }
  return "pending";
}

export function studyExamEntries(state,from,until) {
  const courses=scheduleCourses(state),result=new Map();
  const key=entry=>JSON.stringify([entry.course.id,entry.date,entry.startTime||""]);
  for(const course of courses){
    if(course.progressOnly||isEarned(course,state.semesters))continue;
    const exam=nextExam(course,state.degreePlan,from);
    if(!exam || exam.date<from || exam.date>until)continue;
    const entry={id:"plan-exam:"+course.id+":"+exam.id,kind:"exam",type:"exam",title:course.name,course,examId:exam.id,
      date:exam.date,startTime:exam.time||"",endTime:exam.endTime||"",location:exam.location||"",examKind:exam.kind||"",detail:exam.requirements||""};
    result.set(key(entry),entry);
  }
  for(const item of state.timer?.calendarItems||[]){
    if(item.type!=="exam" || item.date<from || item.date>until)continue;
    const course=courses.find(course=>course.id===item.degreeCourseId || (item.courseId && course.courseId===item.courseId)) ||
      {id:"",name:item.courseName||item.title};
    const entry={...item,id:"calendar-exam:"+item.id,kind:"exam",type:"exam",course,title:item.title,detail:item.requirements||item.details||"",sourceCalendarId:item.id,examId:item.degreeExamId||""};
    if(entry.examId && course.id)for(const [existingKey,existing] of result)if(existing.course.id===course.id && existing.examId===entry.examId)result.delete(existingKey);
    result.set(course.id?key(entry):"manual:"+item.id,entry);
  }
  return [...result.values()];
}

export function studyCalendarEntries(state,from,until) {
  const entries=[...studyScheduleEntries(state,from,until),...studyExamEntries(state,from,until)];
  const courses=scheduleCourses(state);
  for(const item of state.timer?.calendarItems||[]){
    if(item.type!=="reminder"||item.date<from||item.date>until)continue;
    const course=courses.find(c=>c.id===item.degreeCourseId||item.courseId&&c.courseId===item.courseId)||{id:"",name:item.courseName||""};
    entries.push({...item,id:"calendar-item:"+item.id,sourceCalendarId:item.id,course,kind:"calendar",detail:item.details||""});
  }
  return entries;
}


export function studySchedulePeriod(date,view="week"){
  if(!validPlanDate(date))throw new Error("Invalid schedule date");
  const first=view==="month"?date.slice(0,7)+"-01":view==="week"?planWeek(date):date;
  let last;
  if(view==="month"){const next=new Date(first+"T12:00:00Z");next.setUTCMonth(next.getUTCMonth()+1);last=addPlanDays(next.toISOString().slice(0,10),-1);}
  else last=addPlanDays(first,view==="week"?6:0);
  const count=1+Math.round((Date.parse(last)-Date.parse(first))/86400000);
  return {first,last,dates:Array.from({length:count},(_,i)=>addPlanDays(first,i))};
}
export function shiftStudyScheduleDate(date,view,direction){
  if(view!=="month")return addPlanDays(date,direction*(view==="week"?7:1));
  const target=new Date(date.slice(0,7)+"-01T12:00:00Z");target.setUTCMonth(target.getUTCMonth()+direction);
  const month=target.toISOString().slice(0,7),last=studySchedulePeriod(month+"-01","month").last;
  return month+"-"+String(Math.min(Number(date.slice(8)),Number(last.slice(8)))).padStart(2,"0");
}
export function studyMonthEntries(state,first,last){
  const entries=studyCalendarEntries(state,first,last).filter(e=>e.kind!=="exam");
  for(let date=first;date<=last;date=addPlanDays(date,1))entries.push(...studyExamEntries(state,date,date));
  return entries;
}

export function monthTaskWeeks(state,month,courseId="") {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return [];
  const first=month+"-01",next=new Date(first+"T12:00:00Z");next.setUTCMonth(next.getUTCMonth()+1);
  const last=addPlanDays(next.toISOString().slice(0,10),-1),tasks=studyTaskItems(state,first,last).filter(t=>!t.done&&(!courseId||t.course.id===courseId)),result=[];
  for(let start=planWeek(first);start<=last;start=addPlanDays(start,7)){
    const end=addPlanDays(start,6),matching=tasks.filter(t=>t.window.start?t.window.start<=end&&(!t.window.end||t.window.end>=start):
      t.window.end&&t.window.end>=start&&t.window.end<=end);
    if(matching.length)result.push({date:start,count:matching.length,taskIds:matching.map(t=>t.taskId)});
  }
  return result;
}

// Completion windows never reserve calendar hours. Legacy plannedDate remains a compatible time slot.
export function studyTaskWindow(task) {
  const start=task.windowStart||task.weekOf||"";
  const ends=[task.windowEnd||(task.weekOf?addPlanDays(task.weekOf,6):""),task.deadline].filter(validPlanDate).sort();
  return {start,end:ends[0]||"",teachingWeek:task.teachingWeek||Number(task.title?.match(/(?:\bweek\s*|第\s*)(\d+)\s*(?:周)?/i)?.[1])||null};
}
export function studyTaskItems(state,from,until) {
  const allocations=studyScheduleEntries(state,"0001-01-01","9999-12-31").filter(entry=>
    entry.taskId && (entry.kind==="task"&&entry.date || entry.kind==="event"&&["study","class","workshop"].includes(entry.type)&&entry.date));
  const seen=new Set(),result=[];
  for(const course of scheduleCourses(state)){
    for(const task of courseStudyTasks(course,state.semesters)){
      if(seen.has(task.id))continue;seen.add(task.id);
      const window={...studyTaskWindow(task),calendar:studyCalendarWeek(task.weekOf||task.windowStart||task.date||task.deadline,state.degreePlan)},slots=allocations.filter(entry=>entry.course.id===course.id&&entry.taskId===task.id);
      const plannedHours=slots.reduce((sum,slot)=>sum+studySessionHours(slot),0);
      const bucket=task.done?"complete":window.end&&window.end<from?"overdue":window.start&&window.start>until?"future":
        window.start||window.end?"current":"unscoped";
      result.push({...task,schedulingMode:taskSchedulingMode(task,course.planEvents),kind:"task",contentTask:true,id:"plan-task:"+task.id,taskId:task.id,course,window,bucket,allocations:slots,
        plannedHours,remainingHours:task.hours==null?null:Math.max(0,task.hours-plannedHours),actualHours:taskActualHours(state,task.id)});
    }
  }
  return result;
}
export function createTaskStudySession(state,courseId,taskId,values) {
  const course=findScheduleCourse(state,courseId);
  const tasks=course&&courseStudyTasks(course,state.semesters),task=tasks?.find(task=>task.id===taskId);
  if(!task)throw new Error("Task missing");
  if(taskSchedulingMode(task,course.planEvents)==="fixed")throw new Error("固定任务不能重复安排，请先切换为自由安排。");
  const event=normalizeEvent({...values,id:crypto.randomUUID(),type:"study",title:values.title||[task.group,task.title].filter(Boolean).join(" · "),taskId:task.id,userScheduled:true,autoTaskTitle:!values.title});
  const existing=(course.planEvents||[]).find(item=>item.taskId===taskId&&item.date===event.date&&item.startTime===event.startTime&&item.endTime===event.endTime&&item.hours===event.hours&&!item.repeat);
  if(existing)return existing.id;
  applyCourseStudyPlan(state,courseId,{tasks,events:[...(course.planEvents||[]),event],link:course.courseId||"",range:course.planRange});
  return event.id;
}
export function removeCourseStudyTask(state,courseId,taskId){
  const course=findScheduleCourse(state,courseId);
  if(!course)throw new Error("Course missing");
  const tasks=courseStudyTasks(course,state.semesters);
  if(!tasks.some(t=>t.id===taskId))throw new Error("Task missing");
  applyCourseStudyPlan(state,courseId,{tasks:tasks.filter(t=>t.id!==taskId),events:course.planEvents||[],link:course.courseId||"",range:course.planRange});
}
export function removeStudyScheduleEntry(state,courseId,entryId,date) {
  const course=findScheduleCourse(state,courseId);
  if(!course)throw new Error("Course missing");
  const [kind,id]=entryId.split(":"),tasks=courseStudyTasks(course,state.semesters);
  let events=structuredClone(course.planEvents||[]);
  if(kind==="plan-task"){
    const task=tasks.find(task=>task.id===id);if(!task)throw new Error("Task missing");
    Object.assign(task,{date:"",startTime:"",endTime:"",scheduleHours:null,scheduleExecuted:false,userScheduled:true});
  }else if(kind==="plan-event"){
    const event=events.find(event=>event.id===id);if(!event)throw new Error("Time plan missing");
    if(event.batchRuleId){const rule=course.weeklyRules?.find(r=>r.id===event.batchRuleId);if(rule)rule.excludedTaskIds=[...new Set([...(rule.excludedTaskIds||[]),event.taskId])];}
    if(event.repeat){if(!validPlanDate(date))throw new Error("Occurrence date required");event.repeat.exceptDates=[...new Set([...event.repeat.exceptDates,date])];}
    else events=events.filter(event=>event.id!==id);
  }else throw new Error("Only time plans can be removed");
  const targetId=studyScheduleEntries(state,date||"0001-01-01",date||"9999-12-31").find(e=>e.id===entryId)?.taskId;
  const target=tasks.find(t=>t.id===targetId);if(target&&taskSchedulingMode(target,course.planEvents)==="fixed")target.fixedTimePending=true;
  applyCourseStudyPlan(state,courseId,{tasks,events,link:course.courseId||"",range:course.planRange});
}
