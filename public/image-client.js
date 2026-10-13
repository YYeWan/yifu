// All provider calls and credentials stay on the local server.
export async function api(path,options={}){
 let response;
 try{response=await fetch(path,{cache:'no-store',...options,signal:options.signal||AbortSignal.timeout(45000),headers:{'Content-Type':'application/json',...options.headers}});}
 catch(cause){const error=Error('暂时无法连接服务，任务已保留，请恢复连接后继续');error.retryable=true;error.cause=cause;throw error;}
 let data;try{data=await response.json();}catch{const error=Error('服务响应暂时无法读取，任务已保留');error.status=response.ok?502:response.status;throw error;}
 if(options.method==='POST')window.dispatchEvent(new Event('wardrobe-generation'));if(!response.ok){const error=Error(data.error||'请求失败');error.status=response.status;error.code=data.code;if(data.code==='IMAGE_BUSY'||data.code==='VIDEO_BUSY')error.retryable=true;throw error;}return data;
}
export const getImageConfig=()=>api('/api/image-config');
export const listImageJobs=()=>api('/api/image-jobs');
export const getImageJob=id=>api('/api/image-jobs/'+encodeURIComponent(id));
export async function submitImageJob(input){return api('/api/image-jobs',{method:'POST',body:JSON.stringify(input)});}
export async function imageForAPI(src,{rect,shape}={}){
 const image=new Image();image.src=src;await image.decode();
 const referenceScale=rect?image.naturalWidth/1254:1;
 const box=rect?rect.map(v=>v*referenceScale):[0,0,image.naturalWidth,image.naturalHeight];
 const scale=Math.min(1,1448/Math.max(box[2],box[3]));const canvas=document.createElement('canvas');canvas.width=Math.round(box[2]*scale);canvas.height=Math.round(box[3]*scale);
 const g=canvas.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,canvas.width,canvas.height);
 if(shape){g.save();g.scale(scale*referenceScale,scale*referenceScale);g.translate(-rect[0],-rect[1]);g.clip(new Path2D(shape));g.drawImage(image,0,0,1254,1254);g.restore();}
 else g.drawImage(image,...box,0,0,canvas.width,canvas.height);
 for(const quality of [.88,.8,.7,.6]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<1_990_000)return data;}
 throw Error('图片细节过多，请选择一张较小的图片');
}
export const garmentShape=id=>id==='apple-shirt'?'M5 130H510V410L439 432 425 640H5Z':id==='overalls'?'M535 50H610L630 180H737L765 50H840L817 300 892 650 852 705 432 670 485 310 550 290Z':id==='apple-socks'?'M369 743H566L565 973 561 1080 523 1167H337V1100L376 1010 383 981 369 800Z':null;
