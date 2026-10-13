import {getImageJob,submitImageJob} from './image-client.js';
import {readWithRetry,isTemporaryRequestError,taskDelay} from './task-requests.js';
export function createTryonPipeline({state,save,onComplete=()=>{},onUpdate=()=>{},onError=()=>{},getJob=getImageJob,submit=submitImageJob,getInput=async()=>null,releaseInput=async()=>{},delay=taskDelay}){
 const running=new Map(),read=fn=>readWithRetry(fn,{delay});
 async function process(task){
  let look;
  try{
   let job;
   if(task.status==='paused'||task.status==='failed')task.status=task.resumeStatus||'pending';
   if(task.status==='submitting'){
    // Check the durable ID first: a lost POST response must not create a new job.
    try{job=await read(()=>getJob(task.id));}catch(e){if(e.status!==404)throw e;}
    if(!job){
     const input=await getInput(task.id);if(!input)throw Error('提交素材暂不可读取，任务编号已保留');
     for(;;){try{job=await submit(input);break;}catch(e){if(e.code!=='IMAGE_BUSY')throw e;await delay(2500);}}
    }
    task.status='pending';delete task.error;await save();
    await releaseInput(task.id).catch(()=>{});
   }
   if(!job)job=await read(()=>getJob(task.id));
   while(['queued','running'].includes(job.status)){await delay(2000);job=await read(()=>getJob(task.id));}
   if(job.status!=='completed'||job.background!=='white-v1')throw Error(job.error||'换装图片未完成白底处理');
   const id='generated-'+job.id;look=state.looks.find(l=>l.id===id);const added=!look;
   if(added){look={id,name:'我的新搭配',date:new Date().toLocaleDateString('sv-SE'),photo:job.imageUrl,cutoutPhoto:job.cutoutUrl,background:'white-v1',items:(job.itemIds||[]).filter(id=>state.items.some(i=>i.id===id)),favorite:false};state.looks.push(look);}
   const previous=task.status;task.status='completed';delete task.error;
   try{await save();}catch(e){task.status=previous;if(added)state.looks=state.looks.filter(l=>l!==look);throw e;}
  }catch(e){task.resumeStatus=task.status;task.status=isTemporaryRequestError(e)?'paused':'failed';task.error=e.message;try{await save();}catch{task.error='本地保存未完成，生成结果仍在服务端，请释放存储空间后继续';}onError(task);return;}
  // Display failures must not undo an already saved result or restart generation.
  try{await onUpdate(look,task);await onComplete(look,task);}catch{ /* The saved look remains available in recent outfits. */ }
 }
 function watch(id){if(running.has(id))return running.get(id);const task=(state.tryonTasks||[]).find(t=>t.id===id);if(!task||task.status==='completed')return Promise.resolve();const work=process(task);running.set(id,work);work.finally(()=>running.delete(id)).catch(()=>{});return work;}
 function resume(){return Promise.allSettled((state.tryonTasks||[]).filter(t=>t.status!=='completed').map(t=>watch(t.id)));}
 return {watch,resume};
}
