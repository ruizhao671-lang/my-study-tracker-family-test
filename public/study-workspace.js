// Scheduling views reference existing progress courses; no duplicate task store or ECTS module.
const metadata=["planEvents","weeklyRules","planRange","planHistory","planTaskArchive","planEventArchive"];
const learningCourses=state=>(state.semesters||[]).flatMap(s=>s.courses||[]);
export function scheduleCourses(state){
  const degree=state.degreePlan?.modules.flatMap(m=>m.courses)||[];
  const linked=new Set(degree.map(c=>c.courseId).filter(Boolean));
  return [...degree,...learningCourses(state).filter(c=>!linked.has(c.id)).map(raw=>{
    const view={id:"progress-"+raw.id,courseId:raw.id,name:raw.name,progressOnly:true,tasks:[],exams:[],credits:0,code:""};
    for(const key of metadata)Object.defineProperty(view,key,{enumerable:true,get:()=>raw[key],set:value=>{raw[key]=value;}});
    return view;
  })];
}
export const findScheduleCourse=(state,id)=>scheduleCourses(state).find(c=>c.id===id);
export function matchingStudyCourse(state,course){
  const normalize=s=>String(s||"").normalize("NFKD").toLowerCase().replace(/&/g,"und").replace(/[^\p{L}\p{N}]/gu,"");
  const matches=learningCourses(state).filter(c=>normalize(c.name)===normalize(course.name));
  return matches.length===1?matches[0]:null;
}
export function ensureStudyCourse(state,course,preferredId="",assign=true){
  state.semesters ||= [];
  const candidates=learningCourses(state);
  let learning=candidates.find(c=>c.id===(preferredId&&preferredId!=="__new"?preferredId:course.courseId));
  if(!learning){
    learning=matchingStudyCourse(state,course);
  }
  if(!learning){
    let stage=state.semesters.find(s=>s.studyPlanStage);
    if(!stage){stage={id:crypto.randomUUID(),name:"学习计划",kind:"module",courses:[],studyPlanStage:true};state.semesters.push(stage);}
    learning={id:crypto.randomUUID(),name:course.name,categories:[],label:"",degreePlanGenerated:true};stage.courses.push(learning);
  }
  // Preserve schedules made before the course was added to the ECTS planner.
  for(const key of metadata)if(learning[key]&&course[key]!==learning[key]){
    if(Array.isArray(learning[key])){
      const existing=course[key]||[],ids=new Set(existing.map(e=>e.id||e.task?.id));
      course[key]=[...existing,...learning[key].filter(e=>!ids.has(e.id||e.task?.id))];
    }else if(!course[key])course[key]=learning[key];
    delete learning[key];
  }
  if(assign)course.courseId=learning.id;
  return learning;
}
