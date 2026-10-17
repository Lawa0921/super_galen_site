import type { RtsMap, Vec2, Footprint } from './maps';
import type { GameState, Entity, Unit, Building, TeamState, TeamVisibility, HeroProgress } from './types';
import { BUILDINGS, UNITS, SKILL_IDS, isHero, type TeamId, type UnitKind, type BuildingKind, type Cost, type HeroKind, type SkillId } from './catalog';
import {updateVisibility} from './visibility';
const noSkills=()=>Object.fromEntries(SKILL_IDS.map(id=>[id,0])) as Record<SkillId,number>;
const heroState=():HeroProgress=>({recruited:false,xp:0,level:1,points:1,skills:noSkills()});
const teamState = ():TeamState => ({gold:500,wood:200,reservedSupply:0,research:[],hero:heroState(),heroes:{sage:heroState(),'ranger-captain':heroState()},stats:{gatheredGold:0,gatheredWood:0,unitsTrained:0,unitsLost:0,kills:0,buildingsBuilt:0,buildingsLost:0}});
export function createState(map:RtsMap,seed=1):GameState {
  const fog=():TeamVisibility=>({visible:new Uint8Array(map.width*map.height),explored:new Uint8Array(map.width*map.height),knownBuildings:{}});
  const s:GameState={map,seed,rng:seed>>>0,time:0,tick:0,nextId:1,navigationRevision:0,damageSerial:0,status:'playing',winner:null,paused:false,teams:[teamState(),teamState()],entities:[],resources:map.resources.map(r=>({...r,remaining:r.amount})),projectiles:[],visibility:[fog(),fog()],events:[],economyLog:[],rewardedCamps:[],seenCommandIds:[new Set(),new Set()],aiEnabled:[false,true],ai:[{nextThink:0,nextAttack:180,lastScout:0},{nextThink:0,nextAttack:180,lastScout:0}]};
  for(const team of [0,1] as const){
    const p=map.spawns[team];addBuilding(s,team,'townhall',p,true);
    // East workers are the 180° twins of the west ones.
    const turn=p.x<map.width/2?1:-1;
    for(let i=0;i<5;i++)addUnit(s,team,'worker',{x:p.x+turn*(-3+i*1.5),z:p.z+turn*5.5});
  }
  // Seeded AI reaction phase (0-1 s): matches with different seeds diverge from
  // the opening instead of replaying an identical first five minutes.
  for(const ai of s.ai)ai.nextThink=random(s);
  map.camps.forEach((p,campId)=>{for(const offset of [-1,1]){const u=addUnit(s,-1,'neutral-raider',{x:p.x+offset,z:p.z});u.campId=campId;u.home={x:u.x,z:u.z};}});
  updateVisibility(s);return s;
}
export function population(s:GameState,team:TeamId):{used:number;reserved:number;cap:number} {
  let used=0,cap=0;for(const e of s.entities){if(!e.alive||e.team!==team)continue;
    if(e.category==='unit')used+=UNITS[e.kind].supply;
    else if(e.construction>=1)cap+=BUILDINGS[e.kind].supply;
  }return {used,reserved:s.teams[team].reservedSupply,cap:Math.min(80,cap)};
}
export function addUnit(s:GameState,team:TeamId|-1,kind:UnitKind,p:Vec2):Unit {
  const d=UNITS[kind];const level=isHero(kind)&&team!==-1?heroProgress(s.teams[team],kind).level:1;
  const hp=d.hp+(level-1)*60;
  const u:Unit={...p,id:s.nextId++,category:'unit',kind,team,hp,maxHp:hp,alive:true,facing:0,cooldown:0,animation:'idle',order:{type:'idle'},mana:d.mana,taskTime:0,cargo:{kind:'gold',amount:0},path:[],pathRevision:-1,blockedTime:0,skillCooldowns:noSkills(),bannerUntil:0};
  s.entities.push(u);if(isHero(kind)&&team!==-1)heroProgress(s.teams[team],kind).recruited=true;return u;
}
/** Level, XP and learned skills of one hero kind (kept while the hero is dead). */
export const heroProgress=(team:TeamState,kind:HeroKind):HeroProgress=>kind==='commander'?team.hero:team.heroes[kind];
/** Flying units ignore terrain and ground bodies (see movement.ts). */
export const isFlying=(u:{kind:UnitKind}):boolean=>!!UNITS[u.kind].flying;
export function addBuilding(s:GameState,team:TeamId,kind:BuildingKind,p:Vec2,complete=false):Building {
  const d=BUILDINGS[kind];const b:Building={...p,id:s.nextId++,category:'building',kind,team,hp:complete?d.hp:d.hp*.1,maxHp:d.hp,alive:true,facing:0,cooldown:0,animation:'idle',construction:complete?1:0,tier:1,queue:[],spent:{...d.cost}};
  s.entities.push(b);s.navigationRevision++;return b;
}
export function destroyEntity(s:GameState,e:Entity,reason:'combat'|'cancelled'='combat'):void {
  if(!e.alive)return;e.alive=false;e.hp=0;e.deathTime=s.time;e.animation='death';
  if(e.category==='unit'){delete e.attackCue;delete e.hurtCue;delete e.castCue;}
  if(e.category==='building'){e.removalReason=reason;s.teams[e.team].reservedSupply-=e.queue.reduce((n,q)=>n+q.supply,0);e.queue=[];s.navigationRevision++;if(reason==='combat')s.teams[e.team].stats.buildingsLost++;}
  else if(e.team!==-1)s.teams[e.team].stats.unitsLost++;
  s.events.push({time:s.time,type:e.category==='building'&&reason==='cancelled'?'construction-cancelled':'destroyed',team:e.team,entityId:e.id});
}
export function economyChange(s:GameState,team:TeamId,cost:Cost,reason:string):void {
  s.teams[team].gold+=cost.gold;s.teams[team].wood+=cost.wood;
  s.economyLog.push({time:s.time,team,reason,...cost});
}
export const buildings = (s:GameState,team?:TeamId):Building[] => s.entities.filter((e):e is Building=>e.alive&&e.category==='building'&&(team===undefined||e.team===team));
export const units = (s:GameState,team?:TeamId|-1):Unit[] => s.entities.filter((e):e is Unit=>e.alive&&e.category==='unit'&&(team===undefined||e.team===team));
export const byId = (s:GameState,id:number):Entity|undefined => s.entities.find(e=>e.id===id&&e.alive);
export const tier = (s:GameState,team:TeamId):number => Math.max(1,...buildings(s,team).filter(b=>b.kind==='townhall'&&b.construction>=1).map(b=>b.tier));
export const completedKinds = (s:GameState,team:TeamId):BuildingKind[] => buildings(s,team).filter(b=>b.construction>=1).map(b=>b.kind);
export const footprint = (b:Building):Footprint => ({x:b.x,z:b.z,width:BUILDINGS[b.kind].width,depth:BUILDINGS[b.kind].depth});
export const obstacles = (s:GameState):Footprint[] => buildings(s).map(footprint);
export const distance = (a:Vec2,b:Vec2):number => Math.hypot(a.x-b.x,a.z-b.z);
export function random(s:GameState):number {s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296;}
export function distanceToEntity(p:Vec2,e:Entity):number {
  if(e.category==='unit')return Math.max(0,distance(p,e)-UNITS[e.kind].radius);
  const d=BUILDINGS[e.kind];return Math.hypot(Math.max(0,Math.abs(p.x-e.x)-d.width/2),Math.max(0,Math.abs(p.z-e.z)-d.depth/2));
}
