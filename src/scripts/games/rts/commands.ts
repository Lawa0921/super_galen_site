import type { GameState,Command,CommandResult,Unit,QueueItem } from './types';
import { BUILDINGS,UNITS,RESEARCH,TIER_UPGRADES,HERO_KINDS,requirementsMet,supplyShortage,unlocked,isHero,type TeamId,type Cost } from './catalog';
import {addBuilding,buildings,units,byId,population,tier,completedKinds,obstacles,economyChange,destroyEntity,heroProgress,isFlying} from './state';
import {canAttack} from './combat';
import {canPlace,isWalkable,findPath} from './navigation';
import type {Vec2} from './maps';
import {heroCommand} from './hero';
import {formationSlots} from './movement';
import {isVisible,planningObstacles} from './visibility';
const failure=(reason:string):CommandResult=>({ok:false,reason});
const pointValid=(s:GameState,p:Vec2)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=0&&p.z>=0&&p.x<s.map.width&&p.z<s.map.height;
const canAfford=(s:GameState,t:TeamId,c:Cost)=>s.teams[t].gold>=c.gold&&s.teams[t].wood>=c.wood;
const setOrder=(u:Unit,order:Unit['order'])=>{u.order=order;u.engagedTargetId=undefined;u.unreachableTargets=[];u.path=[];u.pathGoal=undefined;u.taskTime=0;u.animation='idle';delete u.attackCue;delete u.approachSlot;};
export function issueCommand(s:GameState,team:TeamId,c:Command):CommandResult {
  if((team!==0&&team!==1)||s.status!=='playing'||s.paused)return failure('目前無法下令');
  if(c.commandId&&s.seenCommandIds[team].has(c.commandId))return failure('重複指令');
  const result=execute(s,team,c);
  if(result.ok&&c.commandId)s.seenCommandIds[team].add(c.commandId);
  return result;
}
function execute(s:GameState,t:TeamId,c:Command):CommandResult {
  const ok:CommandResult={ok:true};
  const pay=(cost:Cost,reason:string)=>economyChange(s,t,{gold:-cost.gold,wood:-cost.wood},reason);
  if(c.type==='learn'||c.type==='cast')return heroCommand(s,t,c);
  if(c.type==='surrender'){s.status='won';s.winner=t===0?1:0;s.endReason='surrender';return ok;}
  if(c.type==='build'){
    const w=byId(s,c.workerId);if(!w||w.team!==t||w.category!=='unit'||w.kind!=='worker')return failure('請選擇工人');
    if(!Object.hasOwn(BUILDINGS,c.building)||!pointValid(s,c.position))return failure('無效建築位置');
    if(!unlocked(BUILDINGS[c.building],s.rosterPreview))return failure('尚未開放');
    if(!isVisible(s,t,c.position))return failure('需要先探索建造位置');
    const d=BUILDINGS[c.building];if(!requirementsMet(d.requires,tier(s,t),completedKinds(s,t)))return failure('尚未達到科技條件');
    if(!canAfford(s,t,d.cost))return failure('資源不足');
    const f={...c.position,width:d.width,depth:d.depth};
    if(!canPlace(s.map,f,obstacles(s)))return failure('此處無法建造：需要平地與通道');
    if(units(s).some(u=>!isFlying(u)&&Math.abs(u.x-f.x)<f.width/2+UNITS[u.kind].radius&&Math.abs(u.z-f.z)<f.depth/2+UNITS[u.kind].radius))return failure('有部隊擋住地基');
    pay(d.cost,'build:'+c.building);const b=addBuilding(s,t,c.building,c.position);setOrder(w,{type:'build',targetId:b.id});return ok;
  }
  if('buildingId' in c){
    const b=byId(s,c.buildingId);if(!b||b.category!=='building'||b.team!==t)return failure('不是我方建築');
    if(c.type==='cancel'){
      if(b.construction<1){const f=1-b.construction;economyChange(s,t,{gold:Math.floor(b.spent.gold*f+1e-8),wood:Math.floor(b.spent.wood*f+1e-8)},'cancel-construction');destroyEntity(s,b,'cancelled');return ok;}
      const index=c.queueId===undefined?0:b.queue.findIndex(q=>q.id===c.queueId);
      if(index<0||!b.queue[index])return failure('沒有可取消的排程');
      const q=b.queue[index],f=1-q.elapsed/q.duration;
      economyChange(s,t,{gold:Math.floor(q.cost.gold*f+1e-8),wood:Math.floor(q.cost.wood*f+1e-8)},'cancel-queue');s.teams[t].reservedSupply-=q.supply;b.queue.splice(index,1);return ok;
    }
    if(c.type==='rally'){
      const resource=c.resourceId===undefined?undefined:s.resources.find(r=>r.id===c.resourceId);
      if(c.resourceId!==undefined&&(b.kind!=='townhall'||!resource||resource.remaining<=0||!isVisible(s,t,resource)))return failure('請指定可見且尚未採盡的資源');
      const p=resource??c.position;
      if(!pointValid(s,p)||!isWalkable(s.map,p,planningObstacles(s,t)))return failure('無效集結點');
      b.rally=resource?{x:resource.x,z:resource.z,resourceId:resource.id}:{x:p.x,z:p.z};return ok;
    }
    if(b.construction<1)return failure('建築尚未完工');
    if(b.queue.length>=5)return failure('排程已滿');
    let q:Omit<QueueItem,'id'|'elapsed'>;
    if(c.type==='train'){
      if(!Object.hasOwn(UNITS,c.unit)||(c.unit as string)==='neutral-raider')return failure('無效單位');
      const d=UNITS[c.unit];if(!unlocked(d,s.rosterPreview))return failure('尚未開放');if(d.trainedAt!==b.kind)return failure('此建築無法訓練該單位');
      if(!requirementsMet(d.requires,tier(s,t),completedKinds(s,t)))return failure('尚未達到科技條件');
      if(isHero(c.unit)){
        const queued=(k:string)=>buildings(s,t).some(x=>x.queue.some(q=>q.target===k));
        if(units(s,t).some(u=>u.kind===c.unit)||queued(c.unit))return failure(c.unit==='commander'?'只能擁有一名統領':`只能擁有一名${d.name}`);
        // WC3 rule: one hero per town hall tier; a fallen hero keeps its slot and can always be revived.
        const held=HERO_KINDS.filter(k=>heroProgress(s.teams[t],k).recruited||queued(k)).length;
        if(!heroProgress(s.teams[t],c.unit).recruited&&held>=tier(s,t))return failure('英雄數量已達主城階級上限');
      }
      const p=population(s,t);if(p.used+p.reserved+d.supply>p.cap)return failure(supplyShortage(p.used+p.reserved+d.supply-p.cap));
      q={type:'train',target:c.unit,cost:d.cost,duration:d.duration,supply:d.supply};
    }else if(c.type==='research'){
      if(!Object.hasOwn(RESEARCH,c.research))return failure('無效研究');const d=RESEARCH[c.research];
      if(d.at!==b.kind||!requirementsMet(d.requires,tier(s,t),completedKinds(s,t))||(d.previous&&!s.teams[t].research.includes(d.previous)))return failure('尚未達到科技條件');
      if(s.teams[t].research.includes(c.research)||buildings(s,t).some(x=>x.queue.some(q=>q.target===c.research)))return failure('研究已完成或進行中');
      q={type:'research',target:c.research,cost:d.cost,duration:d.duration,supply:0};
    }else if(c.type==='upgrade'){
      if(b.kind!=='townhall'||b.tier>=3||b.queue.some(q=>q.type==='upgrade'))return failure('無法升級主城');
      const next=(b.tier+1) as 2|3,d=TIER_UPGRADES[next];
      if(!requirementsMet(d.requires,tier(s,t),completedKinds(s,t)))return failure('尚未達到科技條件');
      q={type:'upgrade',target:next,cost:d.cost,duration:d.duration,supply:0};
    }else return failure('無效建築指令');
    if(!canAfford(s,t,q.cost))return failure('資源不足');pay(q.cost,q.type+':'+q.target);b.queue.push({...q,cost:{...q.cost},id:s.nextId++,elapsed:0});s.teams[t].reservedSupply+=q.supply;return ok;
  }
  if('unitIds' in c){
    if(!Array.isArray(c.unitIds)||c.unitIds.length===0||c.unitIds.length>80)return failure('請選擇部隊');
    const selected=[...new Set(c.unitIds)].map(id=>byId(s,id));
    if(selected.some(u=>!u||u.team!==t||u.category!=='unit'))return failure('部隊不屬於我方');
    const group=selected as Unit[];
    if(c.type==='stop'||c.type==='hold'){group.forEach(u=>setOrder(u,{type:c.type==='stop'?'idle':'hold'}));return ok;}
    if(c.type==='move'){
      const known=planningObstacles(s,t),ground=group.filter(u=>!isFlying(u));
      // Flyers only need a point inside the map; ground units need walkable ground.
      if(!pointValid(s,c.position)||ground.length&&!isWalkable(s.map,c.position,known,Math.max(...ground.map(u=>UNITS[u.kind].radius))))return failure('無法到達目標位置');
      // Each unit walks to its own formation slot; a slot is only offered when
      // it is in line of sight of the clicked point, so the goal stays reachable.
      const slots=formationSlots(s,t,c.position,group);
      const goals:Array<{position:Vec2;path:Vec2[]}>=[];
      for(const [i,u] of group.entries()){if(isFlying(u)){goals.push({position:{...slots[i]},path:[{...slots[i]}]});continue;}
        const r=UNITS[u.kind].radius,slot=findPath(s.map,u,slots[i],known,r);
        const path=slot??findPath(s.map,u,c.position,known,r);
        // Stop at the first unreachable unit: failed searches flood the whole map.
        if(!path)return failure('沒有可通行的路徑');
        goals.push({position:slot?slots[i]:{...c.position},path});}
      group.forEach((u,i)=>{const g=goals[i];setOrder(u,{type:'move',position:{...g.position},attackMove:!!c.attackMove});u.path=g.path;u.pathGoal={...g.position};u.pathRevision=s.navigationRevision;});return ok;
    }
    if(c.type==='gather'){
      const r=s.resources.find(r=>r.id===c.resourceId&&r.remaining>0);if(!r||!isVisible(s,t,r)||group.some(u=>u.kind!=='worker'))return failure('請指派工人採集視野內的可用資源');
      group.forEach(u=>setOrder(u,{type:'gather',resourceId:r.id}));return ok;
    }
    if(!('targetId' in c))return failure('無效部隊指令');
    const target=byId(s,c.targetId);if(!target)return failure('目標已不存在');
    if(c.type==='attack'){
      if(target.team===t||!isVisible(s,t,target))return failure('目標不在視野內');
      // Units that cannot hit air keep their current orders.
      const able=group.filter(u=>canAttack(u.kind,target));if(!able.length)return failure('無法攻擊空中單位');
      able.forEach(u=>setOrder(u,{type:'attack',targetId:target.id}));return ok;
    }
    if(target.category!=='building'||target.team!==t||group.some(u=>u.kind!=='worker'))return failure('請指派工人修建我方建築');
    group.forEach(u=>setOrder(u,{type:target.construction<1?'build':'repair',targetId:target.id}));return ok;
  }
  return failure('無效指令');
}
