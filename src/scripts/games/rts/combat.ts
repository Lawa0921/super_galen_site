import {UNITS,GUARD_MOTION,PROJECTILE_RELEASE_SECONDS,DAMAGE_MATRIX,TOWER_ATTACK,MAGE_SPELL,SKILL_IDS,isHero,type TeamId,type UnitKind,type ArmorType} from './catalog';
import type {GameState,Entity,Unit} from './types';
import {byId,buildings,units,distance,distanceToEntity,destroyEntity,economyChange,heroProgress} from './state';
import {approach,moveToward,advanceMoveOrder} from './movement';
import {isVisible} from './visibility';
import {damageEntity,grantXp} from './hero';
import type {Vec2} from './maps';
interface Hit {target:Entity;damage:number;team:TeamId|-1;source:Vec2}
/** Armour class of any entity: buildings are fortified. */
export const armorOf=(e:Entity):ArmorType=>e.category==='unit'?UNITS[e.kind].armorType:'fortified';
/** Air rule: flying units can only be hit by `targetsAir` attackers (and towers). */
export function canAttack(attacker:UnitKind|'tower',target:Entity):boolean {
  if(target.category!=='unit'||!UNITS[target.kind].flying)return true;
  return attacker==='tower'||!!UNITS[attacker].targetsAir;
}
function rejectedTarget(s:GameState,u:Unit,e:Entity):boolean {
  return (u.unreachableTargets??[]).some(r=>r.id===e.id&&r.revision===s.navigationRevision&&distance(r,e)<.75);
}
function enemyTarget(s:GameState,u:Unit,range:number):Entity|undefined {
  return s.entities.filter(e=>e.alive&&e.hp>0&&e.team!==u.team&&canAttack(u.kind,e)&&(u.team!==-1?isVisible(s,u.team,e):e.category==='unit'&&e.team!==-1)&&distanceToEntity(u,e)<=range&&!rejectedTarget(s,u,e))
    .sort((a,b)=>Number(a.category==='building')-Number(b.category==='building')||distanceToEntity(u,a)-distanceToEntity(u,b)||a.id-b.id)[0];
}
function attackDamage(s:GameState,u:Unit,target:Entity):number {
  const d=UNITS[u.kind],upgrade=u.team===-1?0:s.teams[u.team].research.filter(r=>r.startsWith('weapons')).length;
  const level=isHero(u.kind)&&u.team!==-1?heroProgress(s.teams[u.team],u.kind).level-1:0;
  return (d.damage+upgrade*3+level*4)*(target.category==='building'?(d.buildingMultiplier??1):1)*DAMAGE_MATRIX[d.attackType][armorOf(target)];
}
/** Mage autocast: the visible enemy unit with the most enemies around it inside range, when at least two would be hit. */
function mageBlast(s:GameState,u:Unit):boolean {
  if(u.team===-1||u.mana<MAGE_SPELL.mana||(u.spellCooldown??0)>0||u.cooldown>0)return false;
  const team=u.team,foes=units(s).filter(e=>e.hp>0&&e.team!==team&&isVisible(s,team,e));
  const near=(p:Vec2)=>foes.filter(e=>distance(e,p)<=MAGE_SPELL.radius);
  const best=foes.filter(e=>distance(u,e)<=MAGE_SPELL.range).map(e=>({e,n:near(e).length})).sort((a,b)=>b.n-a.n||a.e.id-b.e.id)[0];
  if(!best||best.n<2)return false;
  for(const e of near(best.e)){damageEntity(s,e,MAGE_SPELL.damage*DAMAGE_MATRIX.magic[armorOf(e)],team,u);e.slowUntil=s.time+MAGE_SPELL.slowSeconds;}
  u.mana-=MAGE_SPELL.mana;u.spellCooldown=MAGE_SPELL.cooldown;u.cooldown=.8;u.animation='cast';delete u.attackCue;
  u.facing=Math.atan2(best.e.x-u.x,best.e.z-u.z);u.castCue={kind:'blast',sequence:(u.castCue?.sequence??0)+1,startedAt:s.time};
  s.events.push({time:s.time,type:'cast-blast',team,entityId:u.id});return true;
}
export function stepCombat(s:GameState,dt:number):void {
  const hits:Hit[]=[];
  s.projectiles=s.projectiles.filter(p=>{
    const target=byId(s,p.targetId);if(!target)return false;
    const d=distance(p,target),step=p.speed*dt;if(d<=step+.4){hits.push({target,damage:p.damage,team:p.team,source:{x:p.x,z:p.z}});return false;}
    p.x+=(target.x-p.x)/d*step;p.z+=(target.z-p.z)/d*step;return true;
  });
  for(const u of units(s)){
    if(u.hp<=0)continue;const d=UNITS[u.kind];u.cooldown=Math.max(0,u.cooldown-dt);u.mana=Math.min(d.mana,u.mana+dt*.8);
    for(const k of SKILL_IDS)u.skillCooldowns[k]=Math.max(0,u.skillCooldowns[k]-dt);
    if(u.spellCooldown)u.spellCooldown=Math.max(0,u.spellCooldown-dt);
    if(u.team===-1&&u.home){
      if(distance(u,u.home)>16)u.returning=true;
      if(u.returning){if(distance(u,u.home)>.4){moveToward(s,u,u.home,dt);u.taskTime=0;}else{u.animation='idle';u.taskTime+=dt;if(u.taskTime>=6){u.hp=u.maxHp;u.returning=false;u.taskTime=0;}}continue;}
    }
    if(u.kind==='worker'&&['gather','build','repair'].includes(u.order.type))continue;
    if(u.kind==='priest'&&u.team!==-1&&u.mana>=12&&u.cooldown<=0&&(u.order.type==='idle'||u.order.type==='hold'||u.order.type==='move'&&u.order.attackMove)){
      const ally=units(s,u.team).filter(a=>a.hp>0&&a.hp<a.maxHp&&distance(u,a)<=7).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
      if(ally){ally.hp=Math.min(ally.maxHp,ally.hp+35);u.mana-=12;u.cooldown=1.8;u.animation='cast';delete u.attackCue;
        u.castCue={kind:'heal',sequence:(u.castCue?.sequence??0)+1,startedAt:s.time};continue;}
    }
    if(u.kind==='mage'&&u.order.type!=='move'&&mageBlast(s,u))continue;
    if(u.kind==='mage'&&u.order.type==='move'&&u.order.attackMove&&mageBlast(s,u))continue;
    let target:Entity|undefined;
    if(u.order.type==='attack'){
      target=byId(s,u.order.targetId);if(!target||target.hp<=0||!canAttack(u.kind,target)||(u.team!==-1&&!isVisible(s,u.team,target))){u.order={type:'idle'};target=undefined;delete u.attackCue;if(u.animation==='attack')u.animation='idle';if(u.team===-1&&u.home){u.returning=true;u.taskTime=0;continue;}}
    }else if(u.order.type!=='move'||u.order.attackMove){
      const acquire=u.order.type==='hold'||u.kind==='worker'?d.range:Math.max(10,d.range);
      // A detour may briefly move away from an acquired enemy. Retain the
      // engagement with a bounded hysteresis instead of oscillating each tick.
      const retained=u.engagedTargetId===undefined?undefined:byId(s,u.engagedTargetId);
      const retainRange=u.order.type==='hold'||u.kind==='worker'?d.range:acquire+4;
      if(retained&&retained.hp>0&&retained.team!==u.team&&canAttack(u.kind,retained)&&distanceToEntity(u,retained)<=retainRange&&(u.team===-1||isVisible(s,u.team,retained))&&!rejectedTarget(s,u,retained))target=retained;
      else target=enemyTarget(s,u,acquire);
      u.engagedTargetId=target?.id;
    }
    if(target&&u.team===-1&&u.home&&distance(target,u.home)>16){u.returning=true;continue;}
    if(target&&u.team===-1)u.order={type:'attack',targetId:target.id};
    if(target){
      if(distanceToEntity(u,target)>d.range){
        delete u.attackCue;u.animation='idle';
        if(u.order.type!=='hold'){
          const p=approach(s,u,target,d.range,target.category==='building'),transient=u.order.type!=='attack';
          const arrivalTolerance=Math.min(.15,Math.max(.001,(d.range-Math.max(d.radius,d.range*.8))/2));
          if(!p||moveToward(s,u,p,dt,arrivalTolerance,!transient)==='blocked'){
            u.unreachableTargets=(u.unreachableTargets??[]).filter(r=>r.id!==target.id&&r.revision===s.navigationRevision&&!!byId(s,r.id));
            u.unreachableTargets.push({id:target.id,x:target.x,z:target.z,revision:s.navigationRevision});u.engagedTargetId=undefined;delete u.approachSlot;
            if(!transient)u.order={type:'idle'};
          }
        }continue;
      }
      if(u.attackCue&&u.attackCue.targetId!==target.id){delete u.attackCue;u.animation='idle';}
      u.facing=Math.atan2(target.x-u.x,target.z-u.z);
      const contact=u.kind==='guard'?GUARD_MOTION.attack.contactSeconds:PROJECTILE_RELEASE_SECONDS[u.kind];
      if(contact!==undefined&&u.attackCue&&u.attackCue.targetId===target.id&&u.attackContactSequence!==u.attackCue.sequence&&s.time-u.attackCue.startedAt+1e-8>=contact){
        if(d.projectileSpeed)s.projectiles.push({id:s.nextId++,sourceId:u.id,team:u.team,targetId:target.id,x:u.x,z:u.z,damage:attackDamage(s,u,target),speed:d.projectileSpeed,kind:u.kind==='siege'?'shell':'bolt'});
        else hits.push({target,damage:attackDamage(s,u,target),team:u.team,source:{x:u.x,z:u.z}});
        u.attackContactSequence=u.attackCue.sequence;
      }
      if(u.cooldown>0){if(u.animation!=='cast')u.animation=u.attackCue?'attack':'idle';continue;}
      u.cooldown=d.interval;u.animation='attack';
      u.attackSequence=(u.attackSequence??0)+1;u.attackCue={sequence:u.attackSequence,startedAt:s.time,targetId:target.id};
      if(!d.projectileSpeed&&u.kind!=='guard')hits.push({target,damage:attackDamage(s,u,target),team:u.team,source:{x:u.x,z:u.z}});
    }else if(u.order.type==='move'){
      delete u.attackCue;delete u.approachSlot;
      if(advanceMoveOrder(s,u,u.order.position,dt)&&u.order.type==='move')u.order={type:'idle'};
    }else if(u.team===-1&&u.home&&(distance(u,u.home)>.5||u.hp<u.maxHp)){u.returning=true;u.taskTime=0;}
    else if(u.attackCue||u.cooldown<=0){delete u.attackCue;u.animation='idle';}
  }
  for(const b of buildings(s)){
    if(b.kind!=='tower'||b.construction<1||b.hp<=0)continue;b.cooldown=Math.max(0,b.cooldown-dt);
    if(b.cooldown>0)continue;
    const target=s.entities.filter(e=>e.alive&&e.team!==b.team&&canAttack('tower',e)&&isVisible(s,b.team,e)&&distanceToEntity(b,e)<=10).sort((a,c)=>distance(b,a)-distance(b,c))[0];
    if(target){s.projectiles.push({id:s.nextId++,sourceId:b.id,team:b.team,targetId:target.id,x:b.x,z:b.z,damage:26*DAMAGE_MATRIX[TOWER_ATTACK][armorOf(target)],speed:16,kind:'bolt'});b.cooldown=1.2;}
  }
  for(const hit of hits)damageEntity(s,hit.target,hit.damage,hit.team,hit.source);
  const deaths=s.entities.filter(e=>e.alive&&e.hp<=0).sort((a,b)=>(a.fatalHitOrder??0)-(b.fatalHitOrder??0)||a.id-b.id);
  for(const e of deaths)destroyEntity(s,e);
  const campKillers=new Map<number,TeamId>();
  for(const e of deaths){const killer=e.lastAttacker;if(killer===undefined||killer===-1||killer===e.team)continue;s.teams[killer].stats.kills++;
    // Every hero within 12 m earns the kill XP (only the commander exists without the preview roster).
    for(const hero of units(s,killer).filter(u=>isHero(u.kind)&&distance(u,e)<=12))grantXp(s,hero,e.category==='building'?25:e.kind==='neutral-raider'?35:20+UNITS[e.kind].supply*5);
    if(e.category==='unit'&&e.campId!==undefined)campKillers.set(e.campId,killer);
  }
  for(const [campId,killer] of campKillers)if(!s.rewardedCamps.includes(campId)&&!units(s,-1).some(u=>u.campId===campId)){
    s.rewardedCamps.push(campId);economyChange(s,killer,{gold:70,wood:0},'camp-cleared');
  }
}
export function resolveVictory(s:GameState):void {
  if(s.status!=='playing')return;const alive=[buildings(s,0).length>0,buildings(s,1).length>0];
  if(!alive[0]&&!alive[1]){s.status='draw';s.endReason='mutual-destruction';}
  else if(!alive[0]||!alive[1]){s.status='won';s.winner=alive[0]?0:1;s.endReason='elimination';}
  else if(s.time>=1800){s.status='draw';s.endReason='time-limit';}
}
