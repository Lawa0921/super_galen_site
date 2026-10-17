import {createState} from './state';
import type {GameState} from './types';
import {createMap} from './maps';
import {updateVisibility} from './visibility';
import {stepEconomy} from './economy';
import {stepCombat,resolveVictory} from './combat';
import {stepAI,AI_PROFILES,type Difficulty} from './ai';
import {separateIdle} from './movement';
/** `rosterPreview` unlocks the catalog's preview roster (tests and art review only; off when shipped). */
export function createGame(id:'river'|'pass'='river',seed=1,difficulty:Difficulty='normal',options:{rosterPreview?:boolean}={}):GameState {
  const s=createState(createMap(id),seed);if(options.rosterPreview)s.rosterPreview=true;for(const ai of s.ai){ai.difficulty=difficulty;ai.nextAttack=AI_PROFILES[difficulty].firstAttack;}updateVisibility(s);return s;
}
/** Fixed 20 Hz; wall-clock accumulation belongs to the presentation layer. */
export function stepGame(s:GameState,dt=.05):void {
  if(s.paused||s.status!=='playing')return;
  if(!Number.isFinite(dt)||Math.abs(dt-.05)>1e-8)throw new Error('RTS simulation requires a 0.05 second tick');
  s.tick++;s.time=s.tick/20;updateVisibility(s);
  for(const t of [0,1] as const)if(s.aiEnabled[t])stepAI(s,t);
  stepEconomy(s,dt);stepCombat(s,dt);separateIdle(s,dt);resolveVictory(s);
  if(s.tick%2===0)updateVisibility(s);
  // Keep event presentation bounded; the economy ledger remains complete for audit.
  if(s.events.length>250)s.events.splice(0,s.events.length-250);
}
