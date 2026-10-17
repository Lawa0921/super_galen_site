import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const run='art-factory/rts/runs/all-models/2026-10-14-v1';
const phase=process.argv[2]??'baseline',folder=run+'/qa/'+phase;
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']});
try{
  const page=await browser.newPage({viewport:{width:1400,height:930}}),errors=[],rows=[],servedAssets=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  page.on('response',response=>{if(new URL(response.url()).pathname.endsWith('.glb'))servedAssets.push(response.body().then(bytes=>({url:response.url(),status:response.status(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})));});
  await page.goto('http://127.0.0.1:4338/'+(phase==='baseline'?'':'?candidate=1'));await page.waitForFunction(()=>!!window.allModels);
  const ids=process.argv[3]?.split(',')??await page.evaluate(()=>window.allModels.ids);
  for(const id of ids){
    const data=await page.evaluate(id=>window.allModels.load(id),id),shots=[];
    for(const view of ['three-quarter','back','side']){
      await page.evaluate(view=>window.allModels.set({view}),view);const name=`${id}-${view}.png`;await page.screenshot({path:folder+'/'+name});shots.push(name);
    }
    let sweep=[];
    if(data.clips.length){
      sweep=await page.evaluate(samples=>window.allModels.sweep(samples),Number(process.argv[4]??31));
      for(const clip of data.clips)for(const fraction of [.5,1]){
        await page.evaluate(o=>window.allModels.set(o),{clip,fraction,view:'three-quarter',lod:0,fit:true});
        const name=`${id}-${clip}-${fraction*100}.png`;await page.screenshot({path:folder+'/'+name});shots.push(name);
      }
    }
    if(data.hasLod){await page.evaluate(id=>window.allModels.load(id,1,1),id);const name=`${id}-lod1-red.png`;await page.screenshot({path:folder+'/'+name});shots.push(name);}
    if(data.construction){
      await page.evaluate(id=>window.allModels.load(id),id);
      for(const progress of [0,.25,.5,.75,1]){
        await page.evaluate(progress=>window.allModels.set({progress,destruction:-1,view:'three-quarter'}),progress);
        const name=`${id}-construction-${progress*100}.png`;await page.screenshot({path:folder+'/'+name});shots.push(name);
      }
      for(const destruction of [.5,1.2,3]){
        await page.evaluate(destruction=>window.allModels.set({progress:1,destruction}),destruction);
        const name=`${id}-destruction-${destruction}.png`;await page.screenshot({path:folder+'/'+name});shots.push(name);
      }
    }
    rows.push({id,data,sweep,shots});console.log(JSON.stringify({id,shots:shots.length,floor:sweep.length?Math.min(...sweep.map(r=>r.lowest)):data.minimum[1]}));
    await writeFile(folder+'/browser.json',JSON.stringify({phase,errors,rows,servedAssets:await Promise.all(servedAssets),sourceLock:JSON.parse(await readFile(run+'/source-lock.json','utf8'))},null,2));
  }
  assert.equal(rows.length,ids.length);assert.deepEqual(errors,[]);console.log(JSON.stringify({models:rows.length,shots:rows.reduce((n,r)=>n+r.shots.length,0),errors}));
}finally{await browser.close();}
