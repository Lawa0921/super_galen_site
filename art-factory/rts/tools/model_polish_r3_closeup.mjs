// Extreme close-ups of one node from several directions in the /games/rts/models/ viewer (round 3 nit checks).
// Usage: node art-factory/rts/tools/model_polish_r3_closeup.mjs <phase> <model> <node> [clip] [frames] [zoom] [port]
// Writes tmp/rts/visual-model-polish/<phase>/<model>-<node>-<clip>-<frame>-<dir>.png (single Chromium, no video).
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const [phase='r3-close',model='worker',node='ProceduralGauntlet_R',clip='Idle',frames='0',zoom='0.5',port='4394']=process.argv.slice(2);
const out=`tmp/rts/visual-model-polish/${phase}`;await mkdir(out,{recursive:true});
const DIRS={front:[0,.1,-1],back:[0,.15,1],left:[-1,.2,0],right:[1,.2,0],top:[.2,1,.2],under:[.3,-.6,-.5]};
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu']});
try{
  const page=await browser.newPage({viewport:{width:900,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/games/rts/models/#${model}`,{timeout:300000});
  await page.waitForFunction(()=>!!window.rtsModelViewer,null,{timeout:300000});
  await page.evaluate(id=>window.rtsModelViewer.select(id),model);await page.waitForTimeout(800);
  if(await page.locator('#rmv-play').isEnabled()&&(await page.locator('#rmv-play').textContent())==='暫停')await page.click('#rmv-play');
  await page.selectOption('#rmv-light','studio');
  const clips=await page.locator('#rmv-clip option').allTextContents().catch(()=>[]);
  const option=clips.find(c=>c.split(' ')[0]===clip);if(option)await page.selectOption('#rmv-clip',{label:option});
  for(const f of frames.split(',')){
    await page.evaluate(v=>{const p=document.querySelector('#rmv-phase');if(p&&!p.disabled){p.value=String(v);p.dispatchEvent(new Event('input'));}},Number(f));
    for(const [name,dir] of Object.entries(DIRS)){
      await page.evaluate(({dir,zoom,node})=>{
        const v=window.rtsModelViewer,m=v.model();let target=m.root;m.root.traverse(o=>{if(o.name===node+'_LOD0')target=o;});if(node.startsWith('bone:'))target=m.root;
        m.root.updateWorldMatrix(true,true);const min=[1e9,1e9,1e9],max=[-1e9,-1e9,-1e9];
        target.traverse(o=>{if(!o.isMesh||!o.visible)return;const p=o.geometry.attributes.position,tmp=o.position.clone();
          for(let i=0;i<p.count;i+=Math.max(1,Math.floor(p.count/800))){tmp.fromBufferAttribute(p,i);if(o.isSkinnedMesh)o.applyBoneTransform(i,tmp);tmp.applyMatrix4(o.matrixWorld);const a=tmp.toArray();for(let k=0;k<3;k++){min[k]=Math.min(min[k],a[k]);max[k]=Math.max(max[k],a[k]);}}});
        let c=min.map((x,k)=>(x+max[k])/2),r=Math.hypot(...max.map((x,k)=>x-min[k]))/2;
        // node "bone:<name>" frames a 12 cm sphere around that bone (e.g. one hand of a two-hand host mesh).
        if(node.startsWith('bone:')){let bone;m.root.traverse(o=>{if(o.isBone&&o.name===node.slice(5))bone=o;});const p=bone.getWorldPosition(bone.position.clone());c=p.toArray();r=.12;}
        const len=Math.hypot(...dir),d=r/Math.sin(v.camera.fov*Math.PI/360)*zoom;
        v.camera.position.set(c[0]+dir[0]/len*d,c[1]+dir[1]/len*d,c[2]+dir[2]/len*d);v.controls.target.set(...c);v.camera.near=d/400;v.camera.far=d*40;v.camera.updateProjectionMatrix();v.controls.update();
      },{dir,zoom:Number(zoom),node});
      await page.waitForTimeout(250);await page.locator('#rmv-canvas').screenshot({path:`${out}/${model}-${node.replace(':','-')}-${clip}-${f}-${name}.png`});
    }
  }
  if(errors.length)console.error(errors);
}finally{await browser.close();}
