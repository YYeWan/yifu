import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import sharp from 'sharp';
import {createLocalStore} from '../server/local-store.mjs';
import {createLocalHandler} from '../server/local-api.mjs';
test('local generation exceeds public quotas, persists, and never repeats identical submissions',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'yifu-local-test-'));const running=[];let images=0,videos=0;
 const env={CODEX_IMAGE_BASE_URL:'https://image.invalid/v1',CODEX_IMAGE_API_KEY:'test',GROK_VIDEO_BASE_URL:'https://video.invalid/v1',GROK_VIDEO_API_KEY:'test'};
 const providers={image:async()=>{images++;return 'data:image/webp;base64,test';},video:async()=>{videos++;return {request_id:'video_test'};}};
 const handler=createLocalHandler({env,store:createLocalStore(directory),providers,background:p=>running.push(p)});
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const png=await sharp({create:{width:2,height:2,channels:3,background:'#fff'}}).png().toBuffer();const image='data:image/png;base64,'+png.toString('base64');
  const submit=async(route,input,origin=base)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(input)});return {status:r.status,data:await r.json()};};
  const q=await (await fetch(base+'/api/experience')).json();assert.equal(q.unlimited,true);
  let last;
  for(let i=0;i<7;i++){last={requestId:randomUUID(),kind:'prepare-white',images:[image]};assert.equal((await submit('/api/image-jobs',last)).status,202);}
  for(let i=0;i<4;i++)assert.equal((await submit('/api/rotation-jobs',{requestId:randomUUID(),image})).status,202);
  await Promise.all(running);assert.equal(images,7);assert.equal(videos,4);
  assert.equal((await submit('/api/image-jobs',last)).status,202);await Promise.all(running);assert.equal(images,7);
  assert.equal((await createLocalStore(directory).get('local','image',last.requestId)).status,'completed');
  assert.equal((await submit('/api/image-jobs',{...last,requestId:randomUUID()},'https://other.invalid')).status,403);
  assert.equal(images,7);
 }finally{await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});}
});
