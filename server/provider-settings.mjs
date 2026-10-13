import {createHash} from 'node:crypto';
import {PublicError} from './local-store.mjs';
export const PRESETS={image:['openai-edits','openai','seedream'],video:['grok','seedance']};
export function providerSettings(env={}){
 const imageType=env.IMAGE_PROVIDER||'openai-edits',videoType=env.VIDEO_PROVIDER||'grok';
 if(!PRESETS.image.includes(imageType)||!PRESETS.video.includes(videoType))throw new PublicError('接口预设无效，请检查 IMAGE_PROVIDER / VIDEO_PROVIDER',503,'INVALID_PROVIDER');
 const image={type:imageType,base:env.IMAGE_BASE_URL||env.CODEX_IMAGE_BASE_URL||'',key:env.IMAGE_API_KEY||env.CODEX_IMAGE_API_KEY||'',model:env.IMAGE_MODEL||env.CODEX_IMAGE_MODEL||'',size:env.IMAGE_SIZE||'',maxInputs:Number(env.IMAGE_MAX_INPUTS||(imageType==='seedream'?10:imageType==='openai'?16:17))};
 const video={type:videoType,base:env.VIDEO_BASE_URL||env.GROK_VIDEO_BASE_URL||'',key:env.VIDEO_API_KEY||env.GROK_VIDEO_API_KEY||'',model:env.VIDEO_MODEL||env.GROK_VIDEO_MODEL||'',lastFrame:env.VIDEO_LAST_FRAME!=='false'};
 image.model ||= imageType==='seedream'?'':'gpt-image-2';video.model ||= videoType==='seedance'?'':'grok-imagine-video-1.5';
 if(!Number.isInteger(image.maxInputs)||image.maxInputs<1||image.maxInputs>17)throw new PublicError('IMAGE_MAX_INPUTS 必须是 1–17 的整数',503,'INVALID_PROVIDER');
 return {image,video,mediaHosts:(env.MEDIA_ALLOWED_HOSTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)};
}
export function videoIdentity(video){return createHash('sha256').update(JSON.stringify([video.type,video.base.replace(/\/$/,''),video.model,video.lastFrame])).digest('hex');}
export function baseURL(value){
 let u;try{u=new URL(value);}catch{throw new PublicError('请填写有效的 API 基础 URL',503,'GENERATION_NOT_READY');}
 const loopback=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
 if((u.protocol!=='https:'&&!(u.protocol==='http:'&&loopback))||u.username||u.password||u.search||u.hash)throw new PublicError('API URL 请使用 HTTPS 或本机 HTTP 基础地址，不含用户名、密码或查询参数',503,'GENERATION_NOT_READY');
 return u.href.replace(/\/$/,'');
}
