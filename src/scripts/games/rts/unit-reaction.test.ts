import {describe,expect,it} from 'vitest';
import {createState,addUnit,destroyEntity} from './state';
import {damageEntity,heroCommand} from './hero';
import {stepCombat} from './combat';
import {stepGame} from './simulation';
import {updateVisibility,getTeamView} from './visibility';
import type {RtsMap} from './maps';

function setup(){
  const map:RtsMap={id:'river',name:'Test',width:96,height:96,blocked:new Uint8Array(9216),noBuild:new Uint8Array(9216),spawns:[{x:15,z:48},{x:80,z:48}],resources:[],camps:[]};
  const s=createState(map,1);s.aiEnabled=[false,false];return s;
}
describe('nonlethal unit hit presentation',()=>{
  it('records a cue without changing movement, work, attack timing or damage',()=>{
    const s=setup(),u=addUnit(s,0,'guard',{x:40,z:40});s.time=10;
    u.order={type:'move',position:{x:41,z:39},attackMove:false};u.animation='walk';u.cooldown=.75;
    const before=structuredClone(u);damageEntity(s,u,11.2,1);
    expect(u.hp).toBeCloseTo(before.hp-10);expect(u.hurtCue).toEqual({sequence:1,startedAt:10});
    expect(u.order).toEqual(before.order);expect(u.animation).toBe('walk');expect(u.cooldown).toBe(.75);expect(u.attackCue).toBeUndefined();
    const view=getTeamView(s,0),copy=view.entities.find(e=>e.id===u.id)!;
    expect(copy.category==='unit'&&copy.hurtCue).toEqual(u.hurtCue);expect(copy).not.toBe(u);
  });
  it('applies every hit but never prolongs the reaction during repeated damage',()=>{
    const s=setup(),u=addUnit(s,0,'guard',{x:40,z:40});s.time=10;
    damageEntity(s,u,11.2,1);damageEntity(s,u,11.2,1);
    s.time=10.1;damageEntity(s,u,11.2,1);s.time=10.599;damageEntity(s,u,11.2,1);
    expect(u.hp).toBeCloseTo(280);expect(u.hurtCue).toEqual({sequence:1,startedAt:10});
    s.time=10.6;damageEntity(s,u,11.2,1);expect(u.hurtCue).toEqual({sequence:2,startedAt:10.6});expect(u.hp).toBeCloseTo(270);
  });
  it('removes an earlier reaction on lethal damage and cannot create one on a corpse',()=>{
    const s=setup(),u=addUnit(s,0,'guard',{x:40,z:40});damageEntity(s,u,1,1);expect(u.hurtCue).toBeDefined();
    damageEntity(s,u,10000,1);expect(u.hurtCue).toBeUndefined();expect(u.fatalHitOrder).toBe(1);
    destroyEntity(s,u);damageEntity(s,u,1,1);expect(u.hurtCue).toBeUndefined();expect(u.animation).toBe('death');
    const other=addUnit(s,0,'guard',{x:41,z:40});damageEntity(s,other,1,1);destroyEntity(s,other);expect(other.hurtCue).toBeUndefined();
  });
  it('keeps the original guard contact tick through incoming hits and pause',()=>{
    const s=setup(),a=addUnit(s,0,'guard',{x:40,z:40}),b=addUnit(s,1,'guard',{x:41.05,z:40});b.cooldown=99;
    a.order={type:'attack',targetId:b.id};updateVisibility(s);stepCombat(s,.05);
    const attack=structuredClone(a.attackCue),order=structuredClone(a.order),cooldown=a.cooldown;
    damageEntity(s,a,1,1);damageEntity(s,a,1,1);
    expect(a.hurtCue).toEqual({sequence:1,startedAt:0});expect(a.attackCue).toEqual(attack);expect(a.order).toEqual(order);expect(a.cooldown).toBe(cooldown);expect(a.animation).toBe('attack');
    s.paused=true;for(let i=0;i<10;i++)stepGame(s);expect(s.time).toBe(0);expect(a.hurtCue?.startedAt).toBe(0);
    s.paused=false;for(let i=0;i<10;i++)stepGame(s);expect(b.hp).toBe(320);
    stepGame(s);expect(b.hp).toBeCloseTo(320-20/1.12);expect(a.attackContactSequence).toBe(attack?.sequence);
  });
  it('preserves a real heal and its casting state when the caster is damaged',()=>{
    const s=setup(),hero=addUnit(s,0,'commander',{x:40,z:40}),ally=addUnit(s,0,'guard',{x:41,z:40});ally.hp=10;
    expect(heroCommand(s,0,{type:'learn',heroId:hero.id,skill:'mend'}).ok).toBe(true);
    expect(heroCommand(s,0,{type:'cast',heroId:hero.id,skill:'mend',targetId:ally.id}).ok).toBe(true);
    const before=structuredClone(hero);damageEntity(s,hero,1,1);
    expect(hero.hurtCue).toBeDefined();expect(hero.animation).toBe('cast');expect(hero.mana).toBe(before.mana);expect(hero.skillCooldowns).toEqual(before.skillCooldowns);expect(ally.hp).toBe(190);
  });
});
