import {describe,it,expect} from 'vitest';
import {createGame,stepGame} from './simulation';
import {addUnit,addBuilding,units,tier} from './state';
import {stepAI,unitWeights} from './ai';
import {updateVisibility} from './visibility';
import {UNITS,type PlayableUnit} from './catalog';
import type {GameState} from './types';

const game=(rosterPreview:boolean)=>{const s=createGame('river',1,'normal',{rosterPreview});s.aiEnabled=[false,false];return s;};
const hallOf=(s:GameState,t:0|1)=>s.entities.find(e=>e.category==='building'&&e.team===t&&e.kind==='townhall')!;
/** Enemy (seat 0) units parked next to seat 1's hall, so seat 1 sees them. */
const show=(s:GameState,kind:PlayableUnit,n:number,visible=true)=>{const h=hallOf(s,1);
  for(let i=0;i<n;i++)addUnit(s,0,kind,visible?{x:h.x-8,z:h.z-4+i*1.6}:{x:48,z:10+i*1.6});updateVisibility(s);s.ai[1].nextThink=0;stepAI(s,1);};

describe('AI unit mix and counters',()=>{
  it('keeps the shipped mix exactly while the roster gate is off',()=>{
    const s=game(false);show(s,'knight',4);
    expect(unitWeights(s,1)).toEqual({guard:.34,crossbow:.26,knight:.2,priest:.1,siege:.1});
  });
  it('adds the preview units to the mix when the gate is on',()=>{
    const w=unitWeights(game(true),1);
    for(const k of ['pikeman','ranger','mage','gryphon'] as const)expect(w[k],k).toBeGreaterThan(0);
    expect(Object.keys(w).some(k=>UNITS[k as PlayableUnit].trainedAt==='altar')).toBe(false);
  });
  it('answers seen cavalry with pikemen, but never reads enemies through fog',()=>{
    const base=unitWeights(game(true),1).pikeman!;
    const seen=game(true);show(seen,'knight',4);expect(seen.ai[1].enemySeen?.knight).toBe(4);
    expect(unitWeights(seen,1).pikeman!).toBeGreaterThan(base*2);
    const fogged=game(true);show(fogged,'knight',4,false);
    expect(fogged.ai[1].enemySeen?.knight??0).toBe(0);expect(unitWeights(fogged,1).pikeman).toBeCloseTo(base);
  });
  it('shifts to anti-air once enemy flyers are seen',()=>{
    const base=unitWeights(game(true),1),s=game(true);show(s,'gryphon',3);const w=unitWeights(s,1);
    for(const k of ['ranger','crossbow','mage'] as const)expect(w[k]!,k).toBeGreaterThan(base[k]!*1.5);
    for(const k of ['guard','pikeman','knight'] as const)expect(w[k]!,k).toBeLessThan(base[k]!);
  });
  it('recruits a second hero once the castle allows it',()=>{
    const s=game(true);s.teams[1].gold=s.teams[1].wood=5000;const h=hallOf(s,1);if(h.category==='building')h.tier=2;
    for(const [i,kind] of (['barracks','lumbermill','forge','altar','house','house'] as const).entries())addBuilding(s,1,kind,{x:h.x+(i%3)*8-8,z:h.z+14+Math.floor(i/3)*8},true);
    addUnit(s,1,'commander',{x:h.x,z:h.z+8});expect(tier(s,1)).toBe(2);
    for(let i=0;i<4;i++){s.ai[1].nextThink=0;s.time+=1;stepAI(s,1);}
    const queued=s.entities.flatMap(e=>e.category==='building'&&e.team===1?e.queue.map(q=>q.target):[]);
    expect(queued.includes('sage')||units(s,1).some(u=>u.kind==='sage')).toBe(true);
  });
});

const NEW_UNITS:PlayableUnit[]=['pikeman','ranger','mage','gryphon','sage','ranger-captain'];
describe('roster in AI-vs-AI play',()=>{
  it.each(['river','pass'] as const)('fields the new roster and still ends by elimination inside 30 minutes (%s)',id=>{
    const s=createGame(id,1,'normal',{rosterPreview:true});s.aiEnabled=[true,true];
    const trained=new Set<string>(),peak:[Record<string,number>,Record<string,number>]=[{},{}];
    while(s.status==='playing'){stepGame(s);if(s.tick%20===0)for(const t of [0,1] as const){const now:Record<string,number>={};
      for(const u of units(s,t)){trained.add(u.kind);now[u.kind]=(now[u.kind]??0)+1;}for(const [k,n] of Object.entries(now))peak[t][k]=Math.max(peak[t][k]??0,n);}}
    console.info(`[roster-ai] ${id} ended t=${s.time.toFixed(0)}s ${s.status} winner=${s.winner} kinds=${[...trained].sort().join(',')} peak0=${JSON.stringify(peak[0])} peak1=${JSON.stringify(peak[1])}`);
    expect(s.status).toBe('won');expect(s.endReason).toBe('elimination');expect(s.time).toBeLessThan(1800);
    expect(NEW_UNITS.filter(k=>trained.has(k)).length).toBeGreaterThanOrEqual(2);
    // The air layer is part of real AI play, not only of the catalog.
    expect(trained.has('gryphon')).toBe(true);
    // A full match to elimination (~45 s alone on the 288 m pass map): same budget as ai-difficulty's AI-vs-AI test.
  },120_000);
});
