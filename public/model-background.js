import {readWithRetry,isTemporaryRequestError,taskDelay} from './task-requests.js';
import {imageForAPI,submitImageJob,getImageJob} from './image-client.js';
export function createModelBackground({state,save,onUpdated=()=>{},onImported=()=>{},notify=()=>{},encode=imageForAPI,submit=submitImageJob,getJob=getImageJob,delay=taskDelay}){
 const running=new Map(),read=fn=>readWithRetry(fn,{delay});
 const find=id=>state.models.find(m=>m.id===id)||(state.pendingModels||[]).find(m=>m.id===id);
 async function publish(model){
  const pending=(state.pendingModels||[]).some(m=>m.id===model.id);
  if(pending){const previousModels=state.models,previousPending=state.pendingModels;state.models=[...state.models,model];state.pendingModels=state.pendingModels.filter(m=>m.id!==model.id);try{await save();}catch(e){state.models=previousModels;state.pendingModels=previousPending;throw e;}try{await onImported(model);}catch{notify('模特已保存，请重新打开模特库');}}
  else{await save();try{await onUpdated(model);}catch{notify('模特已保存，请重新打开模特库');}}
 }

 function ensure(id){if(running.has(id))return running.get(id);const task=process(id);running.set(id,task);task.finally(()=>running.delete(id)).catch(()=>{});return task;}
 async function process(id){
  let model=find(id);if(!model)throw Error('模特已被删除');if(model.background==='white-v1'){if((state.pendingModels||[]).some(m=>m.id===id)){model.whiteJob.status='completed';delete model.whiteJob.error;await publish(model);}return model.photo;}
  model.originalPhoto ||= model.photo;model.whiteJob ||= {id:crypto.randomUUID(),status:'waiting'};const jobId=model.whiteJob.id;
  model.whiteJob.status='waiting';await save();
  try{
   const input={requestId:jobId,kind:'prepare-white',images:[await encode(model.originalPhoto)]};let job;
   for(;;){try{job=await submit(input);break;}catch(e){if(e.code!=='IMAGE_BUSY')throw e;if(!find(id))throw Error('模特已被删除');await delay(2500);}}
   model.whiteJob.status='running';await save();await onUpdated(model);
   while(['queued','running'].includes(job.status)){await delay(2000);job=await read(()=>getJob(jobId));}
   if(job.status!=='completed'||job.background!=='white-v1')throw Error(job.error||'白底处理未完成，请稍后继续');
   model=find(id);if(!model)return null;
   const previous={photo:model.photo,cutoutPhoto:model.cutoutPhoto,background:model.background};
   model.photo=job.imageUrl;model.cutoutPhoto=job.cutoutUrl;model.background='white-v1';model.whiteJob.status='completed';delete model.whiteJob.error;try{await publish(model);}catch(e){Object.assign(model,previous);throw e;}notify('模特已整理成纯白底');return model.photo;
  }catch(e){model=find(id);if(model){model.whiteJob.status=isTemporaryRequestError(e)?'paused':'failed';model.whiteJob.error=e.message;await save();await onUpdated(model);}throw e;}
 }
 function resume(){for(const m of [...state.models,...(state.pendingModels||[])]){if(m.whiteJob&&['waiting','running','paused'].includes(m.whiteJob.status))void ensure(m.id).catch(()=>notify('有一位模特尚未整理完成，可在模特详情继续'));else if(m.whiteJob?.status==='failed')void read(()=>getJob(m.whiteJob.id)).then(job=>{if(job.status==='completed'&&job.background==='white-v1')return ensure(m.id);}).catch(()=>{});}}
 return {ensure,resume};
}
