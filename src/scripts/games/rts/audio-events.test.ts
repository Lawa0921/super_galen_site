import {describe,expect,it} from 'vitest';
import {VisibleAudioCues} from './ui';
import {createGame} from './simulation';
import {addUnit,addBuilding} from './state';
import {getTeamView,updateVisibility} from './visibility';
import type {Unit} from './types';
import {issueCommand} from './commands';
import {stepCombat} from './combat';

describe('visible action sound timing',()=>{
  function setup(){const state=createGame('river',17);state.aiEnabled=[false,false];const cues=new VisibleAudioCues();return {state,cues,read:()=>cues.observe(getTeamView(state,0))};}
  it('does not announce combat destruction when the player cancels unfinished construction',()=>{
    const {state,read}=setup(),building=addBuilding(state,0,'house',state.map.spawns[0]);read();
    expect(issueCommand(state,0,{type:'cancel',buildingId:building.id})).toEqual({ok:true});expect(read()).toEqual([]);
  });
  it('plays each melee swing even while the unit stays in its attack animation',()=>{
    const {state,cues,read}=setup(),guard=addUnit(state,0,'guard',state.map.spawns[0]);cues.observe(getTeamView(state,0));
    guard.animation='attack';guard.attackCue={sequence:1,startedAt:state.time,targetId:99};expect(read()).toContain('attack');expect(read()).toEqual([]);
    guard.attackCue={sequence:2,startedAt:state.time+1.2,targetId:99};expect(read()).toContain('attack');
  });
  it('separates bolt launch, shell launch and actual visible damage',()=>{
    const {state,read}=setup(),target=addUnit(state,1,'guard',{x:state.map.spawns[0].x+2,z:state.map.spawns[0].z});updateVisibility(state);read();
    state.projectiles.push({id:101,sourceId:1,targetId:target.id,team:0,x:target.x,z:target.z,damage:12,speed:10,kind:'bolt'});
    expect(read()).toEqual(['bolt']);state.projectiles=[];target.hp-=12;expect(read()).toEqual(['impact']);
    state.projectiles.push({id:102,sourceId:1,targetId:target.id,team:0,x:target.x,z:target.z,damage:12,speed:10,kind:'shell'});expect(read()).toEqual(['shell']);
  });
  it('hears subsequent harvest strokes, distinguishes repair and announces a completed structure',()=>{
    const {state,read}=setup(),worker=state.entities.find(e=>e.team===0&&e.kind==='worker') as Unit;
    const building=addBuilding(state,0,'house',state.map.spawns[0]);read();
    worker.animation='work';worker.order={type:'gather',resourceId:state.resources[0].id};expect(read()).toContain('gather');
    worker.cargo.amount=1;expect(read()).toContain('gather');expect(read()).toEqual([]);
    worker.order={type:'repair',targetId:building.id};expect(read()).toContain('repair');
    building.construction=1;expect(read()).toContain('complete');expect(read()).toEqual([]);
  });
  it('does not replay damage or old attacks when an enemy returns from fog, but hears a visible death once',()=>{
    const {state,read}=setup(),enemy=addUnit(state,1,'guard',{x:state.map.spawns[0].x+2,z:state.map.spawns[0].z});updateVisibility(state);read();
    enemy.x=80;enemy.z=80;updateVisibility(state);expect(read()).toEqual([]);
    enemy.hp-=30;enemy.animation='attack';enemy.attackCue={sequence:8,startedAt:0,targetId:1};expect(read()).toEqual([]);
    enemy.x=state.map.spawns[0].x+2;enemy.z=state.map.spawns[0].z;updateVisibility(state);expect(read()).toEqual([]);
    enemy.hp=0;enemy.alive=false;enemy.deathTime=state.time;enemy.animation='death';expect(read()).toEqual(['death']);expect(read()).toEqual([]);
  });
  it('keeps healing and allied damage distinct and never treats enemy research as completion',()=>{
    const {state,read}=setup(),priest=addUnit(state,0,'priest',state.map.spawns[0]);read();
    priest.animation='cast';priest.mana-=12;expect(read()).toContain('heal');
    priest.hp-=10;const hurt=read();expect(hurt).toContain('impact');expect(hurt).toContain('warning');
    state.teams[1].research.push('weapons1');expect(read()).toEqual([]);
    state.teams[0].research.push('weapons1');expect(read()).toEqual(['complete']);
  });
  it('uses the real hero skill cooldown transition even if combat already replaced the cast pose',()=>{
    for(const [skill,cue] of [['mend','heal'],['cleave','attack'],['banner','banner']] as const){
      const {state,read}=setup();state.teams[0].hero.level=3;state.teams[0].hero.skills[skill]=1;
      const hero=addUnit(state,0,'commander',state.map.spawns[0]),ally=addUnit(state,0,'guard',{x:hero.x+1,z:hero.z});ally.hp-=80;updateVisibility(state);read();
      expect(issueCommand(state,0,{type:'cast',heroId:hero.id,skill,targetId:ally.id,position:{x:hero.x+1,z:hero.z}})).toEqual({ok:true});
      hero.animation='idle';expect(read()).toEqual([cue]);expect(read()).toEqual([]);
    }
  });
  it('sounds every priest attack through the real combat system when no ally needs healing',()=>{
    const {state,read}=setup(),priest=addUnit(state,0,'priest',state.map.spawns[0]),enemy=addUnit(state,1,'guard',{x:priest.x+4,z:priest.z});
    priest.order={type:'attack',targetId:enemy.id};updateVisibility(state);read();stepCombat(state,.05);expect(read()).toContain('spell');
    priest.cooldown=0;state.time+=1.8;stepCombat(state,.05);expect(read()).toContain('spell');
  });
});
