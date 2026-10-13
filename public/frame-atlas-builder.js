// Upgrade a legacy/server image sequence once without discarding any original HD frames.
export async function compactFrameSequence(frames,manifest){
 const count=Math.min(144,frames.length);if(count<2)throw Error('旋转角度不足');
 const scale=Math.min(1,256/manifest.width,384/manifest.height),width=Math.max(1,Math.round(manifest.width*scale)),height=Math.max(1,Math.round(manifest.height*scale)),cols=6,coarseCount=Math.min(24,count);
 const make=rows=>{const c=document.createElement('canvas');c.width=cols*width;c.height=rows*height;const g=c.getContext('2d',{alpha:false});g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);return [c,g];};
 const encode=c=>new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('旋转角度保存失败')),'image/webp',.78));
 const [coarse,cg]=make(Math.ceil(coarseCount/cols)),samples=new Map(Array.from({length:coarseCount},(_,i)=>[Math.round(i*(count-1)/(coarseCount-1)),i])),sheets=[];let sheet,g;
 try{for(let i=0;i<count;i++){
  if(i%24===0)[sheet,g]=make(4);
  const original=Math.round(i*(frames.length-1)/(count-1)),bitmap=await createImageBitmap(frames[original],{resizeWidth:width,resizeHeight:height});
  try{const local=i%24;g.drawImage(bitmap,local%cols*width,Math.floor(local/cols)*height,width,height);if(samples.has(i)){const j=samples.get(i);cg.drawImage(bitmap,j%cols*width,Math.floor(j/cols)*height,width,height);}}finally{bitmap.close();}
  if(i%24===23||i===count-1){sheets.push({blob:await encode(sheet),start:i-i%24,count:i%24+1,cols,width,height});sheet.width=sheet.height=1;}
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 const detailScale=Math.min(1,960/manifest.width,1280/manifest.height);
 return {version:'frame-atlas-v2',id:crypto.randomUUID(),sourceCount:manifest.count,count,width,height,detail:{frames:Array.from({length:count},(_,i)=>frames[Math.round(i*(frames.length-1)/(count-1))]),count,width:Math.round(manifest.width*detailScale),height:Math.round(manifest.height*detailScale)},coarse:{blob:await encode(coarse),start:0,count:coarseCount,cols,width,height},sheets};
 }finally{coarse.width=coarse.height=1;if(sheet)sheet.width=sheet.height=1;}
}
