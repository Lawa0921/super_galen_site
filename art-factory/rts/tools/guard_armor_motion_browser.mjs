/** Play and seek the actual Blender armor films; visual approval is separate. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';

const root = path.resolve('art-factory/rts/runs/guard-right-hand-cage/2026-10-08-v33-armor-sleeve-winding/qa/motion');
const sha = data => createHash('sha256').update(data).digest('hex');
const encoding = JSON.parse(fs.readFileSync(path.join(root, 'encoding-sources.json'), 'utf8'));
for (const video of encoding.videos) if (sha(fs.readFileSync(path.join(root,video.file))) !== video.sha256) throw Error('Film changed');
const html = `<!doctype html><meta charset="utf-8"><title>護甲動作內部檢查</title>
<style>body{margin:0;background:#181818;color:#eee;font:16px sans-serif}main{width:1200px;margin:12px auto}.labels{display:flex;text-align:center;padding:8px}.labels span{width:50%}video{display:block;width:1200px;height:750px}select,button{font:inherit;margin:8px}</style>
<main><strong>Death 護甲動作內部檢查</strong><select id="speed"><option value="normal">1×</option><option value="quarter">0.25×</option></select><button id="play">播放</button><div class="labels"><span>原始護甲跟隨旋轉</span><span>有界旋轉修正</span></div><video id="film" muted playsinline controls preload="auto"></video></main>
<script>const film=document.querySelector('#film'),speed=document.querySelector('#speed');function load(){film.src='compare-'+speed.value+'.mp4';film.load()}speed.onchange=load;document.querySelector('#play').onclick=()=>film.paused?film.play():film.pause();load();</script>`;
fs.writeFileSync(path.join(root,'motion-review.html'),html);
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:1240,height:850},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.route('http://rts-armor.review/**', async route=>{
    const name=new URL(route.request().url()).pathname.slice(1);
    if (!name) return route.fulfill({contentType:'text/html',body:html});
    if (!encoding.videos.some(v=>v.file===name)) return route.fulfill({status:404,body:'Not found'});
    const bytes=fs.readFileSync(path.join(root,name));
    const range=route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):bytes.length-1,bytes.length-1);
      if(start>end)return route.fulfill({status:416,headers:{'Content-Range':`bytes */${bytes.length}`},body:''});
      return route.fulfill({status:206,contentType:'video/mp4',headers:{'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${bytes.length}`},body:bytes.subarray(start,end+1)});
    }
    return route.fulfill({contentType:'video/mp4',body:bytes});
  });
  await page.goto('http://rts-armor.review/');
  const playbacks=[];
  for (const speed of ['normal','quarter']) {
    await page.selectOption('#speed',speed);
    await page.waitForFunction(()=>document.querySelector('#film').readyState>=3);
    const result=await page.evaluate(async()=>{
      const video=document.querySelector('#film');video.currentTime=0;
      let frames=0,active=true;
      const tick=()=>{if(!active)return;frames++;video.requestVideoFrameCallback(tick)};
      video.requestVideoFrameCallback(tick);
      const ended=new Promise((resolve,reject)=>{video.onended=resolve;video.onerror=()=>reject(Error('Video decode error'))});
      await video.play();await ended;active=false;
      return {frames,ended:video.ended,duration:video.duration,width:video.videoWidth,height:video.videoHeight,error:video.error?.message??null};
    });
    if(result.error||!result.ended||result.frames<20||result.width!==1200||Math.abs(result.duration-(speed==='normal'?1.6:6.4))>.01)throw Error(JSON.stringify(result));
    playbacks.push({speed,...result});
  }
  const witnesses=[];
  for(const frame of [10,14,15,15.5,16,17,22,36,47.5]) {
    const seek=await page.evaluate(async frame=>{
      const video=document.querySelector('#film');video.pause();video.controls=false;
      const target=frame/30*4;
      const seeked=new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));
      video.currentTime=target;await seeked;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(Math.abs(video.currentTime-target)>.001||video.readyState<2)throw Error('Seek failed');
      return {frame,target,currentTime:video.currentTime};
    },frame);
    const name=`browser-frame-${frame}.png`;
    await page.screenshot({path:path.join(root,name)});
    witnesses.push({...seek,file:name,sha256:sha(fs.readFileSync(path.join(root,name)))});
  }
  if(errors.length)throw Error(errors.join('\n'));
  const result={status:'actual_browser_decode_play_seek_passed',candidate_sha256:encoding.candidate_sha256,runtime_publish_allowed:false,errors,playbacks,witnesses};
  fs.writeFileSync(path.join(root,'browser-playback.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,playbacks,errors}));
} finally {await browser.close()}
