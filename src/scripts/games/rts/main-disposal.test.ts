import {afterEach,describe,expect,it,vi} from 'vitest';
import {createGame} from './simulation';
import {mountRts} from './main';
import type {Command} from './types';

const handles=vi.hoisted(()=>({
  library:vi.fn(()=>({load:vi.fn(async()=>{}),dispose:vi.fn()})),
  scene:vi.fn(()=>({render:vi.fn(),dispose:vi.fn(),focus:vi.fn(),setQuality:vi.fn()})),
  input:vi.fn((_send:(command:Command)=>boolean)=>({selection:[] as number[],setMode:vi.fn(),setView:vi.fn(),update:vi.fn(),dispose:vi.fn(),configure:vi.fn()})),
  clock:vi.fn(()=>({frame:vi.fn(),setPaused:vi.fn(),dispose:vi.fn(),interpolation:1})),
  audio:vi.fn(()=>({start:vi.fn(),dispose:vi.fn(),play:vi.fn(),setVolume:vi.fn()})),
}));
vi.mock('./models',()=>({ModelLibrary:class {constructor(){return handles.library();}}}));
vi.mock('./scene',()=>({Battlefield:class {constructor(){return handles.scene();}}}));
vi.mock('./input',()=>({BattlefieldInput:class {constructor(_scene:unknown,_view:unknown,send:(command:Command)=>boolean){return handles.input(send);}}}));
vi.mock('./clock',()=>({SimulationClock:class {constructor(){return handles.clock();}}}));
vi.mock('./audio',()=>({RtsAudio:class {constructor(){return handles.audio();}}}));
vi.mock('./hud',()=>({Hud:class {render(){}notice(){}}}));

let dispose:(()=>void)|undefined;
afterEach(()=>{dispose?.();dispose=undefined;document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();});
function setup(){
  const root=document.createElement('main');document.body.append(root);
  root.innerHTML='<section id="rts-lobby"></section><section id="rts-battle" hidden></section><dialog id="rts-menu"></dialog><dialog id="rts-confirm"><h2 id="rts-confirm-title"></h2><p id="rts-confirm-copy"></p><button id="rts-confirm-yes"></button><button id="rts-confirm-no"></button></dialog><table id="rts-menu-stats" hidden></table><details id="rts-tech-tree"></details><input id="rts-volume"/><output id="rts-volume-value"></output><canvas id="rts-canvas"></canvas><canvas id="rts-overlay"></canvas>';
  for(const id of ['start','resume','restart','surrender','back','pause','home']){const button=document.createElement('button');button.id='rts-'+id;root.append(button);}
  for(const id of ['load-status','menu-tech','portrait','map-name','menu-title','menu-copy']){const element=document.createElement('div');element.id='rts-'+id;root.append(element);}
  const callbacks:FrameRequestCallback[]=[],requestFrame=vi.fn((callback:FrameRequestCallback)=>callbacks.push(callback)),cancelFrame=vi.fn();
  vi.stubGlobal('requestAnimationFrame',requestFrame);vi.stubGlobal('cancelAnimationFrame',cancelFrame);
  const makeGame=vi.fn(()=>createGame('river'));dispose=mountRts(root,makeGame);
  const click=(id:string)=>root.querySelector<HTMLButtonElement>('#rts-'+id)!.click();
  const confirm=()=>{if(root.querySelector<HTMLDialogElement>('#rts-confirm')!.open)click('confirm-yes');};
  const start=async(id='start')=>{const count=requestFrame.mock.calls.length;click(id);confirm();await vi.waitFor(()=>expect(requestFrame).toHaveBeenCalledTimes(count+1));};
  const match=(index:number)=>({scene:handles.scene.mock.results[index].value,input:handles.input.mock.results[index].value,clock:handles.clock.mock.results[index].value});
  return {root,callbacks,requestFrame,cancelFrame,makeGame,click,confirm,start,match};
}

describe('match and root resource ownership',()=>{
  it('releases each old match on restart, reuses its model library and rejects stale frame callbacks',async()=>{
    const {start,match,callbacks,requestFrame,cancelFrame,makeGame}=setup();await start();
    const first=match(0),staleFrame=callbacks[0];staleFrame(200);
    const latestOldRaf=requestFrame.mock.results.at(-1)!.value,library=handles.library.mock.results[0].value;
    await start('restart');
    for(const resource of Object.values(first))expect(resource.dispose).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledWith(latestOldRaf);expect(makeGame).toHaveBeenCalledTimes(2);
    expect(handles.library).toHaveBeenCalledOnce();expect(library.load).toHaveBeenCalledTimes(2);expect(library.dispose).not.toHaveBeenCalled();
    const second=match(1),requested=requestFrame.mock.calls.length,oldRendered=first.scene.render.mock.calls.length;
    staleFrame(400);
    expect(first.scene.render).toHaveBeenCalledTimes(oldRendered);expect(first.clock.frame).toHaveBeenCalledOnce();
    expect(second.scene.render).toHaveBeenCalledOnce();expect(second.clock.frame).not.toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledTimes(requested);
  });
  it('returns to the lobby with no live match, old commands or frame loop',async()=>{
    const {root,start,match,click,confirm,callbacks,requestFrame,makeGame,cancelFrame}=setup();await start();
    const current=match(0),state=makeGame.mock.results[0].value,send=handles.input.mock.calls[0][0];
    const audio=handles.audio.mock.results[0].value,disposals=audio.dispose.mock.calls.length;
    click('back');confirm();
    for(const resource of Object.values(current))expect(resource.dispose).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledWith(requestFrame.mock.results[0].value);
    expect(audio.dispose.mock.calls.length).toBeGreaterThan(disposals);
    expect(root.querySelector<HTMLElement>('#rts-battle')!.hidden).toBe(true);expect(root.querySelector<HTMLElement>('#rts-lobby')!.hidden).toBe(false);
    expect(send({type:'surrender'})).toBe(false);expect(state.status).toBe('playing');
    callbacks[0](300);expect(current.clock.frame).not.toHaveBeenCalled();expect(requestFrame).toHaveBeenCalledOnce();
    expect(makeGame).toHaveBeenCalledOnce();expect(handles.library.mock.results[0].value.dispose).not.toHaveBeenCalled();
  });
  it.each(['return','pagehide'])('disposes the root through %s once and removes its event handlers',async trigger=>{
    const {root,start,match,click,callbacks,requestFrame,makeGame,cancelFrame}=setup();await start();
    const current=match(0),audio=handles.audio.mock.results[0].value,library=handles.library.mock.results[0].value,volumeCalls=audio.setVolume.mock.calls.length;
    if(trigger==='return')dispose!();else window.dispatchEvent(new Event('pagehide'));
    const audioDisposals=audio.dispose.mock.calls.length;expect(audioDisposals).toBeGreaterThan(0);
    dispose!();window.dispatchEvent(new Event('pagehide'));click('start');click('restart');click('pause');click('home');
    const volume=root.querySelector<HTMLInputElement>('#rts-volume')!;volume.value='20';volume.dispatchEvent(new Event('input'));
    vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));callbacks[0](300);
    for(const resource of Object.values(current))expect(resource.dispose).toHaveBeenCalledOnce();
    expect(library.dispose).toHaveBeenCalledOnce();expect(audio.dispose).toHaveBeenCalledTimes(audioDisposals);
    // The saved volume is applied once at mount; nothing reaches audio after disposal.
    expect(audio.setVolume).toHaveBeenCalledTimes(volumeCalls);expect(audio.play).not.toHaveBeenCalled();expect(audio.start).toHaveBeenCalledOnce();
    expect(current.clock.setPaused).not.toHaveBeenCalled();expect(current.scene.focus).not.toHaveBeenCalled();
    expect(makeGame).toHaveBeenCalledOnce();expect(requestFrame).toHaveBeenCalledOnce();expect(cancelFrame).toHaveBeenCalledWith(requestFrame.mock.results[0].value);
  });
});
