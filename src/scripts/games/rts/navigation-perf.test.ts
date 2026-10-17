import {describe,it,expect} from 'vitest';
import {createMap,type Footprint,type RtsMap,type Vec2} from './maps';
import {canPlace,findPath,isWalkable} from './navigation';
import {UNITS} from './catalog';

/** The original per-neighbour isWalkable A* (same tie-breaks), kept as the behavioural oracle. */
function referencePath(map:RtsMap,start:Vec2,goal:Vec2,obstacles:Footprint[],radius:number):number[]|null {
  const W=map.width,ok=(x:number,z:number)=>x>=0&&z>=0&&x<W&&z<map.height&&isWalkable(map,{x:x+.5,z:z+.5},obstacles,radius);
  const cell=(p:Vec2)=>{let best:{i:number;d:number}|null=null;
    for(let z=Math.floor(p.z)-1;z<=Math.floor(p.z)+1;z++)for(let x=Math.floor(p.x)-1;x<=Math.floor(p.x)+1;x++){
      const d=Math.hypot(p.x-x-.5,p.z-z-.5);if(d>Math.SQRT2||!ok(x,z))continue;let clear=true;const n=Math.max(1,Math.ceil(d/.12));
      for(let i=1;i<n;i++)if(!isWalkable(map,{x:p.x+(x+.5-p.x)*i/n,z:p.z+(z+.5-p.z)*i/n},obstacles,radius)){clear=false;break;}
      const inward=(i:number)=>Math.abs(i%W+.5-W/2)+Math.abs(Math.floor(i/W)+.5-map.height/2)*1e-3,i=z*W+x;
      if(clear&&(!best||Math.abs(d-best.d)>1e-9?(!best||d<best.d):inward(i)-inward(best.i)<0||inward(i)===inward(best.i)&&i<best.i))best={i,d};}
    return best?.i??null;};
  const s=cell(start),g=cell(goal);if(s===null||g===null)return null;
  const cost=new Float64Array(W*map.height).fill(Infinity),parent=new Int32Array(W*map.height).fill(-1),closed=new Uint8Array(W*map.height);
  const h=(i:number)=>{const dx=Math.abs(i%W-g%W),dz=Math.abs(Math.floor(i/W)-Math.floor(g/W));return Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz);};
  const open:Array<{i:number;c:number;p:number;o:number}>=[{i:s,c:0,p:h(s),o:0}];let order=1;cost[s]=0;
  while(open.length){let k=0;for(let j=1;j<open.length;j++){const a=open[j],b=open[k];if(a.p-b.p||a.c-b.c||a.o-b.o?(a.p-b.p||a.c-b.c||a.o-b.o)<0:false)k=j;}
    const cur=open.splice(k,1)[0];if(closed[cur.i]||cur.c>cost[cur.i]+1e-9)continue;if(cur.i===g)break;closed[cur.i]=1;const x=cur.i%W,z=Math.floor(cur.i/W);
    for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]){const nx=x+dx,nz=z+dz;
      if(!ok(nx,nz)||dx&&dz&&(!ok(nx,z)||!ok(x,nz)))continue;const n=nz*W+nx;if(closed[n])continue;
      const c=cost[cur.i]+(dx&&dz?Math.SQRT2:1);if(c+1e-9>=cost[n])continue;cost[n]=c;parent[n]=cur.i;open.push({i:n,c,p:c+h(n),o:order++});}}
  if(s===g)return [s];if(parent[g]<0)return null;const cells=[g];while(cells[cells.length-1]!==s)cells.push(parent[cells[cells.length-1]]);return cells.reverse();
}
const cellsOf=(map:RtsMap,path:Vec2[]|null)=>path&&path.map(p=>Math.floor(p.z)*map.width+Math.floor(p.x));
/** A mid-game base: twelve 4x4 buildings per seat, placed as 180° twins. */
function baseObstacles(map:RtsMap):Footprint[]{
  const [a,b]=map.spawns;
  return [[0,-13],[13,-13],[20,0],[13,15],[0,17],[0,-26],[13,-26],[0,30],[13,30],[-8,22],[-8,-22],[26,-15]].flatMap(([dx,dz])=>[{x:a.x+dx,z:a.z+dz,width:4,depth:4},{x:b.x-dx,z:b.z-dz,width:4,depth:4}]);
}

describe.each(['river','pass'] as const)('%s pathfinding at full map scale',id=>{
  const map=createMap(id),obstacles=baseObstacles(map);
  it('returns exactly the reference A* routes for long, short and blocked queries',()=>{
    const [a,b]=map.spawns,queries:Array<[Vec2,Vec2,number]>=[
      [{x:a.x+6.2,z:a.z-3.1},{x:b.x-8.2,z:b.z+.1},.45],[{x:a.x+6.3,z:a.z+2.2},{x:b.x-8.1,z:b.z+3.2},.78],
      [{x:a.x+5.1,z:a.z+.2},{x:a.x+18.2,z:a.z+9.1},.3],[{x:a.x+6.1,z:a.z+.3},{x:a.x+.1,z:a.z-13.1},.45]];
    for(const [start,goal,radius] of queries){
      const path=findPath(map,start,goal,obstacles,radius),reference=referencePath(map,start,goal,obstacles,radius);
      expect(path===null).toBe(reference===null);
      if(path)expect(cellsOf(map,path.slice(1,-1))).toEqual(reference);
    }
  },60_000);
  it('answers 80 cross-map queries and base placement checks within the frame budget',()=>{
    const [a,b]=map.spawns,units=Array.from({length:80},(_,i)=>({x:a.x+6+(i%8)*1.1,z:a.z-4+Math.floor(i/8)*.9}));
    findPath(map,units[0],{x:b.x-8,z:b.z},obstacles,.45);
    let t=performance.now(),found=0;for(const u of units)if(findPath(map,u,{x:b.x-8,z:b.z},obstacles,.45))found++;const long=performance.now()-t;
    // The first check for an obstacle set labels the map's components once (~30 ms cold); later checks reuse them.
    canPlace(map,{x:a.x+20,z:a.z+19,width:4,depth:4},obstacles);
    t=performance.now();for(let i=0;i<10;i++)canPlace(map,{x:a.x+20,z:a.z+20+i,width:4,depth:4},obstacles);const place=performance.now()-t;
    console.info(`[path-bench] ${id} ${map.width}x${map.height} 80 long paths ${long.toFixed(1)}ms (${(long/80).toFixed(2)}ms each) canPlace ${(place/10).toFixed(2)}ms each`);
    expect(found).toBe(80);
    // Generous ceilings for a contended host; the original A* needed ~4x these.
    // canPlace runs on every pointer move of a placement preview: on the 288 m
    // maps its whole-map flood must reuse the cached terrain clearance.
    expect(long/80).toBeLessThan(12);expect(place/10).toBeLessThan(6);
  },60_000);
  it('sees in-place edits of the blocked grid after earlier queries (no stale terrain cache)',()=>{
    const m={...map,blocked:map.blocked.slice(),noBuild:map.noBuild.slice()},[a]=m.spawns,goal={x:a.x+20,z:a.z};
    expect(findPath(m,{x:a.x+6,z:a.z},goal,[],.45)).not.toBeNull();
    const wall=Math.floor(a.x+12);for(let z=0;z<m.height;z++)m.blocked[z*m.width+wall]=1;
    expect(findPath(m,{x:a.x+6,z:a.z},goal,[],.45)).toBeNull();
    expect(canPlace(m,{x:a.x+20,z:a.z+20,width:4,depth:4})).toBe(false);
    for(let z=0;z<m.height;z++)m.blocked[z*m.width+wall]=map.blocked[z*m.width+wall];
    expect(findPath(m,{x:a.x+6,z:a.z},goal,[],.45)).not.toBeNull();
    expect(isWalkable(m,{x:wall+.5,z:a.z},[],.45)).toBe(isWalkable(map,{x:wall+.5,z:a.z},[],.45));
  });
});

/** Brute-force canPlace connectivity (isWalkable per cell, full flood) as the oracle for the cached shortcut. */
function referencePlace(map:RtsMap,f:Footprint,obstacles:Footprint[]):boolean {
  const all=[...obstacles,f],r=Math.max(...Object.values(UNITS).map(u=>u.radius)),W=map.width,ok=(x:number,z:number)=>x>=0&&z>=0&&x<W&&z<map.height&&isWalkable(map,{x:x+.5,z:z+.5},all,r);
  const anchors=[...map.spawns,...map.resources,...map.camps].map(a=>{const c:Array<{i:number;d:number}>=[];
    for(let z=Math.floor(a.z-7);z<=Math.floor(a.z+7);z++)for(let x=Math.floor(a.x-7);x<=Math.floor(a.x+7);x++){const d=Math.hypot(x+.5-a.x,z+.5-a.z);if(d<=7&&ok(x,z))c.push({i:z*W+x,d});}
    c.sort((p,q)=>p.d-q.d||p.i-q.i);return c.filter(p=>p.d<=c[0]?.d+.75).map(p=>p.i);});
  if(anchors.some(c=>!c.length))return false;
  const seen=new Uint8Array(W*map.height),queue=[...anchors[0]];for(const i of queue)seen[i]=1;
  while(queue.length){const i=queue.pop()!,x=i%W,z=Math.floor(i/W);
    for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]){const nx=x+dx,nz=z+dz,n=nz*W+nx;
      if(!ok(nx,nz)||seen[n]||dx&&dz&&(!ok(nx,z)||!ok(x,nz)))continue;seen[n]=1;queue.push(n);}}
  return anchors.every(c=>c.some(i=>seen[i]));
}
describe('cached placement connectivity',()=>{
  it('matches a brute-force flood when footprints seal, narrow or miss a corridor',()=>{
    // 48×24 field split by a wall at x 24 with one 5-cell gap (rows 10–14); anchors on both sides.
    const W=48,H=24,map:RtsMap={id:'pass',name:'corridor',width:W,height:H,blocked:new Uint8Array(W*H),noBuild:new Uint8Array(W*H),spawns:[{x:6,z:12},{x:42,z:12}],resources:[{id:'g',kind:'gold',amount:1,x:8,z:4},{id:'h',kind:'gold',amount:1,x:40,z:20}],camps:[{x:30,z:4}]};
    for(let z=0;z<H;z++)if(z<10||z>14){map.blocked[z*W+24]=1;map.blocked[z*W+25]=1;}
    const cases:Array<[Footprint,Footprint[]]>=[];
    for(const x of [20,22,28,31])for(const z of [8,10.5,12,14,16.5])cases.push([{x,z,width:3,depth:3},[]]);
    cases.push([{x:21,z:12,width:3,depth:3},[{x:28,z:12,width:3,depth:3}]],[{x:21,z:8,width:3,depth:3},[{x:21,z:16,width:3,depth:3}]],[{x:12,z:18,width:4,depth:4},[{x:21,z:12,width:3,depth:7}]]);
    let sealed=0;
    for(const [f,obstacles] of cases){const want=referencePlace(map,f,obstacles);if(!want)sealed++;expect(canPlace(map,f,obstacles),JSON.stringify({f,obstacles})).toBe(want);}
    expect(sealed).toBeGreaterThan(0);expect(sealed).toBeLessThan(cases.length);
  });
});
