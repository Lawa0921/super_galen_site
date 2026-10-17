/** Actual runtime skeleton overlays alongside animation poses, silent. */
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const phase=process.argv[2]??'skeletons',ids=process.argv[3]?.split(',')??['worker','guard','crossbow','priest','knight','siege','commander','neutral-raider'];
const folder='art-factory/rts/runs/all-models/2026-10-14-v1/qa/'+phase;
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:930}}),rows=[],errors=[],served=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(new URL(r.url()).pathname.endsWith('.glb'))served.push(r.body().then(bytes=>({url:r.url(),status:r.status(),sha256:createHash('sha256').update(bytes).digest('hex')})));});
 await page.goto('http://127.0.0.1:4338/?candidate=1');await page.waitForFunction(()=>!!window.allModels);
 for(const id of ids){
  const shots=[];
  for(const lod of [0,1]){
   const data=await page.evaluate(({id,lod})=>window.allModels.load(id,lod),{id,lod});
   for(const clip of ['Idle','Walk','Attack'].filter(c=>data.clips.includes(c))){
    await page.locator('#bones').check();
    await page.evaluate(o=>window.allModels.set(o),{clip,fraction:.5,lod,view:'three-quarter',bones:true,fit:true});
    const shot=`${id}-lod${lod}-${clip}-bones.png`;await page.screenshot({path:folder+'/'+shot});shots.push(shot);
   }
  }
  rows.push({id,shots});console.log(JSON.stringify({id,shots:shots.length}));
 }
 if(errors.length)throw new Error(errors.join('\n'));
 await writeFile(folder+'/skeletons.json',JSON.stringify({scope:'Actual game ModelInstance skeleton overlay; both LODs at Idle/Walk/Attack midpoint.',rows,errors,servedAssets:await Promise.all(served)},null,2));
}finally{await browser.close();}
