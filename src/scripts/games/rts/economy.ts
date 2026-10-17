import {BUILDINGS,UNITS,RESEARCH,TIER_UPGRADES,isHero,type PlayableUnit,type ResearchId} from './catalog';
import type {GameState,Unit,Building} from './types';
import {addUnit,buildings,units,byId,distance,distanceToEntity,obstacles,economyChange,heroProgress} from './state';
import {isWalkable,findPath} from './navigation';
import {approach,moveToward} from './movement';
import {isVisible} from './visibility';
function spawnPoint(s:GameState,b:Building,kind:PlayableUnit){
  const d=BUILDINGS[b.kind],r=UNITS[kind].radius;
  // The maps are 180° symmetric: the east seat scans the ring rotated by a
  // half turn, so twin seats get twin spawns (a fixed +x start favoured west).
  const side=s.map.spawns[b.team].x<s.map.width/2?1:-1;
  for(let ring=0;ring<3;ring++)for(let i=0;i<32;i++){
    const angle=i*Math.PI/16,rx=d.width/2+1+ring,rz=d.depth/2+1+ring;
    const p={x:b.x+side*Math.cos(angle)*rx,z:b.z+side*Math.sin(angle)*rz};
    // The cell centre must also be clear: paths start from a cell centre, so a
    // spawn squeezed against an edge would otherwise never be able to move.
    const centre={x:Math.floor(p.x)+.5,z:Math.floor(p.z)+.5};
    if(isWalkable(s.map,p,obstacles(s),r)&&isWalkable(s.map,centre,obstacles(s),r)&&!units(s).some(u=>distance(u,p)<r+UNITS[u.kind].radius))return p;
  }return null;
}
function gather(s:GameState,u:Unit,dt:number){
  if(u.order.type!=='gather'||u.team===-1)return;const resourceId=u.order.resourceId,resource=s.resources.find(r=>r.id===resourceId);
  if(!resource){u.order={type:'idle'};return;}
  const visible=isVisible(s,u.team,resource);
  if(u.cargo.amount>=10||(visible&&resource.remaining<=0&&u.cargo.amount>0)||u.cargo.amount>0&&u.cargo.kind!==resource.kind){
    const drop=buildings(s,u.team).filter(b=>b.construction>=1&&BUILDINGS[b.kind].accepts?.includes(u.cargo.kind)).sort((a,b)=>distanceToEntity(u,a)-distanceToEntity(u,b))[0];
    if(!drop){u.animation='idle';return;}
    // Reserve the entrance: re-sorting near-equidistant entrances every tick
    // alternated goals and re-pathed the worker back to its start cell.
    if(distanceToEntity(u,drop)>1){const p=approach(s,u,drop,1,true);if(p)moveToward(s,u,p,dt);return;}
    delete u.approachSlot;
    const amount=u.cargo.amount,kind=u.cargo.kind;
    economyChange(s,u.team,{gold:kind==='gold'?amount:0,wood:kind==='wood'?amount:0},'deposit:'+kind);
    s.teams[u.team].stats[kind==='gold'?'gatheredGold':'gatheredWood']+=amount;u.cargo.amount=0;u.taskTime=0;return;
  }
  delete u.approachSlot;
  // Follow the last ordered location without discovering depletion through fog.
  if(!visible){moveToward(s,u,resource,dt,1.6);return;}
  if(resource.remaining<=0){
    const t=u.team;
    const replacement=s.resources.filter(r=>r.remaining>0&&r.kind===resource.kind&&isVisible(s,t,r)).sort((a,b)=>distance(u,a)-distance(u,b)).find(r=>findPath(s.map,u,r,obstacles(s),UNITS.worker.radius)!==null);
    s.events.push({time:s.time,type:'resource-depleted',entityId:u.id,team:t,text:resource.kind==='gold'?'金礦已枯竭':'林木已採盡'});
    if(replacement){u.order={type:'gather',resourceId:replacement.id};u.path=[];u.pathGoal=undefined;}
    else {u.order={type:'idle'};u.animation='idle';s.events.push({time:s.time,type:'gather-idle',entityId:u.id,team:t,text:'沒有可採集的資源，工人已待命'});}return;
  }
  if(distance(u,resource)>1.7){moveToward(s,u,resource,dt,1.6);return;}
  u.animation='work';u.taskTime+=dt;const interval=resource.kind==='gold'?.5:s.teams[u.team].research.includes('timber')?.4:.7;
  while(u.taskTime+1e-8>=interval&&u.cargo.amount<10&&resource.remaining>0){u.taskTime-=interval;u.cargo.kind=resource.kind;u.cargo.amount++;resource.remaining--;}
}
export function stepEconomy(s:GameState,dt:number):void {
  for(const u of units(s)){
    if(u.kind!=='worker')continue;
    if(u.order.type==='gather'){gather(s,u,dt);continue;}
    if(u.order.type!=='build'&&u.order.type!=='repair')continue;
    const b=byId(s,u.order.targetId);if(!b||b.category!=='building'||b.team!==u.team){u.order={type:'idle'};continue;}
    if(distanceToEntity(u,b)>1.3){const p=approach(s,u,b,1.2,true);if(p)moveToward(s,u,p,dt);continue;}
    delete u.approachSlot;u.animation='work';
    if(b.construction<1){const progress=Math.min(1-b.construction,dt/BUILDINGS[b.kind].duration);b.construction+=progress;b.hp=Math.min(b.maxHp,b.hp+progress*b.maxHp*.9);
      if(b.construction>=1-1e-8){b.construction=1;s.teams[b.team].stats.buildingsBuilt++;s.events.push({time:s.time,type:'construction-complete',team:b.team,entityId:b.id,text:`${BUILDINGS[b.kind].name}已完工`});u.order={type:'idle'};}
    }else if(b.hp<b.maxHp){const repaired=Math.min(dt*20,b.maxHp-b.hp,s.teams[b.team].gold*5);if(repaired>0){b.hp+=repaired;b.repairCue={sequence:(b.repairCue?.sequence??0)+1,time:s.time};economyChange(s,b.team,{gold:-repaired/5,wood:0},'repair');}}
    else {u.order={type:'idle'};u.animation='idle';}
  }
  for(const b of buildings(s)){
    if(b.construction<1||b.queue.length===0)continue;const q=b.queue[0];q.elapsed=Math.min(q.duration,q.elapsed+dt);
    if(q.elapsed+1e-8<q.duration)continue;
    let text:string;
    if(q.type==='train'){
      const kind=q.target as PlayableUnit,p=spawnPoint(s,b,kind);if(!p)continue;
      const revived=isHero(kind)&&heroProgress(s.teams[b.team],kind).recruited,u=addUnit(s,b.team,kind,p);text=`${UNITS[kind].name}${revived?'已復活':'已完成訓練'}`;
      if(b.rally)u.order=kind==='worker'&&b.rally.resourceId!==undefined
        ?{type:'gather',resourceId:b.rally.resourceId}
        :{type:'move',position:{x:b.rally.x,z:b.rally.z},attackMove:kind!=='worker'};
      s.teams[b.team].reservedSupply-=q.supply;s.teams[b.team].stats.unitsTrained++;
    }else if(q.type==='research'){s.teams[b.team].research.push(q.target as ResearchId);text=`研究完成：${RESEARCH[q.target as ResearchId].name}`;}
    else {b.tier=q.target as 2|3;b.maxHp+=600;b.hp+=600;text=`主城已升級為${TIER_UPGRADES[b.tier as 2|3].name}`;}
    b.queue.shift();s.events.push({time:s.time,type:q.type+'-complete',team:b.team,entityId:b.id,text});
  }
}
