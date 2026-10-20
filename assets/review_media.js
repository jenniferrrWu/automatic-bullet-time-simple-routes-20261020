/* Review previews: bounded full-file downloads, unrestricted native playback. */
(function(){
'use strict';
const bound=new WeakSet(),states=new WeakMap(),queue=[],blobCache=new Map();
const DOWNLOADS=4,DOWNLOAD_TIMEOUT=30000,MAX_ATTEMPTS=3,CACHE_BYTES=64*1024*1024;
let activeDownloads=0,cacheBytes=0,playAllActive=false,updateTimer=0;
let posterIndex={},posterPromise=null,posterAt=0,posterReady=false;
function elements(root,selector){const a=[];if(root?.matches?.(selector))a.push(root);if(root?.querySelectorAll)a.push(...root.querySelectorAll(selector));return a;}
function state(video){let s=states.get(video);if(!s){s={version:0,phase:'idle',loaded:false,job:null,promise:null,objectURL:null,wantPlay:false,userPaused:false,playPending:false,playAttempt:0,restart:false,error:'',attempts:0,playTimer:0};states.set(video,s);}return s;}
function shell(video){return video.closest('.media-shell,.media-slot')||video.parentElement;}
function status(video,text){const box=shell(video);if(!box)return;let p=box.querySelector('.media-status');if(!p){p=document.createElement('span');p.className='media-status';p.setAttribute('aria-live','polite');box.appendChild(p);}p.textContent=text;}
function hidden(el){if(!el.isConnected||el.closest('[hidden]')||(typeof el.getClientRects==='function'&&el.getClientRects().length===0))return true;for(let d=el.parentElement;d;d=d.parentElement)if(d.tagName==='DETAILS'&&!d.open)return true;return false;}
function inView(el){if(hidden(el))return false;const r=el.getBoundingClientRect();return r.bottom>=-220&&r.top<=innerHeight+220&&r.right>=0&&r.left<=innerWidth;}
function currentVideos(){return [...document.querySelectorAll('video[data-src]')].filter(v=>!hidden(v));}
function diagnostics(){return {at:new Date().toISOString(),downloadConcurrency:DOWNLOADS,activeDownloads,playbackLimit:null,playAllActive,videos:[...document.querySelectorAll('video[data-src]')].map(v=>{const s=state(v);return {label:v.getAttribute('aria-label'),hidden:hidden(v),phase:s.phase,downloaded:s.loaded,attempts:s.attempts,readyState:v.readyState,networkState:v.networkState,paused:v.paused,currentTime:v.currentTime,error:s.error,mediaError:v.error?{code:v.error.code,message:v.error.message}:null,source:v.dataset.src};})};}
function updateGroupNow(){
 updateTimer=0;const videos=currentVideos(),counts={downloaded:0,ready:0,playing:0,failed:0};let bytes=0,total=0;
 for(const v of videos){const s=state(v);total+=Number(v.dataset.bytes)||0;if(s.loaded){counts.downloaded++;bytes+=Number(v.dataset.bytes)||0;}if(v.readyState>=2)counts.ready++;if(!v.paused&&v.readyState>=2)counts.playing++;if(/error|blocked/.test(s.phase))counts.failed++;}
 const el=document.getElementById('review-media-group-status');if(el){el.textContent='已下载 '+counts.downloaded+'/'+videos.length+' · 可播放 '+counts.ready+' · 播放中 '+counts.playing+(total?' · '+(bytes/1048576).toFixed(1)+'/'+(total/1048576).toFixed(1)+' MB':'')+(counts.failed?' · '+counts.failed+'条需重试':'');el.dataset.downloaded=String(counts.downloaded);el.dataset.total=String(videos.length);el.dataset.playing=String(counts.playing);}
 const debug=document.getElementById('review-media-debug');if(debug?.open){const pre=debug.querySelector('pre');if(pre)pre.textContent=JSON.stringify(diagnostics(),null,2);}
}
function updateGroup(){if(!updateTimer)updateTimer=setTimeout(updateGroupNow,60);}
function finish(job,value){if(job.finished)return;job.finished=true;const s=state(job.video);if(s.job===job){s.job=null;s.promise=null;}job.resolve(value);}
function unload(video){
 const s=state(video);s.version++;s.playAttempt++;s.phase='idle';s.loaded=false;s.wantPlay=false;s.userPaused=false;s.playPending=false;s.error='';clearTimeout(s.playTimer);
 if(s.job){s.job.cancelled=true;s.job.controller?.abort();finish(s.job,false);}
 try{video.pause();}catch(e){}
 if(video.hasAttribute('src')||video.querySelector('source[src]')){video.removeAttribute('src');for(const source of video.querySelectorAll('source[src]'))source.removeAttribute('src');video.preload='none';try{video.load();}catch(e){}}
 if(s.objectURL){URL.revokeObjectURL(s.objectURL);s.objectURL=null;}
 shell(video)?.classList.remove('is-loading','is-playing');status(video,'');updateGroup();pump();
}
function release(root){for(const video of elements(root,'video'))unload(video);for(const img of elements(root,'img[data-src]'))if(img.hasAttribute('src')&&!img.complete)img.removeAttribute('src');}
function cacheBlob(url,blob){if(blobCache.has(url))return;blobCache.set(url,blob);cacheBytes+=blob.size;while(cacheBytes>CACHE_BYTES&&blobCache.size>1){const oldest=blobCache.keys().next().value;cacheBytes-=blobCache.get(oldest).size;blobCache.delete(oldest);}}
function valid(job){return !job.cancelled&&state(job.video).version===job.version&&!hidden(job.video);}
function attachBlob(job,blob){
 if(!valid(job))return false;const video=job.video,s=state(video);if(s.objectURL)URL.revokeObjectURL(s.objectURL);s.objectURL=URL.createObjectURL(blob);s.loaded=true;s.phase='buffered';s.error='';video.preload='auto';video.src=s.objectURL;video.load();status(video,'');updateGroup();return true;
}
async function download(job){
 const video=job.video,s=state(video),url=video.dataset.src;
 try{
  if(!valid(job)){finish(job,false);return;}
  const cached=blobCache.get(url);if(cached){finish(job,attachBlob(job,cached));return;}
  for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
   if(!valid(job)){finish(job,false);return;}
   s.attempts=attempt;s.phase='downloading';status(video,attempt===1?'正在下载轻量预览…':'正在重试下载（'+attempt+'/'+MAX_ATTEMPTS+'）…');updateGroup();
   const controller=new AbortController();job.controller=controller;let timedOut=false;
   const timer=setTimeout(()=>{timedOut=true;controller.abort();},DOWNLOAD_TIMEOUT);
   try{
    const response=await fetch(url,{cache:'force-cache',signal:controller.signal});if(!response.ok)throw new Error('HTTP '+response.status);
    const blob=await response.blob();if(!blob.size)throw new Error('empty preview');
    const expected=Number(video.dataset.bytes)||0;if(expected&&blob.size!==expected)throw new Error('incomplete preview '+blob.size+'/'+expected);
    cacheBlob(url,blob);finish(job,attachBlob(job,blob));return;
   }catch(e){
    if(!valid(job)){finish(job,false);return;}
    s.error=timedOut?'download timeout':String(e.message||e);
    if(attempt===MAX_ATTEMPTS){s.phase='download-error';status(video,'预览下载失败；点“全部播放”可仅重试未就绪项。');finish(job,false);return;}
    await new Promise(resolve=>setTimeout(resolve,attempt*700));
   }finally{clearTimeout(timer);job.controller=null;}
  }
 }catch(e){if(valid(job)){s.phase='download-error';s.error=String(e.message||e);status(video,'预览下载失败；可点“全部播放”重试。');}finish(job,false);}
 finally{activeDownloads--;updateGroup();pump();}
}
function pump(){while(activeDownloads<DOWNLOADS&&queue.length){const job=queue.shift();if(job.finished||!valid(job)){finish(job,false);continue;}activeDownloads++;download(job);}}
function ensureSource(video){
 if(hidden(video)||!video.dataset.src)return Promise.resolve(false);const s=state(video);
 if(s.loaded&&video.hasAttribute('src')&&!video.error)return Promise.resolve(true);
 if(s.promise)return s.promise;
 if(video.error){s.loaded=false;video.removeAttribute('src');if(s.objectURL){URL.revokeObjectURL(s.objectURL);s.objectURL=null;}}
 if(video.dataset.buffer!=='blob'){video.src=video.dataset.src;video.preload='metadata';video.load();s.loaded=true;s.phase='buffered';updateGroup();return Promise.resolve(true);}
 s.phase='queued';s.error='';status(video,'等待下载轻量预览…');
 const job={video,version:s.version,cancelled:false,finished:false,controller:null};s.job=job;s.promise=new Promise(resolve=>{job.resolve=resolve;});const promise=s.promise;queue.push(job);updateGroup();pump();return promise;
}
function attemptPlay(video){
 const s=state(video);if(hidden(video)||!s.loaded||!s.wantPlay||s.userPaused)return false;
 if(s.restart||video.ended){try{video.currentTime=0;}catch(e){}s.restart=false;}
 if(s.playPending)return true;
 if(!video.paused&&video.readyState>=2){s.phase='playing';s.error='';updateGroup();return true;}
 s.playPending=true;s.phase='play-pending';s.error='';const version=s.version,attempt=++s.playAttempt;shell(video)?.classList.add('is-loading');
 try{
  const result=video.play();Promise.resolve(result).then(()=>{if(s.version!==version||s.playAttempt!==attempt)return;s.playPending=false;clearTimeout(s.playTimer);s.phase=video.paused?'ready':'playing';updateGroup();}).catch(e=>{
   if(s.version!==version||s.playAttempt!==attempt)return;s.playPending=false;clearTimeout(s.playTimer);if(e.name==='AbortError'||!s.wantPlay)return;s.phase=e.name==='NotAllowedError'?'play-blocked':'play-error';s.error=e.name+': '+e.message;shell(video)?.classList.remove('is-loading');status(video,e.name==='NotAllowedError'?'请点原生控件播放。':'播放尚未开始；可点“全部播放”重试此项。');updateGroup();
  });
  clearTimeout(s.playTimer);s.playTimer=setTimeout(()=>{if(s.version!==version||s.playAttempt!==attempt||!s.wantPlay||!video.paused)return;s.playPending=false;status(video,s.loaded?'预览已下载，等待浏览器解码；可点“全部播放”重试。':'正在下载…');updateGroup();},15000);
  return true;
 }catch(e){s.playPending=false;s.phase='play-error';s.error=String(e.message||e);status(video,'播放失败；可点“全部播放”重试。');updateGroup();return false;}
}
async function start(video,restart=false){if(hidden(video))return false;const s=state(video);s.wantPlay=true;s.userPaused=false;s.restart=restart;const version=s.version;const ok=await ensureSource(video);return ok&&s.version===version&&s.wantPlay?attemptPlay(video):false;}
function playAll(restart=false){playAllActive=true;const pending=currentVideos().map(v=>start(v,restart));updateGroup();return Promise.allSettled(pending);}
function pauseAll(){playAllActive=false;for(const video of document.querySelectorAll('video[data-src]')){const s=state(video);s.wantPlay=false;s.userPaused=true;s.playAttempt++;s.playPending=false;clearTimeout(s.playTimer);try{video.pause();}catch(e){}}updateGroup();}
function previewFor(value){try{const path=new URL(value,location.href).pathname;const normalized=path.split('/').map(p=>{try{return encodeURIComponent(decodeURIComponent(p)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());}catch(e){return p;}}).join('/');const sourceImage=normalized.replace('/inputs/source_post/','/inputs/source_highlights/').replace(/\.mp4$/i,'.png');const item=posterIndex[path]||posterIndex[normalized]||posterIndex[sourceImage];return typeof item==='string'?item:item?.url;}catch(e){return '';}}
function showPoster(video){if(hidden(video)||!inView(video)||video.hasAttribute('poster'))return;const poster=video.dataset.poster||previewFor(video.dataset.posterSource||video.dataset.src);if(poster)video.poster=poster;}
function showImage(img){if(posterReady&&!hidden(img)&&inView(img)&&!img.hasAttribute('src')&&img.dataset.src)img.src=previewFor(img.dataset.src)||img.dataset.src;}
function revealVideo(video){if(hidden(video))return;showPoster(video);const s=state(video),newlyLoaded=!s.loaded;ensureSource(video).then(ok=>{if(ok&&newlyLoaded&&playAllActive&&!s.userPaused){s.wantPlay=true;attemptPlay(video);}});}
const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){if(entry.target.tagName==='VIDEO')revealVideo(entry.target);else showImage(entry.target);}},{rootMargin:'220px 0px'}):null;
async function fetchPosters(){
 if(posterPromise||Date.now()-posterAt<60000)return posterPromise;posterAt=Date.now();
 posterPromise=fetch('assets/posters_index.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then(index=>{posterIndex=index.posters||index;posterReady=true;for(const v of document.querySelectorAll('video[data-src]'))showPoster(v);for(const img of document.querySelectorAll('img[data-src]'))showImage(img);}).catch(()=>{posterReady=true;for(const img of document.querySelectorAll('img[data-src]'))showImage(img);}).finally(()=>{posterPromise=null;});return posterPromise;
}
function policy(){
 if(document.getElementById('review-media-policy'))return;const header=document.querySelector('header');if(!header)return;
 const bar=document.createElement('div');bar.id='review-media-policy';bar.className='media-policy';
 for(const [label,action] of [['全部播放',()=>playAll(false)],['全部暂停',pauseAll],['全部重播',()=>playAll(true)]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',action);bar.appendChild(button);}
 const hint=document.createElement('span');hint.textContent='所有展开预览自动下载；全部播放不限制数量。检查细节可打开原生视频。';bar.appendChild(hint);
 const progress=document.createElement('span');progress.id='review-media-group-status';progress.setAttribute('aria-live','polite');bar.appendChild(progress);header.appendChild(bar);
 const debug=document.createElement('details');debug.id='review-media-debug';debug.className='media-debug';const summary=document.createElement('summary');summary.textContent='视频加载详情';debug.appendChild(summary);debug.appendChild(document.createElement('pre'));debug.addEventListener('toggle',updateGroup);header.appendChild(debug);
}
function mount(root=document){
 policy();for(const video of elements(root,'video[data-src]')){
  video.controls=true;video.playsInline=true;const box=shell(video);box?.classList.add('media-shell');for(const button of box?.querySelectorAll('.media-load')||[])button.remove();
  if(!bound.has(video)){
   bound.add(video);video.muted=true;video.loop=true;video.preload=video.dataset.buffer==='blob'?'none':'metadata';
   video.addEventListener('playing',()=>{const s=state(video);s.phase='playing';s.playPending=false;s.error='';clearTimeout(s.playTimer);box?.classList.remove('is-loading');box?.classList.add('is-playing');status(video,'');updateGroup();});
   video.addEventListener('play',()=>{const s=state(video);s.wantPlay=true;s.userPaused=false;updateGroup();});
   video.addEventListener('pause',()=>{const s=state(video);if(s.phase==='playing'&&!video.ended){s.userPaused=true;s.wantPlay=false;s.phase='ready';}box?.classList.remove('is-playing');updateGroup();});
   for(const name of ['loadeddata','canplay'])video.addEventListener(name,()=>{const s=state(video);if(s.phase!=='playing')s.phase='ready';updateGroup();});
   video.addEventListener('waiting',()=>{const s=state(video);if(video.hasAttribute('src'))status(video,s.loaded&&video.dataset.buffer==='blob'?'文件已下载，等待解码…':'正在缓冲…');updateGroup();});
   video.addEventListener('error',()=>{if(!video.hasAttribute('src'))return;const s=state(video);s.phase='decode-error';s.playPending=false;s.error='MediaError '+(video.error?.code||'')+': '+(video.error?.message||'');box?.classList.remove('is-loading');status(video,'浏览器解码失败；可点“全部播放”重试，或打开原生视频。');updateGroup();});
  }
  observer?.observe(video);if(!hidden(video)&&(video.dataset.buffer==='blob'||playAllActive||inView(video)))revealVideo(video);
 }
 for(const img of elements(root,'img[data-src]')){img.loading='lazy';img.decoding='async';observer?.observe(img);showImage(img);}fetchPosters();updateGroup();
}
if(typeof MutationObserver==='function')new MutationObserver(changes=>{for(const c of changes)for(const node of c.removedNodes)if(node.nodeType===1&&!node.isConnected){release(node);for(const el of elements(node,'video,img[data-src]'))observer?.unobserve(el);}}).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('toggle',event=>{if(event.target?.tagName==='DETAILS'){if(event.target.open)mount(event.target);else release(event.target);}},true);
window.ReviewMedia={mount,release,playAll,pauseAll,replayAll:()=>playAll(true),diagnostics};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mount(document),{once:true});else mount(document);
})();
