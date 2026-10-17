import {createGame,stepGame} from './simulation';
import {issueCommand} from './commands';
import {getTeamView} from './visibility';
import {ModelLibrary} from './models';
import {Battlefield} from './scene';
import {BattlefieldInput} from './input';
import {Hud} from './hud';
import {SimulationClock} from './clock';
import {RtsAudio} from './audio';
import {VisibleAudioCues} from './ui';
import type {GameState,Command} from './types';
import {installRtsDebugHook,type RtsDebugHook} from './debug-hook';
import {drainEvents,AttackAlerts,matchSummary} from './feedback';
import {loadSettings,saveSettings,loadDifficulty,saveDifficulty,type AiDifficulty} from './settings';
import {Onboarding} from './onboarding';
const CONFIRM={restart:['重新開局？','目前戰役的進度將會放棄，並以同一張地圖重新開始。','重新開局'],surrender:['確定投降？','這場戰役將立即以敗北結束。','投降'],back:['返回戰場選擇？','目前戰役的進度將會放棄。','離開戰役']} as const;
export function mountRts(root:HTMLElement,makeGame:typeof createGame=createGame):()=>void {
  const abort=new AbortController(),{signal}=abort,el=<T extends HTMLElement=HTMLElement>(id:string)=>root.querySelector<T>('#'+id)!;
  const lobby=el('rts-lobby'),battle=el('rts-battle'),startButton=el<HTMLButtonElement>('rts-start'),status=el('rts-load-status'),dialog=el<HTMLDialogElement>('rts-menu'),confirmDialog=el<HTMLDialogElement>('rts-confirm'),resultStats=el<HTMLTableElement>('rts-menu-stats');
  const audio=new RtsAudio();let library:ModelLibrary|null=null,state:GameState|null=null,scene:Battlefield|null=null,input:BattlefieldInput|null=null,clock:SimulationClock|null=null,hud:Hud|null=null,raf=0,loading=false,disposed=false,generation=0;
  const volume=el<HTMLInputElement>('rts-volume'),volumeValue=el<HTMLOutputElement>('rts-volume-value'),optional=<T extends HTMLElement>(id:string)=>root.querySelector<T>('#'+id);
  // Settings controls and the tutorial panel are optional so reduced test pages still mount.
  const quality=optional<HTMLSelectElement>('rts-quality'),edgeScroll=optional<HTMLInputElement>('rts-edge-scroll'),cameraSpeed=optional<HTMLInputElement>('rts-camera-speed'),cameraSpeedValue=optional<HTMLOutputElement>('rts-camera-speed-value');
  const settings=loadSettings();
  // One tour per page: a restart keeps its progress; the panel lives inside the battle view.
  const tutorial=new Onboarding();tutorial.attach(optional('rts-tutorial'));
  const menuTech=el('rts-tech-tree').cloneNode(true) as HTMLElement;menuTech.removeAttribute('id');el('rts-menu-tech').append(menuTech);
  const showVolume=()=>{audio.setVolume(settings.volume/100);volumeValue.textContent=settings.volume===0?'靜音':`${settings.volume}%`;};
  const showSpeed=()=>{if(cameraSpeedValue)cameraSpeedValue.textContent=`${settings.cameraSpeed.toFixed(1)}×`;};
  volume.value=String(settings.volume);showVolume();if(quality)quality.value=settings.quality;if(edgeScroll)edgeScroll.checked=settings.edgeScroll;if(cameraSpeed)cameraSpeed.value=String(Math.round(settings.cameraSpeed*100));showSpeed();
  const changed=()=>{saveSettings(settings);input?.configure(settings);};
  volume.addEventListener('input',()=>{settings.volume=Math.max(0,Math.min(100,Number(volume.value)||0));showVolume();changed();},{signal});
  quality?.addEventListener('change',()=>{settings.quality=quality.value==='low'?'low':'high';scene?.setQuality(settings.quality);changed();},{signal});
  edgeScroll?.addEventListener('change',()=>{settings.edgeScroll=edgeScroll.checked;changed();},{signal});
  cameraSpeed?.addEventListener('input',()=>{settings.cameraSpeed=Math.max(.5,Math.min(2,Number(cameraSpeed.value)/100||1));showSpeed();changed();},{signal});
  // Lobby difficulty radios are optional too; the saved choice is restored on mount.
  const difficulties=[...root.querySelectorAll<HTMLInputElement>('input[name="rts-difficulty"]')];let difficulty:AiDifficulty=loadDifficulty();
  for(const radio of difficulties){radio.checked=radio.value===difficulty;radio.addEventListener('change',()=>{if(!radio.checked)return;difficulty=radio.value==='easy'||radio.value==='hard'?radio.value:'normal';saveDifficulty(difficulty);},{signal});}
  let selectedMap:'river'|'pass'='river',viewStale=false,confirmed:(()=>void)|null=null;
  // Dev/e2e-only; the DEV branch is removed from production bundles.
  const uninstallDebug=import.meta.env.DEV?installRtsDebugHook(window as unknown as {__rtsDebug?:RtsDebugHook},()=>({state,scene}),()=>{viewStale=true;}):()=>{};
  function disposeGame(){generation++;cancelAnimationFrame(raf);clock?.dispose();input?.dispose();const hadScene=!!scene;scene?.dispose();if(hadScene)for(const id of ['rts-canvas','rts-overlay']){const canvas=el<HTMLCanvasElement>(id);canvas.replaceWith(canvas.cloneNode(true));}audio.dispose();clock=null;input=null;scene=null;state=null;hud=null;confirmed=null;if(confirmDialog.open)confirmDialog.close();if(dialog.open)dialog.close();}
  /** A live match asks before it is abandoned; a finished one acts at once. */
  function confirmThen(kind:keyof typeof CONFIRM,action:()=>void){
    if(state?.status!=='playing'){action();return;}const [title,copy,accept]=CONFIRM[kind];
    el('rts-confirm-title').textContent=title;el('rts-confirm-copy').textContent=copy;el('rts-confirm-yes').textContent=accept;confirmed=action;if(!confirmDialog.open)confirmDialog.showModal();el('rts-confirm-no').focus();
  }
  function showResults(s:GameState){
    const summary=matchSummary(s),caption=document.createElement('caption'),head=document.createElement('thead'),body=document.createElement('tbody'),row=(cells:Array<string|number>,tag:'th'|'td')=>{const tr=document.createElement('tr');cells.forEach((value,i)=>{const cell=document.createElement(i===0||tag==='th'?'th':'td');cell.textContent=String(value);if(i===0&&tag==='td')cell.scope='row';tr.append(cell);});return tr;};
    caption.textContent=`戰役時長 ${summary.duration}`;head.append(row(['','我方','敵方'],'th'));for(const r of summary.rows){const tr=row([r.label,r.player,r.enemy],'td');tr.dataset.lead=r.player===r.enemy?'even':r.player>r.enemy?'player':'enemy';body.append(tr);}
    resultStats.replaceChildren(caption,head,body);
  }
  function send(command:Command):boolean {
    if(!state)return false;const result=issueCommand(state,0,command);if(!result.ok){hud?.notice(result.reason);audio.play('warning');return false;}if(command.type==='stop'||command.type==='hold')input?.setMode({type:'normal'});audio.play('order');if(tutorial.observe({type:'command',command})&&tutorial.finished)hud?.notice('新手指引完成，祝你旗開得勝！');return true;
  }
  function showMenu(result=false){
    if(!state||!clock)return;state.paused=true;clock.setPaused(true);
    // Flush the last tick now: the normal 100ms HUD throttle can still show the
    // previous second when the pause button (or visibility event) is handled.
    if(hud&&input&&scene)hud.render(getTeamView(state,0),input.selection,scene);
    el('rts-resume').hidden=result;el('rts-surrender').hidden=result;resultStats.hidden=!result;if(result)showResults(state);
    el('rts-menu-title').textContent=result?state.status==='draw'?'戰役和局':state.winner===0?'曙光屬於王國':'王旗暫時落下':'戰役已暫停';
    el('rts-menu-copy').textContent=result?`${state.endReason==='time-limit'?'三十分鐘已到。':state.endReason==='surrender'?'你已結束這場戰役。':state.status==='draw'?'雙方據點同時覆滅。':state.winner===0?'敵方所有建築已被摧毀。':'我方所有建築已被摧毀。'}`:'王國等待你的指令。';
    if(!dialog.open)dialog.showModal();
  }
  async function start(map:'river'|'pass'){
    if(loading||disposed)return;disposeGame();const run=generation;selectedMap=map;loading=true;startButton.disabled=true;status.textContent='正在準備戰場…';audio.start();
    try{
      if(!library)library=new ModelLibrary();await library.load((n,total)=>{if(run===generation)status.textContent=`正在準備戰場 ${Math.floor(n/total*100)}%`;},map);
      if(disposed||run!==generation)return;
      state=makeGame(map,Math.floor(Math.random()*0xffffffff),difficulty);lobby.hidden=true;battle.hidden=false;status.textContent='';
      scene=new Battlefield(el<HTMLCanvasElement>('rts-canvas'),el<HTMLCanvasElement>('rts-overlay'),state.map,library!,el('rts-portrait'));
      // Populate model transforms and the picking tree before pointer handlers
      // become active; the browser can deliver input before the first RAF.
      let view=getTeamView(state,0);scene.setQuality(settings.quality);scene.render(view,0,1);
      hud=new Hud(root,action=>{if(action.type==='command')send(action.command);else if(action.type==='mode')input?.setMode(action.mode);else input?.select(action.ids);});
      input=new BattlefieldInput(scene,view,send,hud,()=>showMenu());input.configure(settings);el('rts-map-name').textContent=state.map.name;
      clock=new SimulationClock(()=>{if(state)stepGame(state);});const audioCues=new VisibleAudioCues(),attackAlerts=new AttackAlerts();audioCues.observe(view);attackAlerts.observe(view);let last=performance.now(),lastHud=0,lastView=-1,lastEvent=state.events.at(-1),ended=false;
      function frame(now:number){if(disposed||run!==generation||!state||!scene||!input||!clock||!hud)return;const dt=Math.min(.1,(now-last)/1000);last=now;clock.frame(now);
        if(state.tick!==lastView||viewStale){viewStale=false;view=getTeamView(state,0);input.setView(view);lastView=state.tick;if(!state.paused){for(const cue of audioCues.observe(view))audio.play(cue);const camera=scene;for(const alert of attackAlerts.observe(view,p=>camera.inView(p))){hud.notice(alert.text,'alert');hud.ping(alert.x,alert.z);}}}
        if(!state.paused)input.update(dt);scene.render(view,state.paused?0:dt,clock.interpolation);
        if(now-lastHud>100){hud.render(view,input.selection,scene);lastHud=now;
          if(tutorial.current?.id==='select')tutorial.observe({type:'select',kinds:input.selection.map(id=>view.entities.find(e=>e.id===id&&e.team===0)?.kind).filter((k):k is NonNullable<typeof k>=>!!k)});}
        const fresh=drainEvents(state.events,lastEvent);if(fresh.length){lastEvent=fresh.at(-1);for(const event of fresh)if(event.team===0&&event.text)hud.notice(event.text);}
        if(!ended&&state.status!=='playing'){ended=true;audio.play(state.status==='draw'?'draw':state.winner===0?'victory':'defeat');showMenu(true);}
        raf=requestAnimationFrame(frame);
      }
      raf=requestAnimationFrame(frame);el<HTMLCanvasElement>('rts-canvas').focus();
    }catch(error){
      console.error('[RTS] Battlefield load failed',error);disposeGame();library?.dispose();library=null;
      battle.hidden=true;lobby.hidden=false;status.textContent='戰場載入失敗，請重試。';startButton.textContent='重新載入戰場';
    }finally{loading=false;startButton.disabled=false;}
  }
  startButton.addEventListener('click',()=>{const map=root.querySelector<HTMLInputElement>('input[name="rts-map"]:checked')?.value;void start(map==='pass'?'pass':'river');},{signal});
  el('rts-pause').addEventListener('click',()=>showMenu(),{signal});
  el('rts-resume').addEventListener('click',()=>{dialog.close();if(state)state.paused=false;clock?.setPaused(false);el<HTMLCanvasElement>('rts-canvas').focus();},{signal});
  el('rts-restart').addEventListener('click',()=>confirmThen('restart',()=>{dialog.close();void start(selectedMap);}),{signal});
  el('rts-back').addEventListener('click',()=>confirmThen('back',()=>{disposeGame();battle.hidden=true;lobby.hidden=false;startButton.textContent='開始戰役';startButton.focus();}),{signal});
  el('rts-surrender').addEventListener('click',()=>confirmThen('surrender',()=>{if(state){state.paused=false;issueCommand(state,0,{type:'surrender'});showMenu(true);}}),{signal});
  el('rts-confirm-yes').addEventListener('click',()=>{const action=confirmed;confirmed=null;confirmDialog.close();action?.();},{signal});
  el('rts-confirm-no').addEventListener('click',()=>confirmDialog.close(),{signal});
  confirmDialog.addEventListener('close',()=>{confirmed=null;},{signal});
  optional('rts-idle')?.addEventListener('click',()=>{input?.selectIdleWorker();},{signal});
  el('rts-home').addEventListener('click',()=>{if(state)scene?.focus(state.entities.find(e=>e.alive&&e.kind==='townhall'&&e.team===0)??state.map.spawns[0]);},{signal});
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(state?.status==='playing')el('rts-resume').click();},{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state?.status==='playing')showMenu();},{signal});
  const dispose=()=>{if(disposed)return;disposed=true;abort.abort();uninstallDebug();disposeGame();library?.dispose();audio.dispose();};
  window.addEventListener('pagehide',dispose,{signal,once:true});return dispose;
}
