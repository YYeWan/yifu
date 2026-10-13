import {mergeExamples} from './public-examples.js';
import {scrubVideos} from './scrub-videos.js';
import {frameAtlases} from './frame-atlases.js';
import {compactFrameSequence} from './frame-atlas-builder.js';
import {prepareLocalVideo} from './local-video-cache.js';
// Each origin/browser owns its library; public examples are copied only once.
export function createLibraryClient({db}){
 let queue=Promise.resolve();const upgrades=new Map();
 function read(store,key){return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 function write(store,key,value){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('浏览器存储空间不足，请先下载保留图片'));});}
 function serial(fn){const result=queue.then(fn);queue=result.catch(()=>{});return result;}
 async function durable(value){
  if(value instanceof Blob)return value;
  if(typeof value==='string'&&value.startsWith('blob:')){
   const response=await fetch(value);if(!response.ok)throw Error('照片暂时无法保存');
   const blob=await response.blob();
   return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
  }
  if(Array.isArray(value))return Promise.all(value.map(durable));
  if(value&&typeof value==='object'){const result={};for(const [key,item] of Object.entries(value))result[key]=await durable(item);return result;}
  return value;
 }
 async function load(){
  const saved=await read('state','wardrobe');
  let r;try{r=await fetch('/assets/examples/library.json',{cache:'no-cache'});}catch(e){if(saved)return saved;throw e;}
  if(r.status===404)return saved;
  if(!r.ok){if(saved)return saved;throw Error('原有穿搭暂时无法读取，请刷新重试');}
  const seed=await r.json(),merged=mergeExamples(saved,seed);
  if(!merged.changed)return saved;
  if(merged.backup)await write('media','integration-test-backup-2026-10-12',merged.backup);
  for(const [key,value] of Object.entries(seed.media))if(!await read('media',key))await write('media',key,value);
  await write('state','wardrobe',merged.state);return merged.state;
 }
 async function getMedia(key){const value=await read('media',key);if(value?.videoUrl&&frameAtlases[value.videoUrl])return {...value,frameAtlas:frameAtlases[value.videoUrl]};
  if((value?.frames?.length>1||value?.videoBlob)&&!value.frameAtlas?.detail){if(!upgrades.has(key))upgrades.set(key,(async()=>{try{const frameAtlas=value.frames?.length>1?await compactFrameSequence(value.frames,value.manifest):(await prepareLocalVideo(value.videoBlob,{fps:value.manifest.fps,start:value.manifest.trimStart||0,end:value.manifest.trimEnd||0})).frameAtlas;const upgraded={...value,frameAtlas};await write('media',key,upgraded);return upgraded;}catch{return value;}finally{upgrades.delete(key);}})());return upgrades.get(key);}
  return value?.videoUrl&&scrubVideos[value.videoUrl]?{...value,originalVideoUrl:value.videoUrl,videoUrl:scrubVideos[value.videoUrl]}:value;}
 return {load,save(state){const snapshot=structuredClone(state);return serial(async()=>write('state','wardrobe',await durable(snapshot)));},getMedia,putMedia(key,value){const snapshot=structuredClone(value);return serial(async()=>write('media',key,await durable(snapshot)));}};
}
