import test from 'node:test';import assert from 'node:assert/strict';
import {compactFrameSequence} from '../public/frame-atlas-builder.js';
test('legacy HD frames gain reusable compact sheets while temporary decoded originals are closed',async()=>{
 const old={document:globalThis.document,createImageBitmap:globalThis.createImageBitmap};let opened=0,closed=0;
 globalThis.document={createElement(){return {width:0,height:0,getContext(){return {fillRect(){},drawImage(){}};},toBlob(fn){fn(new Blob(['sheet']));}};}};
 globalThis.createImageBitmap=async()=>{opened++;return {close(){closed++;}};};
 try{const frames=Array.from({length:5},(_,i)=>new Blob(['HD-'+i])),spec=await compactFrameSequence(frames,{width:1080,height:1920,count:5});assert.equal(spec.count,5);assert.equal(spec.sourceCount,5);assert.ok(spec.width<=256&&spec.height<=384);assert.equal(spec.sheets.length,1);assert.equal(spec.sheets[0].count,5);assert.equal(opened,5);assert.equal(closed,opened);assert.equal(await frames[4].text(),'HD-4');}finally{Object.assign(globalThis,old);}
});
