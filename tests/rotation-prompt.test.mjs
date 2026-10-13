import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createProviders,decodeRotationImage} from '../server/public-providers.mjs';
import {rotationPrompt,rotationPromptVersion} from '../public/rotation-prompt.js';
import {rotationPrompt as serverPrompt} from '../server/rotation-prompt.js';
test('actual video request uses the shared fixed-center prompt with matching first and last references',async()=>{
 let payload;
 const providers=createProviders({GROK_VIDEO_BASE_URL:'https://video.invalid/v1',GROK_VIDEO_API_KEY:'test'},async(_url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({request_id:'video_test'})};});
 await providers.video('data:image/jpeg;base64,test');
 assert.equal(payload.prompt,rotationPrompt);assert.equal(serverPrompt,rotationPrompt);assert.equal(rotationPromptVersion,'rigid-statue-v3');
 assert.ok(payload.prompt.startsWith('拍摄对象是一尊完全静态、没有生命的一体成型'));
 assert.ok(payload.prompt.includes('它不是活人'));
 assert.ok(!payload.prompt.includes('人物'));
 assert.ok(payload.prompt.includes('凝固雕像的机械旋转'));
 assert.equal(payload.image.url,payload.last_frame.url);assert.equal(payload.duration,10);assert.equal(payload.resolution,'720p');
});
test('rotation input keeps all original content within a white border, without cropping',async()=>{
 const src=await sharp({create:{width:1086,height:1448,channels:3,background:'#f00'}}).png().toBuffer();
 const result=await decodeRotationImage('data:image/png;base64,'+src.toString('base64'));
 const {data,info}=await sharp(result).raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,1086);assert.equal(info.height,1448);
 const rgb=(x,y)=>[...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)];
 for(const [x,y] of [[543,50],[543,1400],[50,724],[1030,724]])assert.ok(rgb(x,y).every(v=>v>245));
 assert.ok(rgb(543,724)[0]>240&&rgb(543,724)[1]<15);
});
