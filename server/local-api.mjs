import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createLocalStore,PublicError,localSnapshot} from './local-store.mjs';
import {createProviders,decodeRotationImage,validateImageInput} from './public-providers.mjs';
import {rotationPromptVersion} from './rotation-prompt.js';
import {providerSettings} from './provider-settings.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function body(req){
 if(req.body!==undefined){const s=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(s)>4000000)throw new PublicError('素材总量太大，请减少单品数量',413);try{return JSON.parse(s);}catch{throw new PublicError('请求格式不正确');}}
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4000000)throw new PublicError('素材总量太大，请减少单品数量',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks));}catch{throw new PublicError('请求格式不正确');}
}
export function createLocalHandler({env=process.env,store=createLocalStore(),providers=createProviders(env),background=p=>p.catch(()=>{}),owner=()=>'local'}={}){
 const settings=providerSettings(env);
 const configured=kind=>Boolean(settings[kind].base&&settings[kind].key&&settings[kind].model);
 async function present(who,kind,j){
  if(!j)throw new PublicError('任务不存在',404,'NOT_FOUND');
  if(['queued','running','submitting'].includes(j.status)&&Date.now()-j.createdAt>330000)j={...j,status:'failed',error:'生成结果未确认，已停止自动重发；请联系站点作者。'};
  const {upstreamId,mediaURL,chunks,videoProviderIdentity,...view}=j;
  if(kind==='image'&&j.status==='completed'){
   view.imageUrl=await store.readImage(who,j.id,chunks);
   if(!view.imageUrl){view.status='failed';view.error='临时结果已过期，请使用已保存到浏览器的图片；不会自动重新生成。';}
  }
  if(kind==='video'&&j.status==='done')view.mediaUrl='/api/rotation-media/'+j.id;
  return view;
 }
 async function generate(who,kind,job,input,images){
  try{
   job.status=kind==='image'?'running':'submitting';await store.save(who,kind,job);
   if(kind==='image'){
    const data=await providers.image(input,images);job.chunks=await store.saveImage(who,job.id,data);job.status='completed';job.background='white-v1';job.width=1086;job.height=1448;
   }else{
    const result=await providers.video('data:image/jpeg;base64,'+images.toString('base64'));
    if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(result.request_id||''))throw Error('No request ID');job.upstreamId=result.request_id;job.videoProviderIdentity=providers.videoIdentity;job.status='pending';
   }
  }catch(e){job.status=kind==='video'?'submission_uncertain':'failed';job.error=e instanceof PublicError?e.message:'生成状态未确认，未自动重发，请联系站点作者。';}
  try{await store.save(who,kind,job);}finally{if(kind==='image'||job.status!=='pending')await store.release(who,kind,job.id);}
 }
 return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(s,data)=>{res.statusCode=s;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));};
  const pathname=new URL(req.url,'http://localhost').pathname;
  try{
   if(pathname==='/api/experience'&&req.method==='GET')return send(200,localSnapshot());
   const who=owner(req,env);
   if(pathname==='/api/image-config'&&req.method==='GET')return send(200,{configured:configured('image'),model:settings.image.model,imageProvider:settings.image.type,maxImageInputs:settings.image.maxInputs,videoConfigured:configured('video'),videoProvider:settings.video.type,visionConfigured:false});
   if(pathname==='/api/image-jobs'&&req.method==='GET')return send(200,{jobs:[]});
   const route=/^\/api\/(image-jobs|rotation-jobs|rotation-media)(?:\/([a-f0-9-]+))?$/.exec(pathname);
   if(!route)throw new PublicError('接口不存在',404,'NOT_FOUND');
   const kind=route[1]==='image-jobs'?'image':'video',id=route[2];
   if(!configured(kind))throw new PublicError(kind==='image'?'请在 .env 中配置生图 API URL 和 API Key':'请在 .env 中配置生视频 API URL 和 API Key',503,'GENERATION_NOT_READY');
   if(id&&!UUID.test(id))throw new PublicError('任务编号无效');
   if(req.method==='POST'&&!id&&route[1]!=='rotation-media'){
    if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin);}catch{throw new PublicError('请求来源无效',403,'INVALID_ORIGIN');}if(origin.host!==req.headers.host||!['http:','https:'].includes(origin.protocol))throw new PublicError('请求来源无效',403,'INVALID_ORIGIN');}
    if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new PublicError('请使用 JSON 提交素材',415,'INVALID_CONTENT_TYPE');
    const input=await body(req);if(!input||typeof input!=='object'||!UUID.test(input.requestId||''))throw new PublicError('请提供有效的任务编号');
    const images=kind==='image'?await validateImageInput(input):await decodeRotationImage(input.image);
    if(kind==='image'&&images.length>settings.image.maxInputs)throw new PublicError(`当前图片预设最多接受 ${settings.image.maxInputs} 张参考图，请减少单品`,400,'IMAGE_REFERENCE_LIMIT');
    const safe=kind==='image'?{kind:input.kind,images:input.images,items:input.items,itemIds:input.itemIds,itemName:input.itemName}:{image:input.image};
    if(input.itemIds!==undefined&&(!Array.isArray(input.itemIds)||input.itemIds.length>16||input.itemIds.some(v=>typeof v!=='string'||v.length>100)))throw new PublicError('单品编号无效');
    const fingerprint=createHash('sha256').update(JSON.stringify(safe)).digest('hex');
    const job={id:input.requestId,kind:kind==='image'?input.kind:'rotation',...(kind==='video'?{promptVersion:rotationPromptVersion}:{}),status:'queued',createdAt:Date.now(),...(kind==='image'?{itemIds:input.itemIds||[]}:{})};
    const reserved=await store.reserve(who,kind,job.id,fingerprint,job);
    if(reserved.created)background(generate(who,kind,job,input,images).catch(()=>{console.error('Generation persistence unavailable');}));
    return send(202,await present(who,kind,reserved.job));
   }
   if(req.method==='GET'&&id){
    let job=await store.get(who,kind,id);if(!job)throw new PublicError('任务不存在',404,'NOT_FOUND');
    if(route[1]==='rotation-media'){
     if(job.status!=='done'||!job.mediaURL)throw new PublicError('视频尚未完成',409,'VIDEO_PENDING');
     const r=await providers.media(job.mediaURL,req.headers.range,job.videoProviderIdentity);
     if(!r.ok)throw new PublicError('视频暂不可读取',502,'UPSTREAM_ERROR');
     res.statusCode=r.status;res.setHeader('Content-Type','video/mp4');for(const h of ['content-length','content-range','accept-ranges'])if(r.headers.has(h))res.setHeader(h,r.headers.get(h));
     await pipeline(Readable.fromWeb(r.body),res);return;
    }
    if(kind==='video'&&job.status==='pending'&&job.upstreamId){
     const r=await providers.status(job.upstreamId,job.videoProviderIdentity);
     if(r.status==='done'&&r.video?.url){job={...job,status:'done',mediaURL:r.video.url};await store.save(who,kind,job);await store.release(who,kind,job.id);}
     else if(r.status==='failed'){job={...job,status:'failed',error:'视频生成失败，未自动重发。'};await store.save(who,kind,job);await store.release(who,kind,job.id);}
    }
    return send(200,await present(who,kind,job));
   }
   throw new PublicError('不支持此操作',405,'METHOD_NOT_ALLOWED');
  }catch(e){if(res.headersSent){res.destroy();return;}return send(e instanceof PublicError?e.status:503,{error:e instanceof PublicError?e.message:'服务暂不可用，请稍后再试；不会自动重复生成。',code:e instanceof PublicError?e.code:'SERVICE_UNAVAILABLE'});}
 };
}
