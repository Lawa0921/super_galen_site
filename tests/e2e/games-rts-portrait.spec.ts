import {waitForRtsLobby} from '../helpers/rts-readiness';
import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {portraitPixelsMatch} from '../helpers/portrait-pixels';

async function decodedPortrait(page:Page,png:Buffer){
  return page.evaluate(async base64=>{
    const image=new Image();image.src=`data:image/png;base64,${base64}`;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d');if(!context)throw new Error('PNG decoding requires a 2D canvas');
    context.drawImage(image,0,0);
    return {width:canvas.width,height:canvas.height,data:Array.from(context.getImageData(0,0,canvas.width,canvas.height).data)};
  },png.toString('base64'));
}

// Deliberately staged units for portrait/UI verification; no gameplay-win claim.
async function fixture(page:Page){
  await page.goto('/games/rts');
  await waitForRtsLobby(page);
  await page.evaluate(async()=>{
    const devtools=new EventTarget();(window as any).__THREE_DEVTOOLS__=devtools;
    const audit:any={contexts:0,world:null,portrait:null,camera:null,state:null};(window as any).__rtsPortraitAudit=audit;
    devtools.addEventListener('observe',((event:CustomEvent)=>{
      const renderer=event.detail;if(!renderer?.isWebGLRenderer)return;audit.contexts++;
      const render=renderer.render.bind(renderer);renderer.render=(scene:any,camera:any)=>{
        if(scene.userData.rtsPortrait)audit.portrait=scene;else{audit.world=scene;audit.camera=camera;}
        const result=render(scene,camera);
        if(scene.userData.rtsPortrait&&audit.sample){
          const gl=renderer.getContext(),box=gl.getParameter(gl.VIEWPORT),pixels=new Uint8Array(box[2]*box[3]*4);gl.readPixels(box[0],box[1],box[2],box[3],gl.RGBA,gl.UNSIGNED_BYTE,pixels);
          let hash=2166136261;for(const value of pixels)hash=Math.imul(hash^value,16777619);
          const pose:any[]=[];scene.traverse((o:any)=>pose.push([o.name,...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray(),...o.matrixWorld.toArray(),...(o.skeleton?Array.from(o.skeleton.boneMatrices):[])]));
          const rect=document.getElementById('rts-portrait-view')!.getBoundingClientRect();
          const metadata={viewport:Array.from(box),scissor:Array.from(gl.getParameter(gl.SCISSOR_BOX)),scissorTest:gl.getParameter(gl.SCISSOR_TEST),dpr:devicePixelRatio,backing:[renderer.domElement.width,renderer.domElement.height],rect:[rect.x,rect.y,rect.width,rect.height],camera:[...camera.matrixWorld.toArray(),...camera.projectionMatrix.toArray()],defaultFramebuffer:gl.getParameter(gl.FRAMEBUFFER_BINDING)===null,glError:gl.getError()};
          const resolve=audit.sample;audit.sample=null;resolve({hash:hash>>>0,pose,metadata,width:box[2],height:box[3],paused:audit.state.paused,pixels:Array.from(pixels)});
        }
        return result;
      };
    }) as EventListener);
    const mainPath='/src/scripts/games/rts/main.ts',statePath='/src/scripts/games/rts/state.ts',simulationPath='/src/scripts/games/rts/simulation.ts',visibilityPath='/src/scripts/games/rts/visibility.ts';
    const {mountRts}=await import(mainPath),{addUnit}=await import(statePath),{createGame}=await import(simulationPath),{updateVisibility}=await import(visibilityPath);
    const old=document.getElementById('rts')!,root=old.cloneNode(true) as HTMLElement;old.replaceWith(root);
    mountRts(root,(map:'river'|'pass',seed:number)=>{
      const state=createGame(map,seed);state.aiEnabled=[false,false];state.entities=state.entities.filter((e:any)=>e.category==='building');
      const hall=state.entities.find((e:any)=>e.team===0)!;hall.x=13;hall.z=155;
      state.map.resources=[];state.resources=[];
      for(const [i,kind] of ['worker','guard','crossbow','priest','knight','siege','commander','neutral-raider'].entries()){
        const unit=addUnit(state,0,kind,{x:18+(i%4)*5,z:136+Math.floor(i/4)*9});unit.hp=unit.maxHp=1000000;unit.order={type:'hold'};
      }
      updateVisibility(state);audit.state=state;return state;
    });
  });
  await page.locator('#rts-start').click();await expect(page.locator('#rts-battle')).toBeVisible({timeout:60000});
}
async function select(page:Page,kind:string,shift=false){
  // Battle DOM and renderer construction precede the first RAF, especially
  // after restart on WebKit. Wait for the actual selectable world instance.
  await page.waitForFunction(kind=>{const a=(window as any).__rtsPortraitAudit,e=a?.state?.entities.find((e:any)=>e.kind===kind&&e.alive);return e&&a?.world?.children.some((o:any)=>o.userData.entityId===e.id);},kind);
  const point=await page.evaluate(kind=>{
    const a=(window as any).__rtsPortraitAudit,e=a.state.entities.find((e:any)=>e.kind===kind&&e.alive),object=a.world.children.find((o:any)=>o.userData.entityId===e.id);
    const p=object.position.clone();p.y=kind==='knight'?1.5:kind==='siege'?.9:kind==='townhall'?2:.8;p.project(a.camera);
    return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};
  },kind);
  if(shift)await page.keyboard.down('Shift');await page.mouse.click(point.x,point.y);if(shift)await page.keyboard.up('Shift');
  await expect(page.locator('#rts-selection h2')).not.toHaveText('指揮官，請下令。');
}
test('eight published portraits animate, clear safely, pause and survive restart',async({page},info)=>{
  test.setTimeout(180000);await page.setViewportSize({width:1600,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
  const output=info.outputPath('portraits');await mkdir(output,{recursive:true});
  const portrait=page.locator('#rts-portrait-view'),evidence:any[]=[];
  for(const kind of ['worker','guard','crossbow','priest','knight','siege','commander','neutral-raider']){
    await select(page,kind);await expect(portrait).toHaveAttribute('data-kind',kind);await expect(portrait).toHaveAccessibleName(/3D 動態肖像/);
    expect(await page.locator('.rts-unit-panel').evaluate(e=>e.getBoundingClientRect().bottom-e.parentElement!.getBoundingClientRect().bottom),'selection panel must stay inside the dock').toBeLessThanOrEqual(1);
    await page.waitForTimeout(180);const first=await portrait.screenshot({path:`${output}/${kind}.png`});await page.waitForTimeout(700);const second=await portrait.screenshot();
    expect(first.equals(second),`${kind} must visibly animate`).toBe(false);evidence.push({kind,movingPixels:true});
  }
  await select(page,'guard');await select(page,'worker',true);await expect(portrait).toHaveAttribute('data-kind','guard');await expect(page.locator('#rts-selection h2')).toContainText('2');
  await page.locator('#rts-pause').click();await page.waitForTimeout(150);
  const raw=()=>page.evaluate(()=>new Promise<any>(resolve=>{(window as any).__rtsPortraitAudit.sample=resolve;}));
  const pausedFrame=await raw(),paused=await portrait.screenshot({path:`${output}/pause-a.png`});await page.waitForTimeout(700);
  const laterFrame=await raw(),later=await portrait.screenshot({path:`${output}/pause-b.png`});
  const firstRaw=Buffer.from(pausedFrame.pixels),laterRaw=Buffer.from(laterFrame.pixels);
  await writeFile(`${output}/pause-a.rgba`,firstRaw);await writeFile(`${output}/pause-b.rgba`,laterRaw);delete pausedFrame.pixels;delete laterFrame.pixels;
  expect(laterRaw.length).toBe(firstRaw.length);
  let changedPixels=0,maxChannelDelta=0;
  for(let i=0;i<firstRaw.length;i+=4){let changed=false;for(let c=0;c<4;c++){const delta=Math.abs(firstRaw[i+c]-laterRaw[i+c]);maxChannelDelta=Math.max(maxChannelDelta,delta);changed ||= delta!==0;}if(changed)changedPixels++;}
  const rawDifference={changedPixels,maxChannelDelta,changedPixelFraction:changedPixels/(firstRaw.length/4)};
  const compositedMatch=portraitPixelsMatch(await decodedPortrait(page,paused),await decodedPortrait(page,later));
  await writeFile(`${output}/pause-diagnostic.json`,JSON.stringify({pausedFrame,laterFrame,rawDifference,compositedPngBytesEqual:paused.equals(later),compositedPixelsWithinOneLevel:compositedMatch},null,2));
  // A frozen raw framebuffer can produce widespread 1-LSB differences after
  // page compositing. Bound decoded PNG channels; keep pose/metadata exact and
  // retain the stricter raw pixel-change fraction to detect actual animation.
  const {hash:firstHash,...firstState}=pausedFrame,{hash:laterHash,...laterState}=laterFrame;
  expect(pausedFrame.metadata.glError).toBe(0);expect(laterState).toEqual(firstState);
  expect(rawDifference.maxChannelDelta).toBeLessThanOrEqual(1);expect(rawDifference.changedPixelFraction).toBeLessThanOrEqual(.001);expect(compositedMatch).toBe(true);
  await page.locator('#rts-resume').click();await page.screenshot({path:`${output}/assembly.png`});
  // Team changes must rebuild a correctly tinted instance. Remove the selected
  // enemy from TeamView by moving it beyond allied sight, not by editing the DOM.
  await select(page,'guard');await page.evaluate(()=>{const a=(window as any).__rtsPortraitAudit;a.state.entities.find((e:any)=>e.kind==='guard').team=1;});
  await expect(portrait).toHaveAttribute('data-team','1');await portrait.screenshot({path:`${output}/guard-red.png`});
  await page.evaluate(()=>{const a=(window as any).__rtsPortraitAudit,u=a.state.entities.find((e:any)=>e.kind==='guard');u.x=87;u.z=87;});
  await expect(page.locator('#rts-portrait')).toBeHidden();
  await select(page,'worker');await page.evaluate(()=>{const a=(window as any).__rtsPortraitAudit;a.state.entities.find((e:any)=>e.kind==='worker').alive=false;});await expect(page.locator('#rts-portrait')).toBeHidden();
  await select(page,'knight');await expect(portrait).toHaveAttribute('data-kind','knight');
  expect(await page.evaluate(()=>(window as any).__rtsPortraitAudit.contexts)).toBe(1);
  await page.setViewportSize({width:1024,height:768});await page.screenshot({path:`${output}/narrow.png`});
  expect(await portrait.evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThan(60);
  expect(await page.locator('.rts-unit-panel').evaluate(e=>e.getBoundingClientRect().bottom-e.parentElement!.getBoundingClientRect().bottom)).toBeLessThanOrEqual(1);
  await page.locator('#rts-pause').click();await page.locator('#rts-restart').click();await page.locator('#rts-confirm-yes').click();await expect(page.locator('#rts-battle')).toBeVisible();await expect(page.locator('#rts-portrait')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>(window as any).__rtsPortraitAudit.contexts)).toBe(2);
  await page.setViewportSize({width:1600,height:1000});await select(page,'worker');await expect(portrait).toHaveAttribute('data-kind','worker');
  await page.locator('#rts-pause').click();await page.locator('#rts-back').click();await page.locator('#rts-confirm-yes').click();await expect(page.locator('#rts-lobby')).toBeVisible();await expect(page.locator('#rts-portrait')).toBeHidden();
  expect(errors).toEqual([]);await writeFile(`${output}/evidence.json`,JSON.stringify({evidence,errors,contextsPerBattle:1},null,2));
});

test('fractional DPR, reduced motion, neutral tint and building/empty selection',async({browser},info)=>{
  test.setTimeout(90000);const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1.5,reducedMotion:'reduce'}),page=await context.newPage();
  try{
    await fixture(page);const portrait=page.locator('#rts-portrait-view');await select(page,'neutral-raider');
    await page.evaluate(()=>{const s=(window as any).__rtsPortraitAudit.state;s.entities.find((e:any)=>e.kind==='neutral-raider').team=-1;});
    await expect(portrait).toHaveAttribute('data-team','-1');await page.waitForTimeout(200);const first=await portrait.screenshot();await page.waitForTimeout(500);expect(first.equals(await portrait.screenshot())).toBe(true);
    const output=info.outputPath('portraits');await mkdir(output,{recursive:true});await page.screenshot({path:`${output}/dpr-1.5-neutral.png`});
    await select(page,'townhall');await expect(page.locator('#rts-portrait')).toBeHidden();await expect(page.locator('#rts-selection h2')).toContainText('領主府');
    await select(page,'priest');await expect(portrait).toHaveAttribute('data-kind','priest');await page.mouse.click(500,130);await expect(page.locator('#rts-portrait')).toBeHidden();
  }finally{await context.close();}
});
