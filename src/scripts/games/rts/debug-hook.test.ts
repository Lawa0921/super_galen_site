import {describe,it,expect} from 'vitest';
import {createGame} from './simulation';
import {installRtsDebugHook,type RtsDebugHook} from './debug-hook';

describe('dev-only RTS debug hook',()=>{
  it('spawns a completed building of any published kind and destroys it through the simulation',()=>{
    const state=createGame('river'),target={} as {__rtsDebug?:RtsDebugHook},focus:Array<{x:number;z:number}>=[];
    const uninstall=installRtsDebugHook(target,()=>({state,scene:{focus:(p:{x:number;z:number})=>focus.push(p),rubbleCount:3}}));
    const hook=target.__rtsDebug!;const id=hook.spawnBuilding('townhall',30,40,{tier:3});
    const hall=state.entities.find(e=>e.id===id)!;expect(hall).toMatchObject({kind:'townhall',team:0,construction:1,alive:true});expect(hall.category==='building'&&hall.tier).toBe(3);
    hook.focus(30,40);expect(focus).toEqual([{x:30,z:40}]);
    state.time=7;expect(hook.destroy(id)).toBe(true);expect(hall).toMatchObject({alive:false,deathTime:7,removalReason:'combat'});
    expect(hook.destroy(id)).toBe(false);expect(hook.time()).toBe(7);expect(hook.rubbleCount()).toBe(3);
    uninstall();expect(target.__rtsDebug).toBeUndefined();
  });
  it('freezes the simulation and advances it by exact fixed ticks for deterministic frame capture',()=>{
    const state=createGame('river'),target={} as {__rtsDebug?:RtsDebugHook};installRtsDebugHook(target,()=>({state,scene:null}));
    const hook=target.__rtsDebug!;hook.setPaused(true);expect(state.paused).toBe(true);
    expect(hook.advance(.7)).toBeCloseTo(.7,6);expect(state.time).toBeCloseTo(.7,6);expect(state.paused).toBe(true);
    hook.setPaused(false);expect(state.paused).toBe(false);
  });
  it('reveals the whole map for one team and frames an arbitrary camera for overview captures',()=>{
    const state=createGame('river'),target={} as {__rtsDebug?:RtsDebugHook},calls:unknown[]=[];let invalidated=0;
    installRtsDebugHook(target,()=>({state,scene:{focus:p=>calls.push(['focus',p]),setSpan:s=>calls.push(['span',s]),rubbleCount:0}}),()=>invalidated++);
    const hook=target.__rtsDebug!;expect(state.visibility[0].visible.every(v=>v===1)).toBe(false);
    hook.reveal();
    expect(state.paused).toBe(true);expect(state.visibility[0].visible.every(v=>v===1)).toBe(true);expect(state.visibility[0].explored.every(v=>v===1)).toBe(true);
    expect(state.visibility[1].visible.every(v=>v===1)).toBe(false);expect(invalidated).toBe(1);
    hook.camera(48,48,90);expect(calls).toEqual([['focus',{x:48,z:48}],['span',90]]);
    expect(()=>hook.camera(48,48,0)).toThrow('span');
  });
  it('reports the live renderer graphics state so quality switches can be verified',()=>{
    const state=createGame('river'),target={} as {__rtsDebug?:RtsDebugHook},renderer={shadowMap:{enabled:true},getPixelRatio:()=>1.5};
    installRtsDebugHook(target,()=>({state,scene:{focus:()=>{},rubbleCount:0,renderer}}));
    expect(target.__rtsDebug!.graphics()).toEqual({shadows:true,pixelRatio:1.5});
    renderer.shadowMap.enabled=false;renderer.getPixelRatio=()=>1;expect(target.__rtsDebug!.graphics()).toEqual({shadows:false,pixelRatio:1});
    installRtsDebugHook(target,()=>({state:null,scene:null}));expect(target.__rtsDebug!.graphics()).toBeNull();
  });
  it('is inert without a running game',()=>{
    const target={} as {__rtsDebug?:RtsDebugHook};installRtsDebugHook(target,()=>({state:null,scene:null}));
    expect(()=>target.__rtsDebug!.spawnBuilding('house',1,1)).toThrow('No running RTS game');expect(target.__rtsDebug!.rubbleCount()).toBe(0);
  });
});
