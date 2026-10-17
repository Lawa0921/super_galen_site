import {describe,expect,it} from 'vitest';
import {createGame} from './simulation';
import {addBuilding,addUnit,destroyEntity} from './state';
import {issueCommand} from './commands';
import {isVisible,updateVisibility} from './visibility';
import {moveToward} from './movement';

describe('navigation uses only a team’s known building footprints',()=>{
  it('accepts the same hidden destination for movement and rally, then rejects it after discovery',()=>{
    const state=createGame('pass'),house=addBuilding(state,0,'house',{x:72,z:110},true);
    const scout=addUnit(state,1,'guard',{x:72,z:62}),hall=state.entities.find(e=>e.team===1&&e.kind==='townhall')!;
    updateVisibility(state);expect(isVisible(state,1,house)).toBe(false);
    expect(issueCommand(state,1,{type:'move',unitIds:[scout.id],position:house}).ok).toBe(true);
    expect(issueCommand(state,1,{type:'rally',buildingId:hall.id,position:house}).ok).toBe(true);
    scout.x=72;scout.z=120;updateVisibility(state);
    expect(issueCommand(state,1,{type:'move',unitIds:[scout.id],position:house}).ok).toBe(false);
    expect(issueCommand(state,1,{type:'rally',buildingId:hall.id,position:house}).ok).toBe(false);
  });
  it('retains an observed obstacle until its destruction is actually discovered',()=>{
    const state=createGame('pass'),house=addBuilding(state,0,'house',{x:72,z:110},true);
    const scout=addUnit(state,1,'guard',{x:72,z:120});updateVisibility(state);
    scout.x=72;scout.z=62;updateVisibility(state);destroyEntity(state,house);updateVisibility(state);
    expect(isVisible(state,1,house)).toBe(false);
    expect(issueCommand(state,1,{type:'move',unitIds:[scout.id],position:house}).ok).toBe(false);
    scout.x=72;scout.z=120;updateVisibility(state);
    expect(issueCommand(state,1,{type:'move',unitIds:[scout.id],position:house}).ok).toBe(true);
  });
  it('replans around a newly seen house without walking through its footprint',()=>{
    const state=createGame('pass'),house=addBuilding(state,0,'house',{x:67,z:94},true);
    const scout=addUnit(state,1,'guard',{x:72,z:110}),goal={x:58,z:68};updateVisibility(state);
    expect(isVisible(state,1,house)).toBe(false);
    expect(issueCommand(state,1,{type:'move',unitIds:[scout.id],position:goal}).ok).toBe(true);
    for(let i=0;i<600;i++){
      updateVisibility(state);moveToward(state,scout,goal,.05);
      expect(Math.hypot(Math.max(0,Math.abs(scout.x-house.x)-2),Math.max(0,Math.abs(scout.z-house.z)-2))).toBeGreaterThanOrEqual(.48-1e-8);
    }
    expect(Math.hypot(scout.x-goal.x,scout.z-goal.z)).toBeLessThan(.3);
  });
});
