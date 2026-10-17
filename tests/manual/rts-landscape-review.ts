/** Actual Battlefield assembly capture. Reveal mode changes only the view copy;
 * this is visual QA, not a natural-gameplay acceptance test. */
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
const folder=process.argv[2];if(!folder)throw new Error('Expected output directory');
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-gpu','--force_high_performance_gpu']});
try{
  const results=[];
  for(const id of ['river','pass']){
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors:string[]=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE_ERROR',e.message);});
    page.on('console',m=>{if(m.type()==='error'&&/THREE|shader/i.test(m.text()))errors.push(m.text());});
    if(process.argv.includes('--candidate-landmark-kit')){
      const candidate='art-factory/rts/runs/landmark-kit/2026-10-08-v1/candidate',ids=['river-gatehouse','river-shrine','highland-watchtower','quarry-ruins'];
      await page.route('**/assets/games/rts/model-registry.json',async route=>{
        const manifest=JSON.parse(await readFile('public/assets/games/rts/model-registry.json','utf8'));
        for(const name of ids)manifest.assets[name]={url:`/assets/games/rts/models/${name}.glb`,lod1:`/assets/games/rts/models/${name}-lod1.glb`,status:'published',scale:1,yaw:0};
        delete manifest.landscape?.ruins;await route.fulfill({json:manifest});
      });
      await page.route('**/assets/games/rts/models/*.glb',async route=>{
        const name=new URL(route.request().url()).pathname.split('/').at(-1)!,id=name.replace(/(?:-lod1)?\.glb$/,'');
        if(ids.includes(id))await route.fulfill({contentType:'model/gltf-binary',path:`${candidate}/${id}-${name.endsWith('-lod1.glb')?'lod1':'lod0'}.glb`});else await route.continue();
      });
    }
    if(process.argv.includes('--candidate-modular')){
      const candidate='art-factory/rts/runs/modular-kingdom/2026-10-08-v1/candidate',files=new Set(await readdir(candidate));
      await page.route('**/assets/games/rts/models/*.glb',async route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1)!;if(files.has(name))await route.fulfill({contentType:'model/gltf-binary',path:`${candidate}/${name}`});else await route.continue();});
    }
    if(process.argv.includes('--candidate-detail')){
      const candidate='art-factory/rts/runs/detail-refinement/2026-10-07-v1/candidate',files=new Set(await readdir(candidate));
      await page.route('**/assets/games/rts/models/*.glb',async route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1)!;if(files.has(name))await route.fulfill({contentType:'model/gltf-binary',path:`${candidate}/${name}`});else await route.continue();});
      await page.route('**/assets/games/rts/materials/detail-v1/*',route=>route.fulfill({path:`${candidate}/materials/${new URL(route.request().url()).pathname.split('/').at(-1)!}`}));
    }
    if(process.argv.includes('--candidate-undergrowth')){
      await page.route('**/assets/games/rts/model-registry.json',async route=>{const manifest=JSON.parse(await readFile('public/assets/games/rts/model-registry.json','utf8'));manifest.landscape={undergrowth:{url:'/assets/games/rts/terrain/valley-undergrowth.webp',status:'published'},ruins:{url:'/assets/games/rts/terrain/kingdom-ruins.webp',status:'published'}};await route.fulfill({json:manifest});});
      await page.route('**/assets/games/rts/terrain/valley-undergrowth.webp',route=>route.fulfill({contentType:'image/webp',path:'art-factory/rts/runs/landscape-districts/2026-10-07-v1/candidate/valley-undergrowth.webp'}));
      await page.route('**/assets/games/rts/terrain/kingdom-ruins.webp',route=>route.fulfill({contentType:'image/webp',path:'art-factory/rts/runs/landscape-landmarks/2026-10-07-v1/candidate/kingdom-ruins.webp'}));
    }
    if(process.argv.includes('--candidate-pine')){
      await page.route('**/assets/games/rts/model-registry.json',async route=>{
        const manifest=JSON.parse(await readFile('public/assets/games/rts/model-registry.json','utf8'));
        manifest.assets.pine={url:'/assets/games/rts/models/pine.glb',status:'published',scale:1,yaw:0};
        await route.fulfill({json:manifest});
      });
      await page.route('**/assets/games/rts/models/pine.glb',route=>route.fulfill({contentType:'model/gltf-binary',path:'art-factory/rts/runs/highland-pine/2026-10-06-v1/candidate/pine.glb'}));
    }
    if(process.argv.includes('--candidate-materials'))await page.route('**/assets/games/rts/terrain/*.webp',async route=>{
      const name=new URL(route.request().url()).pathname.split('/').at(-1)!;
      if(['lush-grass.webp','forest-floor.webp','river-shingle.webp','highland-scree.webp'].includes(name))await route.fulfill({contentType:'image/webp',body:await readFile(`art-factory/rts/runs/landscape-enrichment/2026-10-05/candidate/${name}`)});
      else await route.continue();
    });
    await page.goto(`${process.env.RTS_BASE_URL??'http://127.0.0.1:4321'}/games/rts`);
    await page.waitForLoadState('networkidle');
    await page.addScriptTag({type:'module',content:`
      const mainPath='/src/scripts/games/rts/main.ts';
      const source=await (await fetch(mainPath)).text();
      const scenePath=source.match(new RegExp('from "([^"]*scene[.]ts[^"]*)"'))[1];
      const simulationPath=source.match(new RegExp('from "([^"]*simulation[.]ts[^"]*)"'))[1];
      const {Battlefield}=await import(scenePath),{mountRts}=await import(mainPath);
      const {createGame}=await import(simulationPath);
      const original=Battlefield.prototype.render;
      const audit={reveal:false,field:null,view:null};window.landscapeAudit=audit;
      Battlefield.prototype.render=function(view,dt,alpha){audit.field=this;audit.view=view;
        return original.call(this,audit.reveal?{...view,visible:new Uint8Array(96*96).fill(1),explored:new Uint8Array(96*96).fill(1)}:view,dt,alpha);
      };
      const old=document.getElementById('rts'),root=old.cloneNode(true);old.replaceWith(root);mountRts(root,(...args)=>{const state=createGame(...args);audit.state=state;return state;});`});
    await page.getByRole('radio',{name:id==='river'?/雙河谷地/:/灰脊隘口/}).check();
    await page.locator('#rts-start').click();await page.locator('#rts-battle').waitFor({state:'visible',timeout:60000});
    await page.waitForFunction(()=>!!(window as any).landscapeAudit?.field);
    await page.waitForTimeout(400);
    const select=await page.evaluate(()=>{const f=(window as any).landscapeAudit.field;return f.screen({x:17,z:53.5},1);});
    await page.mouse.click(select.x,select.y);await expect(page.locator('#rts-portrait-view')).toHaveAttribute('data-kind','worker');
    await expect(page.locator('#rts-selection h2')).toHaveText('工人');await page.screenshot({path:`${folder}/${id}-base.png`});
    const fog=await page.evaluate(()=>{const a=(window as any).landscapeAudit,props=a.field.props??[],batches:any[]=[];
      a.field.scene.traverse((o:any)=>{if(o.isInstancedMesh&&o.userData.sceneryKind&&!o.parent.userData.resourceId){const kind=o.userData.sceneryKind,all=[...a.field.map.scenery,...(a.field.map.landmarks??[])].filter((p:any)=>p.kind===kind);batches.push({kind,actual:o.count,expected:all.filter((p:any)=>a.view.explored[Math.floor(p.z)*96+Math.floor(p.x)]===1).length,total:all.length});}});
      for(const [resourceId,grove] of a.field.resourceGroves)for(const b of grove.batches)batches.push({kind:b.mesh.userData.sceneryKind,resourceId,actual:b.mesh.count,expected:Array.from(b.cells).filter((cell:any)=>a.view.explored[cell]===1).length,total:b.cells.length});
      return {explored:a.view.explored.filter(Boolean).length,visibleProps:props.filter((p:any)=>p.instance.root.visible).length,hiddenProps:props.filter((p:any)=>!p.instance.root.visible).length,batches};});
    expect(fog.batches.length).toBeGreaterThan(0);for(const batch of fog.batches){expect(batch.actual).toBe(batch.expected);if(!batch.resourceId)expect(batch.actual).toBeLessThan(batch.total);}
    const landmarkFog=await page.evaluate(()=>{const a=(window as any).landscapeAudit;return {actual:a.field.landmarks.root.children.filter((m:any)=>m.visible).length,expected:a.field.map.landmarks.filter((p:any)=>a.view.explored[Math.floor(p.z)*96+Math.floor(p.x)]).length};});
    expect(landmarkFog.actual).toBe(landmarkFog.expected);expect(landmarkFog.actual).toBe(1);
    await page.evaluate(()=>{const a=(window as any).landscapeAudit;a.reveal=true;a.field.focus({x:48,z:48});a.field.zoom(28);});
    await page.waitForTimeout(250);await page.screenshot({path:`${folder}/${id}-overview.png`});
    await page.evaluate((id)=>{const f=(window as any).landscapeAudit.field;f.focus({x:48,z:id==='river'?28:48});f.zoom(-36);},id);
    await page.waitForTimeout(250);await page.screenshot({path:`${folder}/${id}-crossing.png`});
    const details=await page.evaluate(()=>{const a=(window as any).landscapeAudit,f=a.field,r=f.renderer;let batches=0,instances=0;const revealed:any[]=[];f.scene.traverse((o:any)=>{if(o.isInstancedMesh){batches++;instances+=o.count;if(o.userData.sceneryKind&&!o.parent.userData.resourceId)revealed.push({kind:o.userData.sceneryKind,actual:o.count,expected:[...f.map.scenery,...(f.map.landmarks??[])].filter((p:any)=>p.kind===o.userData.sceneryKind).length});}});return {batches,instances,memory:r.info.memory,scenery:f.map.scenery?.length??0,revealed};});
    for(const batch of details.revealed)expect(batch.actual).toBe(batch.expected);
    expect(await page.evaluate(()=>(window as any).landscapeAudit.field.landmarks.root.children.filter((m:any)=>m.visible).length)).toBe(4);
    const landmarks=await page.evaluate(()=>{
      const f=(window as any).landscapeAudit.field;
      return f.landmarks.root.children.map((root:any,i:number)=>({assetId:root.userData.landmarkAssetId,position:root.position.toArray(),scale:root.scale.toArray(),lods:root.children.length,placement:f.map.landmarks[i]}));
    });
    for(const p of landmarks){expect(p.scale).toEqual([1,1,1]);expect(p.lods).toBe(2);expect(p.assetId).toBe(p.placement.assetId);expect(p.position).toEqual([p.placement.x,0,p.placement.z]);}
    for(const index of [0,2]){
      await page.evaluate(index=>{const f=(window as any).landscapeAudit.field;f.focus(f.map.landmarks[index]);f.span=13;f.updateCamera();},index);
      await page.waitForTimeout(150);await page.screenshot({path:`${folder}/${id}-landmark-${index}.png`});
    }
    const lodReview:any[]=[];
    if(process.argv.includes('--lod-review')){
      await page.locator('#rts-pause').click();
      // Keep the actual paused clock, but remove its modal overlay for asset QA.
      await page.evaluate(()=>(document.getElementById('rts-menu') as HTMLDialogElement).close());
      for(const index of [0,2])for(const pixels of [48,200]){
        const setup=await page.evaluate(({index,pixels})=>{
          const a=(window as any).landscapeAudit,f=a.field,item=f.landmarks.placements[index];
          f.focus(item.point);f.span=24;f.updateCamera();
          f.span*=Math.abs(f.screen(item.point,item.height).y-f.screen(item.point).y)/pixels;f.updateCamera();
          const point=f.screen(item.point,item.height/2),size=pixels===48?140:380;
          a.savedDetail=item.instance.setDetailPixels;a.lodInstance=item.instance;
          return {assetId:item.point.assetId,pixels:Math.abs(f.screen(item.point,item.height).y-f.screen(item.point).y),position:item.instance.root.position.toArray(),height:item.height,clip:{x:Math.round(point.x-size/2),y:Math.round(point.y-size/2),width:size,height:size}};
        },{index,pixels});
        expect(setup.pixels).toBeCloseTo(pixels,5);
        const frames=[];
        for(const lod of [0,1]){
          await page.evaluate(lod=>{const a=(window as any).landscapeAudit;a.lodInstance.setDetailPixels=function(){a.savedDetail.call(this,lod?47.999:48);};},lod);
          await page.waitForTimeout(100);
          const screenshot=`${folder}/${setup.assetId}-${pixels}px-lod${lod}.png`;
          await page.screenshot({path:screenshot,clip:setup.clip});
          const pose=await page.evaluate(()=>{const a=(window as any).landscapeAudit;return {matrix:a.lodInstance.root.matrixWorld.toArray(),visible:a.lodInstance.root.children.map((o:any)=>o.visible),time:a.view.time,camera:a.field.camera.matrixWorld.toArray(),projection:a.field.camera.projectionMatrix.toArray()};});
          expect(pose.visible).toEqual(lod?[false,true]:[true,false]);frames.push({lod,screenshot,...pose});
        }
        expect(frames[0].matrix).toEqual(frames[1].matrix);expect(frames[0].camera).toEqual(frames[1].camera);expect(frames[0].projection).toEqual(frames[1].projection);expect(frames[0].time).toBe(frames[1].time);
        await page.evaluate(()=>{const a=(window as any).landscapeAudit;a.lodInstance.setDetailPixels=a.savedDetail;});lodReview.push({...setup,frames});
      }
      await page.evaluate(()=>(document.getElementById('rts-menu') as HTMLDialogElement).showModal());
      await page.locator('#rts-resume').click();
    }
    const forest=await page.evaluate(()=>{const a=(window as any).landscapeAudit,f=a.field;f.focus({x:22.5,z:58.5});f.zoom(-100);
      const materialNames=new Set<string>(),foliage:any[]=[];let resourceTrees=0;
      for(const grove of f.resourceGroves.values()){resourceTrees+=grove.root.children[0].count;grove.root.traverse((o:any)=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){materialNames.add(m.name);if(m.alphaTest>0)foliage.push({instances:o.count,alphaTest:m.alphaTest,alphaToCoverage:m.alphaToCoverage,transparent:m.transparent});}});}
      const gl=f.renderer.getContext();return {resourceTrees,materialNames:[...materialNames],foliage,antialias:gl.getContextAttributes().antialias,samples:gl.getParameter(gl.SAMPLES)};
    });
    expect(forest.resourceTrees).toBe(24);expect(forest.foliage.length).toBe(2);expect(forest.foliage.reduce((n,m)=>n+m.instances,0)).toBe(24);
    if(id==='pass'){expect(forest.materialNames.sort()).toEqual(['PineBark','PineNeedles']);expect(forest.foliage.every((m:any)=>m.alphaToCoverage&&!m.transparent&&Math.abs(m.alphaTest-.48)<1e-5)).toBe(true);}
    else expect(forest.materialNames).not.toContain('PineNeedles');
    await page.waitForTimeout(250);await page.screenshot({path:`${folder}/${id}-forest.png`});
    if(process.argv.includes('--plant-detail')){
      console.log('PLANT',await page.evaluate(()=>{const f=(window as any).landscapeAudit.field,b=f.undergrowth.batches.find((b:any)=>b.plants[0].kind===1),p=b.plants.find((p:any)=>p.x<35&&p.z>30&&p.z<60);f.focus(p);f.span=8;f.updateCamera();const t=b.mesh.material.map;return {plant:p,texture:{size:[t.image.width,t.image.height],flipY:t.flipY,repeat:t.repeat.toArray(),offset:t.offset.toArray()},position:Array.from(b.mesh.geometry.attributes.position.array),uv:Array.from(b.mesh.geometry.attributes.uv.array)};}));
      await page.waitForTimeout(250);await page.screenshot({path:`${folder}/${id}-plant-detail.png`});
      if(process.argv.includes('--plant-debug')){console.log('MATRICES',await page.evaluate(()=>{const f=(window as any).landscapeAudit.field,m=f.undergrowth.material;m.alphaTest=.05;m.alphaToCoverage=false;m.needsUpdate=true;return f.undergrowth.batches.map((b:any)=>({kind:b.plants[0].kind,first:b.plants[0],matrix:Array.from(b.mesh.instanceMatrix.array.slice(0,16)),world:b.mesh.matrixWorld.toArray()}));}));await page.waitForTimeout(250);await page.screenshot({path:`${folder}/${id}-plant-debug.png`});}
      await page.evaluate(()=>{const f=(window as any).landscapeAudit.field;f.span=24;f.focus({x:22.5,z:58.5});});
    }
    // Controlled depletion fixture: a real mouse gather order consumes the last
    // four wood through the live simulation; no direct call hides scene props.
    const gather=await page.evaluate(()=>{const a=(window as any).landscapeAudit,f=a.field;a.reveal=false;const node=a.state.resources.find((r:any)=>r.kind==='wood'&&r.x<48);node.remaining=4;
      const grove=f.resourceGroves.get(node.id);
      for(let i=0;i<12;i++){const angle=i*2.39996,radius=2.8+(i%3)*1.25,point=f.screen({x:node.x+Math.cos(angle)*radius,z:node.z+Math.sin(angle)*radius},2.4);if(f.pick(point.x,point.y)?.resourceId===node.id)return {id:node.id,point,beforeVisible:grove.root.visible?grove.root.children[0].count:0};}
      throw new Error('No visible wood tree can be picked');
    });
    expect(gather.beforeVisible).toBe(12);await page.mouse.click(gather.point.x,gather.point.y,{button:'right'});
    await page.waitForFunction((id)=>{const a=(window as any).landscapeAudit;return a.state.entities.some((e:any)=>e.kind==='worker'&&e.team===0&&e.order.type==='gather'&&e.order.resourceId===id);},gather.id,{timeout:3000});
    await page.waitForFunction((id)=>{const a=(window as any).landscapeAudit;return a.state.resources.find((r:any)=>r.id===id).remaining===0&&!a.field.resourceGroves.get(id).root.visible&&!a.field.resources.get(id).root.visible;},gather.id,{timeout:30000});
    const depletion=await page.evaluate((id)=>{const a=(window as any).landscapeAudit,g=a.field.resourceGroves.get(id);return {resourceId:id,remaining:a.state.resources.find((r:any)=>r.id===id).remaining,hiddenTrees:g.root.visible?0:g.batches[0].matrices.length,timberVisible:a.field.resources.get(id).root.visible};},gather.id);
    expect(depletion.hiddenTrees).toBe(12);
    await page.screenshot({path:`${folder}/${id}-depleted.png`});
    expect(errors).toEqual([]);results.push({map:id,errors,fog,landmarkFog,landmarks,lodReview,details,forest,depletion});await page.close();
  }
  await writeFile(`${folder}/assembly.json`,JSON.stringify({purpose:'assembly review; overview/crossing/forest reveal only render view; depletion reduces one resource to four wood then uses live mouse gather',candidateDetail:process.argv.includes('--candidate-detail'),candidateUndergrowth:process.argv.includes('--candidate-undergrowth'),candidatePine:process.argv.includes('--candidate-pine'),results},null,2)+'\n');
  console.log(JSON.stringify(results));
}finally{await browser.close();}
