import {describe,it,expect} from 'vitest';
import {createMap,roadPaths,type Vec2} from './maps';
import {channelBanks,RIVER} from './river-layout';

// Both maps are 288×288 1v1 maps with 180° rotational symmetry about the centre:
// point (x,z) ↔ (288−x, 288−z); cell (c,r) ↔ (287−c, 287−r).
const N=288;
const rotate=(p:Vec2)=>({x:N-p.x,z:N-p.z});
const near=(a:Vec2,b:Vec2)=>Math.hypot(a.x-b.x,a.z-b.z)<1e-6;

describe.each(['river','pass'] as const)('%s map gameplay symmetry',id=>{
  const map=createMap(id);
  it('is a 288 m square grid sized by the map itself',()=>{expect([map.width,map.height,map.blocked.length,map.noBuild.length]).toEqual([N,N,N*N,N*N]);});
  it('has rotationally symmetric walkable and buildable cells (0 mismatches)',()=>{
    let blocked=0,noBuild=0;
    for(let z=0;z<N;z++)for(let x=0;x<N;x++){const a=z*N+x,b=(N-1-z)*N+(N-1-x);
      if(map.blocked[a]!==map.blocked[b])blocked++;if(map.noBuild[a]!==map.noBuild[b])noBuild++;}
    expect({blocked,noBuild}).toEqual({blocked:0,noBuild:0});
  });
  it('pairs every spawn, resource, camp and landmark with its rotated twin',()=>{
    expect(near(map.spawns[1],rotate(map.spawns[0]))).toBe(true);
    for(const r of map.resources)expect(map.resources.some(o=>o.kind===r.kind&&o.amount===r.amount&&near(o,rotate(r))),r.id).toBe(true);
    for(const c of map.camps)expect(map.camps.some(o=>near(o,rotate(c)))).toBe(true);
    for(const l of map.landmarks??[])expect((map.landmarks??[]).some(o=>o.district===l.district&&near(o,rotate(l))),`${l.district}@${l.x},${l.z}`).toBe(true);
  });
  it('pairs every blocking tree and rock with its rotated twin',()=>{
    const solid=(map.scenery??[]).filter(p=>!p.onOriginalObstacle||p.kind!=='rock');
    for(const p of solid)expect(solid.some(o=>o.kind===p.kind&&Math.abs(o.radius-p.radius)<1e-9&&near(o,rotate(p))),`${p.kind}@${p.x},${p.z}`).toBe(true);
  });
  it('keeps the road network symmetric',()=>{
    const routes=roadPaths(map);
    for(const route of routes)expect(routes.some(other=>other.length===route.length&&other.every((p,i)=>near(p,rotate(route[route.length-1-i]))))).toBe(true);
  });
});
describe('river channel',()=>{
  it('bends symmetrically between the bases and stays centred on both stone bridges',()=>{
    for(let z=0;z<=N;z+=.25){const a=channelBanks(z),b=channelBanks(N-z);
      expect(a.left).toBeCloseTo(N-b.right,9);expect(a.right).toBeCloseTo(N-b.left,9);}
    expect(RIVER.bridges).toEqual([84,204]);expect(RIVER.ford).toBe(144);
    for(const z of [...RIVER.bridges,RIVER.ford]){const {left,right}=channelBanks(z);expect((left+right)/2).toBeCloseTo(144,1);}
  });
});
