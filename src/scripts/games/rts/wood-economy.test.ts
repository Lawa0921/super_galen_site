import {describe,it,expect} from 'vitest';
import {createGame,stepGame} from './simulation';
import {createMap} from './maps';
import {distance} from './state';

/** Wood nodes a seat can harvest from its own half (the far half is the opponent's). */
const homeWood=(s:ReturnType<typeof createGame>,t:0|1)=>s.resources.filter(r=>r.kind==='wood'&&distance(r,s.map.spawns[t])<distance(r,s.map.spawns[t?0:1]));
/** Cheapest wood bill that unlocks anything late (siege engine 140, tier-III research 140). */
const STARVED=140;
/**
 * Headless AI-vs-AI macro game: both seats run the normal AI, but attack
 * waves are held back so the match reaches the late game and the economy,
 * not a base race, decides whether the wood holds out for 20 minutes.
 * A seat runs out of wood once its home groves are cut AND its stock can no
 * longer pay a late wood cost; exhausted groves with a banked stock are not a stall.
 */
function endurance(id:'river'|'pass',seed:number){
  const s=createGame(id,seed);s.aiEnabled=[true,true];const dry:[number|null,number|null]=[null,null],starved:[number|null,number|null]=[null,null];
  while(s.time<1200&&s.status==='playing'){for(const ai of s.ai)ai.nextAttack=Infinity;stepGame(s);
    for(const t of [0,1] as const){const cut=homeWood(s,t).every(r=>r.remaining<=0);
      if(dry[t]===null&&cut)dry[t]=s.time;if(starved[t]===null&&cut&&s.teams[t].wood<STARVED)starved[t]=s.time;}}
  return {s,dry,starved,left:[0,1].map(t=>homeWood(s,t as 0|1).reduce((n,r)=>n+r.remaining,0)),gathered:s.teams.map(t=>t.stats.gatheredWood),stock:s.teams.map(t=>Math.floor(t.wood))};
}

describe.each(['river','pass'] as const)('%s wood economy',id=>{
  it('gives each seat the same home wood as its 180° twin, enough for the full tech tree twice over',()=>{
    const map=createMap(id),wood=map.resources.filter(r=>r.kind==='wood');
    const side=(t:0|1)=>wood.filter(r=>distance(r,map.spawns[t])<distance(r,map.spawns[t?0:1])).reduce((n,r)=>n+r.amount,0);
    expect(side(0)).toBe(side(1));expect(side(0)).toBeGreaterThanOrEqual(4000);
  });
  it('keeps both AI seats supplied with wood through 20 minutes of play',()=>{
    const {s,dry,starved,left,gathered,stock}=endurance(id,3);
    console.info(`[wood-economy] ${id}: t=${s.time.toFixed(0)}s starved=${JSON.stringify(starved)} groves-cut=${JSON.stringify(dry)} left=${left.join('/')} gathered=${gathered.join('/')} stock=${stock.join('/')}`);
    expect(s.time).toBeGreaterThanOrEqual(1200);expect(starved).toEqual([null,null]);
  },600_000);
});
