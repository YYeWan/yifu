// Optional seed data must be owned by the person deploying this application.
export function mergeExamples(saved,seed){
 if(saved?.publicExamplesVersion===seed.version)return {state:saved,changed:false};
 const state=structuredClone(saved||{items:[],models:[],looks:[],selected:[]});
 for(const kind of ['items','models','looks']){const current=state[kind]||[],ids=new Set(current.map(x=>x.id));state[kind]=[...(seed.state[kind]||[]).filter(x=>!ids.has(x.id)).map(x=>structuredClone(x)),...current];}
 state.selected=(state.selected||[]).filter(id=>state.items.some(x=>x.id===id));
 state.selectedModel=state.selectedModel&&state.models.some(x=>x.id===state.selectedModel)?state.selectedModel:seed.state.selectedModel||null;
 state.homeEntryId=state.homeEntryId||seed.state.homeEntryId||null;
 state.publicExamplesVersion=seed.version;return {state,changed:true};
}
