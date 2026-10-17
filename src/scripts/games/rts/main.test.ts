import {afterEach,describe,it,expect,vi} from 'vitest';
import {createGame} from './simulation';
import {mountRts} from './main';
const spies=vi.hoisted(()=>({render:vi.fn(),sceneRender:vi.fn(),paused:vi.fn(),mode:vi.fn(),bindSend:vi.fn()}));
vi.mock('./models',()=>({ModelLibrary:class {async load(){}dispose(){}}}));
vi.mock('./scene',()=>({Battlefield:class {render=spies.sceneRender;dispose(){}focus(){}setQuality(){}}}));
vi.mock('./input',()=>({BattlefieldInput:class {constructor(_scene:unknown,_view:unknown,send:unknown){spies.bindSend(send);}selection:number[]=[];setMode=spies.mode;setView(){}update(){}dispose(){}configure(){}}}));
vi.mock('./hud',()=>({Hud:class {render=spies.render;notice(){}}}));
vi.mock('./clock',()=>({SimulationClock:class {setPaused=spies.paused;frame(){}dispose(){}}}));
vi.mock('./audio',()=>({RtsAudio:class {start(){}dispose(){}play(){}setVolume(){}}}));
let dispose:()=>void;
afterEach(()=>{dispose?.();document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();});

describe('pause presentation',()=>{
  it('replaces a lost rendering surface after an initial paint failure and retries with one input and frame loop',async()=>{
    const root=document.createElement('main');document.body.append(root);
    root.innerHTML='<section id="rts-lobby"></section><section id="rts-battle" hidden></section><dialog id="rts-menu"></dialog><dialog id="rts-confirm"><h2 id="rts-confirm-title"></h2><p id="rts-confirm-copy"></p><button id="rts-confirm-yes"></button><button id="rts-confirm-no"></button></dialog><table id="rts-menu-stats" hidden></table><details id="rts-tech-tree"></details><input id="rts-volume"/><output id="rts-volume-value"></output><canvas id="rts-canvas"></canvas><canvas id="rts-overlay"></canvas>';
    for(const id of ['start','resume','restart','surrender','back','pause','home']){const b=document.createElement('button');b.id='rts-'+id;root.append(b);}
    for(const id of ['load-status','menu-tech','portrait','map-name','menu-title','menu-copy']){const e=document.createElement('div');e.id='rts-'+id;root.append(e);}
    const requestFrame=vi.fn(()=>1);vi.stubGlobal('requestAnimationFrame',requestFrame);vi.stubGlobal('cancelAnimationFrame',vi.fn());
    vi.spyOn(console,'error').mockImplementation(()=>{});spies.sceneRender.mockImplementationOnce(()=>{throw new Error('First draw failed');});
    const canvas=root.querySelector('#rts-canvas'),overlay=root.querySelector('#rts-overlay');dispose=mountRts(root);
    root.querySelector<HTMLButtonElement>('#rts-start')!.click();
    await vi.waitFor(()=>expect(root.querySelector('#rts-load-status')!.textContent).toBe('戰場載入失敗，請重試。'));
    expect(root.querySelector('#rts-canvas')).not.toBe(canvas);expect(root.querySelector('#rts-overlay')).not.toBe(overlay);
    expect(spies.bindSend).not.toHaveBeenCalled();expect(requestFrame).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('#rts-start')!.click();await vi.waitFor(()=>expect(requestFrame).toHaveBeenCalledOnce());
    expect(spies.sceneRender).toHaveBeenCalledTimes(2);expect(spies.bindSend).toHaveBeenCalledOnce();expect((root.querySelector('#rts-battle') as HTMLElement).hidden).toBe(false);
  });
  it('prepares pickable models before accepting input, even when the first animation frame is delayed or the match restarts',async()=>{
    const root=document.createElement('main');document.body.append(root);
    root.innerHTML='<section id="rts-lobby"></section><section id="rts-battle" hidden></section><dialog id="rts-menu"></dialog><dialog id="rts-confirm"><h2 id="rts-confirm-title"></h2><p id="rts-confirm-copy"></p><button id="rts-confirm-yes"></button><button id="rts-confirm-no"></button></dialog><table id="rts-menu-stats" hidden></table><details id="rts-tech-tree"></details><input id="rts-volume"/><output id="rts-volume-value"></output><canvas id="rts-canvas"></canvas><canvas id="rts-overlay"></canvas>';
    for(const id of ['start','resume','restart','surrender','back','pause','home']){const b=document.createElement('button');b.id='rts-'+id;root.append(b);}
    for(const id of ['load-status','menu-tech','portrait','map-name','menu-title','menu-copy']){const e=document.createElement('div');e.id='rts-'+id;root.append(e);}
    // No RAF callback runs: a browser may deliver the first pointer event first.
    const requestFrame=vi.fn(()=>1);vi.stubGlobal('requestAnimationFrame',requestFrame);vi.stubGlobal('cancelAnimationFrame',vi.fn());
    const states:ReturnType<typeof createGame>[]=[];
    dispose=mountRts(root,()=>{const state=createGame('river',states.length+1);states.push(state);return state;});
    for(const [index,button] of ['start','restart'].entries()){
      root.querySelector<HTMLButtonElement>('#rts-'+button)!.click();if(root.querySelector<HTMLDialogElement>('#rts-confirm')!.open)root.querySelector<HTMLButtonElement>('#rts-confirm-yes')!.click();
      await vi.waitFor(()=>expect(requestFrame).toHaveBeenCalledTimes(index+1));
      expect(spies.sceneRender).toHaveBeenCalledTimes(index+1);
      const [view,dt,interpolation]=spies.sceneRender.mock.calls[index];
      expect(view.entities.filter((e:{kind:string})=>e.kind==='worker')).toHaveLength(5);
      expect(dt).toBe(0);expect(interpolation).toBe(1);expect(states[index].tick).toBe(0);
      expect(spies.sceneRender.mock.invocationCallOrder[index]).toBeLessThan(spies.bindSend.mock.invocationCallOrder[index]);
    }
  });
  it.each([['stop',false],['hold',false],['stop',true],['hold',true]] as const)('clears targeting after accepted %s commands, but preserves it when paused=%s',async(type,paused)=>{
    const root=document.createElement('main');document.body.append(root);
    root.innerHTML='<section id="rts-lobby"></section><section id="rts-battle"></section><dialog id="rts-menu"></dialog><dialog id="rts-confirm"><h2 id="rts-confirm-title"></h2><p id="rts-confirm-copy"></p><button id="rts-confirm-yes"></button><button id="rts-confirm-no"></button></dialog><table id="rts-menu-stats" hidden></table><details id="rts-tech-tree"></details><input id="rts-volume"/><output id="rts-volume-value"></output><canvas id="rts-canvas"></canvas><canvas id="rts-overlay"></canvas>';
    for(const id of ['start','resume','restart','surrender','back','pause','home']){const b=document.createElement('button');b.id='rts-'+id;root.append(b);}
    for(const id of ['load-status','menu-tech','portrait','map-name','menu-title','menu-copy']){const e=document.createElement('div');e.id='rts-'+id;root.append(e);}
    vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
    const state=createGame('river',1);dispose=mountRts(root,()=>state);root.querySelector<HTMLButtonElement>('#rts-start')!.click();
    await vi.waitFor(()=>expect(spies.bindSend).toHaveBeenCalled());state.paused=paused;
    const send=spies.bindSend.mock.calls[0][0];expect(send({type,unitIds:[2]})).toBe(!paused);
    if(paused)expect(spies.mode).not.toHaveBeenCalled();else expect(spies.mode).toHaveBeenCalledExactlyOnceWith({type:'normal'});
  });
  it.each(['button','hidden'])('flushes the latest simulation snapshot before a %s pause, between throttled HUD frames',async trigger=>{
    const root=document.createElement('main');document.body.append(root);
    root.innerHTML='<section id="rts-lobby"></section><section id="rts-battle"></section><dialog id="rts-menu"></dialog><dialog id="rts-confirm"><h2 id="rts-confirm-title"></h2><p id="rts-confirm-copy"></p><button id="rts-confirm-yes"></button><button id="rts-confirm-no"></button></dialog><table id="rts-menu-stats" hidden></table><details id="rts-tech-tree"></details><input id="rts-volume"/><output id="rts-volume-value"></output><canvas id="rts-canvas"></canvas><canvas id="rts-overlay"></canvas>';
    for(const id of ['start','resume','restart','surrender','back','pause','home']){const b=document.createElement('button');b.id='rts-'+id;root.append(b);}
    for(const id of ['load-status','menu-tech','portrait','map-name','menu-title','menu-copy']){const e=document.createElement('div');e.id='rts-'+id;root.append(e);}
    let frame:FrameRequestCallback|undefined;
    vi.stubGlobal('requestAnimationFrame',vi.fn((callback:FrameRequestCallback)=>{frame=callback;return 1;}));vi.stubGlobal('cancelAnimationFrame',vi.fn());
    const state=createGame('river',1);state.time=.95;state.tick=19;
    dispose=mountRts(root,()=>state);root.querySelector<HTMLButtonElement>('#rts-start')!.click();await vi.waitFor(()=>expect(frame).toBeDefined());
    frame!(120);expect(spies.render.mock.calls.at(-1)![0].time).toBe(.95);
    state.time=1.05;state.tick=21;frame!(150);expect(spies.render.mock.calls.at(-1)![0].time).toBe(.95);
    if(trigger==='button')root.querySelector<HTMLButtonElement>('#rts-pause')!.click();
    else{vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));}
    expect(state.paused).toBe(true);expect(spies.paused).toHaveBeenLastCalledWith(true);
    expect(spies.render.mock.calls.at(-1)![0].time).toBe(1.05);
    expect(root.querySelector<HTMLDialogElement>('#rts-menu')!.open).toBe(true);
  });
});
