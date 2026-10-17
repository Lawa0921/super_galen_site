import type {BuildingKind,TeamId} from './catalog';
import type {GameState,Building} from './types';
import {addBuilding,destroyEntity} from './state';
import {stepGame} from './simulation';

/** Development/e2e-only handle. main.ts installs it behind import.meta.env.DEV,
 * so production bundles never expose it. */
export interface RtsDebugHook {
  spawnBuilding(kind:BuildingKind,x:number,z:number,options?:{team?:TeamId;tier?:Building['tier']}):number;
  destroy(id:number):boolean;
  focus(x:number,z:number):void;
  time():number;
  rubbleCount():number;
  setPaused(paused:boolean):void;
  /** Steps whole 0.05 s ticks, keeping the pause state; returns the new game time. */
  advance(seconds:number):number;
  /** Pauses and lifts the fog for one team (until the next simulation step) for overview captures. */
  reveal(team?:TeamId):void;
  /** Frames the camera at a world point with an orthographic span beyond the gameplay zoom limits. */
  camera(x:number,z:number,span:number):void;
  /** Live renderer state (shadows on, device pixel ratio) for verifying graphics-quality switches; null without a scene. */
  graphics():{shadows:boolean;pixelRatio:number}|null;
}
interface SceneAccess {focus(p:{x:number;z:number}):void;setSpan?(span:number):void;readonly rubbleCount:number;readonly renderer?:{shadowMap:{enabled:boolean};getPixelRatio():number}}
export function installRtsDebugHook(target:{__rtsDebug?:RtsDebugHook},access:()=>{state:GameState|null;scene:SceneAccess|null},invalidateView:()=>void=()=>{}):()=>void {
  const game=()=>{const {state,scene}=access();if(!state)throw new Error('No running RTS game');return {state,scene};};
  const hook:RtsDebugHook={
    spawnBuilding(kind,x,z,options={}){const b=addBuilding(game().state,options.team??0,kind,{x,z},true);if(options.tier)b.tier=options.tier;return b.id;},
    destroy(id){const {state}=game(),e=state.entities.find(e=>e.id===id&&e.alive);if(!e)return false;destroyEntity(state,e,'combat');return true;},
    focus(x,z){game().scene?.focus({x,z});},
    time(){return game().state.time;},
    rubbleCount(){return access().scene?.rubbleCount??0;},
    setPaused(paused){game().state.paused=paused;},
    advance(seconds){const {state}=game(),was=state.paused;state.paused=false;for(let i=Math.round(seconds/.05);i>0;i--)stepGame(state);state.paused=was;return state.time;},
    reveal(team=0){const {state}=game(),fog=state.visibility[team];state.paused=true;fog.visible.fill(1);fog.explored.fill(1);invalidateView();},
    camera(x,z,span){if(!(span>0))throw new Error('camera span must be positive');const {scene}=game();scene?.focus({x,z});scene?.setSpan?.(span);},
    graphics(){const renderer=access().scene?.renderer;return renderer?{shadows:renderer.shadowMap.enabled,pixelRatio:renderer.getPixelRatio()}:null;},
  };
  target.__rtsDebug=hook;
  return ()=>{if(target.__rtsDebug===hook)delete target.__rtsDebug;};
}
