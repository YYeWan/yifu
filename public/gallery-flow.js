export function galleryType(state){
 if(['rotation','flat'].includes(state.homeViewType))return state.homeViewType;
 const current=(state.looks||[]).find(x=>x.id===state.homeEntryId);
 return current&&!current.sequence?'flat':'rotation';
}
export function galleryEntries(state,type=galleryType(state)){
 return (state.looks||[]).filter(look=>Boolean(look.sequence)===(type==='rotation'));
}
export function gallerySelection(state,type){
 const entries=galleryEntries(state,type),preferred=state.gallerySelections?.[type];
 return entries.find(x=>x.id===preferred)||entries.find(x=>x.id===state.homeEntryId)||entries[0];
}
