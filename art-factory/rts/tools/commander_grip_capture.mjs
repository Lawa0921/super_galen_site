import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const run='art-factory/rts/runs/commander-grip/2026-10-14-v1';
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']});
try{
const page=await browser.newPage({viewport:{width:1400,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4336/');await page.waitForFunction(()=>!!window.gripReview,{},{timeout:60000});
await mkdir(run+'/qa/browser',{recursive:true});const shots=[];
for(const view of ['front','three-quarter','back','side','game']){
await page.evaluate(view=>window.gripReview.set({clip:'Idle',fraction:0,view}),view);const file=`${run}/qa/browser/${view}.png`;await page.screenshot({path:file});shots.push(file);
}
for(const clip of ['Walk','Attack','Hurt','Death','CastCleave','CastMend','CastBanner'])for(const fraction of [.25,.5,.75,1]){
await page.evaluate(o=>window.gripReview.set(o),{clip,fraction,view:'three-quarter'});const file=`${run}/qa/browser/${clip}-${fraction*100}.png`;await page.screenshot({path:file});shots.push(file);
}
await page.evaluate(()=>window.gripReview.set({clip:'Idle',fraction:0,lod:1,team:1,view:'three-quarter'}));await page.screenshot({path:run+'/qa/browser/lod1-red.png'});shots.push(run+'/qa/browser/lod1-red.png');
await page.evaluate(()=>window.gripReview.set({clip:'Idle',fraction:0,lod:0,team:0,view:'front',zoom:1.65}));await page.screenshot({path:run+'/qa/browser/grip-close.png'});shots.push(run+'/qa/browser/grip-close.png');
for(const lod of [0,1])for(const [clip,fraction] of [['Idle',0],['Death',.25],['Death',.5],['Death',1]]){
await page.evaluate(o=>window.gripReview.set(o),{clip,fraction,lod,team:0,view:'side',zoom:1.65});
const file=`${run}/qa/browser/wrist-lod${lod}-${clip}-${fraction*100}.png`;await page.screenshot({path:file});shots.push(file);
}
const sweep=await page.evaluate(()=>window.gripReview.sweep());
const assets=await Promise.all([0,1].map(async lod=>({lod,sha256:createHash('sha256').update(await readFile(`${run}/candidate/commander-lod${lod}.glb`)).digest('hex')})));
await writeFile(run+'/qa/browser.json',JSON.stringify({shots,sweep,errors,assets},null,2));
assert.equal(errors.length,0);assert.equal(sweep.length,16);
for(const r of sweep){assert(r.afterFloor>=-.001,`Sword ground penetration ${r.clip} LOD${r.lod}: ${r.afterFloor}m`);assert(r.additionalPenetration<.001,`New sword floor regression ${r.additionalPenetration}m`);}
console.log(JSON.stringify({shots:shots.length,errors,swordMinimumHeight:Math.min(...sweep.map(r=>r.afterFloor))}));
}finally{await browser.close();}
