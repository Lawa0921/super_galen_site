import {describe,it,expect} from 'vitest';
import {createMap} from './maps';
import {createState,addBuilding,addUnit,distance,distanceToEntity} from './state';
import {updateVisibility} from './visibility';
import {issueCommand} from './commands';
import {stepCombat} from './combat';
import {UNITS} from './catalog';
import {approach} from './movement';

/** A house on open pass-map meadow (the fixture predates the 192 m re-layout; shifted (−12,+52) m onto clear ground). */
function fixture(){
  const state=createState(createMap('pass'));state.entities=[];state.aiEnabled=[false,false];
  const house=addBuilding(state,1,'house',{x:70,z:130},true);
  return {state,house};
}
describe('building engagement progress',()=>{
  it('keeps distinct approach slots until an order, target or route changes',()=>{
    const {state,house}=fixture(),first=addUnit(state,0,'guard',{x:68.496,z:120.504}),second=addUnit(state,0,'guard',{x:69.5,z:120.5});
    first.order=second.order={type:'attack',targetId:house.id};updateVisibility(state);
    const a=approach(state,first,house,UNITS.guard.range,true)!,b=approach(state,second,house,UNITS.guard.range,true)!;
    expect(distance(a,b)).toBeGreaterThanOrEqual(2*UNITS.guard.radius);
    first.x=68.39;first.z=120.61;expect(approach(state,first,house,UNITS.guard.range,true)).toEqual(a);
    state.navigationRevision++;approach(state,first,house,UNITS.guard.range,true);expect(first.approachSlot!.revision).toBe(state.navigationRevision);
    house.x=71;approach(state,first,house,UNITS.guard.range,true);expect(first.approachSlot!.target.x).toBe(71);
    expect(issueCommand(state,0,{type:'stop',unitIds:[first.id]}).ok).toBe(true);expect(first.approachSlot).toBeUndefined();
  });

  it('releases a non-progressing slot rather than reserving it indefinitely',()=>{
    const {state,house}=fixture(),guard=addUnit(state,0,'guard',{x:68.496,z:120.504});guard.order={type:'attack',targetId:house.id};updateVisibility(state);
    const first=approach(state,guard,house,UNITS.guard.range,true)!;state.time=1.05;
    const retry=approach(state,guard,house,UNITS.guard.range,true)!;expect(distance(first,retry)).toBeGreaterThan(.1);
  });

  it('crosses the perimeter-choice bisector instead of repeatedly returning to a grid centre',()=>{
    const {state,house}=fixture(),guard=addUnit(state,0,'guard',{x:68.496,z:120.504});
    updateVisibility(state);expect(issueCommand(state,0,{type:'move',unitIds:[guard.id],position:{x:70,z:126},attackMove:true}).ok).toBe(true);
    for(let i=0;i<800;i++){state.time+=.05;updateVisibility(state);stepCombat(state,.05);}
    expect(guard.attackContactSequence).toBeGreaterThanOrEqual(1);expect(house.hp).toBeLessThan(house.maxHp);
  });
  it('gives a clustered army room to reach and damage the southern pass house',()=>{
    const {state,house}=fixture();
    const positions=[[68.517385989844,120.509726874652],[69.041106692586,119.020056770813],[68.346422770646,121.5],[67.870665786716,119.476823160772],[68.826887879831,119.978245195464],[69.165094023001,120.922176878397],[69.798074108404,119.619150724618]];
    const army=positions.map(([x,z],i)=>addUnit(state,0,i===0?'commander':'guard',{x,z}));updateVisibility(state);
    // The observed army already has overlap from non-precise travel. Closing
    // to melee must not deepen that overlap while recovering its formation.
    const minimumSeparation=army.map(a=>army.map(b=>Math.min(distance(a,b),UNITS[a.kind].radius+UNITS[b.kind].radius)));
    expect(issueCommand(state,0,{type:'move',unitIds:army.map(u=>u.id),position:{x:57,z:126},attackMove:true}).ok).toBe(true);
    for(let i=0;i<800&&house.alive;i++){
      state.time+=.05;updateVisibility(state);stepCombat(state,.05);
      for(const unit of army)expect(distanceToEntity(unit,house)).toBeGreaterThanOrEqual(UNITS[unit.kind].radius-1e-8);
      for(let a=0;a<army.length;a++)for(let b=a+1;b<army.length;b++)expect(distance(army[a],army[b])).toBeGreaterThanOrEqual(minimumSeparation[a][b]-1e-8);
    }
    expect(house.alive).toBe(false);
  });
});
