import type {Vec2} from './maps';
import {SKILLS,isHero,type SkillId} from './catalog';
import {isPointVisible,type getTeamView} from './visibility';
export interface SpellPreview {skill:SkillId;origin:Vec2 & {id?:number};aim:Vec2;range:number;valid:boolean;targetId?:number;target?:Vec2 & {id?:number}}
export function spellPreview(view:ReturnType<typeof getTeamView>,heroId:number,skill:SkillId,aim?:Vec2,targetId?:number):SpellPreview|null {
  const hero=view.entities.find(e=>e.id===heroId&&e.alive&&e.team===0&&isHero(e.kind));
  if(!hero||hero.category!=='unit'||!isHero(hero.kind))return null;
  const definition=SKILLS[skill],target=view.entities.find(e=>e.id===targetId&&e.alive);
  const origin={id:hero.id,x:hero.x,z:hero.z},point=aim??{x:hero.x+Math.sin(hero.facing)*definition.range,z:hero.z+Math.cos(hero.facing)*definition.range};
  const progress=hero.kind==='commander'?view.team.hero:view.team.heroes[hero.kind];
  let valid=definition.hero===hero.kind&&progress.skills[skill]>0&&progress.level>=definition.minLevel&&hero.mana>=definition.mana&&hero.skillCooldowns[skill]<=0;
  if(skill==='mark')valid=valid&&!!target&&target.team!==0&&target.category==='unit'&&target.hp>0&&Math.hypot(target.x-hero.x,target.z-hero.z)<=definition.range;
  if(skill==='sunburst'||skill==='volley'||skill==='daybreak'){
    const distance=Math.hypot(point.x-hero.x,point.z-hero.z),visible=point.x>=0&&point.z>=0&&point.x<view.width&&point.z<view.height&&isPointVisible(view.visible,view.width,view.height,point);
    valid=valid&&!!aim&&distance<=definition.range&&visible;
  }
  if(skill==='mend')valid=valid&&!!target&&target.team===0&&target.category==='unit'&&target.hp>0&&target.hp<target.maxHp&&Math.hypot(target.x-hero.x,target.z-hero.z)<=definition.range;
  if(skill==='cleave'){
    const distance=Math.hypot(point.x-hero.x,point.z-hero.z),visible=point.x>=0&&point.z>=0&&point.x<view.width&&point.z<view.height&&isPointVisible(view.visible,view.width,view.height,point);
    valid=valid&&!!aim&&distance>=.01&&distance<=definition.range&&visible;
  }
  return {skill,origin,aim:point,range:definition.range,valid,targetId:target?.id,target:target?{id:target.id,x:target.x,z:target.z}:undefined};
}
