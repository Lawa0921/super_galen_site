import {describe,it,expect} from 'vitest';
import {createGame} from './simulation';
import {addUnit,addBuilding,units,tier} from './state';
import {stepAI,unitWeights,antiAirNeed,AI_PROFILES,type Difficulty} from './ai';
import {updateVisibility} from './visibility';
import {UNITS,type PlayableUnit,type BuildingKind} from './catalog';
import type {GameState,Unit} from './types';

const hallOf=(s:GameState,t:0|1)=>s.entities.find(e=>e.category==='building'&&e.team===t&&e.kind==='townhall')!;
/** Seat 1 with a finished tier III base and a deep bank, its three heroes already in the field. */
function castle(difficulty:Difficulty='normal',rosterPreview=true){
  const s=createGame('river',1,difficulty,{rosterPreview});s.aiEnabled=[false,false];
  s.teams[1].gold=s.teams[1].wood=5000;const h=hallOf(s,1);if(h.category==='building')h.tier=3;
  const kinds:BuildingKind[]=['barracks','lumbermill','forge','altar','chapel','stable','workshop','house','house','house','house'];
  for(const [i,kind] of kinds.entries())addBuilding(s,1,kind,{x:h.x+(i%4)*9-14,z:h.z+14+Math.floor(i/4)*9},true);
  for(const hero of (rosterPreview?['commander','sage','ranger-captain']:['commander']) as PlayableUnit[])addUnit(s,1,hero,{x:h.x,z:h.z+8});
  updateVisibility(s);expect(tier(s,1)).toBe(3);return s;
}
const think=(s:GameState,n=4)=>{for(let i=0;i<n;i++){s.ai[1].nextThink=0;s.time+=1;stepAI(s,1);}};
const queued=(s:GameState)=>s.entities.flatMap(e=>e.category==='building'&&e.team===1?e.queue.filter(q=>q.type==='train').map(q=>q.target as PlayableUnit):[]);
/** Enemy (seat 0) units next to seat 1's hall, so seat 1 sees and remembers them. */
const show=(s:GameState,kind:PlayableUnit,n:number)=>{const h=hallOf(s,1);
  for(let i=0;i<n;i++)addUnit(s,0,kind,{x:h.x-8,z:h.z-4+i*1.6});updateVisibility(s);s.ai[1].nextThink=0;stepAI(s,1);
  for(const u of units(s,0))if(u.kind===kind)u.alive=false;s.entities=s.entities.filter(e=>e.alive);updateVisibility(s);};

describe('AI air layer: gryphons',()=>{
  it('techs into and fields a gryphon at tier III on normal',()=>{
    const s=castle();think(s,6);expect(queued(s)).toContain('gryphon');
  });
  it('fields two gryphons on hard and none by rule on easy',()=>{
    expect(AI_PROFILES.hard.air.min).toBeGreaterThan(AI_PROFILES.normal.air.min);expect(AI_PROFILES.easy.air.min).toBe(0);
    expect(AI_PROFILES.easy.air.harass).toBe(false);expect(AI_PROFILES.normal.air.harass).toBe(true);
    const w=(d:Difficulty)=>unitWeights(castle(d),1).gryphon!;expect(w('easy')).toBeLessThan(w('normal'));expect(w('hard')).toBeGreaterThan(w('normal'));
  });
  it('never fields gryphons while the roster gate is off',()=>{
    const s=castle('hard',false);think(s,8);expect(queued(s)).not.toContain('gryphon');expect(units(s,1).some(u=>u.kind==='gryphon')).toBe(false);
  });
  it('favours gryphons against an enemy without anti-air and drops them against massed anti-air',()=>{
    const base=unitWeights(castle(),1).gryphon!;
    const open=castle();show(open,'guard',4);show(open,'pikeman',3);expect(unitWeights(open,1).gryphon!).toBeGreaterThan(base*2);
    const covered=castle();show(covered,'crossbow',5);show(covered,'ranger',3);expect(unitWeights(covered,1).gryphon!).toBeLessThan(base);
  });
});

describe('AI air layer: answering enemy flyers',()=>{
  it('scales the anti-air it wants by difficulty once flyers are seen',()=>{
    const need=(d:Difficulty)=>{const s=castle(d);show(s,'gryphon',3);return antiAirNeed(s,1);};
    expect(antiAirNeed(castle(),1)).toBe(0);
    expect(need('easy')).toBeGreaterThan(0);expect(need('normal')).toBeGreaterThan(need('easy'));expect(need('hard')).toBeGreaterThan(need('normal'));
  });
  it('trains only anti-air soldiers while short of the anti-air it needs',()=>{
    const s=castle();show(s,'gryphon',3);think(s,6);
    const soldiers=queued(s).filter(k=>k!=='worker');expect(soldiers.length).toBeGreaterThan(0);
    for(const k of soldiers)expect(UNITS[k].targetsAir,k).toBe(true);
  });
});

describe('AI air layer: gryphon harassment',()=>{
  /** A seat-1 gryphon beside seat 0's hall, where seat 0's starting workers mine. */
  function raid(difficulty:Difficulty='normal'){
    const s=castle(difficulty),enemy=hallOf(s,0),g=addUnit(s,1,'gryphon',{x:enemy.x+5,z:enemy.z+5});updateVisibility(s);return {s,g,enemy};
  }
  it('hunts visible enemy workers when no anti-air is around',()=>{
    const {s,g}=raid();think(s,1);expect(g.order.type).toBe('attack');
    const target=s.entities.find(e=>g.order.type==='attack'&&e.id===g.order.targetId) as Unit;expect(target.kind).toBe('worker');expect(target.team).toBe(0);
  });
  it('pulls out when enemy anti-air guards the workers',()=>{
    const {s,g}=raid();for(let i=0;i<3;i++)addUnit(s,0,'crossbow',{x:g.x+3,z:g.z+i});updateVisibility(s);think(s,1);
    expect(g.order.type).toBe('move');if(g.order.type==='move'){expect(g.order.attackMove).toBe(false);expect(Math.hypot(g.order.position.x-hallOf(s,1).x,g.order.position.z-hallOf(s,1).z)).toBeLessThan(20);}
  });
  it('flies a badly hurt gryphon home',()=>{
    const {s,g}=raid();g.hp=g.maxHp*.3;think(s,1);expect(g.order.type).toBe('move');
  });
  it('does not stall all production waiting for anti-air it cannot afford',()=>{
    const s=castle();show(s,'gryphon',3);s.teams[1].wood=30;think(s,3);
    expect(queued(s).some(k=>k==='guard'||k==='pikeman')).toBe(true);
  });
  const remember=(s:GameState,kind:'townhall'|'tower',x:number,z:number)=>{const id=9000+Object.keys(s.visibility[1].knownBuildings).length;
    s.visibility[1].knownBuildings[id]={id,kind,x,z,team:0,tier:1,lastSeen:0,construction:1};};
  it('raids a remembered enemy hall but not one a remembered tower guards',()=>{
    const open=castle(),h=hallOf(open,1),enemy=hallOf(open,0),g=addUnit(open,1,'gryphon',{x:h.x,z:h.z+6});remember(open,'townhall',enemy.x,enemy.z);think(open,1);
    expect(g.order.type==='move'&&g.order.attackMove&&Math.hypot(g.order.position.x-enemy.x,g.order.position.z-enemy.z)<1).toBe(true);
    const guarded=castle(),g2=addUnit(guarded,1,'gryphon',{x:h.x,z:h.z+6});remember(guarded,'townhall',enemy.x,enemy.z);remember(guarded,'tower',enemy.x+6,enemy.z);think(guarded,1);
    expect(g2.order.type==='move'&&Math.hypot(g2.order.position.x-enemy.x,g2.order.position.z-enemy.z)<1).toBe(false);
  });
  it('lets a hurt gryphon that is already home rejoin the army instead of holding it back',()=>{
    const s=castle(),h=hallOf(s,1),g=addUnit(s,1,'gryphon',{x:h.x,z:h.z+6});g.hp=g.maxHp*.3;think(s,1);
    expect(g.order.type==='move'&&!g.order.attackMove).toBe(false);
  });
  it('leaves harassment out on easy',()=>{
    const {s,g}=raid('easy');think(s,1);expect(g.order.type).not.toBe('attack');
  });
});
