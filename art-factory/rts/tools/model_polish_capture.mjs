// Close-up captures of the /games/rts/models/ viewer for the model polish review (single Chromium, no video/trace).
// Usage: node art-factory/rts/tools/model_polish_capture.mjs <phase> [id,id,...] [port]
// Per model: studio front / three-quarter / game-view framing, game-lighting front, a facade close-up for buildings
// and a three-quarter close-up of every equipment node for units. Writes PNGs + stats.json to
// tmp/rts/visual-model-polish/<phase>/.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const phase=process.argv[2]??'after';
const ids=(process.argv[3]??'worker,guard,crossbow,knight,priest,neutral-raider,commander,barracks,townhall,townhall-tier2,townhall-tier3').split(',');
const port=process.argv[4]??'4394';
const out=`tmp/rts/visual-model-polish/${phase}`;await mkdir(out,{recursive:true});
const EQUIPMENT={worker:['WorkerCraftAxe'],guard:['KingdomSteelSword','KingdomSunShield'],crossbow:['ProceduralCrossbow'],
  knight:['KnightLance','KnightSunShield'],priest:['PriestDawnStaff'],'neutral-raider':['RaiderShortAxe'],commander:['CommanderLongsword','CommanderDawnShield']};
const BUILDINGS=new Set(['barracks','townhall','townhall-tier2','townhall-tier3','river-gatehouse','river-shrine','highland-watchtower','quarry-ruins','stone-bridge','gold-mine','timber-pile']);
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']});
const rows=[],errors=[];
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/games/rts/models/#${ids[0]}`,{timeout:300000});
  await page.waitForFunction(()=>!!window.rtsModelViewer,null,{timeout:300000});
  const canvas=page.locator('#rmv-canvas');
  // Frame a world-space box (whole model or one named node) from a direction; zoom < 1 moves closer.
  const frame=(dir,zoom,node)=>page.evaluate(({dir,zoom,node})=>{
    const v=window.rtsModelViewer,m=v.model();
    let target=m.root;if(node){m.root.traverse(o=>{if(o.name===node+'_LOD0')target=o;});}
    m.root.updateWorldMatrix(true,true);
    // Box3 via geometry bounds of visible meshes under target (skinned meshes use their current pose).
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    target.traverse(o=>{if(!o.isMesh||!o.visible)return;const g=o.geometry,p=g.attributes.position,tmp=o.position.clone();
      for(let i=0;i<p.count;i+=Math.max(1,Math.floor(p.count/600))){tmp.fromBufferAttribute(p,i);if(o.isSkinnedMesh)o.applyBoneTransform(i,tmp);tmp.applyMatrix4(o.matrixWorld);
        const a=tmp.toArray();for(let k=0;k<3;k++){min[k]=Math.min(min[k],a[k]);max[k]=Math.max(max[k],a[k]);}}});
    const c=min.map((x,k)=>(x+max[k])/2),r=Math.hypot(...max.map((x,k)=>x-min[k]))/2;
    const len=Math.hypot(...dir),d=r/Math.sin(v.camera.fov*Math.PI/360)*zoom;
    v.camera.position.set(c[0]+dir[0]/len*d,c[1]+dir[1]/len*d,c[2]+dir[2]/len*d);v.controls.target.set(...c);
    v.camera.near=d/200;v.camera.far=d*40;v.camera.updateProjectionMatrix();v.controls.update();return {c,r};
  },{dir,zoom,node});
  const shot=async name=>{await page.waitForTimeout(300);await canvas.screenshot({path:`${out}/${name}.png`});};
  for(const id of ids){
    await page.evaluate(id=>window.rtsModelViewer.select(id),id);
    if(await page.locator('#rmv-play').isEnabled()&&(await page.locator('#rmv-play').textContent())==='暫停')await page.click('#rmv-play');
    await page.evaluate(()=>{const p=document.querySelector('#rmv-phase');if(p&&!p.disabled){p.value='0';p.dispatchEvent(new Event('input'));}});
    const building=BUILDINGS.has(id),front=building?[0,.28,1]:[0,.12,-1],tq=building?[1,.55,1]:[.85,.3,-1];
    for(const light of ['studio','game']){
      await page.selectOption('#rmv-light',light);
      await frame(front,1.0);await shot(`${id}-${light}-front`);
      if(light==='studio'){
        await frame(tq,1.0);await shot(`${id}-${light}-3q`);
        await page.evaluate(()=>window.rtsModelViewer.setView('game'));await shot(`${id}-${light}-game`);
        if(building){await frame([.35,.18,1],.42);await shot(`${id}-${light}-facade-close`);await frame([1,.25,.35],.42);await shot(`${id}-${light}-side-close`);}
        for(const node of EQUIPMENT[id]??[]){await frame([.75,.25,-1],.95,node);await shot(`${id}-${light}-${node}-3q`);await frame([0,.05,-1],.95,node);await shot(`${id}-${light}-${node}-front`);}
      }else{await page.evaluate(()=>window.rtsModelViewer.setView('game'));await shot(`${id}-${light}-game`);}
    }
    const stats=[];for(const lod of [0,1]){await page.evaluate(l=>window.rtsModelViewer.setLod(l),lod);stats.push(await page.evaluate(()=>window.rtsModelViewer.stats()));}
    await page.evaluate(()=>window.rtsModelViewer.setLod(0));
    rows.push({id,lod0:stats[0],lod1:stats[1]});console.log(id,stats[0].triangles,stats[1].triangles,stats[0].materials,stats[0].drawCalls,stats[0].maxTextureSize);
  }
}finally{await writeFile(`${out}/stats.json`,JSON.stringify({phase,errors,rows},null,2));await browser.close();}
if(errors.length){console.error(errors);process.exit(1);}
