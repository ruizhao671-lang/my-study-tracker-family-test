export const TASK_FIELDS=["schedulingMode","title","group","detail","hours","date","startTime","endTime","weekOf","deadline","windowStart","windowEnd","teachingWeek","blockId","seriesKey"];
export const EVENT_FIELDS=["schedulingMode","title","type","date","startTime","endTime","hours","weekOf","period","detail","taskId","taskSeriesKey","repeat"];
export function sourceId(item,kind="task"){
  const key=item.importKey||"",prefix=kind==="task"?"task:":"event:";
  if(key.startsWith(prefix))return key.slice(prefix.length);
  if(kind==="task"&&item.seriesKey&&item.weekOf)return item.seriesKey.replace(/^task:/,"")+"@"+item.weekOf;
  if(kind==="task"&&key.startsWith("[")){try{const parts=JSON.parse(key);if(String(parts[0]).startsWith("task:")&&/^\d{4}-\d{2}-\d{2}$/.test(parts.at(-1)))return String(parts[0]).slice(5)+"@"+parts.at(-1);}catch{}}
  return item.id||"";
}

export function itemIdentity(item,kind="task"){
  const key=item.importKey||"";
  return kind==="task"&&(item.seriesKey&&item.weekOf||key.startsWith("task:")||key.startsWith('["task:'))?"task:"+sourceId(item,kind):key||"native:"+item.id;
}

export function matchImportedItem(item,existing,kind="task"){
  if(item.forceNew)return null;
  if(item.mergeIntoId)return existing.find(old=>old.id===item.mergeIntoId)||null;
  const key=itemIdentity(item,kind),raw=sourceId(item,kind);
  return existing.find(old=>old.id===item.id||item.importKey&&old.importKey===item.importKey||itemIdentity(old,kind)===key||(old.importAliases||[]).includes(key)||raw===old.id||kind==="task"&&!item.importKey&&!old.importKey&&item.title===old.title&&(item.group||"")===(old.group||"")&&(item.date||"")===(old.date||"")&&(item.weekOf||"")===(old.weekOf||""))||null;
}

export function importFields(raw,kind="task"){
  const fields=new Set(Object.keys(raw).filter(key=>(kind==="task"?TASK_FIELDS:EVENT_FIELDS).includes(key)));
  if(Object.hasOwn(raw,"estimatedHours"))fields.add("hours");
  if(Object.hasOwn(raw,"plannedDate"))fields.add("date");
  return [...fields];
}

export function hydrateImportedItem(item,previous,kind="task"){
  if(!previous)return item;
  const fields=new Set(item.providedFields||importFields(item,kind));
  const result={...item};
  for(const key of kind==="task"?TASK_FIELDS:EVENT_FIELDS)if(!fields.has(key))result[key]=structuredClone(previous[key]??(key==="repeat"?undefined:key==="hours"||key==="teachingWeek"?null:""));
  if(kind==="event"&&result.repeat&&previous.repeat){
    if(item.repeatProvidedFields)result.repeat={...previous.repeat,...Object.fromEntries(item.repeatProvidedFields.map(key=>[key,result.repeat[key]]))};
    result.repeat={...result.repeat,exceptDates:[...new Set([...(previous.repeat.exceptDates||[]),...(result.repeat.exceptDates||[])])]};
  }
  if(kind==="task"&&!item.doneEdited)result.done=previous.done===true;
  if(kind==="event"&&!item.executionEdited){result.executed=previous.executed===true;result.completedDates=[...(previous.completedDates||[])];}
  return result;
}

export function itemChanges(previous,item,kind="task"){
  if(!previous)return [];
  const fields=new Set(item.providedFields||importFields(item,kind));
  if(kind==="task"&&item.doneEdited)fields.add("done");
  if(kind==="event"&&item.executionEdited)fields.add("executed");
  return [...fields].filter(key=>key!=="seriesKey"&&JSON.stringify(previous[key]??null)!==JSON.stringify(item[key]??null))
    .map(key=>({field:key,before:previous[key]??null,after:item[key]??null}));
}

export function validateImportIds(rows,kind){
  const seen=new Set();
  for(const row of rows){if(!Object.hasOwn(row,"id"))continue;if(typeof row.id!=="string"||!row.id.trim())throw new Error("Invalid "+kind+" ID");
    if(seen.has(row.id))throw new Error("Duplicate "+kind+" ID: "+row.id);seen.add(row.id);}
}
