import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const run='art-factory/rts/runs/commander-shield/2026-10-14-v1';
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']});
try{
const page=await browser.newPage({viewport:{width:1400,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4335/');await page.waitForFunction(()=>!!window.shieldReview,{},{timeout:60000});
await mkdir(run+'/qa/browser',{recursive:true});const shots=[];
for(const view of ['front','three-quarter','back','side','game']){
await page.evaluate(view=>window.shieldReview.set({clip:'Idle',fraction:0,view}),view);const file=`${run}/qa/browser/${view}.png`;await page.screenshot({path:file});shots.push(file);
}
for(const clip of ['Attack','Death','CastCleave','CastMend','CastBanner'])for(const fraction of [.25,.5,.75,1]){
await page.evaluate(o=>window.shieldReview.set(o),{clip,fraction,view:'three-quarter'});const file=`${run}/qa/browser/${clip}-${fraction*100}.png`;await page.screenshot({path:file});shots.push(file);
}
await page.evaluate(()=>window.shieldReview.set({clip:'Idle',fraction:0,lod:1,team:1,view:'three-quarter'}));await page.screenshot({path:run+'/qa/browser/lod1-red.png'});
const sweep=await page.evaluate(()=>window.shieldReview.sweep());
await writeFile(run+'/qa/browser.json',JSON.stringify({shots,sweep,errors},null,2));
console.log(JSON.stringify({shots:shots.length+1,errors,sweep}));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
