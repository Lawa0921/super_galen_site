import {describe,it,expect} from 'vitest';
import {createGame,stepGame} from './simulation';
import {addBuilding,addUnit,buildings,units,population,distance,obstacles} from './state';
import {stepAI} from './ai';
import {canPlace} from './navigation';
import {BUILDINGS} from './catalog';
import type {GameState} from './types';

// The original twelve hand-placed AI construction offsets (team 1 uses their 180° twins).
const FIXED=[[0,-13],[13,-13],[20,0],[13,15],[0,17],[26,-15],[26,17],[0,-26],[13,-26],[26,-28],[0,30],[13,30]];
const rich=(s:GameState,t:0|1)=>{s.teams[t].gold=5000;s.teams[t].wood=5000;};
const think=(s:GameState,t:0|1)=>{s.ai[t].nextThink=0;stepAI(s,t);};

describe('AI construction sites beyond the fixed slots',()=>{
  it.each(['river','pass'] as const)('finds a legal, explored house site on %s once every fixed slot is taken',map=>{
    const s=createGame(map,1);s.aiEnabled=[false,false];rich(s,1);
    const base=s.map.spawns[1];
    // Occupy each fixed slot centre with a small tower so no 4x4 house fits there.
    for(const [dx,dz] of FIXED){const p={x:base.x-dx,z:base.z-dz};
      if(canPlace(s.map,{...p,width:3,depth:3},obstacles(s)))addBuilding(s,1,'tower',p,true);}
    addUnit(s,1,'guard',{x:base.x-6,z:base.z+8});stepGame(s);
    const p=population(s,1);expect(p.cap-p.used).toBeLessThan(5);
    const before=buildings(s,1).length;think(s,1);
    const house=buildings(s,1).find(b=>b.kind==='house');
    expect(buildings(s,1).length).toBeGreaterThan(before);expect(house).toBeDefined();
    // Keep mining and wood lines open: no footprint near a resource or on the hall-to-resource lane.
    for(const r of s.resources.filter(r=>distance(r,base)<25)){
      expect(distance(house!,r)).toBeGreaterThanOrEqual(5);
      const hx=base.x,hz=base.z,dx=r.x-hx,dz=r.z-hz,t=Math.max(0,Math.min(1,((house!.x-hx)*dx+(house!.z-hz)*dz)/(dx*dx+dz*dz)));
      expect(Math.hypot(house!.x-hx-t*dx,house!.z-hz-t*dz)).toBeGreaterThan(BUILDINGS.house.width/2+1);
    }
  });
});

describe('AI production and research choices',()=>{
  it('trains an affordable unlocked unit instead of stalling on a locked composition slot',()=>{
    // Tier II without a stable: the old rotation picked a knight for army slot 3 and stalled.
    const s=createGame('river',1);s.aiEnabled=[false,false];
    const base=s.map.spawns[1],hall=buildings(s,1).find(b=>b.kind==='townhall')!;hall.tier=2;
    const placed=[['barracks',0,-13],['lumbermill',13,-13],['forge',20,0],['altar',13,15],['house',0,17]] as const;
    const made=placed.map(([kind,dx,dz])=>addBuilding(s,1,kind,{x:base.x-dx,z:base.z+dz},true)),barracks=made[0];
    for(let i=0;i<3;i++)addUnit(s,1,'guard',{x:base.x-6-i*1.2,z:base.z+8});
    s.teams[1].gold=1000;s.teams[1].wood=500;stepGame(s);think(s,1);
    expect(barracks.queue.length).toBe(1);
  });
  it('researches armour and axe upgrades, not only weapons',()=>{
    const s=createGame('river',1);s.aiEnabled=[false,false];rich(s,1);
    // A finished tier III base (not saving for an upgrade) researches beyond weapons.
    const base=s.map.spawns[1];buildings(s,1).find(b=>b.kind==='townhall')!.tier=3;
    for(const [kind,dx,dz] of [['barracks',0,-13],['lumbermill',13,-13],['forge',20,0],['altar',13,15],['chapel',0,17],['stable',13,-26],['workshop',0,30]] as const)addBuilding(s,1,kind,{x:base.x-dx,z:base.z+dz},true);
    for(let i=0;i<2;i++)addUnit(s,1,'worker',{x:base.x-3+i*1.5,z:base.z+9});
    s.teams[1].research.push('weapons1');stepGame(s);
    const research=new Set<string>();
    for(let i=0;i<30;i++){think(s,1);for(const b of buildings(s,1))for(const q of b.queue)if(q.type==='research')research.add(String(q.target));rich(s,1);for(const b of buildings(s,1))b.queue=b.queue.filter(q=>q.type!=='research');}
    expect(research.has('armor1')).toBe(true);expect(research.has('timber')).toBe(true);
  });
  it('builds a guard tower once its core tech is in place',()=>{
    const s=createGame('river',1);s.aiEnabled=[false,false];rich(s,1);
    const base=s.map.spawns[1],hall=buildings(s,1).find(b=>b.kind==='townhall')!;hall.tier=3;
    for(const [kind,dx,dz] of [['barracks',0,-13],['lumbermill',13,-13],['forge',20,0],['altar',13,15],['chapel',0,17],['stable',13,-26],['workshop',0,30]] as const)addBuilding(s,1,kind,{x:base.x-dx,z:base.z+dz},true);
    stepGame(s);for(let i=0;i<5;i++){think(s,1);rich(s,1);}
    expect(buildings(s,1).some(b=>b.kind==='tower')).toBe(true);
  });
  it('grows its workforce past nine and spreads miners over more than one visible gold mine',()=>{
    // Tier II: the tier I opening keeps the original nine-worker pace.
    const s=createGame('river',1);s.aiEnabled=[false,false];rich(s,1);
    const base=s.map.spawns[1];buildings(s,1).find(b=>b.kind==='townhall')!.tier=2;
    for(const [dx,dz] of [[0,-13],[13,-13],[13,15]])addBuilding(s,1,'house',{x:base.x-dx,z:base.z+dz},true);
    for(let i=0;i<9;i++)addUnit(s,1,'worker',{x:base.x-3+(i%5)*1.5,z:base.z+7+Math.floor(i/5)*1.5});
    const far=s.resources.find(r=>r.id==='river-gold-south')!;far.x=base.x-4;far.z=base.z+14;
    stepGame(s);think(s,1);
    const hall=buildings(s,1).find(b=>b.kind==='townhall')!;
    expect(units(s,1).filter(u=>u.kind==='worker').length).toBe(14);
    expect(hall.queue.some(q=>q.target==='worker')).toBe(true);
    const mines=new Set(units(s,1).filter(u=>u.order.type==='gather').map(u=>(u.order as {resourceId:string}).resourceId).filter(id=>s.resources.find(r=>r.id===id)!.kind==='gold'));
    expect(mines.size).toBeGreaterThan(1);
  });
});

describe('match seed',()=>{
  // Each AI-trained unit with the tick it appeared. A run stops early once it
  // has already diverged from the reference: on the 288 m maps every
  // simulated second is costly and four full 420 s runs exceeded the timeout
  // under full-suite load. 300 s covers the opening, the think-phase split
  // (~200 s) and the first barracks production.
  const HORIZON=300;
  const run=(seed:number,reference?:string[])=>{const s=createGame('river',seed);s.aiEnabled=[true,true];const trained:string[]=[];const seen=new Set(s.entities.map(e=>e.id));
    while(s.time<HORIZON){stepGame(s);for(const e of s.entities)if(!seen.has(e.id)){seen.add(e.id);if(e.category==='unit'){trained.push(s.tick+':'+e.team+e.kind);
      if(reference&&trained[trained.length-1]!==reference[trained.length-1])return trained;}}}
    return trained;};
  it('changes AI decisions between seeds while each seed stays reproducible',()=>{
    const a=run(1);
    expect(a.length).toBeGreaterThan(10);
    expect(run(1)).toEqual(a);
    const b=run(2,a),c=run(3,a);
    expect(new Set([a,b,c].map(x=>x.join(','))).size).toBeGreaterThan(1);
  },60_000);
});
