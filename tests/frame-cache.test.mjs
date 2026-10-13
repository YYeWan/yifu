import test from 'node:test';import assert from 'node:assert/strict';
import {createFrameCache,selectCachedFrame} from '../public/frame-cache.js';
const coarse={blob:new Blob(['coarse']),count:4,start:0,cols:2,width:16,height:20};
const fine={blob:new Blob(['fine']),count:8,start:0,cols:4,width:32,height:40};
const spec={sourceCount:241,count:8,width:32,height:40,coarse,sheets:[fine]};
function setup(decode){
 const old={document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 const calls=[],callbacks=new Map();let next=0;const canvas={hidden:true,dataset:{},setAttribute(){},getContext(){return {drawImage(...args){calls.push(args);}};}};
 globalThis.document={createElement:()=>canvas};globalThis.requestAnimationFrame=fn=>{callbacks.set(++next,fn);return next;};globalThis.cancelAnimationFrame=id=>callbacks.delete(id);
 const stage={dataset:{},append(){}},frames=[],cache=createFrameCache({stage,onFrame:i=>frames.push(i),decode});
 return {stage,canvas,cache,calls,frames,flush(){const pending=[...callbacks.values()];callbacks.clear();pending.forEach(fn=>fn());},restore(){cache.clear();Object.assign(globalThis,old);}};
}
test('frame selection uses coarse angles until its fine sheet is decoded, including both endpoints',()=>{
 let r=selectCachedFrame(spec,240,new Map());assert.equal(r.sheet,coarse);assert.equal(r.x,16);assert.equal(r.y,20);
 r=selectCachedFrame(spec,240,new Map([[fine,{}]]));assert.equal(r.sheet,fine);assert.equal(r.x,96);assert.equal(r.y,40);
 assert.equal(selectCachedFrame(spec,0,new Map()).x,0);
});
test('coarse interaction is ready before fine work; dragging uses cached pixels; clearing releases every bitmap',async()=>{
 let completeFine;const bitmaps=[];const decode=async blob=>{const b={width:64,height:80,closed:false,close(){this.closed=true;}};bitmaps.push(b);if(await blob.text()==='fine')await new Promise(resolve=>completeFine=resolve);return b;};
 const x=setup(decode);try{await x.cache.load(spec);assert.equal(x.cache.ready,true);assert.equal(x.canvas.hidden,false);x.cache.show(240);x.flush();assert.equal(x.frames.at(-1),240);assert.equal(x.calls.at(-1)[3],16);await new Promise(resolve=>setImmediate(resolve));completeFine();await new Promise(resolve=>setImmediate(resolve));x.flush();assert.equal(x.calls.at(-1)[3],32);x.cache.clear();assert.equal(x.stage.dataset.rotationCacheBytes,'0');assert.equal(x.canvas.hidden,true);assert.ok(bitmaps.every(b=>b.closed));}finally{x.restore();}
});
test('switching while an image decodes closes its late result and never reveals it',async()=>{
 let resolveDecode;const bitmap={width:64,height:80,closed:false,close(){this.closed=true;}};
 const x=setup(()=>new Promise(resolve=>resolveDecode=()=>resolve(bitmap)));
 try{const pending=x.cache.load(spec);await new Promise(resolve=>setImmediate(resolve));x.cache.clear();resolveDecode();await assert.rejects(pending,e=>e.name==='AbortError');assert.equal(bitmap.closed,true);assert.equal(x.canvas.hidden,true);}finally{x.restore();}
});
test('an unreadable coarse sheet rejects for the video fallback without keeping a pixel buffer',async()=>{
 const x=setup(async()=>{throw Error('bad image');});try{await assert.rejects(x.cache.load(spec),/bad image/);assert.equal(x.cache.ready,false);assert.equal(x.canvas.width,1);}finally{x.restore();}
});
test('HD frames replace previews without video seeks and their decoded cache remains bounded',async()=>{
 const decoded=[],hdFrames=Array.from({length:40},(_,i)=>new Blob(['hd-'+i]));
 const hdSpec={...spec,detail:{frames:hdFrames,count:40,width:720,height:960}};
 const x=setup(async blob=>{const hd=(await blob.text()).startsWith('hd-');const bitmap={width:hd?720:64,height:hd?960:80,closed:false,close(){this.closed=true;}};decoded.push(bitmap);return bitmap;});
 try{await x.cache.load(hdSpec);await new Promise(resolve=>setImmediate(resolve));x.flush();assert.equal(x.canvas.width,720);assert.equal(x.canvas.height,960);assert.equal(x.canvas.dataset.quality,'hd');
  for(let i=0;i<40;i++){x.cache.show(Math.round(i/39*240));x.flush();await new Promise(resolve=>setImmediate(resolve));x.flush();assert.ok(Number(x.stage.dataset.rotationDetailFrames)<=12);const liveHD=decoded.filter(b=>b.width===720&&!b.closed);assert.ok(liveHD.reduce((n,b)=>n+b.width*b.height*4,0)<=32*1024*1024);}
  assert.ok(decoded.some(b=>b.width===720&&b.closed));x.cache.clear();assert.ok(decoded.every(b=>b.closed));assert.equal(x.stage.dataset.rotationCacheBytes,'0');
 }finally{x.restore();}
});
