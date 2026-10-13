import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export class PublicError extends Error{constructor(message,status=400,code='INVALID_REQUEST'){super(message);this.status=status;this.code=code;}}
export const localSnapshot=()=>({active:true,status:'ready',local:true,unlimited:true,image:{unlimited:true},video:{unlimited:true}});
export function createLocalStore(directory=fileURLToPath(new URL('../.local/generation/',import.meta.url))){
 let queue=Promise.resolve();
 const file=(kind,id,suffix='')=>{if(!['image','video'].includes(kind)||!/^[a-f0-9-]{36}$/i.test(id))throw new PublicError('任务编号无效');return path.join(directory,`${kind}-${id}${suffix}.json`);};
 async function read(name){try{return JSON.parse(await readFile(name,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async function write(name,value){await mkdir(directory,{recursive:true,mode:0o700});const temp=name+'.tmp';await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,name);}
 function lock(fn){const work=queue.then(fn);queue=work.catch(()=>{});return work;}
 return {
  snapshot:async()=>localSnapshot(),
  reserve:(_owner,kind,id,fingerprint,job)=>lock(async()=>{
   const name=file(kind,id),existing=await read(name);
   if(existing){if(existing.fingerprint!==fingerprint)throw new PublicError('任务编号已用于其他内容',409,'IDEMPOTENCY_CONFLICT');return {created:false,job:existing.job};}
   await write(name,{fingerprint,job});return {created:true,job};
  }),
  get:async(_owner,kind,id)=>(await read(file(kind,id)))?.job||null,
  save:(_owner,kind,job)=>lock(async()=>{const name=file(kind,job.id),previous=await read(name);await write(name,{...previous,job});}),
  release:async()=>{},
  saveImage:async(_owner,id,data)=>{await write(file('image',id,'-result'),{data,expiresAt:Date.now()+3600000});return 1;},
  readImage:async(_owner,id)=>{const result=await read(file('image',id,'-result'));return result&&result.expiresAt>Date.now()?result.data:null;}
 };
}
