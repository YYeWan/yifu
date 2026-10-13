import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createProviders} from '../server/public-providers.mjs';
import {providerSettings} from '../server/provider-settings.mjs';
import {rotationPrompt} from '../public/rotation-prompt.js';
const png=await sharp({create:{width:4,height:4,channels:3,background:'#fff'}}).png().toBuffer();
const imageResult=()=>new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}),{headers:{'Content-Type':'application/json'}});
const imageEnv={IMAGE_BASE_URL:'https://image.invalid/v1',IMAGE_API_KEY:'test',IMAGE_MODEL:'gpt-image-2'};
const videoEnv={VIDEO_BASE_URL:'https://video.invalid/api/v3',VIDEO_API_KEY:'test',VIDEO_MODEL:'seedance-test'};
test('OpenAI preset uses image[] and omits response_format for GPT Image models',async()=>{
 let req;const p=createProviders({...imageEnv,IMAGE_PROVIDER:'openai'},async(url,options)=>{req={url,...options};return imageResult();});
 const result=await p.image({kind:'prepare-white'},[png]);assert.match(result,/^data:image\/webp;base64,/);assert.equal(req.url,'https://image.invalid/v1/images/edits');assert.equal(req.body.getAll('image[]').length,1);assert.equal(req.body.has('response_format'),false);
});
test('legacy image preset stays compatible with multipart image and b64_json',async()=>{
 let form;const p=createProviders({CODEX_IMAGE_BASE_URL:imageEnv.IMAGE_BASE_URL,CODEX_IMAGE_API_KEY:'test'},async(_url,options)=>{form=options.body;return imageResult();});
 await p.image({kind:'prepare-white'},[png]);assert.equal(form.getAll('image').length,1);assert.equal(form.get('response_format'),'b64_json');
});
test('Seedream sends every reference in JSON and rejects over-limit inputs before calling upstream',async()=>{
 let calls=0,req;const p=createProviders({...imageEnv,IMAGE_PROVIDER:'seedream',IMAGE_MODEL:'seedream-test',IMAGE_MAX_INPUTS:'2'},async(url,options)=>{calls++;req={url,...JSON.parse(options.body)};return imageResult();});
 await p.image({kind:'tryon',items:['shirt']},[png,png]);assert.equal(req.url,'https://image.invalid/v1/images/generations');assert.equal(req.image.length,2);assert.match(req.image[0],/^data:image\/jpeg;base64,/);assert.equal(req.size,'2K');assert.equal(req.response_format,'b64_json');assert.equal(req.stream,false);
 await assert.rejects(()=>p.image({kind:'tryon',items:['a','b']},[png,png,png]),e=>e.code==='IMAGE_REFERENCE_LIMIT');assert.equal(calls,1);
});
test('Seedance maps task IDs, first/last frames, pending, success and failures to the app protocol',async()=>{
 let payload,taskStatus='running',lastURL;
 const p=createProviders({...videoEnv,VIDEO_PROVIDER:'seedance'},async(url,options)=>{lastURL=url;if(options.method==='POST'){payload=JSON.parse(options.body);return Response.json({id:'cgt-test-123'});}return Response.json({status:taskStatus,content:{video_url:'https://bucket.tos-cn-beijing.volces.com/video.mp4'}});});
 assert.equal((await p.video('data:image/jpeg;base64,test')).request_id,'cgt-test-123');assert.equal(payload.content[0].text,rotationPrompt);assert.equal(payload.content[1].role,'first_frame');assert.equal(payload.content[2].role,'last_frame');assert.equal(payload.content[1].image_url.url,payload.content[2].image_url.url);assert.equal(payload.ratio,'3:4');assert.equal(payload.duration,10);
 assert.equal((await p.status('cgt-test-123')).status,'pending');assert.equal(lastURL,'https://video.invalid/api/v3/contents/generations/tasks/cgt-test-123');taskStatus='succeeded';assert.equal((await p.status('cgt-test-123')).status,'done');for(const status of ['failed','cancelled','expired']){taskStatus=status;assert.equal((await p.status('cgt-test-123')).status,'failed');}
});
test('Grok accepts official UUID IDs and maps expired tasks to failed',async()=>{
 let query=false;const p=createProviders({...videoEnv,VIDEO_PROVIDER:'grok'},async()=>Response.json(query?{status:'expired'}:{request_id:'d97415a1-5796-b7ec-379f-4e6819e08fdf'}));
 const job=await p.video('image');query=true;assert.equal((await p.status(job.request_id)).status,'failed');
});
test('optional first-frame-only mode omits unsupported last-frame fields',async()=>{
 for(const type of ['grok','seedance']){let payload;const p=createProviders({...videoEnv,VIDEO_PROVIDER:type,VIDEO_LAST_FRAME:'false'},async(_url,options)=>{payload=JSON.parse(options.body);return Response.json(type==='grok'?{request_id:'video_test'}:{id:'cgt-test'});});await p.video('image');assert.ok(!payload.last_frame);assert.ok(!payload.content?.some(x=>x.role==='last_frame'));}
});
test('CDN downloads preserve Range and never forward API keys; unapproved hosts and changed providers fail closed',async()=>{
 let calls=[];const p=createProviders({...videoEnv,VIDEO_PROVIDER:'seedance'},async(url,options)=>{calls.push({url,...options});return new Response('video');});
 await p.media('https://bucket.tos-cn-beijing.volces.com/test.mp4?signature=test','bytes=0-10',p.videoIdentity);assert.equal(calls[0].headers.Range,'bytes=0-10');assert.ok(!calls[0].headers.Authorization);assert.equal(calls[0].redirect,'error');
 await assert.rejects(()=>p.media('https://evil.invalid/video.mp4'),e=>e.code==='MEDIA_HOST_NOT_ALLOWED');await assert.rejects(()=>p.media('http://127.0.0.1/private'),e=>e.code==='MEDIA_HOST_NOT_ALLOWED');await assert.rejects(()=>p.status('cgt-test','old-config'),e=>e.code==='VIDEO_PROVIDER_CHANGED');assert.equal(calls.length,1);
});
test('URL image results use the approved CDN without credentials and become normalized browser images',async()=>{
 const calls=[];const p=createProviders({...imageEnv,IMAGE_PROVIDER:'seedream',MEDIA_ALLOWED_HOSTS:'cdn.invalid'},async(url,options)=>{calls.push({url,...options});return options.method==='POST'?Response.json({data:[{url:'https://cdn.invalid/result.png'}]}):new Response(png);});
 assert.match(await p.image({kind:'prepare-white'},[png]),/^data:image\/webp;base64,/);assert.ok(!calls[1].headers.Authorization);
});
test('new settings override legacy aliases and invalid preset names do not silently fall back',()=>{
 const cfg=providerSettings({...imageEnv,CODEX_IMAGE_API_KEY:'old',GROK_VIDEO_API_KEY:'old'});assert.equal(cfg.image.key,'test');assert.equal(cfg.video.key,'old');assert.throws(()=>providerSettings({IMAGE_PROVIDER:'unknown'}),e=>e.code==='INVALID_PROVIDER');
});
test('Seedance runs through the application job API with a non-Grok task ID and private CDN forwarding',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),path=await import('node:path'),http=await import('node:http');
 const {createLocalStore}=await import('../server/local-store.mjs'),{createLocalHandler}=await import('../server/local-api.mjs');
 const dir=await mkdtemp(path.join(tmpdir(),'yifu-seedance-')),work=[],requests=[];
 const env={...videoEnv,VIDEO_PROVIDER:'seedance'};
 const providers=createProviders(env,async(url,options)=>{requests.push({url,...options});if(url.includes('tos-cn-beijing'))return new Response('video',{headers:{'Content-Type':'video/mp4'}});return Response.json(options.method==='POST'?{id:'cgt-api-test'}:{status:'succeeded',content:{video_url:'https://bucket.tos-cn-beijing.volces.com/result.mp4'}});});
 const server=http.createServer(createLocalHandler({env,providers,store:createLocalStore(dir),background:p=>work.push(p)}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,id=crypto.randomUUID();
 try{
  const r=await fetch(base+'/api/rotation-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:id,image:'data:image/png;base64,'+png.toString('base64')})});assert.equal(r.status,202);await Promise.all(work);
  const done=await(await fetch(base+'/api/rotation-jobs/'+id)).json();assert.equal(done.status,'done');assert.equal(done.mediaUrl,'/api/rotation-media/'+id);assert.equal(done.upstreamId,undefined);assert.equal(done.videoProviderIdentity,undefined);
  const media=await fetch(base+done.mediaUrl,{headers:{Range:'bytes=0-4'}});assert.equal(await media.text(),'video');assert.ok(!requests.at(-1).headers.Authorization);assert.equal(requests.at(-1).headers.Range,'bytes=0-4');
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
