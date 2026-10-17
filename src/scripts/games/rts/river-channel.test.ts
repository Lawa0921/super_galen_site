import {describe,it,expect} from 'vitest';
import {Vector3,Matrix4} from 'three';
import {createMap,roadPaths} from './maps';
import {findPath,isWalkable,canPlace} from './navigation';
import {createState,buildings} from './state';
import {stepGame} from './simulation';
import {channelGroundGeometry,channelHeight,channelFogGeometry,channelRoadPaths,channelBanks,createChannelMap,CHANNEL_WATER_Y,RIVER,onBridge} from './river-channel';

describe('continuous original river terrain',()=>{
  it('carves only the blocked strip and preserves flat playable bridge approaches',()=>{
    const original=createMap('river'),before=original.blocked.slice(),map=createChannelMap(original);
    for(let z=.25;z<288;z+=.5)for(let x=130.25;x<158;x+=.5){
      const h=channelHeight(x,z);
      expect(Number.isFinite(h)).toBe(true);expect(h).toBeLessThanOrEqual(0);expect(h).toBeGreaterThanOrEqual(-1.25);
      const ford=Math.abs(z-RIVER.ford)<=RIVER.fordHalf+1.5;
      if(!onBridge(x,z,3)&&!ford&&!map.blocked[Math.floor(z)*288+Math.floor(x)])expect(h,`${x},${z}`).toBe(0);
    }
    // The centre ford is a dry causeway: walkable at ground level across the whole channel.
    for(let x=134.5;x<154;x++){expect(channelHeight(x,RIVER.ford+.5)).toBeCloseTo(0,9);expect(map.blocked[RIVER.ford*288+Math.floor(x)]).toBe(0);}
    const {left,right}=channelBanks(40);
    expect(channelHeight(left-1,40)).toBe(0);expect(channelHeight(right+1,40)).toBe(0);
    expect(channelHeight(left,40)).toBeCloseTo(CHANNEL_WATER_Y);expect(channelHeight(right,40)).toBeCloseTo(CHANNEL_WATER_Y);
    expect(channelHeight((left+right)/2,40)).toBeCloseTo(-1.25);expect(original.blocked).toEqual(before);
    expect(map.resources.map(r=>[r.id,r.kind,r.amount])).toEqual(original.resources.map(r=>[r.id,r.kind,r.amount]));expect(map.spawns).toEqual(original.spawns);
    const banks=Array.from({length:289},(_,z)=>channelBanks(z));
    expect(Math.max(...banks.map(b=>b.right-b.left))).toBeGreaterThan(8);
    expect(Math.max(...banks.map(b=>(b.left+b.right)/2))-Math.min(...banks.map(b=>(b.left+b.right)/2))).toBeGreaterThan(8);
  });
  it('keeps both bridge routes, the ford, all resources and production sites accessible',()=>{
    const map=createMap('river');
    for(const path of roadPaths(map))for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)*4);
      for(let j=0;j<=steps;j++)expect(isWalkable(map,{x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps},[],.78)).toBe(true);
    }
    for(const spawn of map.spawns)for(const target of [...map.resources,...map.camps,...map.spawns])expect(findPath(map,spawn,target,[],.78),JSON.stringify(target)).not.toBeNull();
    for(const p of [{x:24,z:131},{x:15,z:131},{x:37,z:131},{x:24,z:174},{x:37,z:174},{x:264,z:157},{x:273,z:157},{x:251,z:157},{x:264,z:114},{x:251,z:114}])expect(canPlace(map,{...p,width:7,depth:7})).toBe(true);
    for(const r of map.resources)for(const z of RIVER.bridges)expect(Math.abs(r.x-144)>7||Math.abs(r.z-z)>6).toBe(true);
  });
  it('keeps source texture UVs, connected faces, outer extent and positive face area',()=>{
    const geometry=channelGroundGeometry(),p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),idx=geometry.index!;
    const transform=new Matrix4().makeRotationX(-Math.PI/2);transform.setPosition(144,0,144);
    const point=(i:number)=>new Vector3().fromBufferAttribute(p,i).applyMatrix4(transform);
    const edgeUses=new Map<string,number>();
    for(let i=0;i<p.count;i++){
      const v=point(i);expect(uv.getX(i)).toBeCloseTo((v.x+96)/480,6);expect(uv.getY(i)).toBeCloseTo((384-v.z)/480,6);
      expect(v.y).toBeCloseTo(channelHeight(v.x,v.z),5);
    }
    for(let i=0;i<idx.count;i+=3){
      const ids=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)],a=point(ids[0]),b=point(ids[1]),c=point(ids[2]);
      expect(b.sub(a).cross(c.sub(a)).y).toBeGreaterThan(0);
      ids.forEach((v,j)=>{const other=ids[(j+1)%3],key=[Math.min(v,other),Math.max(v,other)].join(':');edgeUses.set(key,(edgeUses.get(key)??0)+1);});
    }
    for(const [key,count] of edgeUses){expect(count).toBeLessThanOrEqual(2);if(count===1){const [a,b]=key.split(':').map(Number).map(point);expect((a.x===b.x&&[-96,384].includes(a.x))||(a.z===b.z&&[-96,384].includes(a.z)),key).toBe(true);}}
    expect(idx.count/3).toBeLessThan(9000);geometry.dispose();
  });
  it('drapes fog over the water or land without changing its UV mapping',()=>{
    const geometry=channelFogGeometry(),p=geometry.getAttribute('position');
    for(let i=0;i<p.count;i++){const x=p.getX(i)+144,z=144-p.getY(i);expect(p.getZ(i)).toBeCloseTo(Math.max(onBridge(x,z)?.025:CHANNEL_WATER_Y,channelHeight(x,z))+.04,5);}
    geometry.dispose();
  });
  it('clips road strips before both bridges and the ford without changing navigation routes',()=>{
    const paths=channelRoadPaths(createMap('river'));
    // Two bridge roads and the ford road, each split in two, plus both natural and both third-expansion roads.
    expect(paths).toHaveLength(10);
    for(const path of paths)for(const p of path)expect(p.x<=140||p.x>=148).toBe(true);
    expect(channelRoadPaths(createMap('pass'))).toHaveLength(7);
  });
  it('lets the default AI pay, gather, build and cross the revised river to win',async()=>{
    const state=createState(createMap('river'),1);
    for(let i=0;i<36000&&state.status==='playing';i++){stepGame(state);if(i%500===499)await new Promise<void>(resolve=>setTimeout(resolve,0));}
    expect(state.status).toBe('won');expect(state.winner).toBe(1);expect(state.endReason).toBe('elimination');
    expect(buildings(state,1).find(b=>b.kind==='townhall')!.tier).toBeGreaterThanOrEqual(2);
    expect(state.teams[1].stats.gatheredGold).toBeGreaterThan(0);expect(state.teams[1].stats.gatheredWood).toBeGreaterThan(0);
    const ledger=state.economyLog.filter(r=>r.team===1);expect(state.teams[1].gold).toBeCloseTo(500+ledger.reduce((n,r)=>n+r.gold,0),5);expect(state.teams[1].wood).toBeCloseTo(200+ledger.reduce((n,r)=>n+r.wood,0),5);
    console.info(JSON.stringify({channelCampaign:{time:state.time,winner:state.winner,stats:state.teams[1].stats}}));
  },120000);
});
