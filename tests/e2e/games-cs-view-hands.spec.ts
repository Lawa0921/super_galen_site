import {test,expect} from '@playwright/test';

test('anatomical rifle hands follow reload, reset at round end and are absent from world weapons',async({page,browserName,isMobile})=>{
  test.skip(browserName!=='chromium'||isMobile,'Desktop first-person weapon assembly');
  await page.route('**/__cs_view_hands',route=>route.fulfill({contentType:'text/html',body:'<canvas style="width:1000px;height:625px"></canvas>'}));
  await page.goto('/__cs_view_hands');
  const result=await page.evaluate(async()=>{
    const {Vector3}=await import('/node_modules/three/build/three.module.js');
    const {GameRenderer}=await import('/src/scripts/games/cs/renderer.ts');
    const {createMatch,WEAPONS}=await import('/src/scripts/games/cs/engine.ts');
    const r=new GameRenderer(document.querySelector('canvas')!);await r.load();
    try{
      const m=createMatch('attack');m.phase='live';m.actors.forEach(p=>p.weapon='rifle');
      const draw=()=>r.render(m,1/60,{yaw:0,pitch:0},false);draw();
      const gun=r.gun,group=gun.getObjectByName('view_hands');
      const support=group?.getObjectByName('support_hand'),trigger=group?.getObjectByName('trigger_hand');
      if(!support||!trigger)return {hasHands:false};
      const meshCounts=[support,trigger].map(hand=>{let count=0;hand.traverse(n=>{if(n.isMesh)count++;});return count;});
      const palm=gun.getObjectByName('fps_hand_L');
      if(!palm?.isBone)return {hasHands:false};
      let boundSkins=0;support.traverse(node=>{if(node.isSkinnedMesh&&node.skeleton.bones.includes(palm))boundSkins++;});
      // The authored reload deforms the skin through bones; the mesh group
      // intentionally stays fixed. Measure the palm relative to the weapon.
      const samplePalm=()=>{gun.updateWorldMatrix(true,true);return gun.worldToLocal(palm.getWorldPosition(new Vector3()));};
      const rest=samplePalm().toArray(),hip=gun.position.toArray();
      const materials=[];group.traverse(n=>{if(n.isMesh)materials.push(...(Array.isArray(n.material)?n.material:[n.material]));});
      const surfaces=[...new Set(materials)].map(material=>({
        name:material.name,standard:material.isMeshStandardMaterial===true,
        color:!!material.map,normal:!!material.normalMap,roughnessMap:!!material.roughnessMap,ao:!!material.aoMap,
        roughness:material.roughness,metalness:material.metalness,
        detail:material.userData.csFabricDetail,program:material.customProgramCacheKey(),
      }));
      m.actors[0].reload=WEAPONS.rifle.reload*.5;draw();const moving=samplePalm().distanceTo(new Vector3(...rest));
      m.phase='round-over';draw();const reset=samplePalm().toArray();
      const worldHands=[];for(const unit of r.units.values())unit.traverse(n=>{if(/view_hands/i.test(n.name))worldHands.push(n.visible);});
      return {hasHands:true,meshCounts,boundSkins,materialCount:materials.length,surfaces,rest,reset,moving,hip,worldHands,worldUnitCount:r.units.size,glError:r.renderer.getContext().getError()};
    }finally{r.dispose();}
  });
  expect(result.hasHands).toBe(true);
  expect(result.meshCounts?.length).toBe(2);
  expect(result.meshCounts?.every(count=>count>0)).toBe(true);
  expect(result.boundSkins).toBeGreaterThan(0);
  expect(result.materialCount).toBeGreaterThan(0);
  expect(result.surfaces?.map(m=>m.name).sort()).toEqual(['MakeHuman_authored_FPS_uniform_CC0','PolyHaven_brown_leather_CC0']);
  for(const surface of result.surfaces!) expect(surface).toMatchObject({standard:true,color:true,normal:true,metalness:0});
  expect(result.surfaces?.find(m=>m.name==='PolyHaven_brown_leather_CC0')).toMatchObject({roughnessMap:true});
  // The V36 sleeve uses authored uniform roughness plus packed AO/cloth detail;
  // requiring an optional roughness texture would reject that material contract.
  expect(result.surfaces?.find(m=>m.name==='MakeHuman_authored_FPS_uniform_CC0')).toMatchObject({
    ao:true,roughness:.98,program:'cs-fabric-detail-v36',
    detail:{normalStrength:1,albedoStrength:.6,cavityMean:.785,foldContrast:2.2,atlasMean:.557},
  });
  expect(result.moving).toBeGreaterThan(.1);
  result.reset!.forEach((value,i)=>expect(value).toBeCloseTo(result.rest![i],6));
  expect(result.hip?.[0]).toBeCloseTo(.16,2);
  expect(result.hip?.[1]).toBeCloseTo(-.17,2);
  expect(result.hip?.[2]).toBeCloseTo(-.45,2);
  // All six actors have resident models, including the hidden local player.
  expect(result.worldUnitCount).toBe(6);
  expect(result.worldHands).toEqual([]);
  expect(result.glError).toBe(0);
});
