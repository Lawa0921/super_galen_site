import {describe,it,expect} from 'vitest';
import {createGame,stepGame} from './simulation';
import {addUnit,units,destroyEntity,distance} from './state';
import {issueCommand} from './commands';
import {isWalkable,findPath} from './navigation';
import {UNITS} from './catalog';
import type {Unit} from './types';

// Overlap tolerance: 10% of the summed radii (~0.1 m for guards). Units may
// legitimately brush while yielding to a mover, but never visibly interpenetrate.
const OVERLAP=.9;
const overlapPairs=(g:Unit[])=>{let n=0;for(let i=0;i<g.length;i++)for(let j=i+1;j<g.length;j++)
  if(distance(g[i],g[j])<(UNITS[g[i].kind].radius+UNITS[g[j].kind].radius)*OVERLAP)n++;return n;};
const spotsNear=(s:ReturnType<typeof createGame>,c:{x:number;z:number},n:number)=>{const out:{x:number;z:number}[]=[];
  for(let x=c.x-4;x<=c.x+4;x+=1.2)for(let z=c.z-4;z<=c.z+4;z+=1.2){const p={x,z};if(isWalkable(s.map,p,[],.5)&&findPath(s.map,p,{x:30.5,z:40.5},[],.5))out.push(p);}
  return out.sort((a,b)=>distance(a,c)-distance(b,c)).slice(0,n);};
const reveal=(s:ReturnType<typeof createGame>)=>{for(const i of s.visibility[0].explored.keys()){s.visibility[0].explored[i]=1;s.visibility[0].visible[i]=1;}};
// Narrowest crossings on each 192 m map (pass centre gap 6 cells, goat trail 4, bridges 6, ford 6).
const crossings=[
  {map:'pass',name:'pass middle',from:{x:84,z:96},to:{x:108,z:96}},
  {map:'pass',name:'pass north',from:{x:84,z:47.5},to:{x:108,z:47.5}},
  {map:'river',name:'north bridge',from:{x:84,z:58},to:{x:108,z:56}},
  {map:'river',name:'south bridge',from:{x:84,z:136},to:{x:108,z:136}},
  {map:'river',name:'centre ford',from:{x:82,z:96},to:{x:110,z:96}},
] as const;
describe('group movement separation',()=>{
  it.each(crossings)('20 guards cross the $name without stacking and all settle',c=>{
    const s=createGame(c.map,1);s.aiEnabled=[false,false];
    for(const u of units(s,-1))destroyEntity(s,u);reveal(s);
    const spots:{x:number;z:number}[]=[];
    for(let x=c.from.x-7;x<=c.from.x;x+=1.1)for(let z=c.from.z-5;z<=c.from.z+5;z+=1.1){const p={x,z};if(isWalkable(s.map,p,[],.5)&&findPath(s.map,p,c.to,[],.48))spots.push(p);}
    spots.sort((a,b)=>distance(a,c.from)-distance(b,c.from));
    const g=spots.slice(0,20).map(p=>addUnit(s,0,'guard',p));
    expect(issueCommand(s,0,{type:'move',unitIds:g.map(u=>u.id),position:c.to})).toEqual({ok:true});
    let lastCross=-1,idleAt=-1,maxOverlap=0;const crossed=new Set<number>();
    for(let tick=0;tick<20*120;tick++){stepGame(s);
      g.forEach(u=>{if(u.x>102)crossed.add(u.id);});if(lastCross<0&&crossed.size===20)lastCross=s.time;
      maxOverlap=Math.max(maxOverlap,overlapPairs(g));
      if(idleAt<0&&g.every(u=>u.order.type==='idle')){idleAt=s.time;break;}
    }
    console.info(`[formation:${c.name}] lastCross=${lastCross} allIdle=${idleAt} maxOverlapPairs=${maxOverlap} endOverlap=${overlapPairs(g)}`);
    expect(lastCross).toBeGreaterThan(0);expect(lastCross).toBeLessThan(16);
    expect(idleAt).toBeGreaterThan(0);
    expect(overlapPairs(g)).toBe(0);expect(maxOverlap).toBeLessThanOrEqual(2);
    expect(g.every(u=>distance(u,c.to)<6)).toBe(true);
  });
  it('assigns distinct walkable formation slots and keeps a lone unit on the exact point',()=>{
    const s=createGame('river',1);s.aiEnabled=[false,false];reveal(s);
    const g=spotsNear(s,{x:24,z:36},12).map(p=>addUnit(s,0,'guard',p));expect(g).toHaveLength(12);
    const goal={x:30.5,z:40.5};
    expect(issueCommand(s,0,{type:'move',unitIds:g.map(u=>u.id),position:goal})).toEqual({ok:true});
    const slots=g.map(u=>(u.order as {position:{x:number;z:number}}).position);
    for(let i=0;i<slots.length;i++){expect(isWalkable(s.map,slots[i],[],UNITS.guard.radius)).toBe(true);
      for(let j=i+1;j<slots.length;j++)expect(distance(slots[i],slots[j])).toBeGreaterThanOrEqual(UNITS.guard.radius*2);}
    expect(Math.max(...slots.map(p=>distance(p,goal)))).toBeLessThan(4);
    const lone=addUnit(s,0,'guard',spotsNear(s,{x:24,z:44},1)[0]);
    issueCommand(s,0,{type:'move',unitIds:[lone.id],position:goal});
    expect(lone.order).toEqual({type:'move',position:goal,attackMove:false});
  });
  it('separates idle units that were stacked on one point',()=>{
    const s=createGame('river',1);s.aiEnabled=[false,false];
    const at=spotsNear(s,{x:25,z:36},1)[0];const g=Array.from({length:6},()=>addUnit(s,0,'guard',at));
    for(let i=0;i<20*5;i++)stepGame(s);
    expect(overlapPairs(g)).toBe(0);expect(g.every(u=>u.order.type==='idle'&&distance(u,at)<3)).toBe(true);
  });
  it('lets individually rallied units that cannot reach the shared point settle to idle',()=>{
    const s=createGame('river',1);s.aiEnabled=[false,false];reveal(s);
    const goal={x:30.5,z:40.5};
    const g=spotsNear(s,{x:24,z:34},8).map(p=>addUnit(s,0,'guard',p));expect(g).toHaveLength(8);
    for(const u of g)expect(issueCommand(s,0,{type:'move',unitIds:[u.id],position:goal}).ok).toBe(true);
    let idleAt=-1;for(let i=0;i<20*60&&idleAt<0;i++){stepGame(s);if(g.every(u=>u.order.type==='idle'))idleAt=s.time;}
    expect(idleAt).toBeGreaterThan(0);expect(overlapPairs(g)).toBe(0);
  });
});
