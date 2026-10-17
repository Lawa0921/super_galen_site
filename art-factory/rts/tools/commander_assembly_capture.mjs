import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const run='art-factory/rts/runs/commander-assembly/2026-10-14-v1';
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']});
try{
await mkdir(run+'/qa/browser',{recursive:true});const page=await browser.newPage({viewport:{width:1400,height:960}});const errors=[],shots=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4337/');await page.waitForFunction(()=>!!window.assemblyReview?.focusPart);
const floor=await page.evaluate(()=>window.assemblyReview.sweep());
for(const view of ['front','three-quarter','back','side','game']){await page.evaluate(view=>window.assemblyReview.set({clip:'Idle',fraction:0,view,zoom:1}),view);const file=`${run}/qa/browser/${view}.png`;await page.screenshot({path:file});shots.push(file);}
for(const clip of ['Walk','Attack','Hurt','Death','CastCleave','CastMend','CastBanner'])for(const fraction of [.25,.5,.75,1]){await page.evaluate(o=>window.assemblyReview.set(o),{clip,fraction,view:'three-quarter',zoom:1});const file=`${run}/qa/browser/${clip}-${fraction*100}.png`;await page.screenshot({path:file});shots.push(file);}
await page.evaluate(()=>window.assemblyReview.set({clip:'Idle',fraction:0,lod:1,team:1,view:'three-quarter',zoom:1.4}));await page.screenshot({path:run+'/qa/browser/lod1-red.png'});shots.push(run+'/qa/browser/lod1-red.png');
await page.close();
for(const lod of [0,1])for(const side of ['R','L'])for(const [clip,fraction,angle] of [['Idle',0,'outer'],['Idle',0,'back'],['Attack',.5,'back'],['Death',.5,'back'],['Death',1,'outer']]){
  const p=await browser.newPage({viewport:{width:1400,height:960}});p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:4337/');await p.waitForFunction(()=>!!window.assemblyReview?.focusPart);
  await p.evaluate(o=>{window.assemblyReview.focusPart(o.lod,o.clip,o.fraction,o.side,o.angle);document.querySelector('.labels').innerHTML='<span>完整裝配候選：'+o.side+' 手／前臂</span>';},{lod,clip,fraction,side,angle});
  const file=`${run}/qa/browser/hand-${side}-lod${lod}-${clip}-${fraction*100}-${angle}.png`;await p.screenshot({path:file});shots.push(file);await p.close();
}
for(const lod of [0,1])for(const fraction of [.25,.5,.75,1])for(const angle of ['top','back']){
  const p=await browser.newPage({viewport:{width:1400,height:960}});await p.goto('http://127.0.0.1:4337/');await p.waitForFunction(()=>!!window.assemblyReview?.focusPart);
  await p.evaluate(o=>{window.assemblyReview.focusPart(o.lod,'Death',o.fraction,'all',o.angle);document.querySelector('.labels').innerHTML='<span>完整裝配候選：倒地姿勢</span>';},{lod,fraction,angle});
  const file=`${run}/qa/browser/death-lod${lod}-${fraction*100}-${angle}.png`;await p.screenshot({path:file});shots.push(file);await p.close();
}
const assets=await Promise.all([0,1].map(async lod=>({lod,sha256:createHash('sha256').update(await readFile(`${run}/candidate/commander-lod${lod}.glb`)).digest('hex')})));
await writeFile(run+'/qa/browser.json',JSON.stringify({shots,errors,assets,floor},null,2));assert.equal(errors.length,0);console.log(JSON.stringify({shots:shots.length,errors}));
}finally{await browser.close();}
