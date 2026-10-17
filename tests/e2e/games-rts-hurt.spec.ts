import {waitForRtsLobby} from '../helpers/rts-readiness';
import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test.use({viewport:{width:1600,height:1000}});
test('eight published units react to damage, freeze in pause and yield to attack',async({page},info)=>{
  test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const output=info.outputPath('hurt');await mkdir(output,{recursive:true});
  await page.clock.install({time:new Date('2026-10-11T12:00:00Z')});
  await page.goto('/games/rts');await waitForRtsLobby(page);
  // Staged presentation fixture, not a natural-match result. Production damage,
  // commands, simulation, published GLBs and the normal render loop remain in use.
  await page.evaluate(async()=>{
    const mainPath='/src/scripts/games/rts/main.ts',statePath='/src/scripts/games/rts/state.ts',simPath='/src/scripts/games/rts/simulation.ts',fogPath='/src/scripts/games/rts/visibility.ts',heroPath='/src/scripts/games/rts/hero.ts',commandPath='/src/scripts/games/rts/commands.ts';
    const main=await(await fetch(mainPath)).text(),scenePath=main.match(/from "([^"\n]*\/scene\.ts[^"\n]*)"/)?.[1];
    if(!scenePath)throw new Error('No active scene module');
    const {mountRts}=await import(mainPath),{addBuilding,addUnit}=await import(statePath),{createGame}=await import(simPath),{updateVisibility}=await import(fogPath),{Battlefield}=await import(scenePath),{damageEntity}=await import(heroPath),{issueCommand}=await import(commandPath);
    const render=Battlefield.prototype.render;
    Battlefield.prototype.render=function(...args:any[]){(window as any).__hurtFixture.field=this;return render.apply(this,args);};
    const old=document.getElementById('rts')!,root=old.cloneNode(true) as HTMLElement;old.replaceWith(root);
    mountRts(root,(map:'river'|'pass',seed:number)=>{
      const state=createGame(map,seed);state.aiEnabled=[false,false];state.entities=[];
      state.map.blocked.fill(0);state.map.noBuild.fill(0);state.map.scenery=[];state.map.resources=[];state.resources=[];
      state.map.spawns[0]={x:32,z:32};
      addBuilding(state,0,'townhall',{x:8,z:80},true);addBuilding(state,1,'townhall',{x:88,z:80},true);
      const units=['worker','guard','crossbow','priest','knight','siege','commander','neutral-raider'].map((kind,i)=>{
        const unit=addUnit(state,0,kind,{x:24+(i%4)*5,z:29+Math.floor(i/4)*7});unit.order={type:'hold'};unit.mana=0;return unit;
      });
      const fixture:any={state,units,damage(){units.forEach(unit=>damageEntity(state,unit,12,1));},attack(){
        const guard=units[1],enemy=addUnit(state,1,'guard',{x:guard.x+1,z:guard.z});enemy.order={type:'hold'};
        damageEntity(state,guard,12,1);updateVisibility(state);return issueCommand(state,0,{type:'attack',unitIds:[guard.id],targetId:enemy.id});
      },sample(){return units.map(unit=>{
        const instance=fixture.field.models.get(unit.id).instance;
        return {kind:unit.kind,hp:unit.hp,animation:unit.animation,order:unit.order,age:unit.hurtCue?state.time-unit.hurtCue.startedAt:null,variants:instance.variants.map((v:any)=>{
          // A shared LOD binds the primary skeleton; siege animates rigid pivots.
          // Read the actual deformation targets rather than only child bones.
          const targets=new Set<any>();v.root.traverse((o:any)=>{
            if(o.isSkinnedMesh)o.skeleton.bones.forEach((bone:any)=>targets.add(bone));
            if(o.name==='ChassisRecoilPivot'||o.name.startsWith('TeamCloth_'))targets.add(o);
          });
          const pose=[...targets].map(o=>[o.name,...o.position.toArray(),...o.quaternion.toArray()]);
          return {visible:v.root.visible,clip:v.action?.getClip().name,time:v.action?.time,pose};
        })};
      });}};
      updateVisibility(state);(window as any).__hurtFixture=fixture;return state;
    });
  });
  await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
  await page.clock.pauseAt(new Date('2026-10-11T13:00:00Z'));
  await page.evaluate(()=>(window as any).__rtsDebug.camera(32,33,48));await page.clock.runFor(16);
  const sample=()=>page.evaluate(()=>(window as any).__hurtFixture.sample());
  const idle=await sample();expect(idle).toHaveLength(8);
  const point=await page.evaluate(()=>(window as any).__hurtFixture.field.screen({x:29,z:29},1));await page.mouse.click(point.x,point.y);
  await page.clock.runFor(100);await expect(page.locator('#rts-selection h2')).toHaveText('王國衛兵');
  await page.locator('#rts-pause').click();await expect(page.locator('#rts-menu')).toBeVisible();
  await page.evaluate(()=>{(window as any).__hurtFixture.damage();(window as any).__rtsDebug.advance(.2);});await page.clock.runFor(16);
  const hurt=await sample();
  for(const [i,unit] of hurt.entries()){
    expect(unit.hp,unit.kind).toBeLessThan(idle[i].hp);expect(unit.age).toBeCloseTo(.2);
    for(const [lod,variant] of unit.variants.entries()){
      expect(variant.clip,`${unit.kind} LOD ${lod}`).toBe('Hurt');expect(variant.time).toBeCloseTo(.2);
      expect(variant.pose,`${unit.kind} LOD ${lod} visible recoil`).not.toEqual(idle[i].variants[lod].pose);
      if(unit.kind==='siege'){
        const pivot=variant.pose.find((p:any[])=>p[0]==='ChassisRecoilPivot');expect(pivot).toBeDefined();
        expect(pivot,'siege chassis itself must recoil').not.toEqual(idle[i].variants[lod].pose.find((p:any[])=>p[0]==='ChassisRecoilPivot'));
      }
    }
  }
  await page.clock.runFor(500);expect(await sample()).toEqual(hurt);
  await page.screenshot({path:`${output}/paused-hurt.png`});
  // Resume through the real control. A single RAF presents the existing recoil
  // before the next fixed simulation tick, then the normal clock expires it.
  await page.locator('#rts-resume').click();await page.clock.runFor(16);
  await page.screenshot({path:`${output}/hurt.png`});
  await page.evaluate(()=>(window as any).__rtsDebug.camera(32,33,24));await page.clock.runFor(16);
  await page.screenshot({path:`${output}/hurt-max-zoom.png`});
  await page.evaluate(()=>(window as any).__rtsDebug.camera(32,33,48));await page.clock.runFor(500);
  const recovered=await sample();for(const unit of recovered)expect(unit.variants.every((v:any)=>v.clip==='Idle')).toBe(true);
  await page.screenshot({path:`${output}/recovered.png`});
  // Isolated diagnostic framing crosses the actual renderer's 48 px LOD
  // threshold for every unit, including shorter units. Gameplay-scale views
  // above remain at the normal 48/24 spans. No model visibility is overridden.
  await page.evaluate(()=>{const w=window as any;w.__rtsDebug.setPaused(true);w.__hurtFixture.damage();w.__rtsDebug.advance(.2);});
  const displayed:any[]=[];
  for(const lod of [0,1])for(let index=0;index<8;index++){
    await page.evaluate(({index,lod})=>{
      const w=window as any,f=w.__hurtFixture,u=f.units[index],height=f.field.models.get(u.id).height;
      const pixels=Math.abs(f.field.screen(u,height).y-f.field.screen(u).y);
      w.__rtsDebug.camera(u.x,u.z,f.field.span*pixels/(lod===0?72:32));
    },{index,lod});await page.clock.runFor(16);
    const unit=(await sample())[index];expect(unit.variants.map((v:any)=>v.visible)).toEqual(lod===0?[true,false]:[false,true]);
    expect(unit.variants[lod].clip).toBe('Hurt');expect(unit.variants[lod].time).toBeCloseTo(.2);displayed.push({lod,...unit});
    await page.screenshot({path:`${output}/${unit.kind}-lod${lod}.png`});
  }
  await page.evaluate(()=>{const w=window as any;w.__rtsDebug.camera(32,33,48);w.__rtsDebug.setPaused(false);});await page.clock.runFor(500);
  expect(await page.evaluate(()=>(window as any).__hurtFixture.attack())).toEqual({ok:true});
  await page.clock.runFor(100);const attacking=await sample();
  await writeFile(`${output}/evidence.json`,JSON.stringify({idle,hurt,recovered,displayed,attacking,errors},null,2));
  expect(attacking[1].age).toBeLessThan(.35);expect(attacking[1].variants.every((v:any)=>v.clip==='Attack')).toBe(true);
  expect(errors).toEqual([]);
});
