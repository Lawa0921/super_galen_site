// Long, real-browser campaign audit. Requires a preview on port 4321.
// No gameplay state injection. --candidate-art opts into the explicitly isolated art fixture.
import {chromium,expect} from '@playwright/test';
import {candidateArtFixture,initialScreen} from '../e2e/rts-candidate-fixture';
import {mkdir,writeFile} from 'node:fs/promises';
import {createMap} from '../../src/scripts/games/rts/maps';
import {isWalkable} from '../../src/scripts/games/rts/navigation';
import {installAudioCapture,saveAudioCapture} from './rts-audio-capture';

const captureAudio=process.argv.includes('--capture-audio');
const campaignOut=process.env.RTS_CAMPAIGN_OUT??'tmp/rts';await mkdir(campaignOut,{recursive:true});

// These are UI patrol waypoints, never state-injected movement commands.
const baseTargets=[[76,55],[82,35],[69,35],[62,48],[69,63],[82,65],[56,33],[56,65],[82,22],[82,74],[69,74]];
const patrol=(id:string)=>id==='pass'?[[38,24],[55,24],...baseTargets]:baseTargets;
for(const id of ['river','pass'] as const)for(const [x,z] of patrol(id))
  expect(isWalkable(createMap(id),{x,z},[],.5),`${id} patrol waypoint ${x},${z}`).toBe(true);

const browser=await chromium.launch(process.argv.includes('--dedicated-gpu')?{channel:'chromium',headless:true,args:['--mute-audio','--enable-gpu','--force_high_performance_gpu']}:{headless:true,args:['--mute-audio']});
try{
  campaigns: for(const map of (process.argv.includes('--pass-only')?['pass']:process.argv.includes('--river-only')?['river']:['river','pass'])){
    const targets=patrol(map);
    const page=await browser.newPage({viewport:{width:1600,height:1000}});
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    if(process.argv.includes('--candidate-art'))await candidateArtFixture(page);if(!captureAudio)await page.clock.install({time:new Date('2026-10-04T12:00:00Z')});
    await page.goto(`${process.env.RTS_BASE_URL??'http://127.0.0.1:4321'}/games/rts`);
    await page.waitForLoadState('networkidle');
    if(captureAudio)await installAudioCapture(page);
    // Read only the same TeamView/camera that the player sees, for skill aiming.
    await page.addScriptTag({type:'module',content:`const source=await(await fetch('/src/scripts/games/rts/main.ts')).text();const path=source.match(new RegExp('from "([^"]*scene[.]ts[^"]*)"'))[1];const {Battlefield}=await import(path);const original=Battlefield.prototype.render;Battlefield.prototype.render=function(view,dt,alpha){window.campaignVisible={field:this,view};return original.call(this,view,dt,alpha);};`});
    // Optional read-only observation of the naturally created match. No state,
    // resources, commands, AI policy or outcome are injected by this wrapper.
    const diagnostics:any[]=[];
    if(process.argv.includes('--diagnostic')){
      await page.waitForLoadState('networkidle');
      await page.addScriptTag({type:'module',content:`const mainPath='/src/scripts/games/rts/main.ts';const {mountRts}=await import(mainPath);const {createGame}=await import('/src/scripts/games/rts/simulation.ts');const old=document.getElementById('rts'),root=old.cloneNode(true);old.replaceWith(root);mountRts(root,(...args)=>{const state=createGame(...args);window.campaignObservedState=state;return state;});`});
    }
    await page.locator(`input[value="${map}"]`).check();
    await page.locator('#rts-start').click();await page.locator('#rts-battle').waitFor({state:'visible'});
    if(!captureAudio)await page.clock.pauseAt(new Date('2026-10-04T13:00:00Z'));
    const advance=async(seconds:number)=>{if(captureAudio){await page.waitForTimeout(seconds*1000);return;}for(let f=0;f<Math.round(seconds*4);f++)await page.clock.fastForward(250);};
    const click=async(x:number,z:number,height=1,button:'left'|'right'='left')=>{const p=initialScreen(x,z,height);await page.mouse.click(p.x,p.y,{button});await advance(.25);};
    const command=(name:string)=>page.locator('#rts-commands').getByRole('button',{name:new RegExp('^'+name)});
    const mark=async(phase:string)=>{console.log(JSON.stringify({map,phase,time:await page.locator('#rts-time').textContent(),gold:await page.locator('#rts-gold').textContent(),wood:await page.locator('#rts-wood').textContent(),supply:await page.locator('#rts-supply').textContent(),selected:await page.locator('#rts-selection h2').textContent(),notice:await page.locator('#rts-notice').textContent()}));
      if(process.argv.includes('--diagnostic')){diagnostics.push({phase,...await page.evaluate(()=>{const s=(window as any).campaignObservedState;return {time:s.time,status:s.status,paused:s.paused,entities:s.entities.filter((e:any)=>e.alive).map((e:any)=>({id:e.id,kind:e.kind,team:e.team,x:e.x,z:e.z,hp:e.hp,animation:e.animation,order:e.order,path:e.path?.map((p:any)=>({x:p.x,z:p.z})),pathGoal:e.pathGoal&&{x:e.pathGoal.x,z:e.pathGoal.z},blockedTime:e.blockedTime,engagedTargetId:e.engagedTargetId,unreachableTargets:e.unreachableTargets})),events:s.events.slice(-20)};})});await writeFile(`${campaignOut}/player-observation-${map}.json`,JSON.stringify(diagnostics,null,2));}
    };
    const build=async(name:string,x:number,z:number)=>{
      await page.keyboard.press('1');await advance(.25);await command('建造').click();await command(name).click();const p=initialScreen(x,z);
      await page.mouse.move(p.x,p.y);await page.mouse.click(p.x,p.y);await advance(.25);await mark('build-'+name);
    };
    await click(17,53.5);await page.keyboard.press('Control+1');
    for(const x of [11,12.5,14]){await click(x,53.5);await click(24.5,48.5,1,'right');}
    await click(15.5,53.5);await click(25.3,58.5,3,'right');
    await build('兵營',14,35);await advance(27);
    await build('民居',5,35);await advance(18);
    await build('誓約祭壇',27,35);await advance(28);
    await page.keyboard.press('1');await advance(.25);await click(24.5,48.5,1,'right');
    await click(27,35,2);await expect(page.locator('#rts-selection h2')).toHaveText('誓約祭壇');
    await command('誓衛統領').click();await click(24,27,0,'right');
    await click(14,35,2);await expect(page.locator('#rts-selection h2')).toHaveText('兵營');await click(24,27,0,'right');
    for(let i=0;i<4;i++){
      let waits=0;while(!(await command('王國衛兵').isEnabled())&&waits++<24)await advance(5);
      await command('王國衛兵').click();await advance(.25);await mark('train-guard-'+(i+1));
    }
    await advance(42);await mark('muster');await page.screenshot({path:`${campaignOut}/natural-ui-muster-${map}.png`});
    const corners=[[19,22],[29,22],[19,32],[29,32]].map(([x,z])=>initialScreen(x,z));
    const left=Math.min(...corners.map(p=>p.x)),right=Math.max(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y)),bottom=Math.max(...corners.map(p=>p.y));
    // Natural combat can pull a trained guard away from the rally point.
    // Box the visible army, using only the player's current view.
    const army=await page.evaluate(()=>{const a=(window as any).campaignVisible;return a.view.entities.filter((e:any)=>e.alive&&e.team===0&&(e.kind==='guard'||e.kind==='commander')).map((e:any)=>({id:e.id,kind:e.kind,x:e.x,z:e.z,screen:a.field.screen(e)}));});
    console.log(JSON.stringify({map,phase:'visible-muster',army}));expect(army).toHaveLength(5);
    const armyLeft=Math.min(...army.map((u:any)=>u.screen.x))-12,armyRight=Math.max(...army.map((u:any)=>u.screen.x))+12,armyTop=Math.min(...army.map((u:any)=>u.screen.y))-12,armyBottom=Math.max(...army.map((u:any)=>u.screen.y))+12;
    await page.mouse.move(armyLeft,armyTop);await page.mouse.down();await page.mouse.move(armyRight,armyBottom,{steps:8});await page.mouse.up();await advance(.25);
    await page.keyboard.press('Control+3');await mark('army-selected');
    await expect(page.locator('.rts-group-list button')).toHaveCount(5);
    const mini=await page.locator('#rts-minimap').boundingBox();if(!mini)throw new Error('Missing minimap');
    await page.locator('.rts-group-list button').getByText('誓衛統領',{exact:true}).click();await advance(.25);
    await page.locator('#rts-canvas').focus();await page.keyboard.press('Control+2');
    const useHero=async()=>{
      if(await page.locator('#rts-menu').isVisible())return;
      const visible=await page.evaluate(()=>{const a=(window as any).campaignVisible,hero=a?.view.entities.find((e:any)=>e.alive&&e.team===0&&e.kind==='commander');if(!hero)return null;const target=a.view.entities.filter((e:any)=>e.alive&&e.team!==0&&Math.hypot(e.x-hero.x,e.z-hero.z)<4.8).sort((a:any,b:any)=>Number(a.category==='building')-Number(b.category==='building'))[0];return {hero:{x:hero.x,z:hero.z,hp:hero.hp,maxHp:hero.maxHp},target:target?{x:target.x,z:target.z}:null};});
      if(!visible)return;
      await page.locator('#rts-canvas').focus();await page.keyboard.press('2');await advance(.25);
      for(const skill of ['破陣斬','戰地救援']){const learn=command('學習'+skill);if(await learn.isVisible()&&await learn.isEnabled()){await learn.click();await advance(.25);}}
      const heal=visible.hero.hp<visible.hero.maxHp-140&&await command('戰地救援').isVisible()&&await command('戰地救援').isEnabled();
      const strike=visible.target&&await command('破陣斬').isVisible()&&await command('破陣斬').isEnabled();
      if(heal||strike){
        await page.mouse.click(mini.x+visible.hero.x/96*mini.width,mini.y+visible.hero.z/96*mini.height);await advance(.25);
        // Real-time combat continues while the camera moves. A hero may die
        // after the readiness check; never wait 30 seconds for a removed card.
        try{await command(heal?'戰地救援':'破陣斬').click({timeout:1200});}
        catch(error){
          const observed=await page.evaluate(()=>{const a=(window as any).campaignVisible;return {hero:a?.view.entities.find((e:any)=>e.alive&&e.team===0&&e.kind==='commander')??null,selection:document.querySelector('#rts-selection h2')?.textContent,commands:[...document.querySelectorAll<HTMLButtonElement>('#rts-commands button')].map(b=>({text:b.textContent,disabled:b.disabled})),time:document.querySelector('#rts-time')?.textContent};});
          console.log(JSON.stringify({map,phase:'hero-action-interrupted',...observed}));
          if(observed.hero)throw error;
          await page.locator('#rts-home').click();await page.locator('#rts-canvas').focus();return;
        }
        const aim=heal?visible.hero:visible.target!,point=await page.evaluate(p=>(window as any).campaignVisible.field.screen(p,1),aim);
        await page.mouse.click(point.x,point.y);await advance(.25);
      }
      await page.locator('#rts-home').click();await page.locator('#rts-canvas').focus();await advance(.25);
    };
    await useHero();
    const attack=async(x:number,z:number)=>{await page.keyboard.press('3');await page.keyboard.press('a');await page.mouse.click(mini.x+x/96*mini.width,mini.y+z/96*mini.height,{button:'right'});await advance(.25);if(process.argv.includes('--diagnostic'))await mark(`order-${x}-${z}`);};
    // Ground attack-move cannot target a known building's solid footprint.
    // Sweep beside the southern expansion slots to reveal and engage the house.
    for(let sweep=0;sweep<3;sweep++)for(const [x,z] of targets){
      if(await page.locator('#rts-menu').isVisible())break;
      // Training leaves focus on the command button. Restore battlefield
      // keyboard focus before recalling the army, or Ctrl+3 would overwrite
      // the group with only the newly box-selected reinforcements.
      await page.locator('#rts-canvas').focus();await page.keyboard.press('3');await page.keyboard.down('Shift');
      await page.mouse.move(left,top);await page.mouse.down();await page.mouse.move(right,bottom,{steps:8});await page.mouse.up();await page.keyboard.up('Shift');
      await page.keyboard.press('Control+3');
      await attack(x,z);for(let interval=0;interval<(z===24?3:7);interval++){await advance(5);if(await page.locator('#rts-menu').isVisible())break;await useHero();}await mark(`attack-${x}-${z}`);
      if(process.argv.includes('--diagnostic-stop')&&sweep===0&&x===69&&z===74){await page.screenshot({path:`${campaignOut}/player-observation-${map}.png`});break campaigns;}
      if(await page.locator('#rts-menu').isVisible())break;
      await page.keyboard.press('Escape');
      // Escape cancels targeting after a minimap order; it must not pause the game.
      if(await page.locator('#rts-menu').isVisible())await page.locator('#rts-resume').click();
      await click(14,35,2);
      if(await command('王國衛兵').isVisible()&&await command('王國衛兵').isEnabled()){
        await command('王國衛兵').click();await advance(.25);
      }
    }
    await mark('result');
    const title=await page.locator('#rts-menu-title').textContent();
    const won=(await page.locator('#rts-menu').isVisible())&&title==='曙光屬於王國';
    await page.screenshot({path:`${campaignOut}/natural-ui-player-${won?'win':'incomplete'}-${map}.png`});
    if(captureAudio){await page.waitForTimeout(2500);await saveAudioCapture(page,`${process.env.RTS_AUDIO_OUT??'tmp/rts/commercial-live-audio'}/${map}`,{map,won,title,gameTime:await page.locator('#rts-time').textContent(),errors});}
    if(!(await page.locator('#rts-menu').isVisible())||title!=='曙光屬於王國')throw new Error(`Player campaign not won: ${map}: ${title}`);
    if(errors.length)throw new Error(errors.join('\n'));
    await page.close();
  }
}finally{
  if(captureAudio)for(const context of browser.contexts())for(const page of context.pages()){
    try{
      if(await page.evaluate(()=>!!(window as any).rtsAudioCapture&&!(window as any).rtsAudioCapture.isFinished())){
        const map=await page.locator('input[name="rts-map"]:checked').inputValue();
        await saveAudioCapture(page,`${process.env.RTS_AUDIO_OUT??'tmp/rts/commercial-live-audio'}/${map}-interrupted`,{map,completed:false,reason:'Campaign exited before normal capture finalization'});
      }
    }catch(error){console.error('Could not preserve interrupted audio capture',error);}
  }
  await browser.close();
}
