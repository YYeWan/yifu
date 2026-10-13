// Decode only the requested video angle; never extract a whole video on startup.
export function createVideoPlayer({stage,onFrame,onError}){
 const video=document.createElement('video');video.className='rotation-video';video.muted=true;video.playsInline=true;video.loop=true;video.preload='auto';video.hidden=true;video.setAttribute('aria-hidden','true');stage.append(video);
 let manifest,raf=0,seekRAF=0,seekTarget=null,seeking=false,seekStarted=0,cancelLoad=null,ready=false,lastFrame=-1;
 const waiters=new Set();
 function frame(){if(!ready)return;const index=Math.max(0,Math.min(manifest.count-1,Math.round((video.currentTime-(manifest.trimStart||0))*manifest.fps)));if(index!==lastFrame){lastFrame=index;onFrame(index,video);}}
 function tick(){if(manifest.trimEnd&&video.currentTime>=manifest.trimEnd)seek(0);frame();if(!video.paused)raf=requestAnimationFrame(tick);}
 function flushSeek(){
  seekRAF=0;if(!ready||seeking||seekTarget===null)return;
  const target=seekTarget;seekTarget=null;
  if(Math.abs(video.currentTime-target)<.0001)return;
  seeking=true;seekStarted=performance.now();video.currentTime=target;
 }
 function scheduleSeek(){if(!seekRAF)seekRAF=requestAnimationFrame(flushSeek);}
 video.addEventListener('seeked',()=>{seeking=false;video.dataset.seekMs=String(Math.round(performance.now()-seekStarted));frame();if(seekTarget!==null)scheduleSeek();});
 video.addEventListener('timeupdate',()=>{if(!seeking)frame();});
 video.addEventListener('playing',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);});
 function pause(){video.pause();cancelAnimationFrame(raf);}
 function clear(){pause();ready=false;for(const cancel of [...waiters])cancel(new DOMException('穿搭已切换','AbortError'));cancelAnimationFrame(seekRAF);seekRAF=0;seekTarget=null;seeking=false;if(cancelLoad)cancelLoad();cancelLoad=null;video.hidden=true;video.removeAttribute('src');video.load();}
 async function load(src,next,{visible=true}={}){
  clear();lastFrame=-1;manifest=next;
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>done(Error('旋转暂时无法读取，可继续看图片或点击重试')),15000);
   function done(error){clearTimeout(timer);video.removeEventListener('loadeddata',ok);video.removeEventListener('error',bad);cancelLoad=null;error?reject(error):resolve();}
   const ok=()=>done(),bad=()=>done(Error('旋转视频暂时无法读取，请重试'));
   cancelLoad=()=>done(new DOMException('穿搭已切换','AbortError'));
   video.addEventListener('loadeddata',ok,{once:true});video.addEventListener('error',bad,{once:true});video.src=src;video.load();
  });
  ready=true;video.hidden=!visible;frame();
 }
 function timeFor(index){return Math.max(0,Math.min((manifest.trimStart||0)+index/manifest.fps,video.duration-.001));}
 function seek(index){if(!ready)return;seekTarget=timeFor(index);scheduleSeek();}
 function seekAndWait(index){
  if(!ready)return Promise.reject(Error('旋转视频尚未就绪'));
  const target=timeFor(index);if(!seeking&&Math.abs(video.currentTime-target)<.0001)return Promise.resolve();
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>done(Error('高清画面暂未读取完成，请重试')),15000);function done(error){clearTimeout(timer);video.removeEventListener('seeked',check);waiters.delete(done);error?reject(error):resolve();}function check(){if(Math.abs(video.currentTime-target)<.5/manifest.fps)done();}waiters.add(done);video.addEventListener('seeked',check);seek(index);});
 }
 return {load,clear,pause,seek,seekAndWait,get frameSource(){return ready?video:null;},hide(){if(!ready){clear();return;}pause();cancelAnimationFrame(seekRAF);seekRAF=0;seekTarget=null;video.hidden=true;},reveal(){if(ready)video.hidden=false;},play(){if(ready)void video.play().catch(onError);}};
}
