import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readProxyConfig} from '../server/local-config.mjs';
import {createWardrobeServer} from '../server.mjs';
test('portable config loads an optional env file and supports environment overrides without local paths',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'yifu-config-')),file=path.join(dir,'.env');
 try{assert.equal((await readProxyConfig({env:{},file})).CODEX_IMAGE_API_KEY,'');await writeFile(file,'CODEX_IMAGE_BASE_URL="https://image.invalid/v1"\nCODEX_IMAGE_API_KEY=test\nPORT=9000\n');const c=await readProxyConfig({env:{PORT:'9001'},file});assert.equal(c.PORT,9001);assert.equal(c.CODEX_IMAGE_API_KEY,'test');assert.equal(c.GROK_VIDEO_API_KEY,'');await assert.rejects(()=>readProxyConfig({env:{PORT:'invalid'},file}));}finally{await rm(dir,{recursive:true,force:true});}
});
test('fresh server works without credentials, serves only public files, and rejects hostile origins',async()=>{
 const server=createWardrobeServer({env:{}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(await page.text(),/数字衣柜/);
  const config=await(await fetch(base+'/api/image-config')).json();assert.equal(config.configured,false);assert.equal(config.videoConfigured,false);assert.ok(!JSON.stringify(config).includes('API_KEY'));
  assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/server/local-config.mjs')).status,404);
  const q=await(await fetch(base+'/api/experience')).json();assert.equal(q.unlimited,true);
  const rejected=await fetch(base+'/api/image-jobs',{method:'POST',headers:{Origin:'https://hostile.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(rejected.status,403);
  const missing=await fetch(base+'/api/image-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(missing.status,503);
  const bytes=await fetch(base+'/assets/manifest.json',{headers:{Range:'bytes=0-4'}});assert.equal(bytes.status,206);assert.equal((await bytes.arrayBuffer()).byteLength,5);
 }finally{await new Promise(r=>server.close(r));}
});
test('image configuration does not depend on having a video provider configured',async()=>{
 const server=createWardrobeServer({env:{CODEX_IMAGE_BASE_URL:'https://image.invalid/v1',CODEX_IMAGE_API_KEY:'test'}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const config=await(await fetch(`http://127.0.0.1:${server.address().port}/api/image-config`)).json();assert.equal(config.configured,true);assert.equal(config.videoConfigured,false);}finally{await new Promise(r=>server.close(r));}
});
