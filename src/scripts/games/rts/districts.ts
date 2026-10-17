import type {RtsMap,Vec2} from './maps';
import {roadPaths} from './maps';
import {channelBanks} from './river-layout';
import {isWalkable} from './navigation';
import {MAP_LANDMARK_MODELS,type LandmarkAssetId} from './landmark-models';

export interface Landmark extends Vec2 {assetId:LandmarkAssetId;kind:0|1|2|3;width:number;depth:number;height:number;rotation:number;district:'outpost'|'camp'}
export interface Undergrowth extends Vec2 {kind:0|1|2|3;width:number;height:number;rotation:number}
const hash=(x:number,z:number,salt:number)=>{let n=Math.imul(x+salt,374761393)+Math.imul(z,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
const segmentDistance=(p:Vec2,a:Vec2,b:Vec2)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);};

/** Original abandoned structures have solid footprints and no faction/building affordance. */
export function addLandmarks(map:RtsMap):void {
  map.landmarks=[];
  // Outposts beside each base and natural expansion, ruins beside every camp;
  // the east points are the 180° twins of the west ones.
  const west=[{x:map.spawns[0].x-9,z:map.spawns[0].z+6},{x:44,z:84},{x:44,z:222}],turn=(p:Vec2)=>({x:map.width-p.x,z:map.height-p.z});
  const points=[...[...west,...west.map(turn)].map(p=>({...p,district:'outpost' as const})),...map.camps.map(p=>({x:p.x,z:p.z+(p.x<map.width/2?-1:1)*(map.id==='river'?5:4.3),district:'camp' as const}))];
  for(const p of points){
    const width=3.8,depth=3.8,indices:number[]=[];
    for(let z=Math.floor(p.z-depth/2);z<Math.ceil(p.z+depth/2);z++)for(let x=Math.floor(p.x-width/2);x<Math.ceil(p.x+width/2);x++)indices.push(z*map.width+x);
    if(indices.some(i=>i<0||i>=map.blocked.length||map.blocked[i]))continue;
    map.landmarks.push({...p,assetId:MAP_LANDMARK_MODELS[map.id][p.district==='outpost'?0:1],kind:p.district==='outpost'?(map.id==='river'?0:2):(map.id==='river'?1:3),width,depth,height:3.8,rotation:0});
    for(const i of indices){map.blocked[i]=1;map.noBuild[i]=1;}
  }
}

/** Decorative undergrowth is passable, does not consume RNG or create fake harvest nodes. */
export function createUndergrowth(map:RtsMap):Undergrowth[]{
  const plants:Undergrowth[]=[],paths=roadPaths(map),trees=map.scenery?.filter(p=>p.kind!=='rock')??[];
  const patches=[...map.spawns.flatMap(s=>[{x:s.x-7,z:s.z-7},{x:s.x+7,z:s.z+10}]),...map.resources.filter(r=>r.kind==='gold').map(r=>({x:r.x+(r.x<map.width/2?-8:8),z:r.z}))];
  // Only trees within 5 m matter below: bucket them in 8 m cells instead of scanning every tree per plant.
  const buckets=new Map<number,Vec2[]>(),key=(x:number,z:number)=>Math.floor(z/8)*4096+Math.floor(x/8);
  for(const t of trees){const k=key(t.x,t.z);let list=buckets.get(k);if(!list)buckets.set(k,list=[]);list.push(t);}
  const nearestTree=(p:Vec2)=>{let best=Infinity;for(let dz=-8;dz<=8;dz+=8)for(let dx=-8;dx<=8;dx+=8)for(const t of buckets.get(key(p.x+dx,p.z+dz))??[])best=Math.min(best,Math.hypot(p.x-t.x,p.z-t.z));return best;};
  const wood=map.resources.filter(r=>r.kind==='wood');
  for(let gz=2;gz<map.height-2;gz+=1.3)for(let gx=2;gx<map.width-2;gx+=1.3){
    const ix=Math.round(gx*10),iz=Math.round(gz*10),p={x:gx+(hash(ix,iz,17)-.5)*1.1,z:gz+(hash(ix,iz,29)-.5)*1.1};
    if(!isWalkable(map,p)||map.spawns.some(s=>Math.abs(s.x-p.x)<5.8&&Math.abs(s.z-p.z)<5.8)||map.resources.some(r=>Math.hypot(r.x-p.x,r.z-p.z)<2.6))continue;
    const route=paths.some(path=>path.slice(1).some((b,i)=>segmentDistance(p,path[i],b)<2.6));if(route)continue;
    const forest=Math.min(nearestTree(p),...wood.map(r=>Math.abs(Math.hypot(p.x-r.x,p.z-r.z)-3.5)));
    const bank=channelBanks(p.z),waterDistance=Math.min(Math.abs(p.x-bank.left),Math.abs(p.x-bank.right));
    const riverside=map.id==='river'&&waterDistance>1.5&&waterDistance<4.2;
    const patch=Math.max(...patches.map(q=>Math.exp(-((p.x-q.x)**2+(p.z-q.z)**2)/48)));
    const density=riverside?.92:forest<5?.85:patch*.9;
    // Correlated gaps keep nearby plants together instead of peppering every clearing.
    if(!riverside&&Math.sin(p.x*.65+Math.sin(p.z*.23))*Math.cos(p.z*.53)<-.1)continue;
    if(hash(ix,iz,43)>density)continue;
    const kind:Undergrowth['kind']=riverside?3:forest<3.8?2:hash(ix,iz,67)<(map.id==='river'?.78:.13)?1:0;
    const size=1.35+hash(ix,iz,71)*.5;
    plants.push({...p,kind,width:size,height:size*.85,rotation:0});
  }
  return plants;
}
