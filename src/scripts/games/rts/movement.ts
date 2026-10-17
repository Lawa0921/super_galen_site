import {UNITS,BUILDINGS,SLOW_FACTOR,HASTE_FACTOR} from './catalog';
import type {Vec2,Footprint} from './maps';
import type {GameState,Unit,Entity} from './types';
import {distance,distanceToEntity,units,isFlying} from './state';
import {findPath,isWalkable} from './navigation';
import {planningObstacles} from './visibility';
import {unitsNear,gridMoved} from './unit-grid';
const MAX_RADIUS=Math.max(...Object.values(UNITS).map(d=>d.radius));
const STEER_ANGLES=[30,-30,60,-60,90,-90];
/** Harvesting workers ghost through traffic so mines and drop-offs never jam. */
const ghost=(u:Unit)=>u.kind==='worker'&&u.order.type==='gather';
/** Bodies that collide on one layer: flyers only meet flyers, ground units only ground units. */
const sameLayer=(a:Unit,b:Unit)=>isFlying(a)===isFlying(b);
/** Movement speed with the timed slow / haste effects. */
export function unitSpeed(s:GameState,u:Unit):number {
  let speed=UNITS[u.kind].speed;
  if((u.slowUntil??0)>s.time)speed*=SLOW_FACTOR;
  if((u.hasteUntil??0)>s.time)speed*=HASTE_FACTOR;
  return speed;
}
const yields=(v:Unit,mover:Unit)=>v.team===mover.team&&v.order.type==='idle';
/** +1 for the west seat, -1 for east: angular scans turn by 180° (the maps' symmetry) so geometric ties never favour a side. */
const side=(s:GameState,team:Unit['team'])=>team===-1||s.map.spawns[team].x<s.map.width/2?1:-1;
/** Slide an idle friend out of a mover's lane without pushing it into others. */
function nudge(s:GameState,v:Unit,mover:Unit,dir:Vec2,step:number,obs:Footprint[]):boolean {
  const cross=dir.x*(v.z-mover.z)-dir.z*(v.x-mover.x),side=Math.abs(cross)>1e-6?Math.sign(cross):(v.id%2?1:-1);
  const perp={x:-dir.z*side,z:dir.x*side},r=UNITS[v.kind].radius;
  const others=unitsNear(s,v,r+MAX_RADIUS+step+.05).filter(o=>o!==v&&!ghost(o)&&sameLayer(o,v));
  for(const d of [perp,{x:(perp.x+dir.x)*Math.SQRT1_2,z:(perp.z+dir.z)*Math.SQRT1_2},dir]){
    const q={x:v.x+d.x*step,z:v.z+d.z*step};
    if(!isWalkable(s.map,q,obs,r)||others.some(o=>distance(q,o)<Math.min(r+UNITS[o.kind].radius,distance(v,o))-1e-6))continue;
    v.x=q.x;v.z=q.z;gridMoved(s,v);return true;
  }
  return false;
}
/** Gently push apart idle units that overlap (stacked spawns, settled crowds). */
export function separateIdle(s:GameState,dt:number):void {
  const obstaclesByTeam=new Map<number,Footprint[]>();
  for(const u of units(s)){
    if(u.order.type!=='idle'||ghost(u)||u.returning)continue;
    const r=UNITS[u.kind].radius,near=unitsNear(s,u,r+MAX_RADIUS+.05).filter(v=>v!==u&&!ghost(v)&&sameLayer(u,v));
    let px=0,pz=0;
    for(const v of near){const sum=r+UNITS[v.kind].radius,d=distance(u,v);if(d>=sum-1e-6)continue;
      let nx:number,nz:number;
      if(d<1e-6){const a=(u.id*2.399963229728653)%(Math.PI*2);nx=Math.cos(a);nz=Math.sin(a);}else{nx=(u.x-v.x)/d;nz=(u.z-v.z)/d;}
      const share=v.order.type==='idle'?.5:1;px+=nx*(sum-d)*share;pz+=nz*(sum-d)*share;}
    const len=Math.hypot(px,pz);if(len<1e-4)continue;
    let obs=obstaclesByTeam.get(u.team);if(!obs){obs=planningObstacles(s,u.team);obstaclesByTeam.set(u.team,obs);}
    for(const scale of [1,.5]){const move=Math.min(len,SEPARATION_SPEED*dt)*scale,q={x:u.x+px/len*move,z:u.z+pz/len*move};
      if(isFlying(u)?!inBounds(s,q):!isWalkable(s.map,q,obs,r))continue;
      // Resolve existing overlaps by their net push; never create a new one.
      if(near.some(v=>distance(u,v)>=r+UNITS[v.kind].radius-1e-6&&distance(q,v)<r+UNITS[v.kind].radius-1e-6))continue;
      u.x=q.x;u.z=q.z;gridMoved(s,u);break;}
  }
}
const SEPARATION_SPEED=1.2,SETTLE_NEAR=6;
const inBounds=(s:GameState,p:Vec2)=>p.x>=0&&p.z>=0&&p.x<s.map.width&&p.z<s.map.height;
/** The unit is already beyond waypoint a along the path leg a→b. */
const passed=(u:Vec2,a:Vec2,b:Vec2)=>(a.x-u.x)*(b.x-a.x)+(a.z-u.z)*(b.z-a.z)<=0;
function lineWalkable(s:GameState,a:Vec2,b:Vec2,obs:Footprint[],radius:number):boolean {
  const n=Math.max(1,Math.ceil(distance(a,b)/.05));
  for(let i=1;i<=n;i++)if(!isWalkable(s.map,{x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n},obs,radius))return false;
  return true;
}
/**
 * Advance a move order. Units that cannot reach their exact slot (occupied by
 * a crowd, a shared rally point) settle to idle instead of walking in place:
 * within 6 m, 1.5 s without getting 0.3 m closer; farther out, 15 s without
 * 0.5 m of displacement (detours around ridges still count as progress).
 */
export function advanceMoveOrder(s:GameState,u:Unit,goal:Vec2,dt:number):boolean {
  const result=moveToward(s,u,goal,dt,.4);
  if(result==='arrived'||u.order.type!=='move'){delete u.moveWatch;return result==='arrived';}
  const w=u.moveWatch,d=distance(u,goal),near=d<SETTLE_NEAR;
  if(!w||distance(w.goal,goal)>1e-6||d<w.best-.3||!near&&distance(u,w)>.5){u.moveWatch={x:u.x,z:u.z,at:s.time,goal:{...goal},best:d};return false;}
  if(s.time-w.at+1e-8>=(near?1.5:15)){delete u.moveWatch;u.path=[];u.pathGoal=undefined;u.animation='idle';return true;}
  return false;
}
/**
 * Spread a group destination over distinct walkable slots that are in plain
 * line of sight of the clicked point (same side of walls), preserving each
 * unit's place in the group so paths do not cross.
 */
export function formationSlots(s:GameState,team:Unit['team'],goal:Vec2,group:Unit[]):Vec2[] {
  if(group.length<=1)return group.map(()=>({...goal}));
  const obs=planningObstacles(s,team),rMax=Math.max(...group.map(u=>UNITS[u.kind].radius)),spacing=2*rMax+.12;
  const visible=(p:Vec2)=>{if(!isWalkable(s.map,p,obs,rMax))return false;const n=Math.ceil(distance(p,goal)/.25);
    for(let i=1;i<n;i++)if(!isWalkable(s.map,{x:goal.x+(p.x-goal.x)*i/n,z:goal.z+(p.z-goal.z)*i/n},obs,rMax))return false;return true;};
  const slots:Vec2[]=[{...goal}],mirror=side(s,team);
  for(let ring=1;slots.length<group.length&&ring<=10;ring++){const n=6*ring;
    for(let i=0;i<n&&slots.length<group.length*2;i++){const a=i*2*Math.PI/n;
      const p={x:goal.x+mirror*Math.cos(a)*ring*spacing,z:goal.z+mirror*Math.sin(a)*ring*spacing};if(visible(p))slots.push(p);}}
  const cx=group.reduce((n,u)=>n+u.x,0)/group.length,cz=group.reduce((n,u)=>n+u.z,0)/group.length;
  const spread=Math.max(1e-6,...group.map(u=>Math.hypot(u.x-cx,u.z-cz))),reach=Math.max(...slots.map(p=>distance(p,goal)));
  const k=Math.min(1,reach/spread);
  const ideal=group.map(u=>({x:goal.x+(u.x-cx)*k,z:goal.z+(u.z-cz)*k}));
  const orderIdx=group.map((_,i)=>i).sort((a,b)=>distance(ideal[a],goal)-distance(ideal[b],goal)||mirror*(group[a].x-group[b].x)||mirror*(group[a].z-group[b].z)||group[a].id-group[b].id);
  const free=slots.slice(0,Math.max(group.length,slots.length)),result:Vec2[]=new Array(group.length);
  for(const i of orderIdx){
    if(!free.length){result[i]={...goal};continue;}
    let best=0;for(let j=1;j<free.length;j++)if(distance(free[j],ideal[i])<distance(free[best],ideal[i])-1e-9)best=j;
    result[i]=free.splice(best,1)[0];
  }
  return result;
}
/**
 * Units that may hold an approach slot on a target. Rebuilt once per tick and
 * appended as slots are reserved; entries are re-validated at use, so cleared
 * or retargeted slots are harmless.
 */
const claimIndex=new WeakMap<GameState,{tick:number;count:number;byTarget:Map<number,Set<Unit>>}>();
function claimsOn(s:GameState,targetId:number):Set<Unit> {
  let index=claimIndex.get(s);
  if(!index||index.tick!==s.tick||index.count!==s.entities.length){
    index={tick:s.tick,count:s.entities.length,byTarget:new Map()};claimIndex.set(s,index);
    for(const v of s.entities)if(v.category==='unit'&&v.alive&&v.approachSlot){const id=v.approachSlot.targetId;let set=index.byTarget.get(id);if(!set)index.byTarget.set(id,set=new Set());set.add(v);}
  }
  let set=index.byTarget.get(targetId);if(!set)index.byTarget.set(targetId,set=new Set());return set;
}
/** Find a reachable perimeter point instead of routing into a solid building. */
export function approach(s:GameState,u:Unit,target:Entity,range=1,reserve=false):Vec2|null {
  if(!reserve)delete u.approachSlot;
  if(distanceToEntity(u,target)<=range)return {x:u.x,z:u.z};
  const d=target.category==='building'?BUILDINGS[target.kind]:null;
  // Leave room for the attacker's feet even when its reach is very short.
  const clearance=Math.max(UNITS[u.kind].radius,range*.8);
  const rx=d?d.width/2:UNITS[target.kind as Unit['kind']].radius;
  const rz=d?d.depth/2:rx;
  const candidates:Vec2[]=[],known=planningObstacles(s,u.team);
  const flip=side(s,u.team);
  for(let i=0;i<16;i++){const a=i*Math.PI/8,c=flip*Math.cos(a),sn=flip*Math.sin(a);
    const edge=d?Math.min(rx/(Math.abs(c)||1e-9),rz/(Math.abs(sn)||1e-9)):rx;
    const p=range<1?{x:target.x+c*(edge+clearance),z:target.z+sn*(edge+clearance)}:{x:target.x+c*(rx+range*.8),z:target.z+sn*(rz+range*.8)};
    if((isFlying(u)?inBounds(s,p):isWalkable(s.map,p,known,UNITS[u.kind].radius))&&distanceToEntity(p,target)<=range)candidates.push(p);}
  // Spatial queries instead of scanning every unit per candidate (O(n²)/tick):
  // bodies come from the unit grid, perimeter claims from the per-target index.
  const slot=u.approachSlot,radius=UNITS[u.kind].radius,claimants=reserve?claimsOn(s,target.id):undefined;
  const free=(p:Vec2)=>{
    for(const v of unitsNear(s,p,radius+MAX_RADIUS))if(v.id!==u.id&&sameLayer(u,v)&&distance(p,v)<radius+UNITS[v.kind].radius-1e-8)return false;
    if(claimants)for(const v of claimants){
      const claimed=v.approachSlot;
      if(v===u||!v.alive||!claimed||claimed.targetId!==target.id||claimed.revision!==s.navigationRevision||
        !(v.order.type==='attack'&&v.order.targetId===target.id||v.engagedTargetId===target.id))continue;
      if(sameLayer(u,v)&&distance(p,claimed.position)<radius+UNITS[v.kind].radius-1e-8)return false;
    }
    return true;
  };
  // Keep one perimeter destination while traversing its path. Re-sorting it
  // every tick can alternate two goals and send A* back to the start cell.
  const stalled=!!slot&&s.time-slot.checkedAt>=1&&distance(u,slot.progress)<.3;
  if(reserve&&slot&&slot.targetId===target.id&&slot.revision===s.navigationRevision&&slot.range===range&&distance(slot.target,target)<.1&&!stalled&&
    candidates.some(p=>distance(p,slot.position)<1e-8)&&free(slot.position)){
    if(s.time-slot.checkedAt>=1){slot.progress={x:u.x,z:u.z};slot.checkedAt=s.time;}
    return slot.position;
  }
  if(reserve)delete u.approachSlot;
  // Preserve the angular order of equidistant entrances: floating point noise
  // must not alternate the destination and restart the path every tick.
  candidates.sort((a,b)=>{const delta=distance(a,u)-distance(b,u);return Math.abs(delta)<1e-8?0:delta;});
  const available=(reserve||range<1)?candidates.filter(free):candidates;
  const chosen=(stalled?available.find(p=>distance(p,slot!.position)>.1):undefined)??available[0]??candidates[0]??null;
  if(reserve&&chosen){u.approachSlot={targetId:target.id,target:{x:target.x,z:target.z},position:chosen,revision:s.navigationRevision,range,progress:{x:u.x,z:u.z},checkedAt:s.time};claimsOn(s,target.id).add(u);}
  return chosen;
}
export function moveToward(s:GameState,u:Unit,goal:Vec2,dt:number,stopDistance=.15,stopOnBlocked=true):'arrived'|'moving'|'blocked' {
  if(distance(u,goal)<=stopDistance){u.animation='idle';return 'arrived';}
  if(isFlying(u))return fly(s,u,goal,dt,stopDistance);
  const radius=UNITS[u.kind].radius,obs=planningObstacles(s,u.team),precise=stopDistance<.1||!!u.approachSlot;
  // Once close, use the actual perimeter goal rather than a grid centre
  // occupied by another attacker. Check the whole shortcut against terrain.
  const remaining=distance(u,goal);
  if(precise&&remaining<3){
    const samples=Math.ceil(remaining/.1);
    if(Array.from({length:samples},(_,i)=>({x:u.x+(goal.x-u.x)*(i+1)/samples,z:u.z+(goal.z-u.z)*(i+1)/samples})).every(p=>isWalkable(s.map,p,obs,radius))){
      u.path=[{...goal}];u.pathGoal={...goal};u.pathRevision=s.navigationRevision;
    }
  }
  if(!u.pathGoal||distance(u.pathGoal,goal)>(precise?.1:.75)||u.pathRevision!==s.navigationRevision||u.path.length===0){
    const path=findPath(s.map,u,goal,obs,radius);
    if(path===null){u.path=[];u.pathGoal=undefined;if(stopOnBlocked)u.order={type:'idle'};u.animation='idle';s.events.push({time:s.time,type:'path-blocked',entityId:u.id,team:u.team,text:stopOnBlocked?'道路受阻，部隊已停止':'無法接近目標，繼續原指令'});return 'blocked';}
    u.path=path;u.pathGoal={...goal};u.pathRevision=s.navigationRevision;
    while(u.path.length&&distance(u,u.path[0])<Math.min(.1,stopDistance))u.path.shift();
  }
  if(!u.path.length){u.animation='idle';return 'moving';}
  let budget=unitSpeed(s,u)*dt;const solid=!ghost(u);
  while(budget>0&&u.path.length){
    // Steering around neighbours can carry a unit past its grid waypoint;
    // never walk back to it when the following waypoint is in plain line.
    if(!(u.strictPathUntil!==undefined&&s.time<u.strictPathUntil)&&u.path.length>1&&(distance(u,u.path[0])<.75||passed(u,u.path[0],u.path[1]))&&lineWalkable(s,u,u.path[1],obs,radius)){u.path.shift();continue;}
    const p=u.path[0],len=distance(u,p);if(len<.02){u.path.shift();continue;}
    const step=Math.min(budget,len);let dx=(p.x-u.x)/len,dz=(p.z-u.z)/len,next={x:u.x+dx*step,z:u.z+dz*step};
    if(solid){
      // A mover never steps deeper into a neighbour. It steers around the
      // first blocker, asks an idle friend to yield, or waits for the gap.
      const near=unitsNear(s,u,radius+MAX_RADIUS+step+.05).filter(v=>v!==u&&!ghost(v)&&!isFlying(v));
      const hit=(q:Vec2)=>near.find(v=>distance(q,v)<Math.min(radius+UNITS[v.kind].radius,distance(u,v))-1e-6);
      const first=hit(next);
      if(first){
        const sign=u.id<first.id?1:-1;let steer:Vec2|undefined;
        // Queue behind a friend walking the same way instead of side-stepping:
        // lateral weaving at a choke point costs more than it gains.
        const following=first.team===u.team&&first.order.type==='move'&&first.path.length>0&&Math.sin(first.facing)*dx+Math.cos(first.facing)*dz>.5
          &&((first.x-u.x)*dx+(first.z-u.z)*dz)>.7*distance(u,first);
        if(!following)for(const degrees of STEER_ANGLES){const a=degrees*sign*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);
          const q={x:u.x+(dx*c-dz*sn)*step,z:u.z+(dx*sn+dz*c)*step};
          if(isWalkable(s.map,q,obs,radius)&&!hit(q)){steer=q;break;}}
        // A blocked unit sitting next to its waypoint may cut straight to the
        // following one when that exact step is clear (no walking backwards).
        const after=u.path[1];
        if(!steer&&after&&(len<.75||passed(u,p,after))&&distance(u,after)>.02){const l=distance(u,after),st=Math.min(budget,l),q={x:u.x+(after.x-u.x)/l*st,z:u.z+(after.z-u.z)/l*st};
          if(isWalkable(s.map,q,obs,radius)&&!hit(q)){u.path.shift();steer=q;dx=(after.x-u.x)/l;dz=(after.z-u.z)/l;}}
        if(!steer){
          // Idle friends yield at once; after half a second of waiting any
          // friendly mover is shouldered aside too, which breaks queues that
          // wait on each other (side-by-side merges, circular waits).
          u.waitTicks=(u.waitTicks??0)+1;
          const pushed=(yields(first,u)||first.team===u.team&&first.order.type!=='hold'&&u.waitTicks>=10)&&nudge(s,first,u,{x:dx,z:dz},step,obs);
          // Take the gap at once, before the pushed unit walks back into it.
          if(pushed&&!hit(next))steer=next;
          else{u.blockedTime+=dt;u.animation='idle';return 'moving';}}
        next=steer;
      }
    }
    // A sampled shortcut can still clip a corner: re-path and follow the grid
    // waypoints strictly for a moment so the same shortcut is not retried.
    if(!isWalkable(s.map,next,obs,radius)){u.path=[];u.blockedTime+=dt;u.strictPathUntil=s.time+1;return 'moving';}
    u.x=next.x;u.z=next.z;u.waitTicks=0;gridMoved(s,u);u.facing=Math.atan2(dx,dz);u.animation='walk';budget-=step;
    if(distance(u,p)<Math.min(.1,stopDistance))u.path.shift();else break;
  }
  return distance(u,goal)<=stopDistance?'arrived':'moving';
}
/** Air layer: straight flight toward the goal, clamped to the map, ignoring terrain, buildings and ground bodies. */
function fly(s:GameState,u:Unit,goal:Vec2,dt:number,stopDistance:number):'arrived'|'moving' {
  const target={x:Math.min(s.map.width-1e-3,Math.max(0,goal.x)),z:Math.min(s.map.height-1e-3,Math.max(0,goal.z))};
  const d=distance(u,target),step=Math.min(d,unitSpeed(s,u)*dt);
  u.path=[{...target}];u.pathGoal={...goal};u.pathRevision=s.navigationRevision;
  if(d>1e-9){u.facing=Math.atan2(target.x-u.x,target.z-u.z);u.x+=(target.x-u.x)/d*step;u.z+=(target.z-u.z)/d*step;gridMoved(s,u);u.animation='walk';}
  if(distance(u,goal)<=stopDistance||distance(u,target)<1e-6){u.animation='idle';return distance(u,goal)<=stopDistance?'arrived':'moving';}
  return 'moving';
}
