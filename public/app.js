import {createVideoPlayer} from './video-player.js';
import {createFrameCache} from './frame-cache.js';
const $ = (id) => document.getElementById(id);
const stage = $('stage'), canvas = $('canvas'), slider = $('rotation');
const stats = {loaded: 0, failed: 0, displayed: -1, desired: 0, playing: false, matte: false};
const blobs = new Map(), bitmaps = new Map(), pending = new Map();
const CACHE_LIMIT = 24;
let manifest, total = 0, requested = 0, serial = 0, playRAF = 0, drag = null, disposed = false;
let enabled=true, generation=0, localFrames=null,videoSequence=false,activeSequence=null,videoURL=null,nativeMode=false,videoReady=null;
const videoPlayer=createVideoPlayer({stage,onFrame(index){if(nativeMode||!frameCache.ready)displayFrame(index);},onError:()=>{stop();$('status').textContent='旋转播放未开始，请再试一次';}});
const frameCache=createFrameCache({stage,onFrame:displayFrame,onProgress(done,count){if(enabled)$('drag-hint').textContent=done===count?'左右滑动，看看每一面':'正在细化旋转画面，可以先拖动';}});
let gl, program, texture, alphaUniform;
const wrap = (n) => ((Math.round(n) % total) + total) % total;
const padded = (n) => String(n).padStart(4, '0');
function compile(type, source) {
  const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}
function initRenderer() {
  gl = canvas.getContext('webgl', {alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false});
  if (!gl) throw new Error('浏览器无法启用 WebGL，请换用 Chrome 或 Safari。');
  program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, `attribute vec2 position; varying vec2 uv; void main(){gl_Position=vec4(position,0.,1.);uv=vec2((position.x+1.)*.5,(1.-position.y)*.5);}`));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `precision highp float; varying vec2 uv; uniform sampler2D frame; uniform float nativeAlpha;
    void main(){vec4 pixel=texture2D(frame,uv);vec3 c=pixel.rgb;
      if(nativeAlpha>.5)c=mix(vec3(1.),c,pixel.a);
      gl_FragColor=vec4(c,1.);}`));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('无法初始化图像显示。');
  gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const attr=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
  texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  alphaUniform=gl.getUniformLocation(program,'nativeAlpha');gl.uniform1i(gl.getUniformLocation(program,'frame'),0);
  gl.viewport(0,0,canvas.width,canvas.height);
}
function paint(bitmap) {
  gl.bindTexture(gl.TEXTURE_2D,texture);
  if(bitmap) gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);
  gl.uniform1f(alphaUniform,manifest.transparent?1:0);gl.drawArrays(gl.TRIANGLES,0,6);
}
function updateStatus() {
  $('status').textContent=stats.failed?`有 ${stats.failed} 帧读取失败，请刷新重试`:(stats.loaded===total?'全部角度已就绪':`正在准备更多角度 ${stats.loaded}/${total}`);
}
function getBlob(index) {
  if(localFrames)return Promise.resolve(localFrames[index]);
  if(blobs.has(index)) return blobs.get(index);
  const ownGeneration=generation;
  const task=fetch(manifest.pattern.replace('{index}',padded(index))).then(r=>{
    if(!r.ok) throw new Error(`第 ${index+1} 帧读取失败`);return r.blob();
  }).then(b=>{if(ownGeneration===generation){stats.loaded++;updateStatus();}return b;}).catch(e=>{if(ownGeneration===generation){blobs.delete(index);stats.failed++;updateStatus();}throw e;});
  blobs.set(index,task); return task;
}
async function getBitmap(index) {
  if(bitmaps.has(index)){const b=bitmaps.get(index);bitmaps.delete(index);bitmaps.set(index,b);return b;}
  if(pending.has(index)) return pending.get(index);
  const ownGeneration=generation;
  const task=getBlob(index).then(b=>createImageBitmap(b)).then(bitmap=>{
    if(disposed||ownGeneration!==generation){bitmap.close();throw new Error('Viewer changed');}
    bitmaps.set(index,bitmap);
    while(bitmaps.size>CACHE_LIMIT){const key=[...bitmaps.keys()].find(k=>k!==requested&&k!==stats.displayed);if(key===undefined)break;bitmaps.get(key).close();bitmaps.delete(key);}
    return bitmap;
  }).finally(()=>{if(ownGeneration===generation)pending.delete(index);});
  pending.set(index,task);return task;
}
function prefetchAround(index) {
  for(const offset of [-3,-2,-1,1,2,3]) getBitmap(wrap(index+offset)).catch(()=>{});
}
function displayFrame(index){
 if(!videoSequence||stats.playing){requested=index;stats.desired=index;}stats.displayed=index;canvas.dataset.frame=String(index);
 const angle=Math.round(index/total*360);$('angle').textContent=String(angle).padStart(3,'0')+'°';
 stage.setAttribute('aria-valuenow',String(angle));stage.setAttribute('aria-valuetext',`${angle} 度，第 ${index+1} 帧`);
 slider.value=String(index);slider.style.setProperty('--rotation-progress',`${total>1?index/(total-1)*100:0}%`);slider.setAttribute('aria-valuetext',`${angle} 度`);$('loading').hidden=true;
}
async function show(index) {
  if(!total||disposed)return;
  requested=wrap(index);stats.desired=requested;const version=++serial;if(frameCache.ready){nativeMode=false;videoPlayer.hide();frameCache.show(requested);return;}if(videoSequence){videoPlayer.seek(requested);return;}
  try {
    const bitmap=await getBitmap(requested);
    if(version!==serial||disposed)return;
    paint(bitmap);displayFrame(requested);prefetchAround(requested);
  } catch(e) {if(version===serial){stop();$('status').textContent=e.message+'，请刷新重试';}}
}
function stop(){videoPlayer.pause();stats.playing=false;cancelAnimationFrame(playRAF);if(frameCache.ready){nativeMode=false;videoPlayer.hide();if(enabled)frameCache.show(requested);}$('play').setAttribute('aria-pressed','false');$('play-label').textContent='自动旋转';$('play-icon').textContent='▷';}
async function ensureVideo(){
 if(!videoReady){const own=generation;videoReady=videoPlayer.load(videoURL,manifest,{visible:!frameCache.ready}).then(()=>{if(own!==generation)throw new DOMException('穿搭已切换','AbortError');}).catch(e=>{if(own===generation)videoReady=null;throw e;});}await videoReady;
}
async function togglePlay(){
  if(stats.playing){stop();return;}
  if(!total||!enabled)return;
  stats.playing=true;$('play').setAttribute('aria-pressed','true');$('play-label').textContent='暂停旋转';$('play-icon').textContent='Ⅱ';
  if(videoSequence){const own=generation,target=requested;try{await ensureVideo();await videoPlayer.seekAndWait(target);if(own!==generation||!enabled||!stats.playing)return;nativeMode=true;frameCache.hide();videoPlayer.reveal();stage.dataset.rotationMode='video';videoPlayer.play();}catch(e){if(own===generation&&e.name!=='AbortError')stop();}return;}
  const from=requested,start=performance.now();let last=-1;
  const tick=now=>{if(!stats.playing)return;const i=wrap(from+Math.floor((now-start)/1000*manifest.fps));if(i!==last){show(i);last=i;}playRAF=requestAnimationFrame(tick);};
  playRAF=requestAnimationFrame(tick);
}
stage.addEventListener('pointerdown',e=>{
  if(!total||!enabled||e.button!==0||drag)return;
  stop();stage.focus({preventScroll:true});drag={id:e.pointerId,x:e.clientX,frame:requested,width:stage.clientWidth};
  stage.setPointerCapture(e.pointerId);stage.classList.add('dragging');
});
stage.addEventListener('pointermove',e=>{if(drag&&drag.id===e.pointerId)show(drag.frame-(e.clientX-drag.x)/drag.width*total);});
function release(e){if(drag&&drag.id===e.pointerId){drag=null;stage.classList.remove('dragging');}}
stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);stage.addEventListener('lostpointercapture',release);
stage.addEventListener('keydown',e=>{
  if(!total||!enabled)return;
  if(['ArrowLeft','ArrowRight','Home','End',' '].includes(e.key)){
    e.preventDefault();stop();if(e.key===' ')togglePlay();
    else show(e.key==='Home'?0:e.key==='End'?total-1:requested+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?10:1));
  }
});
slider.addEventListener('input',()=>{stop();show(Number(slider.value));});
$('reset').addEventListener('click',()=>{stop();show(0);});$('play').addEventListener('click',togglePlay);
// Retain the viewer API for saved sequences; this stage always displays white.
function setMatte(){
  stats.matte=false;$('viewer').dataset.bg='';
  if(stats.displayed>=0)paint();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.addEventListener('pagehide',()=>{stop();frameCache.clear();videoPlayer.clear();if(activeSequence?.videoBlob&&videoURL)URL.revokeObjectURL(videoURL);disposed=true;bitmaps.forEach(b=>b.close());bitmaps.clear();});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();stop();$('status').textContent='图像显示中断，请刷新页面恢复。';});
async function loadSequence(sequence){
  const loadStarted=performance.now();
  stop();frameCache.clear();videoPlayer.clear();if(activeSequence?.videoBlob&&videoURL)URL.revokeObjectURL(videoURL);generation++;serial++;blobs.clear();pending.clear();bitmaps.forEach(b=>b.close());bitmaps.clear();
  activeSequence=sequence;videoReady=null;nativeMode=false;videoURL=sequence.videoBlob?URL.createObjectURL(sequence.videoBlob):sequence.videoUrl;
  videoSequence=Boolean(videoURL);localFrames=sequence.frames||null;manifest=sequence.manifest;total=manifest.count;requested=0;
  stats.loaded=localFrames?total:0;stats.failed=0;stats.displayed=-1;stats.desired=0;
  canvas.width=manifest.width;canvas.height=manifest.height;gl.viewport(0,0,canvas.width,canvas.height);
  slider.max=total-1;slider.disabled=true;$('play').disabled=true;
  if(sequence.frameAtlas){try{await frameCache.load(sequence.frameAtlas);stats.loaded=total;}catch(e){if(e.name==='AbortError')throw e;if(videoSequence){await ensureVideo();stats.loaded=total;}else await show(0);}}
  else if(videoSequence){await ensureVideo();stats.loaded=total;}else await show(0);updateStatus();
  slider.disabled=total<2||stats.displayed<0;
  $('play').disabled=slider.disabled;stage.dataset.rotationLoadMs=String(Math.round(performance.now()-loadStarted));
  if(!localFrames&&!videoSequence)preload();
}
async function preload(){
  let next=0;const ownGeneration=generation;
  async function worker(){while(next<total&&!disposed&&generation===ownGeneration){const i=next++;try{await getBlob(i);}catch{} await new Promise(r=>setTimeout(r,6));}}
  await Promise.all(Array.from({length:4},worker));
}
window.__wardrobe={stats,show,stop,setMatte,loadSequence,async captureCanvas(){stop();const own=generation,target=requested;if(videoSequence){await ensureVideo();await videoPlayer.seekAndWait(target);if(own!==generation)throw new DOMException('穿搭已切换','AbortError');paint(videoPlayer.frameSource);}else if(frameCache.ready){const bitmap=await getBitmap(target);if(own!==generation)throw new DOMException('穿搭已切换','AbortError');paint(bitmap);}return canvas;},setEnabled(value){enabled=value;if(!value){stop();videoPlayer.hide();frameCache.clear();}},hideCurrent(){frameCache.hide();videoPlayer.hide();},revealCurrent(){if(frameCache.ready)frameCache.show(requested);else if(videoSequence)videoPlayer.reveal();},get cacheSize(){return bitmaps.size;},get count(){return total;}};
async function init(){
  const r=await fetch('assets/manifest.json');if(!r.ok)throw new Error('无法读取素材信息');manifest=await r.json();
  total=manifest.count;if(total===0){canvas.width=1080;canvas.height=1440;initRenderer();enabled=false;$('loading').hidden=true;return;}if(!Number.isInteger(total)||total<2)throw new Error('帧序列为空');
  canvas.width=manifest.width;canvas.height=manifest.height;initRenderer();
  slider.max=total-1;await show(0);if(stats.displayed<0)throw new Error('首帧无法加载，请刷新重试');
  slider.disabled=false;$('play').disabled=false;
  void preload();updateStatus();
}
window.__wardrobe.ready=init().catch(e=>{$('load-text').textContent=e.message;$('loading').querySelector('.spinner').hidden=true;$('status').textContent='加载失败';throw e;});
