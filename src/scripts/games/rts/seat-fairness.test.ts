import {describe,it,expect} from 'vitest';
import {createState,addBuilding,addUnit,buildings,units} from './state';
import {createGame,stepGame} from './simulation';
import {issueCommand} from './commands';
import {stepAI} from './ai';
import {approach,formationSlots} from './movement';
import {findPath} from './navigation';
import {updateVisibility} from './visibility';
import type {RtsMap} from './maps';

/** Exact 180° twin test map, like the real maps: (x,z) ↔ (96 − x, 96 − z). */
const mirroredMap=():RtsMap=>{
  const blocked=new Uint8Array(9216),noBuild=new Uint8Array(9216);
  for(let z=0;z<96;z++)for(let x=46;x<50;x++)if(!(z>=25&&z<31||z>=65&&z<71)){blocked[z*96+x]=1;noBuild[z*96+x]=1;}
  return {id:'river',name:'Mirror',width:96,height:96,blocked,noBuild,spawns:[{x:14,z:48},{x:82,z:48}],camps:[],
    resources:[{id:'g0',kind:'gold',x:24.5,z:48.5,amount:5000},{id:'w0',kind:'wood',x:22.5,z:58.5,amount:2500},{id:'g1',kind:'gold',x:71.5,z:47.5,amount:5000},{id:'w1',kind:'wood',x:73.5,z:37.5,amount:2500}]};
};
const mirrorX=(x:number)=>96-x,mirrorZ=(z:number)=>96-z;

describe('seat fairness: team index must not matter on a mirrored map',()=>{
  it('spawns trained units at mirrored positions for both seats',()=>{
    const s=createState(mirroredMap(),1);s.aiEnabled=[false,false];
    for(const t of [0,1] as const){const hall=buildings(s,t)[0];expect(issueCommand(s,t,{type:'train',buildingId:hall.id,unit:'worker'}).ok).toBe(true);}
    for(let i=0;i<20*7;i++)stepGame(s);
    const [a,b]=[0,1].map(t=>units(s,t as 0|1).at(-1)!);
    expect(a.x).toBeCloseTo(mirrorX(b.x),6);expect(a.z).toBeCloseTo(mirrorZ(b.z),6);
  });
  it('plays a mirrored AI opening the same way for both seats',()=>{
    // Pathfinding tie-breaks are not mirror-exact, so allow small economic
    // drift but no difference in build order, hero or tech.
    const s=createState(mirroredMap(),7);updateVisibility(s);s.aiEnabled=[true,true];
    while(s.time<300)stepGame(s);
    const summary=(t:0|1)=>({kinds:buildings(s,t).map(b=>b.kind).sort(),hero:units(s,t).some(u=>u.kind==='commander'),tier:Math.max(...buildings(s,t).filter(b=>b.kind==='townhall').map(b=>b.tier))});
    expect(summary(1)).toEqual(summary(0));
    const [g0,g1]=[0,1].map(t=>s.teams[t].stats.gatheredGold);expect(Math.abs(g0-g1)/Math.max(g0,g1)).toBeLessThan(.1);
  },30_000);
  it('recruits the hero before spending on the tier upgrade',()=>{
    const s=createGame('river',1);s.aiEnabled=[false,false];
    const base=s.map.spawns[0];
    for(const [kind,dx,dz] of [['barracks',0,-13],['lumbermill',13,-13],['forge',20,0],['altar',13,15],['house',0,17]] as const)addBuilding(s,0,kind,{x:base.x+dx,z:base.z+dz},true);
    s.teams[0].gold=460;s.teams[0].wood=300;stepGame(s);s.ai[0].nextThink=0;stepAI(s,0);
    expect(buildings(s,0).some(b=>b.kind==='altar'&&b.queue.some(q=>q.target==='commander'))).toBe(true);
  });
  it('stages an attack on the attacker side even when the seats are swapped',()=>{
    const map=mirroredMap();map.spawns=[map.spawns[1],map.spawns[0]];
    const s=createState(map,1);s.aiEnabled=[false,false];
    const east=map.spawns[0],enemyHall=buildings(s,1)[0];
    for(let i=0;i<6;i++)addUnit(s,0,'guard',{x:east.x-8,z:east.z-3+i*1.2});
    s.visibility[0].knownBuildings[enemyHall.id]={id:enemyHall.id,kind:'townhall',x:enemyHall.x,z:enemyHall.z,team:1,tier:1,lastSeen:0};
    s.time=200;s.tick=4000;s.ai[0].nextThink=0;stepAI(s,0);
    const guard=units(s,0).find(u=>u.kind==='guard')!;
    expect(guard.order.type).toBe('move');
    if(guard.order.type==='move')expect(guard.order.position.x).toBeGreaterThan(enemyHall.x);
  });
  it('scouts with a common soldier toward mirrored frontier points for both seats',()=>{
    const s=createState(mirroredMap(),1);s.aiEnabled=[false,false];updateVisibility(s);
    for(const t of [0,1] as const){const sp=s.map.spawns[t],side=t?-1:1;
      addUnit(s,t,'commander',{x:sp.x+side*6,z:sp.z-side*6});addUnit(s,t,'guard',{x:sp.x+side*6,z:sp.z+side*6});}
    // Second ring of the opening is skipped: both seats already scouted once.
    s.ai[0].lastScout=s.ai[1].lastScout=1;s.time=61;s.tick=1220;updateVisibility(s);
    for(const t of [0,1] as const){s.ai[t].nextThink=0;stepAI(s,t);}
    const scouts=[0,1].map(t=>units(s,t as 0|1).find(u=>u.order.type==='move')!);
    expect(scouts.map(u=>u.kind)).toEqual(['guard','guard']);
    const [a,b]=scouts.map(u=>(u.order as {position:{x:number;z:number}}).position);
    expect(a.x).toBeCloseTo(mirrorX(b.x),6);expect(a.z).toBeCloseTo(mirrorZ(b.z),6);
  });
  it('resolves geometric ties (approach entrances, formation slots, start cells) mirror-symmetrically',()=>{
    const s=createState(mirroredMap(),1);s.aiEnabled=[false,false];
    const [h0,h1]=[0,1].map(t=>buildings(s,t as 0|1)[0]);
    // A unit straight in front of each hall sees two equidistant entrances.
    // Initial workers are 180° twins in creation order.
    const [w0,w1]=[units(s,0)[0],units(s,1)[0]];w0.x=h0.x;w0.z=h0.z+9;w1.x=h1.x;w1.z=h1.z-9;
    const [p0,p1]=[approach(s,w0,h0,1,true)!,approach(s,w1,h1,1,true)!];
    expect(p0.x).toBeCloseTo(mirrorX(p1.x),6);expect(p0.z).toBeCloseTo(mirrorZ(p1.z),6);
    const g0=units(s,0),g1=units(s,1);
    const [f0,f1]=[formationSlots(s,0,{x:30,z:30},g0),formationSlots(s,1,{x:66,z:66},g1)];
    f0.forEach((p,i)=>{const q=f1[g1.findIndex(u=>Math.abs(u.x-mirrorX(g0[i].x))<1e-6&&Math.abs(u.z-mirrorZ(g0[i].z))<1e-6)];expect(p.x).toBeCloseTo(mirrorX(q.x),6);expect(p.z).toBeCloseTo(mirrorZ(q.z),6);});
    // Integer start points sit on a cell boundary; the first waypoint must mirror too.
    const [a,b]=[findPath(s.map,{x:20,z:40},{x:30,z:40}),findPath(s.map,{x:76,z:56},{x:66,z:56})];
    expect(a![1].x).toBeCloseTo(mirrorX(b![1].x),6);expect(a![1].z).toBeCloseTo(mirrorZ(b![1].z),6);
  });
});
