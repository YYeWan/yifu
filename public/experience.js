const bar=document.querySelector('.experience-bar');
let refreshing=false,lastGood=false;
const quotaRetry=document.createElement('button');quotaRetry.className='text-button';quotaRetry.textContent='重试额度';quotaRetry.hidden=true;quotaRetry.onclick=refreshExperience;bar.append(quotaRetry);
async function refreshExperience(){
 if(refreshing||document.hidden)return;refreshing=true;
 try{
  const r=await fetch('/api/experience',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('quota');const q=await r.json();
  if(q.local&&q.unlimited){
   bar.dataset.state='ready';bar.setAttribute('aria-label','本地生成不限次数');bar.querySelector('.experience-heading strong').textContent='本地模式';bar.querySelector('.experience-heading > span:last-child').textContent='自由创作';
   for(const kind of ['image','video']){document.getElementById(kind+'-quota-remaining').textContent='∞';document.getElementById(kind+'-quota-total').parentElement.hidden=true;const p=document.getElementById(kind+'-quota-progress');p.max=1;p.value=1;}
   document.getElementById('experience-personal').textContent='本地图片、视频生成不限次数';bar.title='直接使用你配置的图片与视频反代，不占用公网体验额度。';quotaRetry.hidden=true;lastGood=true;return;
  }
  if(!q.active){bar.dataset.state='pending';document.getElementById('experience-personal').textContent='生成体验正在准备中';return;}
  for(const kind of ['image','video']){const v=q[kind];if(!Number.isInteger(v.remaining)||!Number.isInteger(v.personalRemaining))throw Error('quota');document.getElementById(kind+'-quota-remaining').textContent=v.remaining;document.getElementById(kind+'-quota-total').textContent=v.total;const p=document.getElementById(kind+'-quota-progress');p.max=v.total;p.value=v.remaining;}
  lastGood=true;quotaRetry.hidden=true;bar.dataset.state='ready';document.getElementById('experience-personal').textContent=`当前 IP 还可生成 ${q.image.personalRemaining} 张图片 · ${q.video.personalRemaining} 个视频`;
  bar.title='每 IP 累计 5 次图片、2 次视频；白底整理、单品提取与换装共用图片次数。提交生成后占用额度，不会每日重置。';
 }catch{quotaRetry.hidden=false;bar.dataset.state='error';if(!lastGood)for(const kind of ['image','video'])document.getElementById(kind+'-quota-remaining').textContent='—';document.getElementById('experience-personal').textContent=lastGood?'额度暂未更新，上方为上次读取结果':'额度暂不可读取，可点击重试';}finally{refreshing=false;}
}
void refreshExperience();const timer=setInterval(refreshExperience,15000);
window.addEventListener('focus',refreshExperience);document.addEventListener('visibilitychange',refreshExperience);window.addEventListener('wardrobe-generation',refreshExperience);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
