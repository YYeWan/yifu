import sharp from 'sharp';
import {PublicError} from './local-store.mjs';
import {buildTryonInstructions} from './tryon-prompt.mjs';
import {rotationPrompt} from './rotation-prompt.js';
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
function baseURL(value){const u=new URL(value);const loopback=['localhost','127.0.0.1','[::1]'].includes(u.hostname);if((u.protocol!=='https:'&&!(u.protocol==='http:'&&loopback))||u.username||u.password)throw new PublicError('生成接口尚未配置',503,'GENERATION_NOT_READY');return u.href.replace(/\/$/,'');}
export function createProviders(env,request=fetch){
 const imageBase=()=>baseURL(env.CODEX_IMAGE_BASE_URL),videoBase=()=>baseURL(env.GROK_VIDEO_BASE_URL);
 async function json(base,key,route,payload,timeout){
  const r=await request(base+route,{method:payload?'POST':'GET',headers:{Authorization:'Bearer '+key,...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,redirect:'error',signal:AbortSignal.timeout(timeout)});
  if(!r.ok)throw new PublicError('生成服务暂未完成请求，未自动重发（HTTP '+r.status+'）',502,'UPSTREAM_ERROR');return r.json();
 }
 return {
  async image(input,images){
   const head='生成一张完整竖版全身图片，3:4 构图，四周留白，不裁切。背景与脚下为纯白 RGB(255,255,255)，无阴影、渐变、地平线、文字、水印。';
   const prompt=head+(input.kind==='tryon'?buildTryonInstructions(input.items):input.kind==='extract'?`将图1中的「${input.itemName}」独立提取为单件白底商品图。移除人物与其他单品，保留原款式、颜色、材质和印花，合理补全遮挡。`:'只整理背景和光照，保留人物身份、脸、发型、姿势、衣服、鞋子和配饰，全身完整入镜。');
   const form=new FormData();form.set('model',env.CODEX_IMAGE_MODEL||'gpt-image-2');form.set('prompt',prompt);form.set('response_format','b64_json');form.set('n','1');
   images.forEach((b,i)=>form.append('image',new Blob([b],{type:'image/jpeg'}),`reference-${i+1}.jpg`));
   const r=await request(imageBase()+'/images/edits',{method:'POST',headers:{Authorization:'Bearer '+env.CODEX_IMAGE_API_KEY},body:form,redirect:'error',signal:AbortSignal.timeout(240000)});
   if(!r.ok)throw new PublicError('图片生成未完成，未自动重发（HTTP '+r.status+'）',502,'UPSTREAM_ERROR');
   const data=await r.json(),encoded=data.data?.[0]?.b64_json;if(typeof encoded!=='string'||encoded.length>24000000)throw new PublicError('图片结果不可读取',502,'UPSTREAM_ERROR');
   const raw=Buffer.from(encoded.replace(/^data:image\/\w+;base64,/,''),'base64');
   const normalized=await sharp(raw,{limitInputPixels:64000000}).rotate().resize(1086,1448,{fit:'contain',background:'#fff'}).flatten({background:'#fff'}).png().toBuffer();
   let result;for(const quality of [90,80,70,60]){result=await sharp(normalized).webp({quality}).toBuffer();if(result.length<=300000)break;}
   if(result.length>300000)throw new PublicError('图片结果超过临时存储上限',502,'UPSTREAM_ERROR');
   return 'data:image/webp;base64,'+result.toString('base64');
  },
  async video(image){return json(videoBase(),env.GROK_VIDEO_API_KEY,'/videos/generations',{model:env.GROK_VIDEO_MODEL||'grok-imagine-video-1.5',duration:10,resolution:'720p',aspect_ratio:'3:4',image:{url:image},last_frame:{url:image},prompt:rotationPrompt},90000);},
  async status(id){return json(videoBase(),env.GROK_VIDEO_API_KEY,'/videos/'+encodeURIComponent(id),null,20000);},
  async media(url,range){
   const u=new URL(url),base=new URL(videoBase());
   if(u.origin!==base.origin||!/^\/v1\/media\/videos\/[A-Za-z0-9_.-]+$/.test(u.pathname))throw new PublicError('视频结果地址不可读取',502,'UPSTREAM_ERROR');
   return request(u,{headers:{Authorization:'Bearer '+env.GROK_VIDEO_API_KEY,...(range?{Range:range}:{})},redirect:'error',signal:AbortSignal.timeout(90000)});
  }
 };
}
