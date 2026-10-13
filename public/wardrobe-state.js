export const MAX_TRYON_ITEMS=16;
export const duplicateRepair = [];
export function mergeDuplicateItems(state,pairs=duplicateRepair){
 const redirects={};state.archivedDuplicates ||= [];
 for(const {oldId,newId} of pairs){
  const old=state.items.find(i=>i.id===oldId),replacement=state.items.find(i=>i.id===newId);
  if(!old||!replacement)continue;
  state.archivedDuplicates.push({...old,replacedBy:newId});replacement.favorite ||= old.favorite;
  redirects[oldId]=newId;
 }
 state.items=state.items.filter(i=>!redirects[i.id]);
 state.selected=[...new Set(state.selected.map(id=>redirects[id]||id))];
 state.looks.forEach(l=>l.items=[...new Set(l.items.map(id=>redirects[id]||id))]);
 return Object.keys(redirects).length;
}

export function removeItems(state,ids){
 const chosen=new Set(ids),items=state.items.filter(i=>chosen.has(i.id));if(!items.length)return 0;
 state.deletedBatches ||= [];state.deletedItemIds ||= [];
 state.deletedBatches.push({items,selected:state.selected.filter(id=>chosen.has(id)),links:state.looks.map(l=>({id:l.id,items:l.items.filter(id=>chosen.has(id))})).filter(l=>l.items.length)});
 state.deletedItemIds=[...new Set([...state.deletedItemIds,...items.map(i=>i.id)])];
 state.items=state.items.filter(i=>!chosen.has(i.id));state.selected=state.selected.filter(id=>!chosen.has(id));state.looks.forEach(l=>l.items=l.items.filter(id=>!chosen.has(id)));return items.length;
}
export function restoreRemovedItems(state){
 const batch=state.deletedBatches?.pop();if(!batch)return 0;
 for(const item of batch.items)if(!state.items.some(i=>i.id===item.id))state.items.push(item);
 const restored=new Set(batch.items.map(i=>i.id));state.deletedItemIds=(state.deletedItemIds||[]).filter(id=>!restored.has(id));
 state.selected=[...new Set([...state.selected,...batch.selected])].filter(id=>state.items.some(i=>i.id===id)).slice(0,MAX_TRYON_ITEMS);
 for(const link of batch.links){const look=state.looks.find(l=>l.id===link.id);if(look)look.items=[...new Set([...look.items,...link.items])];}
 return batch.items.length;
}

// Models are viewable on the home stage without becoming outfit records.
export function homeEntries(state){return state.looks||[];}

export function removeModels(state,ids){
 const chosen=new Set(ids),models=state.models.map((model,index)=>({model,index})).filter(({model})=>chosen.has(model.id));
 if(!models.length)return 0;
 state.deletedModelBatches ||= [];
 state.deletedModelBatches.push({models,selectedModel:state.selectedModel,homeEntryId:state.homeEntryId});
 state.models=state.models.filter(m=>!chosen.has(m.id));
 if(chosen.has(state.selectedModel))state.selectedModel=state.models[0]?.id||null;
 if(models.some(({model})=>'model:'+model.id===state.homeEntryId))state.homeEntryId=state.looks[0]?.id||(state.models[0]?'model:'+state.models[0].id:null);
 return models.length;
}
export function restoreRemovedModels(state){
 const batch=state.deletedModelBatches?.pop();if(!batch)return 0;
 for(const {model,index} of batch.models)if(!state.models.some(m=>m.id===model.id))state.models.splice(Math.min(index,state.models.length),0,model);
 if(state.models.some(m=>m.id===batch.selectedModel))state.selectedModel=batch.selectedModel;
 if(homeEntries(state).some(e=>e.id===batch.homeEntryId))state.homeEntryId=batch.homeEntryId;
 return batch.models.length;
}

// Build the update before the IndexedDB transaction so a failed save can roll back.
export function planRotationSave(state,{targetId,name,key,sequence,date}){
 const entry=targetId?homeEntries(state).find(e=>e.id===targetId):null;
 if(targetId&&!entry)throw Error('对应模特或穿搭已不存在，请重新选择');
 const collection=entry?.modelId?'models':'looks';
 const target=entry?.modelId?state.models.find(m=>m.id===entry.modelId):entry;
 const saved=target?{...target,name,sequence:key,...(target.sequence&&target.sequence!==key?{rotationHistory:[...(target.rotationHistory||[]),{sequence:target.sequence,photo:target.photo,replacedAt:new Date().toISOString()}]}:{}),...(sequence.preparedPhoto?{originalPhoto:target.originalPhoto||target.photo,photo:sequence.preparedPhoto,background:'white-v1',cutout:false}:{})}:{id:crypto.randomUUID(),name,date,photo:sequence.cover,sequence:key,items:[],favorite:false};
 return {collection,entries:target?state[collection].map(x=>x.id===target.id?saved:x):[...state.looks,saved],entryId:entry?.modelId?'model:'+saved.id:saved.id,previousSequence:target?.sequence};
}

// Reuse only an explicit association or an identical source image, never a name/person match.
export function reconcileModelRotations(state){
 let changed=0;
 for(const model of state.models||[]){
  if(model.sequence)continue;
  const sources=[model.photo,model.originalPhoto].filter(Boolean);
  const matches=(state.looks||[]).filter(look=>look.sequence&&(model.rotationLookId?look.id===model.rotationLookId:[look.photo,look.originalPhoto].some(photo=>photo&&sources.includes(photo))));
  if(matches.length!==1)continue;
  model.sequence=matches[0].sequence;model.rotationLookId=matches[0].id;changed++;
 }
 return changed;
}
export function rotationSequenceInUse(state,key){
 return homeEntries(state).some(entry=>entry.sequence===key)||(state.deletedModelBatches||[]).some(batch=>batch.models.some(({model})=>model.sequence===key));
}
