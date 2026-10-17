// Hand close-ups of every humanoid unit in the /games/rts/models/ viewer (single Chromium, no video/trace).
// Usage: node art-factory/rts/tools/model_hands_capture.mjs <phase> [id,id,...] [port] [lod]
// For each unit, clip and key phase it frames each hand (vertices dominated by Hand_L / Hand_R within 0.16 m of the
// bone, i.e. glove + palm + the held grip) from the front and from the hand's own three-quarter side, in studio light;
// the Idle and Attack key frames are repeated under game lighting. Env: HANDS_VIEWS (front,3q,back), HANDS_CLIPS, HANDS_SIDES. Writes 420 px JPEG crops + shots.json to
// tmp/rts/visual-hands/<phase>/.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const phase=process.argv[2]??'after';
const ids=(process.argv[3]??'worker,guard,crossbow,knight,priest,neutral-raider,commander').split(',');
const port=process.argv[4]??'4394';
const lod=Number(process.argv[5]??0);
const out=`tmp/rts/visual-hands/${phase}${lod?'-lod1':''}`;await mkdir(out,{recursive:true});
// Key phases per clip (fraction of the clip). Death is skipped: the body is on the ground and hands are not posed.
const PHASES={Idle:[0],Walk:[.25,.75],Attack:[.3,.55],Hurt:[.4],Cast:[.5],CastCleave:[.5],CastMend:[.5],CastBanner:[.5],Mine:[.35,.7],Chop:[.35,.7],Build:[.35,.7]};
const GAME_LIGHT=new Set(['Idle','Attack']);
const VIEWS=(process.env.HANDS_VIEWS??'front,3q,back').split(','),CLIPS=process.env.HANDS_CLIPS?.split(','),SIDES=(process.env.HANDS_SIDES??'R,L').split(',');
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']});
const shots=[],errors=[];
try{
  const page=await browser.newPage({viewport:{width:1100,height:820}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/games/rts/models/#${ids[0]}`,{timeout:300000});
  await page.waitForFunction(()=>!!window.rtsModelViewer,null,{timeout:300000});
  const canvas=page.locator('#rmv-canvas');
  // Frame one hand: world centre / radius of the skinned vertices dominated by that hand bone near the bone.
  const ZOOM=Number(process.env.HANDS_ZOOM??1);
  const frameHand=(side,view)=>page.evaluate(({side,view,zoom})=>{
    const v=window.rtsModelViewer,m=v.model();m.root.updateWorldMatrix(true,true);
    let bone,unitCenter=[0,0,0],n=0;const pts=[];
    m.root.traverse(o=>{if(!o.isSkinnedMesh||!o.visible)return;const b=o.skeleton.bones.find(x=>x.name==='Hand_'+side);if(b&&!bone)bone=b;});
    if(!bone)return null;const bp=bone.getWorldPosition(bone.position.clone());
    m.root.traverse(o=>{if(!o.isSkinnedMesh||!o.visible)return;const g=o.geometry,p=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,tmp=bp.clone();
      const bi=o.skeleton.bones.indexOf(o.skeleton.bones.find(x=>x.name==='Hand_'+side));
      for(let i=0;i<p.count;i++){tmp.fromBufferAttribute(p,i);o.applyBoneTransform(i,tmp);tmp.applyMatrix4(o.matrixWorld);
        if(i%7===0){unitCenter[0]+=tmp.x;unitCenter[1]+=tmp.y;unitCenter[2]+=tmp.z;n++;}
        if(bi<0)continue;let best=0,bw=-1;for(let k=0;k<4;k++){const w=sw.getComponent(i,k);if(w>bw){bw=w;best=si.getComponent(i,k);}}
        if(best===bi&&tmp.distanceTo(bp)<.16)pts.push(tmp.clone());}});
    unitCenter=unitCenter.map(x=>x/n);
    const c=pts.length?pts.reduce((a,p)=>a.add(p),bp.clone().multiplyScalar(0)).multiplyScalar(1/pts.length):bp;
    const r=Math.max(.075,Math.min(.14,pts.reduce((a,p)=>Math.max(a,p.distanceTo(c)),0)));
    // Unit forward is -Z in the viewer; three-quarter view comes from the hand's own side.
    const sx=Math.sign(c.x-unitCenter[0])||1;
    const dir=view==='front'?[0,.1,-1]:view==='back'?[sx*.35,.25,1]:view==='side'?[sx,.15,-.25]:[sx*.85,.3,-1];
    const len=Math.hypot(...dir),d=r/Math.sin(v.camera.fov*Math.PI/360)*1.25*zoom;
    v.camera.position.set(c.x+dir[0]/len*d,c.y+dir[1]/len*d,c.z+dir[2]/len*d);v.controls.target.copy(c);
    v.camera.near=d/100;v.camera.far=d*60;v.camera.updateProjectionMatrix();v.controls.update();
    return {c:c.toArray(),r,points:pts.length};
  },{side,view,zoom:ZOOM});
  const shot=async name=>{await page.waitForTimeout(220);const box=await canvas.boundingBox();const s=Math.min(box.width,box.height);
    await page.screenshot({path:`${out}/${name}.jpg`,type:'jpeg',quality:86,clip:{x:box.x+(box.width-s)/2,y:box.y+(box.height-s)/2,width:s,height:s}});};
  for(const id of ids){
    await page.evaluate(id=>window.rtsModelViewer.select(id),id);
    await page.evaluate(l=>window.rtsModelViewer.setLod(l),lod);
    const clips=await page.$$eval('#rmv-clip option',o=>o.map(x=>x.value));
    for(const clip of clips){if(CLIPS&&!CLIPS.includes(clip))continue;
      for(const fraction of PHASES[clip]??[]){
        await page.selectOption('#rmv-clip',clip);
        await page.evaluate(f=>{const p=document.querySelector('#rmv-phase');p.value=String(Math.round(f*1000));p.dispatchEvent(new Event('input'));},fraction);
        for(const light of GAME_LIGHT.has(clip)?['studio','game']:['studio']){
          await page.selectOption('#rmv-light',light);
          for(const side of SIDES)for(const view of light==='game'?['3q']:VIEWS){
            const f=await frameHand(side,view);if(!f)continue;
            const name=`${id}-${clip}-${Math.round(fraction*100)}-${side}-${view}-${light}`;await shot(name);
            shots.push({id,clip,fraction,side,view,light,name,points:f.points,radius:f.r});
          }
        }
      }
    }
    console.log(id,shots.filter(s=>s.id===id).length);
  }
}finally{await writeFile(`${out}/shots.json`,JSON.stringify({phase,lod,errors,shots},null,2));await browser.close();}
if(errors.length){console.error(errors);process.exit(1);}
