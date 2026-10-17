import {describe,it,expect} from 'vitest';
import {createState,addBuilding,addUnit,destroyEntity} from './state';
import {createMap} from './maps';
import {damageEntity} from './hero';
import {stepEconomy} from './economy';
import {issueCommand} from './commands';
import {getTeamView,updateVisibility} from './visibility';
import {buildingIntegrity,BuildingCueHistory} from './building-lifecycle';
import {stepCombat} from './combat';

function fixture(){const state=createState(createMap('pass'));state.entities=[];state.aiEnabled=[false,false];return {state,house:addBuilding(state,0,'house',{x:22,z:36},true)};}
describe('building lifecycle facts and visibility',()=>{
  it('uses real melee, skill and approaching projectile positions for impact direction',()=>{
    const {state,house}=fixture();house.team=1;const hero=addUnit(state,0,'commander',{x:24.5,z:36});updateVisibility(state);
    expect(issueCommand(state,0,{type:'attack',unitIds:[hero.id],targetId:house.id}).ok).toBe(true);stepCombat(state,.05);
    expect(house.damageCues!.at(-1)?.source).toEqual({x:hero.x,z:hero.z});
    state.teams[0].hero.skills.cleave=1;expect(issueCommand(state,0,{type:'cast',heroId:hero.id,skill:'cleave',targetId:house.id}).ok).toBe(true);
    expect(house.damageCues!.at(-1)?.source).toEqual({x:hero.x,z:hero.z});expect(house.damageCues!.at(-1)?.sequence).toBe(2);
    hero.order={type:'hold'};hero.cooldown=10;
    state.projectiles.push({id:100,sourceId:999,team:0,targetId:house.id,damage:20,speed:16,kind:'bolt',x:22.3,z:36});stepCombat(state,.05);
    expect(house.damageCues!.at(-1)).toMatchObject({sequence:3,source:{x:22.3,z:36}});
  });
  it('records distinct actual impacts including two in one tick, without changing fatal-hit ordering',()=>{
    const {state,house}=fixture(),source={x:24,z:36};state.time=2;
    damageEntity(state,house,20,1,source);source.x=27;damageEntity(state,house,30,1,source);
    expect(house.damageCues).toEqual([{sequence:1,time:2,source:{x:24,z:36}},{sequence:2,time:2,source:{x:27,z:36}}]);
    expect(state.damageSerial).toBe(0);damageEntity(state,house,100000,1,source);expect(state.damageSerial).toBe(1);
    damageEntity(state,house,20,1,source);expect(house.damageCues).toHaveLength(3);
  });
  it('bounds impact history while keeping the true monotonically increasing sequence',()=>{
    const {state,house}=fixture();house.hp=100000;
    for(let i=0;i<40;i++)damageEntity(state,house,1,1,{x:25,z:36});
    expect(house.damageCues).toHaveLength(16);expect(house.damageCues!.at(-1)!.sequence).toBe(40);
    state.time=1;damageEntity(state,house,1,1);expect(house.damageCues).toEqual([{sequence:41,time:1}]);
  });
  it('emits repair cues only for real paid restoration, not normal construction or an empty treasury',()=>{
    const {state,house}=fixture(),worker=addUnit(state,0,'worker',{x:22,z:38.8});worker.order={type:'repair',targetId:house.id};house.hp-=20;state.time=1;
    const gold=state.teams[0].gold;stepEconomy(state,.05);expect(house.repairCue).toEqual({sequence:1,time:1});expect(state.teams[0].gold).toBeCloseTo(gold-.2);
    state.teams[0].gold=0;state.time=2;stepEconomy(state,.05);expect(house.repairCue).toEqual({sequence:1,time:1});
    const fresh=addBuilding(state,0,'house',{x:22,z:43});worker.x=22;worker.z=45.8;worker.order={type:'build',targetId:fresh.id};stepEconomy(state,.05);
    expect(fresh.construction).toBeGreaterThan(0);expect(fresh.repairCue).toBeUndefined();expect(buildingIntegrity(fresh)).toBeCloseTo(1);
  });
  it('removes cancelled construction immediately without a combat destruction cue or obstacle',()=>{
    const {state}=fixture(),fresh=addBuilding(state,0,'house',{x:30,z:36}),revision=state.navigationRevision;
    expect(issueCommand(state,0,{type:'cancel',buildingId:fresh.id}).ok).toBe(true);
    expect(fresh.removalReason).toBe('cancelled');expect(getTeamView(state,0).entities.some(e=>e.id===fresh.id)).toBe(false);
    expect(state.events.filter(e=>e.entityId===fresh.id).map(e=>e.type)).toEqual(['construction-cancelled']);expect(state.navigationRevision).toBe(revision+1);
  });
  it('retains combat destruction for exactly the simulation death window',()=>{
    const {state,house}=fixture();state.time=2;destroyEntity(state,house);expect(house.removalReason).toBe('combat');
    state.time=4.999;expect(getTeamView(state,0).entities.some(e=>e.id===house.id)).toBe(true);
    state.time=5;expect(getTeamView(state,0).entities.some(e=>e.id===house.id)).toBe(false);
  });
  it('normalizes integrity against the portion actually constructed',()=>{
    const {house}=fixture();house.construction=0;house.hp=house.maxHp*.1;expect(buildingIntegrity(house)).toBe(1);
    house.construction=.5;house.hp=house.maxHp*.55*.4;expect(buildingIntegrity(house)).toBeCloseTo(.4);
    house.hp=-1;expect(buildingIntegrity(house)).toBe(0);house.hp=house.maxHp*2;expect(buildingIntegrity(house)).toBe(1);
  });
  it('freezes remembered integrity and removes hidden attack origins from detached team views',()=>{
    const {state,house}=fixture();house.team=1;const scout=addUnit(state,0,'worker',{x:22,z:40});house.hp=house.maxHp*.5;
    damageEntity(state,house,10,1,{x:90,z:90});updateVisibility(state);
    const seen=getTeamView(state,0).entities.find(e=>e.id===house.id)!;expect(seen.category).toBe('building');
    if(seen.category==='building'){expect(seen.damageCues![0].source).toBeUndefined();seen.damageCues![0].sequence=99;}
    expect(house.damageCues![0].sequence).toBe(1);const integrity=buildingIntegrity(house);
    scout.x=5;scout.z=5;updateVisibility(state);house.hp=house.maxHp;updateVisibility(state);
    const memory=getTeamView(state,0).knownBuildings.find(e=>e.id===house.id)!;expect(memory.integrity).toBe(integrity);expect('damageCues' in memory).toBe(false);
    destroyEntity(state,house);updateVisibility(state);expect(getTeamView(state,0).knownBuildings.find(e=>e.id===house.id)?.integrity).toBe(integrity);
  });
  it('never invents a hit on initial visibility and consumes each new cue once',()=>{
    const {state,house}=fixture(),history=new BuildingCueHistory();damageEntity(state,house,20,1,{x:24,z:36});
    expect(history.observe(house,0)).toEqual({impacts:[],repair:false});state.time=.05;
    damageEntity(state,house,20,1,{x:24,z:36});damageEntity(state,house,20,1,{x:25,z:36});
    expect(history.observe(house,.05).impacts.map(c=>c.sequence)).toEqual([2,3]);expect(history.observe(house,.05)).toEqual({impacts:[],repair:false});
    house.repairCue={sequence:1,time:.1};expect(history.observe(house,.1).repair).toBe(true);expect(history.observe(house,.1).repair).toBe(false);
    const rediscovered=new BuildingCueHistory();expect(rediscovered.observe(house,1)).toEqual({impacts:[],repair:false});
    state.time=1;damageEntity(state,house,20,1);expect(history.observe(house,2).impacts).toEqual([]);
  });
});
