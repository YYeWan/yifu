import {galleryType,galleryEntries,gallerySelection} from './gallery-flow.js';
import {createCreationUI} from './creation-ui.js';
import {createLibraryClient} from './library-client.js';
import {createTryonPipeline} from './tryon-pipeline.js';
import {createRotationGeneration} from './rotation-generation.js';
import {reconcileModelRotations,rotationSequenceInUse,MAX_TRYON_ITEMS,removeItems,restoreRemovedItems,homeEntries,removeModels,restoreRemovedModels,planRotationSave} from './wardrobe-state.js';
import {createVideoFlow} from './video-flow.js';
import {createFlows} from './wardrobe-flows.js';
import {getImageConfig,listImageJobs,getImageJob,submitImageJob,imageForAPI,garmentShape} from './image-client.js';
const $=id=>document.getElementById(id);
const paths={wardrobe:'M4 3h16v18H4zM12 3v18M9 10v3m6-3v3',home:'M3 10 12 3l9 7M5 9v11h5v-6h4v6h5V9',camera:'M4 7h4l2-3h4l2 3h4v13H4z M16 13a4 4 0 1 0-8 0 4 4 0 0 0 8 0',closet:'M4 5h16v15H4z M4 13h5l1 3h4l1-3h5',calendar:'M5 5h14v16H5z M8 3v4m8-4v4M5 10h14m-10 4h1m4 0h1m-6 3h1m4 0h1',menu:'M5 7h14M5 12h14M5 17h14',left:'m14 6-6 6 6 6',right:'m9 6 6 6-6 6',heart:'M20.8 5.8c-2.2-2.2-5.8-1.4-8.8 1.5-3-2.9-6.6-3.7-8.8-1.5-2.8 3 .5 7.1 8.8 13.7 8.3-6.6 11.6-10.7 8.8-13.7Z',share:'M8 9H5v12h14V9h-3M12 15V3m-4 4 4-4 4 4',trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',sliders:'M4 6h7m4 0h5M4 12h3m4 0h9M4 18h10m4 0h2M11 4v4m-4 2v4m7 2v4',rotate:'M20 9a8 8 0 1 0 0 6M20 3v6h-6',plus:'M12 5v14M5 12h14',search:'M17 10a7 7 0 1 0-14 0 7 7 0 0 0 14 0Zm-2 5 6 6',hanger:'M10 6a2 2 0 1 1 3 2l-1 1v3L3 18v2h18v-2l-9-6',close:'m6 6 12 12M6 18 18 6',check:'m5 12 4 4L19 6',photo:'M3 4h18v16H3z M3 17l6-7 4 5 3-3 5 5M15 8h1',download:'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.plus}"/></svg>`;
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));}icons();
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const categories=[['tops','上衣','TOPS'],['bottoms','下装','BOTTOMS'],['shoes','鞋子','SHOES'],['accessories','配饰','ACCESSORIES']];
let db, library, state={items:[],looks:[],selected:[]},currentId=null,pageName='home',filter='all',onlyFavorites=false,currentSequence='source',initialManifest,month=new Date(),pickedDay=today(),busy=false;
const mediaURLs=new Set();let toastTimer,artId=0;
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2800);}
async function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('yifu-browser-library',1);r.onupgradeneeded=()=>{r.result.createObjectStore('state');r.result.createObjectStore('media');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function legacyOpenDB(){
 // Discover a pre-existing wardrobe database so a brand change never resets saved media.
 if(typeof indexedDB.databases!=='function')throw Error('当前浏览器无法确认已有衣柜数据，请更新浏览器后再打开。');
 const databases=await indexedDB.databases();
 const current=databases.find(entry=>entry.name==='wardrobe-library');
 const legacy=databases.filter(entry=>entry.name?.endsWith('-wardrobe'));
 if(!current&&legacy.length>1)throw Error('发现多个已有衣柜数据库，暂不创建新衣柜，以免覆盖记录。');
 const name=current?.name||legacy[0]?.name||'wardrobe-library';
 return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{r.result.createObjectStore('state');r.result.createObjectStore('media');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
function get(store,key){if(store==='media')return library.getMedia(key);throw Error('衣柜数据应从本机服务读取');}
function put(store,key,value){if(store==='media')return library.putMedia(key,value);throw Error('衣柜数据应保存到本机服务');}
async function save(){await library.save(state);}
function url(blob){const u=URL.createObjectURL(blob);mediaURLs.add(u);return u;}
function current(){const entries=galleryEntries(state);return entries.find(l=>l.id===currentId)||entries[0];}
function art(i){if(!i)return '';if(i.photo)return `<span class="item-art"><img src="${escape(i.thumbnail||i.photo)}" alt="${escape(i.name)}" loading="lazy"></span>`;const clip=`crop-${++artId}`;const contour=garmentShape(i.id);const shape=contour?`<path d="${contour}"/>`:`<rect x="${i.rect[0]}" y="${i.rect[1]}" width="${i.rect[2]}" height="${i.rect[3]}"/>`;return `<span class="item-art"><svg viewBox="${i.rect.join(' ')}" role="img" aria-label="${escape(i.name)}"><defs><clipPath id="${clip}">${shape}</clipPath></defs><image clip-path="url(#${clip})" href="assets/outfits/${i.board}.png" width="1254" height="1254"/></svg></span>`;}
function openModal(title,html){$('modal-title').textContent=title;$('modal-body').innerHTML=html;icons($('modal'));if(!$('modal').open)$('modal').showModal();}
function closeModal(){if(!busy)$('modal').close();}
$('close-modal').onclick=closeModal;$('modal').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
$('close-settings').onclick=()=>$('settings-modal').close();
function navigate(name){pageName=name;document.querySelector('.app-shell').dataset.view=name;$('header-page-label').textContent=({home:'穿搭画廊',closet:'单品与人物',create:'创建与记录'})[name];for(const p of ['home','closet','create'])$(`${p}-page`).hidden=p!==name;document.querySelectorAll('[data-page]').forEach(b=>{const active=b.dataset.page===name;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});window.__wardrobe.stop();if(name==='closet')renderCloset();if(name==='create')renderRecent();if(name==='home')renderHome().catch(fail);}
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));document.querySelector('.logo').onclick=e=>{e.preventDefault();navigate('home');};
function syncGalleryModes(){
 const type=galleryType(state);$('show-rotation-looks').setAttribute('aria-pressed',String(type==='rotation'));$('show-flat-looks').setAttribute('aria-pressed',String(type==='flat'));
}
async function switchGalleryType(type){
 if(galleryType(state)===type)return;
 const previous={homeViewType:state.homeViewType,homeEntryId:state.homeEntryId,gallerySelections:structuredClone(state.gallerySelections),currentId};
 const old=current();state.gallerySelections={...state.gallerySelections,...(old?{[galleryType(state)]:old.id}:{})};
 state.homeViewType=type;currentId=gallerySelection(state,type)?.id||null;state.homeEntryId=currentId;
 window.__wardrobe.stop();void renderHome().catch(fail);
 try{await save();}catch(e){state.homeViewType=previous.homeViewType;state.homeEntryId=previous.homeEntryId;state.gallerySelections=previous.gallerySelections;currentId=previous.currentId;void renderHome().catch(fail);fail(e);}
}
let homeRenderVersion=0,currentSequenceVideo=false;
async function renderHome(){
 const version=++homeRenderVersion;const look=current();const entries=galleryEntries(state);syncGalleryModes();$('gallery-total').textContent=entries.length+' 套';$('gallery-preview-images').innerHTML=entries.slice(-3).map(entry=>`<img src="${escape(entry.thumbnail||entry.photo)}" alt="" loading="lazy">`).join('');$('home-gallery-preview').hidden=!entries.length;$('expand-look').hidden=!look?.items?.length;const position=look?entries.findIndex(entry=>entry.id===look.id)+1:0;$('look-position').textContent=position+' / '+entries.length;$('look-position').setAttribute('aria-label',`第 ${position} 套，共 ${entries.length} 套`);$('open-look-picker').disabled=!entries.length;const isModel=Boolean(look?.modelId);$('rotation').hidden=!look?.sequence;for(const id of ['favorite-look','look-date'])$(id).hidden=isModel||!look;$('delete-look').hidden=!look;$('delete-look').setAttribute('aria-label',isModel?'删除人物':'删除这套穿搭');document.querySelector('.look-actions').hidden=!look;if(!look){$('loading').hidden=true;$('look-type-badge').hidden=true;for(const id of ['previous-look','next-look'])$(id).disabled=true;$('look-title').textContent=galleryType(state)==='rotation'?'还没有旋转穿搭':'还没有静态穿搭';$('look-subtitle').textContent='点击下方「创建」，添加一张照片';$('canvas').hidden=true;$('look-photo').hidden=true;$('play').hidden=true;$('photo-to-360').hidden=true;$('look-items').innerHTML='';$('date-label').textContent=today().replaceAll('-','.');$('drag-hint').textContent='添加照片后，在这里查看穿搭';$('angle').hidden=true;window.__wardrobe.setEnabled(false);return;}
 currentId=look.id;$('look-title').textContent=look.name;$('look-title').title=look.name;$('look-subtitle').textContent=isModel?'':look.subtitle||'';$('date-label').textContent=look.date.replaceAll('-','.');$('favorite-look').setAttribute('aria-pressed',String(look.favorite));$('favorite-look').setAttribute('aria-label',look.favorite?'取消收藏这套穿搭':'收藏这套穿搭');
 const rotating=Boolean(look.sequence);$('stage').setAttribute('role',rotating?'slider':'img');$('stage').setAttribute('aria-label',rotating?'左右拖动旋转人物':look.name);window.__wardrobe.hideCurrent();$('canvas').hidden=true;$('look-photo').hidden=false;$('look-photo').src=look.thumbnail||look.photo;$('look-photo').dataset.entryId=look.id;const fullPhoto=new Image();fullPhoto.onload=()=>{if($('look-photo').dataset.entryId===look.id)$('look-photo').src=look.photo;};fullPhoto.src=look.photo;$('look-type-badge').hidden=false;$('look-type-badge').textContent=rotating?'360°':'平面图';$('look-type-badge').dataset.type=rotating?'rotation':'flat';$('stage').classList.toggle('static',!rotating);$('play').hidden=!rotating;$('photo-to-360').hidden=false;$('photo-to-360').textContent=rotating?'重新生成 360°':'生成 360°';$('angle').hidden=!rotating;$('viewer-settings').hidden=true;$('reset').hidden=!rotating;window.__wardrobe.setEnabled(rotating);
 $('drag-hint').textContent=rotating?'左右滑动，看看每一面':'';
 if(isModel){const model=state.models.find(m=>m.id===look.modelId);if(['failed','paused'].includes(model?.whiteJob?.status)){$('drag-hint').innerHTML='<button class="text-button" id="retry-white-inline">白底整理未完成 · 继续处理</button>';$('retry-white-inline').onclick=e=>{e.currentTarget.disabled=true;void flows.ensureModelWhite(model.id).catch(fail);};}else if(model?.whiteJob&&model.whiteJob.status!=='completed'){$('drag-hint').textContent='正在整理白底，可以继续使用衣柜';}}
 if(rotating){
  window.__wardrobe.setMatte(false);
  if(currentSequence!==look.sequence){
   $('rotation').disabled=true;$('play').disabled=true;$('loading').hidden=false;$('load-text').textContent='正在载入旋转，可先看图片…';
   try{const seq=look.sequence==='source'?{manifest:initialManifest}:await get('media',look.sequence);if(version!==homeRenderVersion)return;if(!seq)throw Error('原旋转暂时无法读取');await window.__wardrobe.loadSequence(seq);if(version!==homeRenderVersion)return;currentSequence=look.sequence;currentSequenceVideo=Boolean(seq.videoUrl||seq.videoBlob);$('canvas').hidden=currentSequenceVideo;$('look-photo').hidden=true;$('drag-hint').textContent='左右滑动，看看每一面';}
   catch(e){if(version!==homeRenderVersion||e.name==='AbortError')return;$('loading').hidden=true;$('canvas').hidden=true;$('look-photo').hidden=false;$('drag-hint').innerHTML='<button class="text-button" id="retry-rotation-load">旋转未载入 · 点击重试</button>';$('retry-rotation-load').onclick=()=>{currentSequence=null;void renderHome().catch(fail);};}
  }else{window.__wardrobe.revealCurrent();$('look-photo').hidden=true;$('canvas').hidden=currentSequenceVideo;}
 }else{currentSequence=null;$('loading').hidden=true;window.__wardrobe.setMatte(false);$('look-photo').hidden=false;}

 $('look-items').innerHTML=look.items.map(id=>state.items.find(i=>i.id===id)).filter(Boolean).map(i=>`<button class="mini-item" data-item="${i.id}">${art(i)}<span>${escape(i.name)}</span></button>`).join('')||'<p class="helper" style="grid-column:1/-1">这套穿搭暂无单品记录。</p>';
 if(isModel){const model=state.models.find(m=>m.id===look.modelId);if(['failed','paused'].includes(model?.whiteJob?.status)){$('look-items').innerHTML='<button class="text-button" id="retry-model-white">继续整理白底</button>';$('retry-model-white').onclick=()=>{void flows.ensureModelWhite(model.id).catch(fail);};}}
 $('look-items').querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>detailItem(b.dataset.item));
 for(const id of ['previous-look','next-look'])$(id).disabled=galleryEntries(state).length<2;
}
function shiftLook(n){const entries=galleryEntries(state);const pos=entries.findIndex(l=>l.id===currentId);if(!entries.length)return;currentId=entries[(pos+n+entries.length)%entries.length].id;state.homeEntryId=currentId;void save().catch(fail);window.__wardrobe.stop();renderHome().catch(fail);}
$('previous-look').onclick=()=>shiftLook(-1);$('next-look').onclick=()=>shiftLook(1);
function positionLookPicker(){
 const box=$('viewer').getBoundingClientRect(),dialog=$('look-picker');
 dialog.style.width=Math.min(window.innerWidth>=960?620:380,box.width-32,window.innerWidth-32)+'px';
}
$('open-look-picker').onclick=()=>{
 window.__wardrobe.stop();const entries=galleryEntries(state),active=current()?.id;$('look-picker-title').textContent=galleryType(state)==='rotation'?'360°旋转穿搭':'静态人物穿搭';
 $('look-picker-grid').innerHTML=entries.map((entry,index)=>`<button class="look-picker-card" data-pick-look="${escape(entry.id)}" aria-label="第 ${index+1} 套：${escape(entry.name)}" ${entry.id===active?'aria-current="true"':''}><span class="look-picker-photo"><img src="${escape(entry.thumbnail||entry.photo)}" alt="" loading="lazy"><small class="${entry.sequence?'':'flat'}">${entry.sequence?'360°':'平面图'}</small></span><span class="look-picker-name">${escape(entry.name)}</span></button>`).join('');
 $('look-picker-grid').querySelectorAll('[data-pick-look]').forEach(button=>button.onclick=async()=>{
  const before=currentId,previous=state.homeEntryId;currentId=button.dataset.pickLook;state.homeEntryId=currentId;button.disabled=true;
  try{await save();$('look-picker').close();await renderHome();}catch(e){currentId=before;state.homeEntryId=previous;button.disabled=false;fail(e);}
 });
 positionLookPicker();$('look-picker').showModal();$('look-picker-grid').scrollTop=0;$('open-look-picker').setAttribute('aria-expanded','true');
};
$('close-look-picker').onclick=()=>$('look-picker').close();
$('look-picker').addEventListener('close',()=>{$('open-look-picker').setAttribute('aria-expanded','false');});
$('look-picker').addEventListener('click',event=>{if(event.target!==$('look-picker'))return;const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();});
window.addEventListener('resize',()=>{if($('look-picker').open)positionLookPicker();});

$('expand-look').onclick=()=>{openModal('搭配单品',`<div class="look-detail-grid">${$('look-items').innerHTML}</div>`);$('modal-body').querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>detailItem(b.dataset.item));};
$('home-gallery-preview').onclick=()=>$('open-look-picker').click();
$('favorite-look').onclick=async()=>{const l=current();if(!l||l.modelId)return;l.favorite=!l.favorite;try{await save();renderHome();toast(l.favorite?'已经收藏这套穿搭 ♡':'已取消收藏');}catch(e){l.favorite=!l.favorite;fail(e);}};
$('viewer-settings').onclick=()=>{$('settings-modal').showModal();};

let deletingClothes=false;const deleteSelection=new Set();
function updateClosetControls(){const isModels=filter==='models';document.querySelector('.closet-tools').hidden=false;$('add-item').setAttribute('aria-label',isModels?'添加人物':'添加单品');$('item-search').placeholder=isModels?'搜索人物名称':'搜索单品名称';$('item-search').setAttribute('aria-label',isModels?'搜索人物':'搜索单品');const q=$('item-search').value.trim().toLowerCase();const found=state.items.filter(i=>(!q||i.name.toLowerCase().includes(q))&&(filter!=='favorites'||i.favorite)&&(filter!=='selected'||state.selected.includes(i.id)));$('closet-count').textContent=isModels?`${state.models.length} 位人物 · 选择一位，用于搭配`:`${state.items.length} 件单品 · 点击服装，加入搭配`;$('selection-count').textContent=state.selected.length;$('selected-total').textContent=state.selected.length;$('selection-bar').hidden=isModels||deletingClothes||!state.selected.length;$('delete-clothes-mode').setAttribute('aria-label',deletingClothes?'退出删除':isModels?'删除人物':'删除衣服');$('delete-clothes-mode').title=deletingClothes?'退出删除':isModels?'删除人物':'删除衣服';$('delete-clothes-mode').setAttribute('aria-pressed',String(deletingClothes));$('delete-clothes-bar').hidden=!deletingClothes;$('delete-clothes-bar').querySelector('p').textContent=isModels?'点选要删除的模特，已保存的穿搭会保留':'点选要删除的衣服，不影响搭配勾选';$('clear-all-checks').disabled=deletingClothes?!deleteSelection.size:isModels||!state.selected.length;$('delete-clothes-confirm').disabled=!deleteSelection.size;$('delete-clothes-confirm').textContent='删除选中（'+deleteSelection.size+'）';$('undo-delete-clothes').hidden=isModels?!state.deletedModelBatches?.length:!state.deletedBatches?.length;$('undo-delete-clothes').textContent=isModels?'撤销删除人物':'撤销上次删除';
 return {isModels,q,found};}
function renderCloset(){const {isModels,q,found}=updateClosetControls();
 if(isModels){const models=state.models.filter(m=>!q||m.name.toLowerCase().includes(q));$('closet-groups').innerHTML=flows.importStatus()+`<div class="closet-model-grid">${models.map(m=>`<button class="closet-model-card ${(deletingClothes?deleteSelection.has(m.id):state.selectedModel===m.id)?'selected':''}" data-closet-model="${m.id}" aria-label="${deletingClothes?'选择删除人物':'查看人物'}${escape(m.name)}"><span class="model-portrait"><img src="${escape(m.thumbnail||m.photo)}" alt="${escape(m.name)}" loading="lazy">${(deletingClothes?deleteSelection.has(m.id):state.selectedModel===m.id)?`<i aria-label="${deletingClothes?'已选待删除':'当前人物'}">✓</i>`:''}</span><span class="model-name">${escape(m.name)}</span>${m.whiteJob&&m.whiteJob.status!=='completed'?`<small class="model-processing">${['failed','paused'].includes(m.whiteJob.status)?'整理未完成':'正在整理白底'}</small>`:''}</button>`).join('')||'<p class="empty">还没有这位模特，点右上角添加照片。</p>'}</div>`;$('closet-groups').querySelectorAll('[data-closet-model]').forEach(b=>b.onclick=()=>{if(deletingClothes){const id=b.dataset.closetModel;deleteSelection.has(id)?deleteSelection.delete(id):deleteSelection.add(id);renderCloset();}else viewModel(b.dataset.closetModel);});flows.bindImports($('closet-groups'));return;}
 $('closet-groups').innerHTML=categories.map(([key,label,en])=>{const list=found.filter(i=>i.category===key);if(!list.length)return '';return `<section class="wardrobe-group"><div class="group-heading"><h2>${label}<span>${en}</span></h2><span>${list.length} 件</span></div><div class="items-grid">${list.map(i=>`<div class="closet-item"><button class="item-card ${(deletingClothes?deleteSelection.has(i.id):state.selected.includes(i.id))?'selected':''} ${deletingClothes?'delete-choice':''}" data-item="${i.id}" aria-pressed="${deletingClothes?deleteSelection.has(i.id):state.selected.includes(i.id)}" aria-label="${deletingClothes?'选择删除':state.selected.includes(i.id)?'移出搭配：':'加入搭配：'}${escape(i.name)}">${art(i)}<span class="item-name">${escape(i.name)}</span></button>${deletingClothes?'':`<button class="item-heart" data-favorite-item="${i.id}" aria-pressed="${!!i.favorite}" aria-label="${i.favorite?'取消收藏':'收藏'}：${escape(i.name)}">${icon('heart')}</button>`}</div>`).join('')}</div></section>`;}).join('')||'<div class="empty">这里还空着呢。<br>换个关键词，或添加一件喜欢的单品。</div>';
 $('closet-groups').querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>{if(deletingClothes){const id=b.dataset.item;deleteSelection.has(id)?deleteSelection.delete(id):deleteSelection.add(id);syncClosetCards();}else toggleClosetSelection(b.dataset.item);} );
 $('closet-groups').querySelectorAll('[data-favorite-item]').forEach(b=>b.onclick=()=>toggleClosetFavorite(b.dataset.favoriteItem));}
// Keep card/image nodes in place when only selection or favorite state changes.
function syncClosetCards(){
 updateClosetControls();
 const groups=$('closet-groups');
 for(const button of groups.querySelectorAll('[data-item]')){
  const item=state.items.find(i=>i.id===button.dataset.item);if(!item)continue;
  const selected=deletingClothes?deleteSelection.has(item.id):state.selected.includes(item.id);
  if((filter==='selected'&&!state.selected.includes(item.id))||(filter==='favorites'&&!item.favorite)){button.closest('.closet-item').remove();continue;}
  button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
  button.setAttribute('aria-label',(deletingClothes?'选择删除':selected?'移出搭配：':'加入搭配：')+item.name);
 }
 for(const heart of groups.querySelectorAll('[data-favorite-item]')){
  const item=state.items.find(i=>i.id===heart.dataset.favoriteItem);if(!item)continue;
  heart.setAttribute('aria-pressed',String(!!item.favorite));heart.setAttribute('aria-label',(item.favorite?'取消收藏：':'收藏：')+item.name);
 }
 for(const group of groups.querySelectorAll('.wardrobe-group')){
  const count=group.querySelectorAll('[data-item]').length;
  if(!count)group.remove();else group.querySelector('.group-heading>span').textContent=count+' 件';
 }
 if(!groups.querySelector('[data-item]')&&!groups.querySelector('.empty'))groups.innerHTML='<div class="empty">这里还没有单品，试试其他筛选。</div>';
}
async function toggleClosetSelection(id){const selected=state.selected.includes(id);if(!selected&&state.selected.length>=MAX_TRYON_ITEMS){toast(`一次最多搭配 ${MAX_TRYON_ITEMS} 件，请先移出几件`);return;}const before=state.selected;state.selected=selected?before.filter(x=>x!==id):[...before,id];syncClosetCards();try{await save();}catch(e){state.selected=before;renderCloset();fail(e);}}
async function toggleClosetFavorite(id){const item=state.items.find(i=>i.id===id);if(!item)return;const before=!!item.favorite;item.favorite=!before;syncClosetCards();try{await save();}catch(e){item.favorite=before;renderCloset();fail(e);}}
async function clearClothesChecks(){if(filter==='models'&&!deletingClothes)return;if(deletingClothes){deleteSelection.clear();}else{const before=state.selected;state.selected=[];try{await save();}catch(e){state.selected=before;fail(e);return;}if(filter==='selected'){filter='all';document.querySelectorAll('[data-filter]').forEach(t=>t.classList.toggle('active',t.dataset.filter==='all'));}}renderCloset();toast('已取消全部勾选');}
async function deleteClothes(ids){const previous=structuredClone(state);const count=removeItems(state,ids);try{await save();}catch(e){Object.assign(state,previous);fail(e);return;}deleteSelection.clear();deletingClothes=false;closeModal();renderCloset();await renderHome();toast(count+' 件衣服已删除，可撤销');}
async function deleteModels(ids){const previous=structuredClone(state);const count=removeModels(state,ids);try{await save();}catch(e){Object.assign(state,previous);fail(e);return 0;}currentId=state.homeEntryId||currentId;deleteSelection.clear();deletingClothes=false;renderCloset();await renderHome();toast(count+' 位人物已删除，可撤销');return count;}
$('delete-clothes-mode').onclick=()=>{deletingClothes=!deletingClothes;deleteSelection.clear();renderCloset();};
$('clear-all-checks').onclick=clearClothesChecks;
$('delete-clothes-confirm').onclick=()=>filter==='models'?deleteModels([...deleteSelection]):deleteClothes([...deleteSelection]);
$('undo-delete-clothes').onclick=async()=>{const previous=structuredClone(state);const isModels=filter==='models';const count=isModels?restoreRemovedModels(state):restoreRemovedItems(state);try{await save();}catch(e){Object.assign(state,previous);fail(e);return;}if(isModels&&state.homeEntryId)currentId=state.homeEntryId;renderCloset();await renderHome();toast('已恢复 '+count+(isModels?' 位人物':' 件衣服'));};
$('item-search').oninput=renderCloset;document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;deletingClothes=false;deleteSelection.clear();document.querySelectorAll('[data-filter]').forEach(t=>t.classList.toggle('active',t===b));renderCloset();});
function detailItem(id){const i=state.items.find(x=>x.id===id);if(!i)return;const selected=state.selected.includes(id);openModal(i.name,`<div class="detail-art">${art(i)}</div><p class="helper">${categories.find(c=>c[0]===i.category)?.[1]||'单品'} · ${i.board?'来自你的服装参考':'我的上传'}</p><div class="detail-actions"><button class="pill soft" id="item-favorite">${i.favorite?'♥ 已收藏':'♡ 收藏单品'}</button><button class="pill dark" id="item-select">${selected?'移出搭配':'加入搭配'}</button></div><div class="detail-actions"><button class="text-button" id="edit-item">编辑名称与分类</button><button class="text-button delete-link" id="delete-single-item">删除这件衣服</button></div>`);
 $('item-favorite').onclick=async()=>{i.favorite=!i.favorite;await save();detailItem(id);renderCloset();};$('item-select').onclick=async()=>{if(!selected&&state.selected.length>=MAX_TRYON_ITEMS){toast(`一次最多搭配 ${MAX_TRYON_ITEMS} 件，请先移出几件`);return;}state.selected=selected?state.selected.filter(x=>x!==id):[...state.selected,id];await save();closeModal();renderCloset();toast(selected?'已移出搭配':'已加入搭配，继续挑喜欢的吧');};$('edit-item').onclick=()=>itemForm(i);$('delete-single-item').onclick=()=>deleteClothes([id]);}
function itemForm(i){openModal(i?'编辑单品':'添加服装单品',`<form id="item-form" class="form-grid"><label>单品名称<input class="field" name="name" maxlength="30" required value="${escape(i?.name||'')}" placeholder="输入单品名称"></label><label>单品分类<select class="field" name="category">${categories.map(c=>`<option value="${c[0]}" ${i?.category===c[0]?'selected':''}>${c[1]}</option>`).join('')}</select></label>${i?'':'<label>单品图片<input name="photo" type="file" accept="image/*" required></label>'}<button class="pill dark" type="submit">保存到衣柜</button></form>`);$('item-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const button=e.target.querySelector('button');button.disabled=true;try{let target=i||{id:crypto.randomUUID(),favorite:false};if(!i)target.photo=await readImage(f.get('photo'));target.name=String(f.get('name')).trim();if(!target.name)throw Error('请给单品起个名字');target.category=String(f.get('category'));if(!i)state.items.push(target);await save();closeModal();renderCloset();renderHome();toast('单品已保存');}catch(e){fail(e);button.disabled=false;}};}
$('add-item').onclick=()=>{if(filter==='models'){navigate('create');$('photo-input').click();return;}creation.addClothes();return;openModal('添加到衣柜',`<div class="menu-list"><button id="upload-single">${icon('photo')}上传单品图片</button><button id="extract-single">${icon('hanger')}从穿搭照片提取</button></div>`);$('upload-single').onclick=()=>itemForm();$('extract-single').onclick=extractItem;};
function renderRecent(){
 const people=state.models||[];$('archive-count').textContent=people.length;$('view-favorites').textContent='去衣柜搭配';
 $('recent-looks').innerHTML=people.map(m=>`<button class="look-card person-card" data-person="${escape(m.id)}" aria-label="人物素材：${escape(m.name)}"><img src="${escape(m.thumbnail||m.photo)}" alt="${escape(m.name)}" loading="lazy"><strong>${escape(m.name)}</strong><small>${state.selectedModel===m.id?'当前搭配人物':'点击搭配或提取服饰'}</small></button>`).join('')||'<p class="empty">添加自己的照片，或保存一位参考模特。</p>';
 $('recent-looks').querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>viewModel(b.dataset.person));
}
$('view-favorites').onclick=()=>{navigate('closet');};
async function viewModel(id){creation.viewPerson(id);}
async function onModelSaved(model){await save();renderRecent();renderCloset();navigate('create');creation.viewPerson(model.id);}
async function onModelUpdated(model){renderCloset();if(current()?.modelId===model.id)await renderHome();}
function readImage(file){return new Promise((resolve,reject)=>{if(!file?.type.startsWith('image/'))return reject(Error('请选择图片文件'));if(file.size>20*1024*1024)return reject(Error('请使用 20 MB 以内的照片'));const r=new FileReader();r.onload=async()=>{const image=new Image();image.onload=()=>resolve(r.result);image.onerror=()=>reject(Error('这张图片无法读取，请换成 JPG、PNG 或 WebP'));image.src=r.result;};r.onerror=()=>reject(Error('图片读取失败'));r.readAsDataURL(file);});}
function photoForm(photo){creation.personForm(photo);}
$('choose-photo').onclick=()=>$('photo-input').click();$('photo-input').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{photoForm(await readImage(file));}catch(e){fail(e);}};

async function tryon(savedModel){
 let modelReference=typeof savedModel==='string'?null:state.models.find(m=>m.id===state.selectedModel);
 if(typeof savedModel!=='string'&&!state.models.length){navigate('create');toast('先添加一张人物照片，再来搭配');return;}
 if(typeof savedModel!=='string')savedModel=state.models.find(m=>m.id===state.selectedModel)?.photo||state.models[0]?.photo;let modelPhoto=savedModel;
 const chosen=state.items.filter(i=>state.selected.includes(i.id));if(!chosen.length){navigate('closet');toast('先挑几件喜欢的单品吧');return;}
 if(chosen.length>MAX_TRYON_ITEMS){toast(`一次最多选择 ${MAX_TRYON_ITEMS} 件单品，请先移出几件`);return;}
 openModal('确认试穿搭配',`<p class="step-label">01 / 选好的 ${chosen.length} 件单品</p><div class="selected-items">${chosen.map(i=>`<div>${art(i)}<span>${escape(i.name)}</span></div>`).join('')}</div><p class="step-label">02 / 选择搭配人物</p><img id="tryon-model" class="photo-preview" style="height:200px" src="${escape(modelPhoto)}" alt="搭配前的人物"><button id="choose-model" class="pill soft" style="width:100%;margin-bottom:8px">选择已保存的人物</button><button id="replace-model" class="pill soft" style="width:100%">上传其他人物照片</button><input id="tryon-file" type="file" accept="image/*" hidden><p class="helper" id="generation-description">生成一张白底换装图片，保留脸、发型和姿势；没选鞋子就沿用原鞋。</p><button id="tryon-action" class="pill dark" style="width:100%">生成穿搭图片</button><button id="tryon-config" class="text-button" style="width:100%">生图服务设置</button>`);
 $('choose-model').onclick=()=>flows.models(true);$('replace-model').onclick=()=>$('tryon-file').click();$('tryon-file').onchange=async e=>{if(!e.target.files[0])return;try{modelReference=null;modelPhoto=await readImage(e.target.files[0]);$('tryon-model').src=modelPhoto;}catch(e){fail(e);}};
 $('tryon-config').hidden=true;
 $('tryon-action').onclick=async()=>{
  const button=$('tryon-action');button.disabled=true;button.textContent='准备模特与单品…';
  try{const config=await getImageConfig();if(!config.configured){toast('请先配置生图 API');imageSettings(()=>tryon(modelPhoto));return;}
   const modelSource=modelPhoto;const images=[await imageForAPI(modelSource)];for(const i of chosen)images.push(await imageForAPI(i.photo||`assets/outfits/${i.board}.png`,{rect:i.rect,shape:garmentShape(i.id)}));
   const id=crypto.randomUUID(),input={requestId:id,kind:'tryon',items:chosen.map(i=>i.name),itemIds:chosen.map(i=>i.id),images};
   await put('media','model-'+id,modelPhoto);await put('media','tryon-input-'+id,input);
   const task={id,status:'submitting'};(state.tryonTasks||=[]).push(task);
   try{await save();}catch(e){state.tryonTasks=state.tryonTasks.filter(t=>t!==task);throw e;}
   watchImageJob({id,kind:'tryon',status:'queued'});
  }catch(e){fail(e);if(button.isConnected){button.disabled=false;button.textContent='生成穿搭图片';}}
 };
}
$('start-tryon').onclick=tryon;$('clear-selection').onclick=clearClothesChecks;
function calendar(){const y=month.getFullYear(),m=month.getMonth();const first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate();const matching=state.looks.filter(l=>l.date===pickedDay);openModal('穿搭日历',`<div class="calendar-head"><button class="icon-button" id="prev-month" aria-label="上个月">${icon('left')}</button><h3>${y} 年 ${m+1} 月</h3><button class="icon-button" id="next-month" aria-label="下个月">${icon('right')}</button></div><div class="calendar-grid">${['日','一','二','三','四','五','六'].map(d=>`<span class="weekday">${d}</span>`).join('')}${'<span></span>'.repeat(first)}${Array.from({length:days},(_,i)=>{const d=`${y}-${String(m+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;return `<button class="day ${state.looks.some(l=>l.date===d)?'has-look':''} ${d===today()?'today':''} ${d===pickedDay?'chosen':''}" data-day="${d}" aria-label="${d}" aria-pressed="${d===pickedDay}">${i+1}</button>`;}).join('')}</div><div class="calendar-results"><p class="helper">${pickedDay.replaceAll('-','.')} · ${matching.length} 套穿搭</p>${matching.map(l=>`<button class="calendar-look" data-look="${l.id}"><img src="${escape(l.thumbnail||l.photo)}" alt=""><span>${escape(l.name)}</span></button>`).join('')||'<p class="helper">这一天还没有穿搭记录。</p>'}</div>`);$('prev-month').onclick=()=>{month=new Date(y,m-1,1);calendar();};$('next-month').onclick=()=>{month=new Date(y,m+1,1);calendar();};$('modal-body').querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{pickedDay=b.dataset.day;calendar();});$('modal-body').querySelectorAll('[data-look]').forEach(b=>b.onclick=()=>{currentId=b.dataset.look;state.homeEntryId=currentId;state.homeViewType=state.looks.find(x=>x.id===currentId)?.sequence?'rotation':'flat';void save().catch(fail);closeModal();navigate('home');renderHome();});}
$('calendar-open').onclick=calendar;
$('look-date').onclick=()=>{const l=current();if(!l||l.modelId)return;openModal('记下这一天',`<form id="date-form" class="form-grid"><label>穿搭日期<input class="field" type="date" name="date" value="${l.date}" required></label><button class="pill dark">保存日期</button></form>`);$('date-form').onsubmit=async e=>{e.preventDefault();l.date=new FormData(e.target).get('date');await save();closeModal();renderHome();toast('日期已更新');};};
$('delete-look').onclick=()=>{const l=current();if(!l)return;if(l.modelId){openModal('删除这位模特？',`<p class="helper">将移除「${escape(l.name)}」。已保存的穿搭和衣服会保留，可在衣柜的模特页撤销删除。</p><div class="detail-actions"><button id="keep-model" class="pill soft">取消</button><button id="confirm-delete-model" class="pill danger">删除人物</button></div>`);$('keep-model').onclick=closeModal;$('confirm-delete-model').onclick=async()=>{if(await deleteModels([l.modelId]))closeModal();};return;}openModal('和这套穿搭说再见？',`<p class="helper">将从衣柜中移除「${escape(l.name)}」。已经收录的单品会保留。</p><div class="detail-actions"><button id="keep-look" class="pill soft">再留一会儿</button><button id="confirm-delete" class="pill danger">删除穿搭</button></div>`);$('keep-look').onclick=closeModal;$('confirm-delete').onclick=async()=>{state.looks=state.looks.filter(x=>x.id!==l.id);await save();closeModal();renderHome();toast('穿搭已移除');};};
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('已复制，可以去生图工具使用');}catch{openModal('复制提示词',`<textarea class="field" style="height:190px;padding:12px" readonly>${escape(text)}</textarea>`);}}
function downloadBlob(blob,name){const u=url(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>{URL.revokeObjectURL(u);mediaURLs.delete(u);},15000);}
$('share-look').onclick=async()=>{const l=current();if(!l)return;try{if(l.sequence){(await window.__wardrobe.captureCanvas()).toBlob(b=>{if(b)downloadBlob(b,`${l.name}.png`);else toast('图片暂时无法保存');},'image/png');}else{const r=await fetch(l.photo);downloadBlob(await r.blob(),`${l.name}.png`);}toast('已准备当前穿搭图片');}catch(e){fail(e);}};
$('menu-open').onclick=()=>{openModal('衣柜工具',`<div class="menu-list"><button id="menu-extract">${icon('hanger')}提取服装单品</button><button id="menu-favs">${icon('heart')}收藏的穿搭</button><button id="menu-calendar">${icon('calendar')}穿搭日历</button><button id="menu-add">${icon('plus')}添加单品</button><button id="menu-export">${icon('download')}导出衣柜清单</button><button id="menu-about">${icon('hanger')}关于 数字衣柜</button></div>`);$('menu-extract').onclick=extractItem;$('menu-favs').onclick=()=>{onlyFavorites=true;closeModal();navigate('create');};$('menu-calendar').onclick=calendar;$('menu-add').onclick=()=>itemForm();$('menu-export').onclick=()=>{const list={exportedAt:new Date().toISOString(),items:state.items.map(({id,name,category,favorite})=>({id,name,category,favorite})),looks:state.looks.map(({id,name,date,items,favorite})=>({id,name,date,items,favorite}))};downloadBlob(new Blob([JSON.stringify(list,null,2)],{type:'application/json'}),'我的衣柜清单.json');toast('已导出单品与穿搭文字清单');};$('menu-about').onclick=()=>openModal('数字衣柜 · 穿搭工作室',`<p class="helper">把照片中的服装整理成自己的衣柜，选择模特和单品，生成新的穿搭。喜欢的穿搭还可以制作 360° 旋转视频。</p><p class="helper">照片和衣柜保存在当前设备的浏览器中，不上传到站点的衣柜数据库。换浏览器不会同步；清理网站数据可能丢失记录，请自行下载保留图片。AI 生成时素材会发送至生成服务；图片结果临时保留 1 小时供取回，衣柜不会同步到他人的设备。</p>`)};
async function imageSettings(){openModal('配置生成服务','<p class="helper">请在项目根目录的 .env 中配置生图与生视频服务的 API URL、API Key，并重启服务。密钥只由服务端读取。</p>');}

let flows;
function extractItem(){publicExtract();}
let imageWatch=0;
async function watchImageJob(initial){
 if(initial.kind==='tryon'&&state.tryonTasks?.some(t=>t.id===initial.id)){const model=await get('media','model-'+initial.id);openModal('正在准备新的喜欢',`<div class="busy-center tryon-wait" data-tryon-task="${initial.id}"><div class="model-wait-stage" aria-hidden="true"><img class="model-wait-photo" src="${escape(model||'')}" alt=""></div><p>正在准备你的新穿搭</p><p class="helper">可以关闭窗口，完成后会自动收好。</p></div>`);void tryonPipeline.watch(initial.id);return;}

 const version=++imageWatch;
 const model=initial.kind==='tryon'?(await get('media','model-'+initial.id)||state.models.find(m=>m.id===state.selectedModel)?.photo||state.models[0]?.photo):null;
 if(version!==imageWatch)return;
 openModal('正在准备新的喜欢',`<div id="ai-job-view" data-job="${initial.id}" class="busy-center${model?' tryon-wait':''}">${model?`<div class="model-wait-stage" aria-hidden="true"><img src="${escape(model)}" alt="" class="model-wait-photo"></div>`:'<span class="spinner"></span>'}<p>正在生成${({extract:'单品图片',analyze:'单品清单','extract-batch':'整套单品',tryon:'你的新穿搭'})[initial.kind]}</p><p class="helper" id="ai-progress-note" hidden></p><p class="helper">可以先逛逛衣柜，稍后从「生成记录」查看。</p></div>`);
 const update=async job=>{
  if(version!==imageWatch||!$('modal').open||$('ai-job-view')?.dataset.job!==job.id)return;
  if(job.kind==='extract-batch'&&['completed','partial','failed','interrupted'].includes(job.status)){flows.batchResult(job);return;}
  if(job.status==='completed'){if(job.kind==='analyze')flows.review(job.garments,job.id);else showImageResult(job);return;}
  if(['failed','interrupted'].includes(job.status)){openModal('这次还没有拿到图片',`<p class="helper">${escape(job.error||'生成未完成')}</p><button id="failed-history" class="pill soft" style="width:100%;margin-top:16px">查看生成记录</button>`);$('failed-history').onclick=imageHistory;if(job.kind==='analyze'){const b=document.createElement('button');b.className='pill soft';b.textContent='手动填写单品清单';b.onclick=()=>flows.review([{name:'',category:'tops'}],job.id);$('modal-body').append(b);}return;}
  setTimeout(async()=>{try{await update(await getImageJob(job.id));}catch(e){if(version===imageWatch&&$('ai-progress-note')){$('ai-progress-note').hidden=false;$('ai-progress-note').textContent='暂时无法读取进度，请稍后从生成记录查看。';}}},1800);
 };update(initial);
}
async function showImageResult(job){
 const isItem=job.kind==='extract',before=isItem?null:await get('media','model-'+job.id);openModal(isItem?'单品图生成好了':'新搭配生成好了',` ${before?`<details><summary>查看搭配前的人物</summary><img class="photo-preview" src="${escape(before)}" alt="搭配前的人物"></details>`:''}<img class="photo-preview generated-preview" src="${escape(job.imageUrl)}" alt="AI 生成结果"><p class="helper">保存前检查口袋、印花与裙长等细节，模型补全可能与原件有偏差。</p><form class="form-grid" id="save-ai-result"><label>${isItem?'单品名称':'穿搭名称'}<input class="field" name="name" maxlength="30" required value="${escape(isItem?job.title:'我的新搭配')}"></label>${!isItem?`<label>穿搭日期<input class="field" name="date" type="date" required value="${today()}"></label>`:''}${isItem?`<label>单品分类<select class="field" name="category">${categories.map(c=>`<option value="${c[0]}">${c[1]}</option>`).join('')}</select></label>`:''}<button class="pill dark">${isItem?'收进单品衣柜':'保存这套穿搭'}</button></form><a class="pill soft" style="width:100%;margin-top:10px" href="${escape(job.imageUrl)}" download="${isItem?'单品':'穿搭'}-3x4.png">下载图片</a>`);
 $('save-ai-result').onsubmit=async e=>{e.preventDefault();const form=new FormData(e.target),name=form.get('name').trim();if(!name)return;const id='generated-'+job.id;try{if(isItem){const existing=state.items.find(i=>i.id===id);if(existing){existing.name=name;existing.category=form.get('category');}else state.items.push({id,name,category:form.get('category'),photo:job.imageUrl,favorite:false});}else{const existing=state.looks.find(l=>l.id===id);if(existing){existing.name=name;existing.date=form.get('date')||existing.date;}else state.looks.push({id,name,date:form.get('date')||today(),photo:job.imageUrl,items:(job.itemIds||[]).filter(id=>state.items.some(i=>i.id===id)),favorite:false});currentId=id;state.homeViewType='flat';state.homeEntryId=id;}await save();closeModal();navigate(isItem?'closet':'home');if(!isItem)await renderHome();toast('已保存到衣柜');}catch(e){fail(e);}};
}
async function imageHistory(){
 try{const {jobs}=await listImageJobs();const labels={queued:'排队中',running:'生成中',completed:'已完成',partial:'部分完成',failed:'未完成',interrupted:'状态待确认'};openModal('生成记录',`<div class="generation-list">${jobs.length?jobs.map(j=>`<button class="generation-row" data-job="${j.id}">${j.imageUrl?`<img src="${escape(j.imageUrl)}" alt="">`:'<span class="entry-icon">✳</span>'}<span><strong>${escape(j.title)}</strong><small>${labels[j.status]||'未知状态'}${j.kind==='analyze'?' · 单品识别':j.kind==='extract-batch'?` · ${j.results.filter(g=>g.status==='completed').length}/${j.results.length} 件`:''}</small></span><span>${icon('right')}</span></button>`).join(''):'<p class="empty">还没有生成记录。<br>从衣柜里挑几件喜欢的，开始搭配吧。</p>'}</div>`);$('modal-body').querySelectorAll('[data-job]').forEach(b=>b.onclick=async()=>{try{const job=await getImageJob(b.dataset.job);if(job.kind==='auto-extract'){closeModal();flows.watchAuto(job.id);return;}if(job.kind==='extract-batch'&&['completed','partial','failed','interrupted'].includes(job.status))flows.batchResult(job);else if(job.status==='completed'){if(job.kind==='analyze')flows.review(job.garments,job.id);else showImageResult(job);}else watchImageJob(job);}catch(e){fail(e);}});
 }catch(e){fail(e);}
}
function fail(error){console.error(error);toast(error?.name==='QuotaExceededError'?'本地存储空间不足，请换一份较小的素材':error?.message||'保存失败，请再试一次');}
let videoFlow,rotationGeneration,tryonPipeline;

$('photo-to-360').onclick=()=>rotationGeneration.open(current());
async function commitRotation(sequence,targetId,name){
 const key=crypto.randomUUID();const update=planRotationSave(state,{targetId,name,key,sequence,date:today()});
 const previous=state[update.collection],previousType=state.homeViewType;state[update.collection]=update.entries;state.homeViewType='rotation';
 try{await library.putMedia(key,sequence);await save();}catch(e){state[update.collection]=previous;state.homeViewType=previousType;throw e;}
 return update.entryId;
}
window.addEventListener('pagehide',()=>{mediaURLs.forEach(u=>URL.revokeObjectURL(u));});
function onTryonComplete(look,task){
 const visible=$('modal').open&&$('modal-body').querySelector('[data-tryon-task]')?.dataset.tryonTask===task.id;
 if(visible){
  openModal('换装图片生成好了',`<img class="photo-preview generated-preview" src="${escape(look.photo)}" alt="生成的换装图片"><p class="helper">已保存到最近穿搭，需要旋转视频时可在首页生成。</p><button id="view-tryon-look" class="pill dark" style="width:100%">查看这套穿搭</button>`);
  $('view-tryon-look').onclick=async()=>{currentId=look.id;state.homeEntryId=look.id;state.homeViewType=look.sequence?'rotation':'flat';await save();closeModal();navigate('home');};
 }else toast('换装图片已保存到最近穿搭');
}
async function initUI(){db=await openDB();library=createLibraryClient({db,onProgress:text=>{$('app-startup-message').textContent=text;}});const saved=await library.load();state=saved||{items:[],looks:[],models:[],selected:[]};const startupSnapshot=JSON.stringify(state);currentId=state.homeEntryId||currentId;state.items.forEach(i=>{if(i.category==='outerwear')i.category='tops';});if(!state.models)state.models=[];state.selectedModel ||= state.models[0]?.id||null;reconcileModelRotations(state);if(JSON.stringify(state)!==startupSnapshot)await save();flows=createFlows({$,state,save,put,get,openModal,closeModal,escape,toast,fail,categories,readImage,imageForAPI,submitImageJob,watchImageJob,navigate,tryon,imageHistory,renderCloset,art,onModelSaved,onModelUpdated});await flows.resume();for(const t of state.publicExtractions||[])void runPublicExtraction(t.id);videoFlow=createVideoFlow({$,state,current,openModal,closeModal,escape,fail,toast,url,copyText,navigate,renderHome,commit:commitRotation,setCurrent:id=>currentId=id,setBusy:value=>busy=value});rotationGeneration=createRotationGeneration({$,state,save,openModal,closeModal,escape,toast,renderHome,videoFlow,commit:commitRotation});initialManifest=await(await fetch('assets/manifest.json')).json();await window.__wardrobe.ready;void renderHome().catch(fail);renderCloset();renderRecent();tryonPipeline=createTryonPipeline({state,save,getInput:id=>get('media','tryon-input-'+id),releaseInput:id=>put('media','tryon-input-'+id,null),onComplete:onTryonComplete,onUpdate:()=>renderRecent(),onError:task=>{const visible=$('modal').open&&$('modal-body').querySelector('[data-tryon-task]')?.dataset.tryonTask===task.id;if(visible)openModal(task.status==='paused'?'连接暂时中断':'这次还没有完成',`<p class="helper">${escape(task.error)}</p><button class="pill soft" id="retry-tryon-task">继续处理这次任务</button>`);if(visible)$('retry-tryon-task').onclick=()=>{void watchImageJob({id:task.id,kind:'tryon'});};else toast('换装图片暂未完成，可稍后继续检查');}});rotationGeneration.resume();tryonPipeline.resume();window.__wardrobeUI={get state(){return state;},get page(){return pageName;}};document.querySelector('.app-shell').inert=false;$('app-startup').hidden=true;}
$('retry-startup').onclick=()=>location.reload();
const creation=createCreationUI({$,getState:()=>state,save,readImage,openModal,closeModal,navigate,renderRecent,renderCloset,toast,fail,tryon,escape,imageForAPI,runPublicExtraction});
$('add-clothes-entry').onclick=creation.addClothes;
$('clothes-batch-input').onchange=e=>{const files=[...e.target.files];e.target.value='';void creation.batchFiles(files);};
$('show-rotation-looks').onclick=()=>{void switchGalleryType('rotation');};
$('show-flat-looks').onclick=()=>{void switchGalleryType('flat');};
$('save-as-person').onclick=()=>{void creation.saveLookAsPerson(current());};
initUI().catch(error=>{fail(error);$('app-startup-message').textContent='暂时无法读取衣柜：'+(error.message||'请重新打开');$('app-startup').querySelector('.spinner').hidden=true;$('retry-startup').hidden=false;});

async function publicExtract(source){creation.extract(source);}
const publicExtractionRunning=new Set();
async function runPublicExtraction(id){
 if(publicExtractionRunning.has(id))return;publicExtractionRunning.add(id);
 const task=(state.publicExtractions||[]).find(t=>t.id===id);if(!task){publicExtractionRunning.delete(id);return;}
 try{
  let job;try{job=await getImageJob(id);}catch(e){if(e.status!==404)throw e;}
  if(!job){for(;;){try{job=await submitImageJob(task.input);break;}catch(e){if(e.code!=='IMAGE_BUSY')throw e;await new Promise(r=>setTimeout(r,3000));}}}
  delete task.input;await save();
  while(['queued','running'].includes(job.status)){await new Promise(r=>setTimeout(r,2500));job=await getImageJob(id);}
  if(job.status!=='completed')throw Error(job.error||'单品提取未完成');
  if(!state.items.some(i=>i.id===id))state.items.push({id,name:task.name,category:task.category,photo:job.imageUrl,favorite:false});
  const before=state.publicExtractions;state.publicExtractions=before.filter(t=>t.id!==id);try{await save();}catch(e){state.publicExtractions=before;throw e;}renderCloset();toast('单品已收进衣柜');
 }catch(e){toast(e.message);}finally{publicExtractionRunning.delete(id);}
}
window.addEventListener('online',()=>{for(const t of state.publicExtractions||[])void runPublicExtraction(t.id);});
