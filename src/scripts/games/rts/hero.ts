import type {GameState,Command,CommandResult,Entity,Unit} from './types';
import {SKILLS,UNITS,XP_THRESHOLDS,MARK_FACTOR,isHero,type TeamId} from './catalog';
import {byId,distance,units,distanceToEntity,heroProgress,isFlying} from './state';
import {isVisible} from './visibility';
import {recordBuildingImpact} from './building-lifecycle';
import {HURT_INTERVAL} from './unit-reaction';
import type {Vec2} from './maps';
export function damageEntity(s:GameState,target:Entity,amount:number,attacker:TeamId|-1,source?:Vec2):void {
  if(!target.alive||target.hp<=0)return;
  let armor=target.category==='unit'?UNITS[target.kind].armor:3;
  if(target.team!==-1)armor+=s.teams[target.team].research.filter(r=>r.startsWith('armor')).length*2;
  const banner=target.team!==-1&&units(s,target.team).some(u=>u.kind==='commander'&&u.bannerUntil>s.time&&distance(u,target)<=8);
  const marked=target.category==='unit'&&(target.markedUntil??0)>s.time;
  target.hp-=Math.max(1,amount/(1+armor*.06)*(banner?.75:1)*(marked?MARK_FACTOR:1));target.lastAttacker=attacker;
  if(target.category==='building')recordBuildingImpact(target,s.time,source);
  else if(target.hp<=0)delete target.hurtCue;
  else if(!target.hurtCue||s.time-target.hurtCue.startedAt+1e-8>=HURT_INTERVAL)target.hurtCue={sequence:(target.hurtCue?.sequence??0)+1,startedAt:s.time};
  if(target.hp<=0)target.fatalHitOrder=++s.damageSerial;
}
export function grantXp(s:GameState,hero:Unit,xp:number):void {
  if(hero.team===-1||!isHero(hero.kind))return;const h=heroProgress(s.teams[hero.team],hero.kind);h.xp+=xp;
  while(h.level<5&&h.xp>=XP_THRESHOLDS[h.level]){h.level++;h.points++;hero.maxHp+=60;hero.hp=Math.min(hero.maxHp,hero.hp+60);s.events.push({time:s.time,type:'hero-level',team:hero.team,entityId:hero.id,text:`${UNITS[hero.kind].name}升至 ${h.level} 級`});}
}
/** Visible living enemies (any layer) within radius of a point. */
const enemiesNear=(s:GameState,t:TeamId,p:Vec2,radius:number)=>s.entities.filter(e=>e.alive&&e.hp>0&&e.team!==t&&isVisible(s,t,e)&&distanceToEntity(p,e)<=radius);
const validPoint=(s:GameState,t:TeamId,hero:Unit,p:Vec2|undefined,range:number):p is Vec2=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&distance(hero,p)<=range&&isVisible(s,t,p);
export function heroCommand(s:GameState,t:TeamId,c:Extract<Command,{type:'learn'|'cast'}>):CommandResult {
  const fail=(reason:string):CommandResult=>({ok:false,reason});
  const hero=byId(s,c.heroId);if(!hero||hero.category!=='unit'||!isHero(hero.kind)||hero.team!==t||hero.hp<=0)return fail('請選擇我方統領');
  if(!Object.hasOwn(SKILLS,c.skill))return fail('無效技能');const d=SKILLS[c.skill],progress=heroProgress(s.teams[t],hero.kind);
  if(d.hero!==hero.kind)return fail('此英雄不會這項技能');
  if(c.type==='learn'){
    if(progress.points<=0||progress.skills[c.skill]>=2||progress.level<d.minLevel)return fail('等級或技能點數不足');
    progress.points--;progress.skills[c.skill]++;return {ok:true};
  }
  const rank=progress.skills[c.skill];if(!rank||progress.level<d.minLevel||hero.mana<d.mana||hero.skillCooldowns[c.skill]>0)return fail('技能尚未就緒');
  const target=c.targetId===undefined?undefined:byId(s,c.targetId);
  if(c.skill==='mend'){
    if(!target||target.category!=='unit'||target.team!==t||target.hp<=0||distance(hero,target)>d.range||target.hp>=target.maxHp)return fail('請選擇範圍內受傷的友軍');
    target.hp=Math.min(target.maxHp,target.hp+120+rank*60);
  }else if(c.skill==='cleave'){
    const p=c.position??target;
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)||distance(hero,p)>d.range||distance(hero,p)<.01||!isVisible(s,t,p))return fail('請選擇視野內的近戰目標');
    hero.facing=Math.atan2(p.x-hero.x,p.z-hero.z);
    // A melee arc: flying units are out of reach.
    for(const enemy of s.entities){if(!enemy.alive||enemy.team===t||!isVisible(s,t,enemy)||distanceToEntity(hero,enemy)>d.range||enemy.category==='unit'&&isFlying(enemy))continue;
      const angle=Math.atan2(enemy.x-hero.x,enemy.z-hero.z),delta=Math.atan2(Math.sin(angle-hero.facing),Math.cos(angle-hero.facing));
      if(Math.abs(delta)<=Math.PI/3)damageEntity(s,enemy,65+rank*35,t,hero);
    }
  }else if(c.skill==='sunburst'||c.skill==='volley'||c.skill==='daybreak'){
    const p=c.position??target;if(!validPoint(s,t,hero,p,d.range))return fail('目標超出範圍或不在視野內');
    hero.facing=Math.atan2(p.x-hero.x,p.z-hero.z);
    const damage=c.skill==='sunburst'?55+rank*30:c.skill==='volley'?45+rank*25:60+rank*40;
    for(const enemy of enemiesNear(s,t,p,d.radius??3)){damageEntity(s,enemy,damage,t,hero);if(c.skill==='daybreak'&&enemy.category==='unit')enemy.slowUntil=s.time+5;}
  }else if(c.skill==='radiance'){
    for(const ally of units(s,t))if(ally.hp>0&&distance(hero,ally)<=d.range)ally.hp=Math.min(ally.maxHp,ally.hp+50+rank*40);
  }else if(c.skill==='sprint'){
    for(const ally of units(s,t))if(ally.hp>0&&distance(hero,ally)<=d.range)ally.hasteUntil=s.time+4+rank*2;
  }else if(c.skill==='mark'){
    if(!target||target.category!=='unit'||target.team===t||target.hp<=0||!isVisible(s,t,target)||distance(hero,target)>d.range)return fail('請選擇範圍內可見的敵方單位');
    target.markedUntil=s.time+8+rank*2;
  }else hero.bannerUntil=s.time+6+rank*2;
  hero.mana-=d.mana;hero.skillCooldowns[c.skill]=d.cooldown;hero.animation='cast';delete hero.attackCue;
  hero.castCue={kind:c.skill,sequence:(hero.castCue?.sequence??0)+1,startedAt:s.time};
  s.events.push({time:s.time,type:'cast-'+c.skill,team:t,entityId:hero.id});return {ok:true};
}
