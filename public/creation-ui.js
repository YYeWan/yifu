import {clothingTypes,clothingCategory,guessClothingType,createPerson} from './creation-flow.js';
export function createCreationUI({$,getState,save,readImage,openModal,closeModal,navigate,renderRecent,renderCloset,toast,fail,tryon,escape,imageForAPI,runPublicExtraction}){
 const typeOptions=(selected='')=>'<option value="">选择服饰类型</option>'+clothingTypes.map(([id,name])=>`<option value="${id}" ${selected===id?'selected':''}>${name}</option>`).join('');
 async function thumbnail(photo){const image=new Image();image.src=photo;await image.decode();const scale=Math.min(1,320/image.naturalWidth),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',.76);}
 function viewPerson(id){
  const state=getState(),person=state.models.find(x=>x.id===id);if(!person)return;
  openModal(person.name,`<img class="photo-preview" src="${escape(person.photo)}" alt="人物原照片"><p class="helper">人物素材保留原图。选择衣服完成搭配后，成品会出现在「穿搭」。</p><div class="form-grid"><button class="pill dark" id="person-use">用这个人物搭配</button><button class="pill soft" id="person-extract">提取身上服饰</button></div>`);
  $('person-use').onclick=async()=>{const before=state.selectedModel;state.selectedModel=id;try{await save();closeModal();renderRecent();if(state.selected.length)void tryon();else{navigate('closet');toast('已选好人物，接着选择衣服、鞋子和配饰');}}catch(e){state.selectedModel=before;fail(e);}};
  $('person-extract').onclick=()=>extract(person.originalPhoto||person.photo);
 }
 function personForm(photo){
  openModal('保存人物素材',`<img class="photo-preview" src="${escape(photo)}" alt="待保存人物原图"><form id="save-person-form" class="form-grid"><label>人物名称<input class="field" name="name" maxlength="30" placeholder="例如：我、参考模特" required value="我的人物"></label><p class="helper">保留原始照片，仅存入人物素材，不会加入穿搭首页，也不占生成次数。</p><button class="pill dark">保存人物素材</button></form>`);
  $('save-person-form').onsubmit=async event=>{
   event.preventDefault();const state=getState(),button=event.target.querySelector('button');button.disabled=true;const previous=state.selectedModel;
   let person;try{person=createPerson({id:crypto.randomUUID(),name:new FormData(event.target).get('name'),photo,thumbnail:await thumbnail(photo),date:new Date().toLocaleDateString('sv-SE')});state.models.push(person);state.selectedModel=person.id;await save();closeModal();navigate('create');renderRecent();renderCloset();viewPerson(person.id);toast('人物原图已保存，接下来可以搭配或提取服饰');}
   catch(e){if(person)state.models=state.models.filter(x=>x.id!==person.id);state.selectedModel=previous;fail(e);button.disabled=false;}
  };
 }
 function addClothes(){
  openModal('添加衣服',`<div class="menu-list"><button id="clothes-upload">上传服装图片（可多选）</button><button id="clothes-extract">从人物或穿搭照片提取</button></div><p class="helper">已有单品图可直接免费入柜；提取会为每件服饰生成单独图片。</p>`);
  $('clothes-upload').onclick=()=>$('clothes-batch-input').click();$('clothes-extract').onclick=()=>extract();
 }
 async function batchFiles(files){
  if(!files.length)return;if(files.length>16){toast('一次最多添加 16 件衣服');return;}
  try{
   const entries=[];for(const file of files){const photo=await readImage(file);entries.push({id:crypto.randomUUID(),photo,thumbnail:await thumbnail(photo),name:file.name.replace(/\.[^.]+$/,''),type:guessClothingType(file.name),favorite:false});}
   openModal('确认衣服与分类',`<p class="helper">选择服饰类型后会归入上衣、下装、鞋子或配饰。直接保存原图，不占生成次数。</p><form id="clothes-batch-form" class="form-grid"><div class="clothing-upload-list">${entries.map((x,index)=>`<div class="clothing-upload-row" data-upload="${index}"><img src="${escape(x.thumbnail)}" alt="待入柜衣服"><div><label>单品名称<input class="field" name="name-${index}" maxlength="30" required value="${escape(x.name)}"></label><label>服饰类型<select class="field" name="type-${index}" required>${typeOptions(x.type)}</select></label></div></div>`).join('')}</div><button class="pill dark">保存 ${entries.length} 件到衣柜</button></form>`);
   $('clothes-batch-form').onsubmit=async event=>{
    event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;const state=getState(),previous=state.items;
    try{const form=new FormData(event.target),additions=entries.map((x,index)=>({id:x.id,photo:x.photo,thumbnail:x.thumbnail,name:String(form.get('name-'+index)).trim(),category:clothingCategory(form.get('type-'+index)),favorite:false}));if(additions.some(x=>!x.name))throw Error('请填写单品名称');state.items=[...previous,...additions];await save();closeModal();navigate('closet');renderCloset();toast(`${additions.length} 件服饰已分类入柜`);}catch(e){state.items=previous;fail(e);button.disabled=false;}
   };
  }catch(e){fail(e);}
 }
 function extract(source){
  const presets=[['top','上衣'],['pants','裤子 / 下装'],['shoes','鞋子'],['hat','帽子'],['bag','包袋'],['accessory','配饰']];let photo=source;
  openModal('提取照片中的服饰',`<form id="extract-clothing-form" class="form-grid">${source?`<img class="photo-preview" src="${escape(source)}" alt="服饰来源照片">`:'<label>人物或穿搭照片<input id="extract-source-file" type="file" accept="image/*" required></label>'}<p class="helper">勾选照片中想要的服饰，可补充颜色或款式。每件分别生成图片，并分类收进衣柜。</p><div class="extract-choices">${presets.map(([type,label])=>`<div class="extract-choice"><label><input type="checkbox" name="include" value="${type}">${label}</label><input class="field" name="name-${type}" aria-label="${label}描述" value="${type==='pants'?'下装':label}" maxlength="30"></div>`).join('')}</div><p class="helper">每件占 1 次图片额度，一次最多 5 件；照片未选中的衣服不会提取。</p><button class="pill dark" id="extract-submit">提取选中服饰并入柜</button></form>`);
  if(!source)$('extract-source-file').onchange=async event=>{try{photo=await readImage(event.target.files[0]);}catch(e){photo=null;fail(e);}};
  $('extract-clothing-form').onsubmit=async event=>{
   event.preventDefault();const button=$('extract-submit');button.disabled=true;const state=getState(),previous=state.publicExtractions||[];
   try{
    const form=new FormData(event.target),types=form.getAll('include');if(!photo)throw Error('请先选择照片');if(!types.length)throw Error('请至少勾选一件服饰');if(types.length>5)throw Error('一次最多提取 5 件');
    const names=types.map(type=>String(form.get('name-'+type)).trim());if(names.some(x=>!x))throw Error('请填写选中服饰的描述');
    const response=await fetch('/api/experience',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('暂时无法读取额度，请稍后重试');const quota=await response.json();if(!quota.active||quota.image.personalRemaining<types.length||quota.image.remaining<types.length)throw Error('当前剩余图片额度不足，请减少提取件数');
    const image=await imageForAPI(photo),tasks=types.map((type,index)=>{const id=crypto.randomUUID();return {id,name:names[index],category:clothingCategory(type),input:{requestId:id,kind:'extract',itemName:names[index],images:[image]}};});
    state.publicExtractions=[...previous,...tasks];await save();closeModal();navigate('closet');toast(`开始提取 ${tasks.length} 件服饰，完成后自动入柜`);for(const task of tasks)void runPublicExtraction(task.id);
   }catch(e){state.publicExtractions=previous;fail(e);button.disabled=false;}
  };
 }
 async function saveLookAsPerson(look){if(!look)return;const state=getState();let person=state.models.find(x=>x.sourceLookId===look.id);if(!person){person=createPerson({id:crypto.randomUUID(),name:look.name,photo:look.photo,thumbnail:look.thumbnail||await thumbnail(look.photo),date:new Date().toLocaleDateString('sv-SE')});person.sourceLookId=look.id;state.models.push(person);try{await save();}catch(e){state.models=state.models.filter(x=>x.id!==person.id);fail(e);return;}}navigate('create');renderRecent();viewPerson(person.id);}
 return {viewPerson,personForm,addClothes,batchFiles,extract,saveLookAsPerson};
}
