import {createModelBackground} from './model-background.js';
import {mergeDuplicateItems} from './wardrobe-state.js';
import {api,getImageJob} from './image-client.js';
// Workflow UI is injected with the app's existing storage and modal helpers.
export function createFlows({$,state,save,put,get,openModal,closeModal,escape,toast,fail,categories,readImage,imageForAPI,submitImageJob,watchImageJob,navigate,tryon,imageHistory,renderCloset,art,onModelSaved=()=>{},onModelUpdated=()=>{}}){
 const modelBackground=createModelBackground({state,save,onUpdated:async model=>{await onModelUpdated(model);if(isModelProgress(model.id)&&['failed','paused'].includes(model.whiteJob.status))modelProgress(model.id);},onImported:async model=>{const visible=isModelProgress(model.id);if(visible){state.selectedModel=model.id;await onModelSaved(model);openModal('模特已保存',`<div class="model-save-result"><img class="photo-preview" src="${escape(model.photo)}" alt="已保存的白底模特"><p class="helper">白底已整理好，可以开始试穿了。</p><button class="pill dark" id="view-saved-model">查看模特</button></div>`);$('view-saved-model').onclick=()=>{closeModal();navigate('home');};}else{await onModelUpdated(model);}},notify:toast});
 function isModelProgress(id){return $('modal').open&&$('modal-body').querySelector('[data-model-import]')?.dataset.modelImport===id;}
 function modelProgress(id){
  const model=(state.pendingModels||[]).find(m=>m.id===id);if(!model)return;
  const failed=['failed','paused'].includes(model.whiteJob.status);
  openModal(failed?'模特还没整理完成':'正在整理你的模特',`<div class="busy-center tryon-wait model-save-wait" data-model-import="${id}"><div class="model-wait-stage" aria-hidden="true"><img class="model-wait-photo" src="${escape(model.photo)}" alt=""></div><p role="status">${failed?'白底整理暂未完成':'正在整理纯白背景…'}</p><p class="helper">${failed?'照片已保留，整理好后才会放入模特库。':'整理好后会自动放入模特库。可以关闭窗口，继续逛衣柜。'}</p>${failed?'<button class="pill soft" id="retry-model-import">继续处理</button>':''}</div>`);
  if(failed)$('retry-model-import').onclick=()=>{model.whiteJob.status='waiting';modelProgress(id);void modelBackground.ensure(id).catch(()=>toast('模特尚未入库，可在衣柜的模特页继续处理'));};
 }
 function importStatus(){return (state.pendingModels||[]).map(m=>`<button class="model-import-status" data-pending-model="${m.id}"><span>${['failed','paused'].includes(m.whiteJob.status)?'白底整理未完成':'正在整理模特白底'}</span><span>${['failed','paused'].includes(m.whiteJob.status)?'继续处理':'查看进度'} ›</span></button>`).join('');}
 function bindImports(root){root.querySelectorAll('[data-pending-model]').forEach(b=>b.onclick=()=>modelProgress(b.dataset.pendingModel));}
 let draft={source:null,sourceJobId:null,garments:[]};
 const options=value=>categories.map(c=>`<option value="${c[0]}" ${(value==='outerwear'?'tops':value)===c[0]?'selected':''}>${c[1]}</option>`).join('');
 const watching=new Set(),timers=new Map();let submitting=false;
 function carousel(items){
  const sample=(items.length?items:state.items).slice(0,6);
  const group=()=>'<div class="clothes-loop-group">'+sample.map(i=>'<div class="clothes-loop-card">'+art(i)+'</div>').join('')+'</div>';
  return '<div class="clothes-loop" aria-hidden="true"><div class="clothes-loop-track">'+group()+group()+'</div></div>';
 }
 function progress(jobId='pending'){
  openModal('正在提取单品','<div class="clothes-progress" data-auto-job="'+escape(jobId)+'"><div id="clothes-animation">'+carousel([])+'</div><p class="clothes-progress-title" role="status">正在整理这套穿搭…</p><p class="helper">可以关闭窗口，继续逛衣柜。完成后会通知你。</p></div>');
 }
 function isProgress(id){return $('modal').open&&$('modal-body').querySelector('[data-auto-job]')?.dataset.autoJob===id;}
 function showSaved(job,items,added){
  openModal('单品已入柜','<div class="clothes-result"><p class="clothes-progress-title">'+(added?added+' 件新单品已入柜':'这套衣服已经在衣柜里了')+'</p><div class="saved-clothes-grid">'+items.map(i=>'<div>'+art(i)+'<span>'+escape(i.name)+'</span></div>').join('')+'</div><div class="detail-actions"><button class="pill soft" id="stay-here">留在这里</button><button class="pill dark" id="see-saved-clothes">查看衣柜</button></div></div>');
  $('stay-here').onclick=closeModal;$('see-saved-clothes').onclick=()=>{closeModal();navigate('closet');};
 }
 async function saveClothes(source){
  if(!source||submitting)return;submitting=true;progress();
  try{const job=await submitImageJob({requestId:crypto.randomUUID(),kind:'auto-extract',images:[await imageForAPI(source)]});if(isProgress('pending'))$('modal-body').querySelector('[data-auto-job]').dataset.autoJob=job.id;state.autoJobs ||= [];if(!state.autoJobs.includes(job.id))state.autoJobs.push(job.id);await save();void watchAuto(job.id);}
  catch(e){fail(e);if(isProgress('pending'))openModal('暂时没能保存衣服','<p class="helper">'+escape(e.message)+'</p>');}
  finally{submitting=false;}
 }
 function schedule(id,delay){timers.set(id,setTimeout(()=>{timers.delete(id);void watchAuto(id);},delay));}
 async function watchAuto(id){
  if(watching.has(id)||timers.has(id))return;watching.add(id);
  try{
   const job=await getImageJob(id);
   if(['queued','running'].includes(job.status)){
    const ready=(job.results||[]).filter(g=>g.status==='completed');
    if(isProgress(id)&&ready.length&&$('clothes-animation').dataset.count!==String(ready.length)){$('clothes-animation').innerHTML=carousel(ready.map(g=>({...g,photo:g.imageUrl})));$('clothes-animation').dataset.count=ready.length;}
    schedule(id,2000);return;
   }
   const completed=(job.results||[]).filter(g=>g.status==='completed');let added=0;
   for(const g of completed){if(state.deletedItemIds?.includes(g.id)||state.archivedDuplicates?.some(i=>i.id===g.id))continue;if(!state.items.some(i=>i.id===g.id)){state.items.push({id:g.id,name:g.name,category:g.category,photo:g.imageUrl,sourceJobId:id,favorite:false});added++;}}
   state.autoJobs=(state.autoJobs||[]).filter(v=>v!==id);await save();renderCloset();
   if(job.status==='completed'){
    toast(added?added+' 件衣服已分类收好':'这套衣服已经在衣柜里了');
    if(isProgress(id))showSaved(job,completed.map(g=>state.items.find(i=>i.id===g.id)).filter(Boolean),added);
   }else{toast(job.error||'衣服未全部保存，请查看生成记录');if(isProgress(id))openModal('这次还没整理完成','<p class="helper">'+escape(job.error||'请稍后查看生成记录')+'</p>');}
  }catch(e){toast('暂时无法同步衣柜，稍后会重新读取结果');schedule(id,10000);}
  finally{watching.delete(id);}
 }
 async function resume(){modelBackground.resume();if(mergeDuplicateItems(state)){await save();renderCloset();}for(const id of state.autoJobs||[])void watchAuto(id);}
 async function saveModel(photo){
  const model={id:crypto.randomUUID(),name:'人物 '+(state.models.length+1),photo,originalPhoto:photo,date:new Date().toLocaleDateString('sv-SE')};
  state.models.push(model);state.selectedModel=model.id;
  try{await onModelSaved(model);}catch(e){state.models=state.models.filter(m=>m.id!==model.id);throw e;}
  return model;
 }
 function extract(source){
  if(typeof source==='string'&&source){void saveClothes(source);return;}
  openModal('提取服装单品', '<form class="form-grid" id="extract-form"><label>拍照或选择穿搭图片<input id="extract-photo" type="file" accept="image/*" required></label><img id="extract-preview" class="photo-preview" hidden alt="待保存的衣服"><p class="helper">自动拆开衣服与配饰，分类收进衣柜。</p><button class="pill dark">保存衣服</button></form>');
  let sourcePhoto=null;
  $('extract-photo').onchange=async e=>{if(!e.target.files[0])return;try{sourcePhoto=await readImage(e.target.files[0]);$('extract-preview').src=sourcePhoto;$('extract-preview').hidden=false;}catch(e){fail(e);}};
  $('extract-form').onsubmit=e=>{e.preventDefault();if(sourcePhoto)void saveClothes(sourcePhoto);};
 }
 function review(garments,sourceJobId=draft.sourceJobId){
  draft.garments=garments;draft.sourceJobId=sourceJobId;
  openModal('确认单品与分类',`<p class="flow-steps">2 / 核对单品与分类</p><p class="helper">勾选要收进衣柜的单品，可以改名字、分类或补充遗漏。每件各生成一张 3:4 图片。</p><form id="garment-review" class="form-grid"><div id="garment-rows"></div><button type="button" id="add-garment" class="pill soft">＋ 补充一件</button><p class="helper" id="batch-summary"></p><button class="pill dark" id="generate-batch">开始拆解</button></form><button id="change-source" class="text-button">重新选择照片</button>`);
  const summary=()=>{const n=$('garment-rows').querySelectorAll('[name=include]:checked').length;$('batch-summary').textContent=`已选 ${n} 件 · 将发起 ${n} 次生图，逐件完成后可一起入柜`;$('generate-batch').disabled=!n;$('add-garment').disabled=$('garment-rows').children.length>=8;};
  const add=g=>{const row=document.createElement('div');row.className='garment-row';row.innerHTML=`<label class="check-line"><input type="checkbox" name="include" checked> 收进衣柜</label><label>单品名称<input class="field" name="name" maxlength="30" value="${escape(g.name)}" placeholder="例如：粉色针织开衫"></label><label>分类<select class="field" name="category">${options(g.category)}</select></label><button type="button" class="text-button remove-garment">移除</button>`;$('garment-rows').append(row);row.querySelector('.remove-garment').onclick=()=>{row.remove();summary();};row.querySelector('[name=include]').onchange=summary;summary();};
  garments.forEach(add);summary();$('add-garment').onclick=()=>add({name:'',category:'tops'});$('change-source').onclick=()=>{draft={source:null,sourceJobId:null,garments:[]};extract();};
  $('garment-review').onsubmit=async e=>{e.preventDefault();const chosen=[...$('garment-rows').children].filter(r=>r.querySelector('[name=include]').checked).map(r=>({name:r.querySelector('[name=name]').value.trim(),category:r.querySelector('[name=category]').value}));if(chosen.some(g=>!g.name)){toast('请填好每件单品的名称');return;}const button=$('generate-batch');button.disabled=true;try{draft.garments=chosen;const input={requestId:crypto.randomUUID(),kind:'extract-batch',garments:chosen};if(sourceJobId)input.sourceJobId=sourceJobId;else input.images=[await imageForAPI(draft.source)];watchImageJob(await submitImageJob(input));}catch(e){fail(e);button.disabled=false;}};
 }
 function batchResult(job){
  const completed=(job.results||[]).filter(g=>g.status==='completed'),remaining=(job.results||[]).filter(g=>g.status!=='completed');
  openModal('保存提取结果',`<p class="flow-steps">步骤 3 · ${completed.length} 件已生成，共 ${(job.results||[]).length} 件</p>${job.error?`<p class="notice">${escape(job.error)}。已生成的图片可以先保存；不会自动重复生成。</p>`:''}<form id="save-batch" class="form-grid"><div class="batch-results">${completed.map(g=>`<div class="batch-card" data-result="${g.id}"><img src="${escape(g.imageUrl)}" alt="${escape(g.name)}"><label class="check-line"><input name="include" type="checkbox" checked> 收进衣柜</label><label>名称<input name="name" class="field" maxlength="30" required value="${escape(g.name)}"></label><label>分类<select class="field" name="category">${options(g.category)}</select></label></div>`).join('')}</div>${completed.length?'<button class="pill dark">把选中单品收进衣柜</button>':''}</form>${remaining.length?`<p class="helper">未完成：${remaining.map(g=>escape(g.name)).join('、')}</p><button class="pill soft" id="retry-batch">核对未完成单品</button>`:''}<button class="text-button" id="batch-history">查看生成记录</button>`);
  $('batch-history').onclick=imageHistory;if(remaining.length)$('retry-batch').onclick=()=>review(remaining,job.id);
  $('save-batch').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const selected=[...e.target.querySelectorAll('[data-result]')].filter(r=>r.querySelector('[name=include]').checked);if(!selected.length)throw Error('请至少选择一件单品');const additions=selected.map(r=>{const g=completed.find(g=>g.id===r.dataset.result),name=r.querySelector('[name=name]').value.trim();if(!name)throw Error('请填写单品名称');return {id:g.id,name,category:r.querySelector('[name=category]').value,photo:g.imageUrl,sourceJobId:job.id,favorite:state.items.find(i=>i.id===g.id)?.favorite||false};});const previous=state.items;state.items=[...state.items.filter(i=>!additions.some(a=>a.id===i.id)),...additions];try{await save();}catch(e){state.items=previous;throw e;}closeModal();$('item-search').value='';navigate('closet');toast(`${additions.length} 件单品已经分类收好`);}catch(e){fail(e);button.disabled=false;}};
 }
 function models(forTryon=false){
  openModal('人物素材',`<p class="helper">保存清晰的全身照，换装时保留人物的脸、发型与姿态。</p>${importStatus()}<div class="model-grid">${state.models.map(m=>`<button data-model="${m.id}" class="model-card ${state.selectedModel===m.id?'selected':''}"><img src="${escape(m.photo)}" alt="${escape(m.name)}"><span>${escape(m.name)}</span>${state.selectedModel===m.id?'<small>当前人物</small>':''}</button>`).join('')}</div><form id="model-form" class="form-grid"><label>上传全身照<input type="file" name="photo" accept="image/*" required></label><button class="pill dark">保存新人物</button></form>`);
  $('modal-body').querySelectorAll('[data-model]').forEach(b=>b.onclick=async()=>{state.selectedModel=b.dataset.model;await save();if(forTryon)tryon();else{models();toast('已设为当前人物');}});
  bindImports($('modal-body'));
  $('model-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const f=new FormData(e.target);await saveModel(await readImage(f.get('photo')));}catch(e){fail(e);button.disabled=false;}};
 }
 return {extract,review,batchResult,models,saveModel,saveClothes,resume,watchAuto,importStatus,bindImports,ensureModelWhite:modelBackground.ensure};
}
