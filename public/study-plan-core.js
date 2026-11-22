import { creditNumber, parseStudyTasks, setProgressLink } from "./degree-core.js";

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
      if (task.id === course.passTaskId) continue;
      result.push({
        id: task.id, canonical: true, title: task.title || task.name, group: category.name,
        detail: task.detail || "", hours: task.estimatedHours ?? null, done: task.done,
        date: task.plannedDate || "", startTime: task.plannedStart || "", endTime: task.plannedEnd || "",
        weekOf: task.weekOf || "", deadline: task.deadline || "", blockId: task.planBlockId || "",
        importKey: task.planImportKey || "", userScheduled: task.userScheduled === true
      });
    }
  }
  return result;
}

function normalizeTask(task) {
  const title = text(task.title, 180);
  const rawHours = task.estimatedHours ?? task.hours;
  const hours = planHours(rawHours);
  const date = text(task.date || task.plannedDate, 10);
  const startTime = text(task.startTime, 5);
  const endTime = text(task.endTime, 5);
  const weekOf = text(task.weekOf, 10);
  const deadline = text(task.deadline, 10);
  if (!title || [date, weekOf, deadline].some(value => value && !validPlanDate(value)) ||
    !validTime(startTime) || !validTime(endTime) || (startTime && !date) ||
    (endTime && (!startTime || endTime <= startTime))) throw new Error(title || "Invalid task");
  if (hours === null && rawHours !== null && rawHours !== undefined && text(rawHours) &&
    !/^(?:待定|待估算|未知|未估算|tbd|unknown|\?)$/i.test(text(rawHours))) throw new Error(title);
  return {
    id: task.id || crypto.randomUUID(), title, group: text(task.group, 100), detail: text(task.detail, 4000),
    hours, date, startTime, endTime, weekOf, deadline, blockId: task.blockId ?? "",
    canonical: task.canonical === true, done: task.done === true, importKey: text(task.importKey, 1000), userScheduled: task.userScheduled === true
  };
}

function normalizeEvent(event) {
  const title = text(event.title, 180);
  const date = text(event.date, 10);
  const startTime = text(event.startTime, 5);
  const endTime = text(event.endTime, 5);
  const type = ["class", "workshop", "deadline", "milestone", "study"].includes(event.type) ? event.type : "study";
  if (!title || !validPlanDate(date) || !validTime(startTime) || !validTime(endTime) ||
    (endTime && (!startTime || endTime <= startTime))) throw new Error(title || "Invalid event");
  let repeat;
  if (event.repeat) {
    if(event.repeat.frequency && event.repeat.frequency!=="weekly")throw new Error("Only weekly recurrence is supported");
    const until = event.repeat.until;
    const weekdays = event.repeat.weekdays || [new Date(date + "T12:00:00Z").getUTCDay() || 7];
    const exceptDates = event.repeat.exceptDates || event.repeat.excludeDates || [];
    if (!validPlanDate(until) || until < date || until > addPlanDays(date, 366) || !Array.isArray(weekdays) || !weekdays.length ||
      weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7) ||
      !Array.isArray(exceptDates) || exceptDates.some(day => !validPlanDate(day))) throw new Error(title);
    repeat = { frequency: "weekly", until, weekdays: [...new Set(weekdays)], exceptDates: [...new Set(exceptDates)] };
  }
  return { id: event.id || crypto.randomUUID(), title, type, date, startTime, endTime,
    detail: text(event.detail, 4000), taskId: text(event.taskId, 100), repeat,
    importKey: text(event.importKey, 1000) || sourceKey([type, title, date, startTime]) };
}

export function scheduleOccurrences(event, from, until) {
  if (!event.repeat) return event.date >= from && event.date <= until ? [{ ...event, occurrenceId: event.id + ":" + event.date }] : [];
  const result = [];
  const last = until < event.repeat.until ? until : event.repeat.until;
  const first = from > event.date ? from : event.date;
  for (let date = first; date <= last; date = addPlanDays(date, 1)) {
    const weekday = new Date(date + "T12:00:00Z").getUTCDay() || 7;
    if (event.repeat.weekdays.includes(weekday) && !event.repeat.exceptDates.includes(date)) {
      result.push({ ...event, date, occurrenceId: event.id + ":" + date });
    }
  }
  return result;
}

export function parseCoursePlan(input, course, plan, range) {
  const events = [];
  const tasks = [];
  const weeklyTasks = [];
  const blocks = plan.blocks.map(block => ({ ...block, aliases: [
    block.name.replace("Vorlesungszeit", "上课期间").replace("Vorlesungsfreie Zeit", "假期"),
    block.name.replace("Vorlesungszeit", "Teaching period").replace("Vorlesungsfreie Zeit", "Semester break")
  ] }));
  const start = range.start;
  const end = range.end;
  if (!validPlanDate(start) || !validPlanDate(end) || end < start || end > addPlanDays(start, 366)) throw new Error("计划日期范围");
  const addEvent = event => events.push(normalizeEvent(event));
  if (Array.isArray(input.tasks)) {
    for (const raw of input.tasks) {
      if(raw.repeat?.frequency && raw.repeat.frequency!=="weekly")throw new Error("Only weekly recurrence is supported");
      const task = normalizeTask({ ...raw, id: crypto.randomUUID(), importKey: raw.id ? "task:" + raw.id : raw.importKey });
      if (raw.repeat) weeklyTasks.push({ task, from: raw.repeat.from || start, until: raw.repeat.until || end,
        exceptDates: raw.repeat.exceptDates || [] });
      else tasks.push(task);
    }
    for (const raw of input.events || []) addEvent({ ...raw, id: crypto.randomUUID(), importKey: raw.id ? "event:" + raw.id : raw.importKey });
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
      tasks.push({ ...weekly.task, id: crypto.randomUUID(), weekOf: week, date: "",
        importKey: sourceKey([weekly.task.importKey || weekly.task.title, weekly.task.group, week]) });
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
    if (task.date) task.blockId = plan.blocks.find(block => block.start <= task.date && block.end >= task.date)?.id || "";
  }
  return { tasks, events };
}

export function mergeImportedPlan(existingTasks, existingEvents, imported) {
  const tasks = existingTasks.map(task => ({ ...task }));
  const events = existingEvents.map(event => ({ ...event }));
  let addedTasks = 0;
  let addedEvents = 0;
  for (const task of imported.tasks) {
    const candidates=tasks.filter(item=>!item.importKey && item.title===task.title && (item.group||"")===(task.group||"") &&
      (!item.date || item.date===task.date) && (!item.weekOf || item.weekOf===task.weekOf));
    const previous = tasks.find(item => taskKey(item) === taskKey(task)) || (candidates.length===1 ? candidates[0] : undefined);
    if (previous) { const arranged = previous.userScheduled ? { date: previous.date, startTime: previous.startTime, endTime: previous.endTime, userScheduled: true } : {}; Object.assign(previous, task, { id: previous.id, done: previous.done, canonical: previous.canonical }, arranged); }
    else { tasks.push(task); addedTasks++; }
  }
  for (const event of imported.events) {
    const previous = events.find(item => item.importKey === event.importKey);
    if (previous) { const repeat = event.repeat ? { ...event.repeat, exceptDates: [...new Set([...(previous.repeat?.exceptDates || []), ...event.repeat.exceptDates])] } : undefined; Object.assign(previous, event, { id: previous.id, repeat }); }
    else { events.push(event); addedEvents++; }
  }
  return { tasks, events, addedTasks, addedEvents };
}

export function applyCourseStudyPlan(state, courseId, input) {
  const course = state.degreePlan.modules.flatMap(module => module.courses).find(item => item.id === courseId);
  if (!course) throw new Error("Course missing");
  if (input.range && (!validPlanDate(input.range.start) || !validPlanDate(input.range.end) || input.range.end < input.range.start ||
    input.range.end > addPlanDays(input.range.start,366) || (input.range.exceptDates || []).some(day=>!validPlanDate(day)))) throw new Error("Invalid plan range");
  let tasks = input.tasks.map(normalizeTask);
  const events = input.events.map(normalizeEvent);
  if (!input.link) {
    setProgressLink(course, "", "", state.semesters);
    course.tasks = tasks.map(({ canonical, ...task }) => task);
  } else {
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
    if(course.courseId!==learning.id && learning.categories.some(category=>category.tasks.length)) {
      const target=courseStudyTasks({...course,tasks:[],courseId:learning.id,passTaskId:""},state.semesters);
      tasks=mergeImportedPlan(target,[],{tasks,events:[]}).tasks;
    }
    const before = courseStudyTasks(course, state.semesters).filter(task => task.canonical && course.courseId === learning.id);
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
    for (const category of learning.categories) category.tasks = category.tasks.filter(task => !removed.has(task.id));
    for (const task of tasks) {
      const previousCategory = learning.categories.find(category => category.tasks.some(item => item.id === task.id));
      const previous = previousCategory?.tasks.find(item => item.id === task.id);
      let category = learning.categories.find(item => item.name === (task.group || "未分组"));
      if (!category) {
        category = { id: crypto.randomUUID(), name: task.group || "未分组", tasks: [], degreePlanGenerated: true };
        learning.categories.push(category);
      }
      const saved = { ...previous, id: previous?.id || task.id, title: task.title, name: task.title,
        detail: task.detail, done: task.done, estimatedHours: task.hours, plannedDate: task.date,
        plannedStart: task.startTime, plannedEnd: task.endTime, weekOf: task.weekOf,
        deadline: task.deadline, planBlockId: task.blockId, planImportKey: task.importKey, userScheduled: task.userScheduled,
        privatePlanTask: previous ? previous.privatePlanTask === true : true,
        note: previous?.note || "", attachments: previous?.attachments || [], collapsed: previous?.collapsed ?? true };
      if (previousCategory) previousCategory.tasks = previousCategory.tasks.filter(item => item.id !== saved.id);
      category.tasks.push(saved);
    }
    setProgressLink(course, learning.id, course.courseId === learning.id ? course.passTaskId : "", state.semesters);
    course.tasks = [];
  }
  const savedTasks = courseStudyTasks(course, state.semesters);
  for (const event of events) {
    const bound = savedTasks.find(task => task.id === event.taskId || task.importKey === "task:" + event.taskId);
    event.taskId = bound?.id || "";
  }
  course.planEvents = events;
  if (input.range) course.planRange = input.range;
}

export function studyScheduleEntries(state, from, until) {
  if (!state.degreePlan) return [];
  const entries = [];
  const seen = new Set();
  for (const course of state.degreePlan.modules.flatMap(module => module.courses)) {
    for (const event of course.planEvents || []) {
      for (const occurrence of scheduleOccurrences(event, from, until)) {
        entries.push({ ...occurrence, course, kind: "event", id: "plan-event:" + event.id + ":" + occurrence.date });
      }
    }
    for (const task of courseStudyTasks(course, state.semesters)) {
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      if(task.deadline && task.deadline>=from && task.deadline<=until) entries.push({...task,kind:"event",type:"deadline",sourceTask:true,date:task.deadline,startTime:"",endTime:"",course,taskId:task.id,id:"plan-deadline:"+task.id});
      if (task.date && (task.date < from || task.date > until)) continue;
      if (!task.date && task.weekOf && (addPlanDays(task.weekOf, 6) < from || task.weekOf > until)) continue;
      if(!task.date && entries.some(entry=>entry.course.id===course.id && entry.kind==="event" && entry.taskId===task.id &&
        entry.startTime && entry.type==="study")) continue;
      entries.push({ ...task, taskId: task.id, course, kind: "task", id: "plan-task:" + task.id });
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
