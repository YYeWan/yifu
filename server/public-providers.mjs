import sharp from 'sharp';
import {PublicError} from './local-store.mjs';
import {buildTryonInstructions} from './tryon-prompt.mjs';
import {rotationPrompt} from './rotation-prompt.js';
import {providerSettings,videoIdentity,baseURL} from './provider-settings.mjs';
const badImage=()=>new PublicError('请上传有效的 JPG、PNG 或 WebP 图片');
export async function decodeImage(value){
 if(typeof value!=='string'||value.length>2000000)throw badImage();
 const m=/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);if(!m)throw badImage();
 try{return await sharp(Buffer.from(m[1],'base64'),{limitInputPixels:24000000}).rotate().resize(1086,1448,{fit:'contain',background:'#fff'}).flatten({background:'#fff'}).jpeg({quality:85}).toBuffer();}catch{throw badImage();}
}
// Leave guard space around the whole reference before video generation.
export async function decodeRotationImage(value){
 const normalized=await decodeImage(value);
 return sharp(normalized).resize(864,1152,{fit:'contain',background:'#fff'}).extend({top:148,bottom:148,left:111,right:111,background:'#fff'}).jpeg({quality:90}).toBuffer();
}
export async function validateImageInput(input){
 if(!['tryon','extract','prepare-white'].includes(input.kind))throw new PublicError('请选择换装、单品提取或白底整理');
 if(!Array.isArray(input.images)||input.images.length<1||input.images.length>17)throw badImage();
 if(input.kind==='tryon'&&(!Array.isArray(input.items)||input.items.length<1||input.items.length>16||input.items.some(v=>typeof v!=='string'||!v.trim()||v.length>60)||input.images.length!==input.items.length+1))throw new PublicError('请提供模特和每一件单品的图片及名称');
 if(input.kind!=='tryon'&&input.images.length!==1)throw badImage();
 if(input.kind==='extract'&&(typeof input.itemName!=='string'||!input.itemName.trim()||input.itemName.length>60))throw new PublicError('请填写单品名称');
 return Promise.all(input.images.map(decodeImage));
}
const validTaskId=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(id);
const resultError=()=>new PublicError('生成服务返回了无法读取的结果',502,'UPSTREAM_ERROR');
export function createProviders(env,request=fetch){
 const settings=providerSettings(env),{image:img,video:vid}=settings;
 const imageBase=()=>baseURL(img.base),videoBase=()=>baseURL(vid.base);
 function hostAllowed(host,patterns){return patterns.some(p=>p.startsWith('*.')?host.endsWith(p.slice(1))&&host!==p.slice(2):host===p);}
 async function mediaRequest(value,kind,range){
  let url;try{url=new URL(value);}catch{throw resultError();}
  const base=new URL(kind==='image'?imageBase():videoBase());
  if(url.username||url.password||url.hash||url.href.length>8000)throw resultError();
  const same=url.origin===base.origin,headers=range?{Range:range}:{};
  if(same){
   if(kind==='video'&&vid.type==='grok'&&!/^\/v1\/media\/videos\/[A-Za-z0-9_.-]+$/.test(url.pathname))throw resultError();
   headers.Authorization='Bearer '+(kind==='image'?img.key:vid.key);
  }else{
   const builtIn=kind==='video'&&vid.type==='grok'?['vidgen.x.ai']:kind==='image'&&img.type==='openai'?['*.blob.core.windows.net']:['*.tos-cn-beijing.volces.com','*.tos-cn-shanghai.volces.com','*.tos-cn-guangzhou.volces.com'];
   if(url.protocol!=='https:'||!hostAllowed(url.hostname,[...builtIn,...settings.mediaHosts]))throw new PublicError('结果 CDN 域名未获允许，请在 MEDIA_ALLOWED_HOSTS 中配置可信域名',502,'MEDIA_HOST_NOT_ALLOWED');
   // Signed CDN URLs must never receive the provider API credential.
  }
  return request(url.href,{headers,redirect:'error',signal:AbortSignal.timeout(90000)});
 }
 async function json(base,key,route,payload,timeout){
  const r=await request(base+route,{method:payload?'POST':'GET',headers:{Authorization:'Bearer '+key,...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,redirect:'error',signal:AbortSignal.timeout(timeout)});
  if(!r.ok)throw new PublicError('生成服务暂未完成请求，未自动重发（HTTP '+r.status+'）',502,'UPSTREAM_ERROR');return r.json();
 }
 async function imageBytes(data){
  const first=data?.data?.[0];let raw;
  if(typeof first?.b64_json==='string'){
   if(first.b64_json.length>24000000)throw resultError();raw=Buffer.from(first.b64_json.replace(/^data:image\/\w+;base64,/,''),'base64');
  }else if(typeof first?.url==='string'){
   const r=await mediaRequest(first.url,'image');if(!r.ok)throw resultError();
   const limit=18000000;if(Number(r.headers.get('content-length'))>limit)throw resultError();
   const parts=[];let bytes=0;try{for await(const chunk of r.body){bytes+=chunk.length;if(bytes>limit)throw resultError();parts.push(Buffer.from(chunk));}}catch(error){await r.body?.cancel?.().catch(()=>{});throw error;}raw=Buffer.concat(parts);
  }else throw resultError();
  try{
   const normalized=await sharp(raw,{limitInputPixels:64000000}).rotate().resize(1086,1448,{fit:'contain',background:'#fff'}).flatten({background:'#fff'}).png().toBuffer();
   let result;for(const quality of [90,80,70,60]){result=await sharp(normalized).webp({quality}).toBuffer();if(result.length<=300000)break;}
   if(result.length>300000)throw resultError();return 'data:image/webp;base64,'+result.toString('base64');
  }catch{throw resultError();}
 }
 const identity=videoIdentity(vid);
 return {
  videoIdentity:identity,
  async image(input,images){
   if(images.length>img.maxInputs)throw new PublicError(`当前图片预设最多接受 ${img.maxInputs} 张参考图（包含人物参考），请减少单品或调整 IMAGE_MAX_INPUTS`,400,'IMAGE_REFERENCE_LIMIT');
   const head='生成一张完整竖版全身图片，3:4 构图，四周留白，不裁切。背景与脚下为纯白 RGB(255,255,255)，无阴影、渐变、地平线、文字、水印。';
   const prompt=head+(input.kind==='tryon'?buildTryonInstructions(input.items):input.kind==='extract'?`将图1中的「${input.itemName}」独立提取为单件白底商品图。移除人物与其他单品，保留原款式、颜色、材质和印花，合理补全遮挡。`:'只整理背景和光照，保留人物身份、脸、发型、姿势、衣服、鞋子和配饰，全身完整入镜。');
   if(img.type==='seedream'){
    const refs=images.map(b=>'data:image/jpeg;base64,'+b.toString('base64'));
    return imageBytes(await json(imageBase(),img.key,'/images/generations',{model:img.model,prompt,image:refs.length===1?refs[0]:refs,size:img.size||'2K',response_format:'b64_json',stream:false,watermark:false},240000));
   }
   const form=new FormData();form.set('model',img.model);form.set('prompt',prompt);form.set('n','1');
   if(img.type==='openai-edits'||!img.model.startsWith('gpt-image'))form.set('response_format','b64_json');
   if(img.size)form.set('size',img.size);
   images.forEach((b,i)=>form.append(img.type==='openai'?'image[]':'image',new Blob([b],{type:'image/jpeg'}),`reference-${i+1}.jpg`));
   const r=await request(imageBase()+'/images/edits',{method:'POST',headers:{Authorization:'Bearer '+img.key},body:form,redirect:'error',signal:AbortSignal.timeout(240000)});
   if(!r.ok)throw new PublicError('图片生成未完成，未自动重发（HTTP '+r.status+'）',502,'UPSTREAM_ERROR');return imageBytes(await r.json());
  },
  async video(image){
   const content=[{type:'text',text:rotationPrompt},{type:'image_url',image_url:{url:image},role:'first_frame'}];
   if(vid.lastFrame)content.push({type:'image_url',image_url:{url:image},role:'last_frame'});
   const payload=vid.type==='seedance'?{model:vid.model,content,duration:10,resolution:'720p',ratio:'3:4',watermark:false}:{model:vid.model,duration:10,resolution:'720p',aspect_ratio:'3:4',image:{url:image},...(vid.lastFrame?{last_frame:{url:image}}:{}),prompt:rotationPrompt};
   const data=await json(videoBase(),vid.key,vid.type==='seedance'?'/contents/generations/tasks':'/videos/generations',payload,90000);
   const id=vid.type==='seedance'?data.id:data.request_id;if(!validTaskId(id))throw resultError();return {request_id:id};
  },
  async status(id,expectedIdentity){
   if(expectedIdentity&&expectedIdentity!==identity)throw new PublicError('此任务所属的视频配置已改变，请恢复原配置查询；不会自动重生成',409,'VIDEO_PROVIDER_CHANGED');
   if(!validTaskId(id))throw resultError();
   const data=await json(videoBase(),vid.key,(vid.type==='seedance'?'/contents/generations/tasks/':'/videos/')+encodeURIComponent(id),null,20000);
   if(vid.type==='seedance'){
    if(data.status==='succeeded'){if(typeof data.content?.video_url!=='string')throw resultError();return {status:'done',video:{url:data.content.video_url}};}
    if(['failed','cancelled','expired'].includes(data.status))return {status:'failed'};
    if(!['queued','running'].includes(data.status))throw resultError();return {status:'pending'};
   }
   if(['failed','expired','cancelled'].includes(data.status))return {status:'failed'};
   if(data.status==='done'){if(typeof data.video?.url!=='string')throw resultError();return {status:'done',video:{url:data.video.url}};}
   if(!['pending','queued','running'].includes(data.status))throw resultError();return {status:'pending'};
  },
  async media(url,range,expectedIdentity){
   if(expectedIdentity&&expectedIdentity!==identity)throw new PublicError('请恢复此任务原有的视频 API 配置后下载',409,'VIDEO_PROVIDER_CHANGED');
   return mediaRequest(url,'video',range);
  }
 };
}
