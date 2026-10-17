/** Decode/play the actual Blender before/after films, and capture precise witnesses. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';

const exterior=process.argv.includes('--exterior-tangent');
const attackStart=process.argv.includes('--attack-start')||exterior;
const run=exterior?'2026-10-08-v29-attack-start-exterior-tangent':attackStart?'2026-10-08-v28-authored-attack-start-arc':'2026-10-08-v25-authored-attack';
const root = path.resolve(`art-factory/rts/runs/guard-right-hand-cage/${run}/qa/motion`);
const names = ['front', 'oblique'].flatMap(view => ['normal','quarter'].map(speed => `compare-${view}-${speed}.mp4`));
const sha = data => createHash('sha256').update(data).digest('hex');
const html = `<!doctype html><meta charset="utf-8"><title>內部攻擊動作比較</title>
<style>body{margin:0;background:#181818;color:#eee;font:16px sans-serif}main{width:1024px;margin:12px auto}header{display:flex;gap:16px;align-items:center;margin-bottom:8px}.labels{display:flex;text-align:center;padding:8px}.labels span{width:50%}video{display:block;width:1024px;height:640px;background:#202020}button,select{font:inherit;padding:5px 10px}p{color:#aaa;font-size:13px}</style>
<main><header><strong>Attack 動作內部檢查</strong><select id="view"><option value="front">正面</option><option value="oblique">前側</option></select><select id="speed"><option value="normal">1×</option><option value="quarter">0.25×</option></select><button id="play">播放</button></header><div class="labels"><span>原動作</span><span>作者修訂</span></div><video id="film" muted playsinline controls preload="auto"></video><p>固定相機、相同原創模型。這是動作檢查用影片，未批准角色美術或 runtime 替換。</p></main>
<script>const film=document.querySelector('#film'),view=document.querySelector('#view'),speed=document.querySelector('#speed');function load(){film.src='compare-'+view.value+'-'+speed.value+'.mp4';film.load()}view.onchange=speed.onchange=load;document.querySelector('#play').onclick=()=>film.paused?film.play():film.pause();load();</script>`;
fs.writeFileSync(path.join(root, 'motion-review.html'), html);
const browser = await chromium.launch({headless: true});
const reports = [];
try {
  const page = await browser.newPage({viewport: {width: 1080, height: 790}, deviceScaleFactor: 1});
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('http://rts-motion.review/**', async route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (!name) return route.fulfill({contentType:'text/html', body:html});
    if (!names.includes(name)) return route.fulfill({status:404,body:'Not found'});
    const bytes = fs.readFileSync(path.join(root,name));
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
    if(range) {
      const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):bytes.length-1,bytes.length-1);
      if(start>end)return route.fulfill({status:416,headers:{'Content-Range':`bytes */${bytes.length}`},body:''});
      return route.fulfill({status:206,contentType:'video/mp4',headers:{'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${bytes.length}`},body:bytes.subarray(start,end+1)});
    }
    return route.fulfill({contentType:'video/mp4', headers:{'Accept-Ranges':'bytes'},body:bytes});
  });
  await page.goto('http://rts-motion.review/');
  for (const view of ['front','oblique']) for (const speed of ['normal','quarter']) {
    await page.selectOption('#view', view);
    await page.selectOption('#speed', speed);
    await page.waitForFunction(() => document.querySelector('#film').readyState >= 3);
    const playback = await page.evaluate(async () => {
      const video=document.querySelector('#film');
      video.currentTime=0;
      let frames=0,first=null,last=null,active=true;
      const tick=(_now,meta)=>{if(!active)return;frames++;first??=meta.mediaTime;last=meta.mediaTime;video.requestVideoFrameCallback(tick)};
      video.requestVideoFrameCallback(tick);
      const ended=new Promise((resolve,reject)=>{video.onended=resolve;video.onerror=()=>reject(Error('Video decode failed'))});
      const started=performance.now();await video.play();await ended;active=false;
      return {frames,first,last,wallMs:performance.now()-started,duration:video.duration,width:video.videoWidth,height:video.videoHeight,ended:video.ended,error:video.error?.message??null};
    });
    if (playback.error || playback.frames < 20 || !playback.ended || playback.width !== 1024 || Math.abs(playback.duration-(speed==='normal'?1.2:4.8))>.01) throw Error(JSON.stringify(playback));
    reports.push({view,speed,...playback,file:`compare-${view}-${speed}.mp4`,sha256:sha(fs.readFileSync(path.join(root,`compare-${view}-${speed}.mp4`)))});
  }
  await page.selectOption('#view','oblique');
  await page.selectOption('#speed','quarter');
  await page.waitForFunction(() => document.querySelector('#film').readyState >= 3);
  const witnesses=[];
  for(const frame of (attackStart?[.25,.5,1,1.5,2,2.5,3,3.5,4,4.5]:[9,10,10.5,10.75,11,11.5,12,13.25,16,18])) {
    const seek = await page.evaluate(async frame=>{
      const video=document.querySelector('#film');video.pause();video.controls=false;
      const target=frame/30*4;
      const seeked=new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));
      video.currentTime=target;await seeked;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(Math.abs(video.currentTime-target)>.001||video.readyState<2)throw Error(`Seek failed: ${video.currentTime} wanted ${target}`);
      return {frame,target,currentTime:video.currentTime,readyState:video.readyState};
    },frame);
    witnesses.push(seek);
    await page.screenshot({path:path.join(root,`browser-compare-${String(frame).replace('.','_')}.png`)});
  }
  if(errors.length)throw Error(errors.join('\n'));
  const report={status:'actual_browser_video_playback_verified_visual_decision_separate',runtime_publish_allowed:false,errors,playbacks:reports,seek_witnesses:witnesses};
  fs.writeFileSync(path.join(root,'browser-playback.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {await browser.close()}
