// Process private/imported video once; only compressed sheets + original Blob go into IndexedDB.
export async function prepareLocalVideo(file,{fps=24,start=0,end=0,onProgress=()=>{},isCancelled=()=>false}={}){
 const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';const url=URL.createObjectURL(file);
 function event(name){return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>finish(Error('读取视频超时，请重试')),20000);function finish(error){clearTimeout(timeout);video.removeEventListener(name,ok);video.removeEventListener('error',bad);error?reject(error):resolve();}const ok=()=>finish(),bad=()=>finish(Error('视频无法读取'));video.addEventListener(name,ok,{once:true});video.addEventListener('error',bad,{once:true});});}
 const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{alpha:false});g.fillStyle='#fff';g.fillRect(0,0,w,h);return [c,g];};
 const blob=c=>new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('角度保存失败')),'image/webp',.78));
 try{
  const loaded=event('loadeddata');video.src=url;video.load();await loaded;end=end||video.duration;
  if(!Number.isFinite(end)||!Number.isFinite(start)||end<=start||end>video.duration+.01||end-start>30)throw Error('请使用 30 秒以内的有效视频');
  const width=video.videoWidth,height=video.videoHeight;if(!width||!height)throw Error('视频没有有效画面');
  const scale=Math.min(1,256/width,384/height);
  const sourceCount=Math.max(2,Math.round((end-start)*fps)),count=Math.min(144,sourceCount),tileWidth=Math.max(1,Math.round(width*scale)),tileHeight=Math.max(1,Math.round(height*scale)),coarseCount=Math.min(24,count),cols=6;
  const [coarse,coarseCtx]=make(cols*tileWidth,Math.ceil(coarseCount/cols)*tileHeight),coarseSamples=new Map(Array.from({length:coarseCount},(_,i)=>[Math.round(i*(count-1)/(coarseCount-1)),i]));
  const detailScale=Math.min(1,960/width,1280/height),detailWidth=Math.round(width*detailScale),detailHeight=Math.round(height*detailScale),details=[];
  const [detailCanvas,detailCtx]=make(detailWidth,detailHeight);
  const sheets=[];let sheet,sheetCtx,cover;
  for(let i=0;i<count;i++){
   if(isCancelled())throw Error('已取消视频处理，穿搭保持原样');
   const time=Math.max(.00001,Math.min(start+i/(count-1)*(end-start-1/fps),end-.0001));
   if(Math.abs(video.currentTime-time)>.000001){const sought=event('seeked');video.currentTime=time;await sought;}
   if(isCancelled())throw Error('已取消视频处理，穿搭保持原样');
   if(i===0){const [c,g]=make(width,height);g.drawImage(video,0,0,width,height);cover=c.toDataURL('image/webp',.88);c.width=c.height=1;}
   detailCtx.drawImage(video,0,0,detailWidth,detailHeight);details.push(await new Promise((resolve,reject)=>detailCanvas.toBlob(b=>b?resolve(b):reject(Error('高清角度保存失败')),'image/webp',.92)));
   if(i%24===0)[sheet,sheetCtx]=make(cols*tileWidth,4*tileHeight);
   const local=i%24;sheetCtx.drawImage(video,local%cols*tileWidth,Math.floor(local/cols)*tileHeight,tileWidth,tileHeight);
   if(coarseSamples.has(i)){const j=coarseSamples.get(i);coarseCtx.drawImage(video,j%cols*tileWidth,Math.floor(j/cols)*tileHeight,tileWidth,tileHeight);}
   if(local===23||i===count-1){sheets.push({blob:await blob(sheet),start:i-local,count:local+1,cols,width:tileWidth,height:tileHeight});sheet.width=sheet.height=1;}
   onProgress(i+1,count);await new Promise(resolve=>setTimeout(resolve,0));
  }
  const coarseBlob=await blob(coarse);coarse.width=coarse.height=1;detailCanvas.width=detailCanvas.height=1;
  return {manifest:{count:sourceCount,fps,width,height,duration:end-start,trimStart:start,trimEnd:end,source:file.name},videoBlob:file,cover,frameAtlas:{version:'frame-atlas-v2',id:crypto.randomUUID(),sourceCount,count,width:tileWidth,height:tileHeight,detail:{frames:details,count,width:detailWidth,height:detailHeight},coarse:{blob:coarseBlob,count:coarseCount,start:0,cols,width:tileWidth,height:tileHeight},sheets}};
 }finally{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
}
