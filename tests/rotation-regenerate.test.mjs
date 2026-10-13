import test from 'node:test';
import assert from 'node:assert/strict';
import {createRotationGeneration} from '../public/rotation-generation.js';
import {planRotationSave} from '../public/wardrobe-state.js';
test('regeneration submits once under a new ID, preserves old media until the new result commits',async()=>{
 const target={id:'look',name:'look',photo:'photo',background:'white-v1',sequence:'old-sequence'};
 const state={looks:[target],models:[],rotationTasks:[{id:'old-task',targetId:target.id,status:'completed'}]};
 let finish;const ready=new Promise(r=>finish=r);let submits=0,commits=0;
 const flow=createRotationGeneration({$:()=>({open:false}),state,save:async()=>{},openModal:()=>{},closeModal:()=>{},escape:x=>x,toast:()=>{},renderHome:async()=>{},
  compactImage:async()=> 'image',request:async(route,options)=>{if(options?.method==='POST'){submits++;return {status:'pending'};}await ready;return {status:'done',mediaUrl:'/new-video'};},
  readFrame:async()=>({ok:true,blob:async()=>new Blob(['video'])}),videoFlow:{extractGenerated:async()=>({videoBlob:new Blob(['video'])})},
  commit:async(sequence)=>{commits++;assert.equal(target.sequence,'old-sequence');assert.equal(sequence.preparedPhoto,'photo');target.sequence='new-sequence';},delay:async()=>{}
 });
 const first=flow.start(target,{regenerate:true});await new Promise(r=>setImmediate(r));const repeated=flow.start(target,{regenerate:true});
 assert.equal(target.sequence,'old-sequence');assert.equal(submits,1);assert.equal(state.rotationTasks.length,2);assert.equal(state.rotationTasks[1].previousSequence,'old-sequence');
 finish();await Promise.all([first,repeated]);assert.equal(submits,1);assert.equal(commits,1);assert.equal(target.sequence,'new-sequence');assert.equal(state.rotationTasks[0].status,'completed');
});
test('saving a replacement retains the old sequence reference and photo as recoverable history',()=>{
 const target={id:'look',name:'look',photo:'original-photo',sequence:'old-sequence',items:['shirt']};const state={looks:[target],models:[]};
 const update=planRotationSave(state,{targetId:'look',name:'look',key:'new-sequence',sequence:{},date:'2026-10-13'});
 assert.equal(target.sequence,'old-sequence');assert.equal(update.entries[0].sequence,'new-sequence');assert.deepEqual(update.entries[0].items,['shirt']);
 assert.equal(update.entries[0].rotationHistory[0].sequence,'old-sequence');assert.equal(update.entries[0].rotationHistory[0].photo,'original-photo');
});
