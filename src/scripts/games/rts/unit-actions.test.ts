import {describe,expect,it} from 'vitest';
import {createState,addUnit,addBuilding,destroyEntity} from './state';
import {heroCommand} from './hero';
import {stepCombat} from './combat';
import {stepGame} from './simulation';
import {stepEconomy} from './economy';
import {getTeamView,updateVisibility} from './visibility';
import {workAnimation} from './unit-actions';
import type {RtsMap} from './maps';

function setup(){
  const map:RtsMap={id:'river',name:'Test',width:96,height:96,blocked:new Uint8Array(9216),noBuild:new Uint8Array(9216),spawns:[{x:15,z:48},{x:80,z:48}],resources:[],camps:[]};
  const s=createState(map,1);s.aiEnabled=[false,false];return s;
}
describe('work and casting presentation cues',()=>{
  it.each(['gold','wood'] as const)('selects %s work only while actually gathering a visible resource',kind=>{
    const s=setup(),u=addUnit(s,0,'worker',{x:40,z:40});s.resources=[{id:'resource',kind,x:41,z:40,remaining:100}];
    u.order={type:'gather',resourceId:'resource'};updateVisibility(s);stepEconomy(s,.5);
    expect(u.animation).toBe('work');expect(workAnimation(u,getTeamView(s,0))).toBe(kind==='gold'?'mine':'chop');
    expect(u.cargo.amount).toBe(kind==='gold'?1:0);
    const view=getTeamView(s,0);expect(workAnimation(u,{...view,resources:[]})).toBe('work');
    u.animation='walk';expect(workAnimation(u,view)).toBe('walk');
    u.animation='idle';expect(workAnimation(u,view)).toBe('idle');
  });
  it.each(['build','repair'] as const)('maps actual %s to Build without consulting fog memories',type=>{
    const s=setup(),u=addUnit(s,0,'worker',{x:40,z:40}),b=addBuilding(s,0,'house',{x:41,z:40});
    u.animation='work';u.order={type,targetId:b.id};const view=getTeamView(s,0);
    expect(workAnimation(u,view)).toBe('build');expect(workAnimation(u,{...view,entities:[],knownBuildings:[{id:b.id,kind:b.kind,x:b.x,z:b.z,team:0,tier:1,lastSeen:0}]})).toBe('work');
  });
  it.each(['cleave','mend','banner'] as const)('records only successful %s casts and survives simulation/pause',skill=>{
    const s=setup(),hero=addUnit(s,0,'commander',{x:40,z:40}),ally=addUnit(s,0,'guard',{x:41,z:40});ally.hp=10;
    s.teams[0].hero.level=5;s.teams[0].hero.skills[skill]=1;hero.mana=200;s.time=10;updateVisibility(s);
    const command={type:'cast' as const,heroId:hero.id,skill,targetId:ally.id,position:{x:42,z:40}};
    expect(heroCommand(s,0,command).ok).toBe(true);expect(hero.castCue).toEqual({kind:skill,sequence:1,startedAt:10});
    const cue=structuredClone(hero.castCue),mana=hero.mana,cooldown=hero.skillCooldowns[skill];
    expect(heroCommand(s,0,command).ok).toBe(false);expect(hero.castCue).toEqual(cue);expect(hero.mana).toBe(mana);expect(hero.skillCooldowns[skill]).toBe(cooldown);
    stepCombat(s,.05);expect(hero.animation).toBe('idle');expect(hero.castCue).toEqual(cue);
    s.paused=true;stepGame(s);expect(s.time).toBe(10);expect(getTeamView(s,0).entities.find(e=>e.id===hero.id)).toMatchObject({castCue:cue});
    hero.skillCooldowns[skill]=0;hero.mana=200;ally.hp=10;s.time=20;expect(heroCommand(s,0,command).ok).toBe(true);
    expect(hero.castCue).toEqual({kind:skill,sequence:2,startedAt:20});destroyEntity(s,hero);expect(hero.castCue).toBeUndefined();
  });
  it('emits one priest heal cue per accepted heal while preserving mana/heal/cooldown',()=>{
    const s=setup(),p=addUnit(s,0,'priest',{x:40,z:40}),ally=addUnit(s,0,'guard',{x:41,z:40});ally.hp=10;p.mana=100;
    stepCombat(s,.05);expect(ally.hp).toBe(45);expect(p.mana).toBeCloseTo(88.04);expect(p.cooldown).toBe(1.8);
    expect(p.castCue).toEqual({kind:'heal',sequence:1,startedAt:0});
    s.time=.05;stepCombat(s,.05);expect(p.castCue?.sequence).toBe(1);expect(ally.hp).toBe(45);
    s.time=2;p.cooldown=0;stepCombat(s,.05);expect(ally.hp).toBe(80);expect(p.castCue).toEqual({kind:'heal',sequence:2,startedAt:2});
  });
  it('never emits a priest cue without an injured ally or sufficient mana',()=>{
    const s=setup(),p=addUnit(s,0,'priest',{x:40,z:40}),ally=addUnit(s,0,'guard',{x:41,z:40});
    stepCombat(s,.05);expect(p.castCue).toBeUndefined();ally.hp=10;p.mana=0;stepCombat(s,.05);expect(p.castCue).toBeUndefined();expect(ally.hp).toBe(10);
  });
  it('pauses an attack-moving priest for the heal tick then resumes walking with the same cue',()=>{
    const s=setup(),p=addUnit(s,0,'priest',{x:40,z:40}),ally=addUnit(s,0,'guard',{x:41,z:40});ally.hp=10;p.mana=100;
    p.order={type:'move',position:{x:50,z:40},attackMove:true};p.animation='walk';
    stepCombat(s,.05);expect({x:p.x,z:p.z}).toEqual({x:40,z:40});expect(p.animation).toBe('cast');
    const cue=structuredClone(p.castCue);expect(cue).toEqual({kind:'heal',sequence:1,startedAt:0});
    s.time=.05;stepCombat(s,.05);expect(p.x).toBeGreaterThan(40);expect(p.animation).toBe('walk');expect(p.castCue).toEqual(cue);expect(ally.hp).toBe(45);
  });
});
