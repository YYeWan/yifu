// One active outfit owns decoded sheets; persistent storage contains compressed files only.
export function selectCachedFrame(spec,index,available){
 const unit=Math.max(0,Math.min(1,index/Math.max(1,spec.sourceCount-1)));
 const sample=Math.round(unit*(spec.count-1));
 const fine=spec.sheets.find(s=>sample>=s.start&&sample<s.start+s.count);
 const sheet=available.has(fine)?fine:spec.coarse;
 const local=sheet===spec.coarse?Math.round(unit*(sheet.count-1)):sample-sheet.start;
 return {sheet,x:(local%sheet.cols)*sheet.width,y:Math.floor(local/sheet.cols)*sheet.height,width:sheet.width,height:sheet.height};
}
export function createFrameCache({stage,onFrame,onProgress=()=>{},read=fetch,decode=createImageBitmap}){
 const canvas=document.createElement('canvas');canvas.className='rotation-cache-canvas';canvas.hidden=true;canvas.setAttribute('aria-hidden','true');stage.append(canvas);
 const ctx=canvas.getContext('2d',{alpha:false});
 let spec=null,bitmaps=new Map(),details=new Map(),detailQueue=[],detailBusy=false,failedDetails=new Set(),controller=null,generation=0,raf=0,target=0,visible=false;
 const DETAIL_BUDGET=32*1024*1024,DETAIL_LIMIT=12;
 const detailIndex=()=>Math.round(target/Math.max(1,spec.sourceCount-1)*((spec.detail?.count||spec.count)-1));
 function metrics(){stage.dataset.rotationCacheBytes=String([...bitmaps.values(),...details.values()].reduce((n,b)=>n+b.width*b.height*4,0));stage.dataset.rotationDetailFrames=String(details.size);}
 function trimDetails(){const current=detailIndex();while(details.size>DETAIL_LIMIT||[...details.values()].reduce((n,b)=>n+b.width*b.height*4,0)>DETAIL_BUDGET){const key=[...details.keys()].find(i=>i!==current);if(key===undefined)break;details.get(key).close();details.delete(key);}metrics();}
 async function resource(sheet,signal){
  if(sheet.blob)return sheet.blob;
  let store;try{if(typeof caches!=='undefined')store=await caches.open('wardrobe-rotation-atlases-v1');}catch{}
  let response;try{response=await store?.match(sheet.url);}catch{}
  if(response){stage.dataset.rotationCacheHit='true';return response.blob();}
  const request=new AbortController(),cancel=()=>request.abort(signal.reason);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
  const timer=setTimeout(()=>request.abort(Error('旋转角度读取超时')),12000);
  try{response=await read(sheet.url,{signal:request.signal});if(!response.ok)throw Error('旋转角度暂未读取完成');
   // Disk caching must not delay the first usable angle.
   if(store)void store.put(sheet.url,response.clone()).catch(()=>{});
   return await response.blob();
  }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
 }
 function draw(){
  raf=0;if(!spec||!bitmaps.has(spec.coarse))return;
  const hd=spec.detail?details.get(detailIndex()):null;
  if(hd){ctx.drawImage(hd,0,0,hd.width,hd.height,0,0,canvas.width,canvas.height);}
  else{const rect=selectCachedFrame(spec,target,bitmaps),bitmap=bitmaps.get(rect.sheet);ctx.drawImage(bitmap,rect.x,rect.y,rect.width,rect.height,0,0,canvas.width,canvas.height);}
  canvas.dataset.quality=hd?'hd':'preview';stage.dataset.rotationFrameQuality=canvas.dataset.quality;stage.dataset.rotationFrameResolution=hd?`${hd.width}×${hd.height}`:`${spec.width}×${spec.height}`;
  canvas.hidden=!visible;canvas.dataset.frame=String(target);if(visible){stage.dataset.rotationMode='frames';onFrame(target);}
  if(visible)requestDetails();
 }
 function schedule(){if(!raf)raf=requestAnimationFrame(draw);}
 function requestDetails(){
  if(!spec?.detail||!controller)return;
  const index=detailIndex(),count=spec.detail.count;
  if(details.has(index)){const bitmap=details.get(index);details.delete(index);details.set(index,bitmap);}
  detailQueue=[0,1,-1,2,-2].map(n=>(index+n+count)%count).filter(i=>!details.has(i)&&!failedDetails.has(i));
  if(detailBusy||!detailQueue.length)return;
  detailBusy=true;const own=generation,detail=spec.detail,signal=controller.signal;
  void(async()=>{try{while(own===generation&&detailQueue.length){const i=detailQueue.shift();if(details.has(i)||failedDetails.has(i))continue;
    try{const sheet=detail.frames?{blob:detail.frames[i]}:{url:detail.pattern.replace('{index}',String(i).padStart(4,'0'))};const blob=await resource(sheet,signal);if(own!==generation)return;const bitmap=await decode(blob,{resizeWidth:detail.width,resizeHeight:detail.height});if(own!==generation){bitmap.close();return;}details.set(i,bitmap);trimDetails();if(i===detailIndex())schedule();}
    catch(e){if(own!==generation)return;failedDetails.add(i);}
   }}finally{if(own===generation)detailBusy=false;}})();
 }
 function clear(){
  generation++;controller?.abort();controller=null;cancelAnimationFrame(raf);raf=0;
  for(const bitmap of [...bitmaps.values(),...details.values()])bitmap.close();bitmaps.clear();details.clear();detailQueue=[];detailBusy=false;failedDetails.clear();spec=null;visible=false;canvas.hidden=true;
  // Reset the backing store too, releasing its pixel buffer on mobile.
  canvas.width=1;canvas.height=1;stage.dataset.rotationCacheFrames='0';stage.dataset.rotationCacheBytes='0';stage.dataset.rotationDetailFrames='0';stage.dataset.rotationMode='none';stage.dataset.rotationCacheHit='false';delete stage.dataset.rotationCacheError;
 }
 async function load(next){
  clear();spec=next;target=0;controller=new AbortController();const signal=controller.signal,own=generation;
  canvas.width=spec.detail?.width||spec.width;canvas.height=spec.detail?.height||spec.height;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const add=async sheet=>{
   const blob=await resource(sheet,signal);if(own!==generation)throw new DOMException('穿搭已切换','AbortError');
   const bitmap=await decode(blob);if(own!==generation){bitmap.close();throw new DOMException('穿搭已切换','AbortError');}
   bitmaps.set(sheet,bitmap);
   const loaded=[...bitmaps.keys()].filter(s=>s!==next.coarse).reduce((n,s)=>n+s.count,0);
   stage.dataset.rotationCacheFrames=String(loaded);metrics();
   onProgress(loaded,next.count);schedule();
  };
  try{await add(next.coarse);}catch(e){if(own===generation)clear();throw e;}
  visible=true;draw();
  // Background work never blocks the poster or initial coarse interaction.
  let cursor=0;
  const worker=async()=>{while(own===generation&&cursor<next.sheets.length){const sheet=next.sheets[cursor++];try{await add(sheet);}catch(e){if(own!==generation)return;stage.dataset.rotationCacheError='部分精细角度未准备好';}}};
  void Promise.all([worker(),worker()]);
 }
 return {load,clear,show(index){if(!spec)return false;target=Math.max(0,Math.min(spec.sourceCount-1,Math.round(index)));visible=true;schedule();return true;},hide(){visible=false;canvas.hidden=true;},get ready(){return Boolean(spec&&bitmaps.has(spec.coarse));},get canvas(){return canvas;}};
}
