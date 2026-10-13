import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
export async function readProxyConfig({env=process.env,file=fileURLToPath(new URL('../.env',import.meta.url))}={}){
 let saved={};try{saved=parseEnv(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const merged={...saved,...env},keys=['CODEX_IMAGE_BASE_URL','CODEX_IMAGE_API_KEY','CODEX_IMAGE_MODEL','GROK_VIDEO_BASE_URL','GROK_VIDEO_API_KEY','GROK_VIDEO_MODEL'];
 const result=Object.fromEntries(keys.map(key=>[key,merged[key]||'']));
 const port=Number(merged.PORT||8767);if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be between 1 and 65535');
 return {...result,PORT:port};
}
