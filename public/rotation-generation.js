import {readWithRetry,isTemporaryRequestError,taskDelay} from './task-requests.js';
import {homeEntries} from './wardrobe-state.js';
import {api,imageForAPI,submitImageJob,getImageJob} from './image-client.js';
import {rotationPrompt,rotationPromptVersion} from './rotation-prompt.js';
export function createRotationGeneration({$,state,save,openModal,closeModal,escape,toast,renderHome,videoFlow,commit,request=api,encode=imageForAPI,submitImage=submitImageJob,getImage=getImageJob,readFrame=fetch,compactImage,delay=taskDelay}){
 const running=new Map();
 const terminal=['completed','failed','submission_uncertain','paused'];
 const active=['queued','submitting','pending','processing','done'];
 const read=fn=>readWithRetry(fn,{delay});
 const ownsPanel=task=>$('modal').open&&$('modal-body').querySelector('[data-rotation-task]')?.dataset.rotationTask===task.id;
 function panel(task){openModal('正在准备每一个角度',`<div class="busy-center tryon-wait" data-rotation-task="${task.id}"><div class="model-wait-stage" aria-hidden="true"><img class="model-wait-photo" src="${escape(task.photo)}" alt=""></div><p>正在准备旋转画面</p><p class="helper">可以关闭窗口，继续逛衣柜。完成后会自动收好。</p></div>`);}
 function displayError(task){if(ownsPanel(task))void showReview(task,{recover:false,background:true}).catch(e=>toast(e.message));else toast('旋转结果已保留，点生成 360° 查看');}
 async function showReview(task,{recover=true,background=false}={}){
  let job;try{job=await read(()=>request('/api/rotation-jobs/'+task.id));}catch{}
  if(background&&!ownsPanel(task))return;
  if(!job&&task.error?.includes('体验额度'))task.resumeStatus=task.prepared?'submitting':'preparing';
  if(recover&&job&&active.includes(job.status)){task.status='pending';delete task.error;await save();panel(task);void run(task);return;}
  if(!job?.resumeAllowed&&job?.previews?.length&&['needs_review','review_error','failed'].includes(job.status)){
   const versions=job.previews;let selected=versions.at(-1);
   openModal('看看这次的旋转效果',`<video id="rotation-review-video" controls playsinline preload="metadata" style="width:100%;max-height:50vh;object-fit:contain;background:#fff" src="${escape(selected.url)}"></video><p class="helper">你可以预览各个版本，选择满意的一版保存。</p><select id="rotation-review-version" aria-label="选择视频版本" style="width:100%;margin-bottom:16px">${versions.map(v=>`<option value="${escape(v.id)}"${v.id===selected.id?' selected':''}>${escape(v.label)}</option>`).join('')}</select><button id="save-reviewed-rotation" class="pill dark" style="width:100%">保存这个版本</button>`);
   $('rotation-review-version').onchange=()=>{selected=versions.find(v=>v.id===$('rotation-review-version').value);$('rotation-review-video').src=selected.url;};
   $('save-reviewed-rotation').onclick=async()=>{const button=$('save-reviewed-rotation');button.disabled=true;try{await request('/api/rotation-review/'+task.id,{method:'POST',body:JSON.stringify({attemptId:selected.id})});task.status='pending';delete task.error;await save();panel(task);void run(task);}catch(e){button.disabled=false;toast(e.message);}};return;
  }
  openModal(task.status==='paused'?'连接暂时中断':'这次还没有完成',`<p class="helper">${escape(job?.error||task.error||'任务尚未确认，请稍后查看')}</p><button id="resume-rotation" class="pill soft">${job?.retryAllowed?'重新生成 720P 视频':'继续处理这次任务'}</button>${job?.retryAllowed?'<p class="helper">参数冲突已修复。点击后提交一次新的视频生成。</p>':''}`);
  $('resume-rotation').onclick=async()=>{task.retryRejected=job?.retryAllowed===true;task.resumeProcessing=job?.resumeAllowed===true;task.status=task.retryRejected||task.resumeProcessing?'submitting':job?'pending':task.resumeStatus||'submitting';delete task.error;await save();panel(task);void run(task);};
 }
 function run(task){if(running.has(task.id))return running.get(task.id);const work=process(task).then(result=>{running.delete(task.id);if(!result?.ok)displayError(task);return result;},error=>{running.delete(task.id);toast(error.message);return {ok:false};});running.set(task.id,work);return work;}
 async function process(task){
  try{
   if(task.status==='preparing'){
    let job=await submitImage({kind:'prepare-white',requestId:task.imageId,images:[await encode(task.photo)]});
    while(['queued','running'].includes(job.status)){await delay(2000);job=await read(()=>getImage(task.imageId));}
    if(job.status!=='completed')throw Error(job.error||'穿搭画面未准备完成');
    if(job.background!=='white-v1')throw Error('白底画面尚未准备好');task.prepared=job.imageUrl;task.status='submitting';await save();
   }
   if(task.status==='submitting'){
    const image=await (compactImage||compact)(task.prepared);
    const result=await request('/api/rotation-jobs',{method:'POST',body:JSON.stringify({requestId:task.id,image,prompt:task.prompt||rotationPrompt,retryRejected:task.retryRejected===true,resumeProcessing:task.resumeProcessing===true})});
    delete task.retryRejected;delete task.resumeProcessing;
    task.status=result.status==='submission_uncertain'?'submission_uncertain':'pending';task.error=result.error;await save();
    if(task.status==='submission_uncertain'){return {ok:false};}
   }
   if(task.status==='pending'){
    let job;
    do{job=await read(()=>request('/api/rotation-jobs/'+task.id));if(['failed','submission_uncertain','needs_review','review_error'].includes(job.status))throw Error(job.error||'旋转生成未完成');if(job.status!=='done')await delay(4000);}while(job.status!=='done');
    task.mediaUrl=job.mediaUrl;task.frameManifest=job.manifest;task.status='extracting';await save();
   }
   if(task.status==='extracting'){
    let sequence;
    if(task.frameManifest){const manifest=task.frameManifest,frames=new Array(manifest.count);let next=0;await Promise.all(Array.from({length:4},async()=>{while(next<manifest.count){const i=next++;frames[i]=await read(async()=>{const r=await readFrame(manifest.pattern.replace('{index}',String(i).padStart(4,'0')));if(!r.ok){const e=Error('人物画面尚未读取完成');e.status=r.status;throw e;}return r.blob();});}}));sequence={manifest,frames,cover:task.prepared};}
    else{const response=await read(()=>readFrame(task.mediaUrl));if(!response.ok)throw Error('旋转视频尚未下载完成');const file=new File([await response.blob()],'旋转穿搭.mp4',{type:'video/mp4'});sequence=await videoFlow.extractGenerated(file);}
    const target=homeEntries(state).find(l=>l.id===task.targetId);if(!target)throw Error('原模特或穿搭已被删除，生成视频仍保留在服务端');
    // commitRotation saves task state and the new sequence in one IndexedDB transaction.
    sequence.preparedPhoto=task.prepared;sequence.autoMatte=false;task.renderVersion=4;task.status='completed';try{await commit(sequence,target.id,target.name);}catch(e){task.status='extracting';throw e;}
    if(ownsPanel(task))closeModal();
    try{await renderHome();}catch{toast('视频已保存，请重新打开这套穿搭');}toast('旋转穿搭已收好，可以左右转动了');return {ok:true};
   }
  }catch(e){task.error=e.message;task.resumeStatus=task.status;task.status=isTemporaryRequestError(e)?'paused':'failed';await save();return {ok:false};}
 }
 async function compact(src){const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');const scale=Math.min(1,1024/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.86);}
 function open(target){
  if(!target)return;
  const previous=(state.rotationTasks||[]).find(t=>t.targetId===target.id&&t.status!=='completed');
  if(previous){if(terminal.includes(previous.status)){void showReview(previous);}else{panel(previous);void run(previous);}return;}
  const regenerate=Boolean(target.sequence);
  openModal(regenerate?'重新生成这套旋转':'让这套穿搭转起来',`<img class="photo-preview" src="${escape(target.photo)}" alt="当前穿搭"><p class="helper">${regenerate?'使用当前提示词重新生成，旧旋转保留。':'为这套穿搭生成可以左右转动的展示。'}</p><button id="generate-rotation" class="pill dark" style="width:100%">${regenerate?'重新生成 360° 穿搭':'生成 360° 穿搭'}</button><button id="import-existing-video" class="text-button" style="width:100%;margin-top:8px">已有视频，直接导入</button>`);
  $('import-existing-video').onclick=()=>videoFlow.open(target);
  $('generate-rotation').onclick=async()=>{const button=$('generate-rotation');button.disabled=true;try{await start(target,{show:true,regenerate});}catch(e){button.disabled=false;toast(e.message);}};
 }
 function resume(){return Promise.allSettled((state.rotationTasks||[]).map(async task=>{
  if(task.status==='paused'&&task.error?.includes('体验额度'))return;
  if(task.status==='paused'){task.status=task.resumeStatus||'pending';return run(task);}
  if(!terminal.includes(task.status))return run(task);
  if(task.status!=='completed'){try{const job=await read(()=>request('/api/rotation-jobs/'+task.id));if(active.includes(job.status)){task.status='pending';delete task.error;await save();return run(task);}}catch{}}
 }));}

 async function start(target,{show=false,regenerate=false}={}){
  if(homeEntries(state).find(entry=>entry.id===target.id)?.sequence&&!regenerate)return;
  let task=[...(state.rotationTasks||[])].reverse().find(t=>t.targetId===target.id&&t.status!=='completed');
  if(task?.status==='completed')return;
  if(task&&terminal.includes(task.status)){await showReview(task);return;}
  if(!task){task={id:crypto.randomUUID(),imageId:crypto.randomUUID(),targetId:target.id,photo:target.photo,prompt:rotationPrompt,promptVersion:rotationPromptVersion,previousSequence:target.sequence||null,status:target.background==='white-v1'?'submitting':'preparing',prepared:target.background==='white-v1'?target.photo:undefined};(state.rotationTasks||=[]).push(task);await save();}
  if(show)panel(task);const result=await run(task);if(!result?.ok)throw Error(task.error||'旋转任务未完成');
 }
 return {open,resume,start};
}
