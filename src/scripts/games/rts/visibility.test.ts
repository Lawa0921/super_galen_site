import {describe,it,expect} from 'vitest';
import {createState,addBuilding,destroyEntity,units} from './state';
import {updateVisibility,getTeamView,isVisible} from './visibility';
import type {RtsMap} from './maps';
const flat: RtsMap={id:'river',name:'Test',width:96,height:96,blocked:new Uint8Array(9216),noBuild:new Uint8Array(9216),spawns:[{x:15.5,z:48.5},{x:80.5,z:48.5}],resources:[],camps:[]};
describe('fog of war information boundary',()=>{
  it('freezes last-seen construction through fog and refreshes only on rediscovery',()=>{
    const s=createState(flat,4),w=units(s,0)[0],enemy=addBuilding(s,1,'barracks',{x:48,z:30},false);enemy.construction=.2;
    w.x=48;w.z=34;updateVisibility(s);w.x=15;w.z=50;updateVisibility(s);
    const memory=getTeamView(s,0).knownBuildings.find(e=>e.id===enemy.id)!;expect(memory.construction).toBe(.2);
    enemy.construction=1;updateVisibility(s);expect(getTeamView(s,0).knownBuildings.find(e=>e.id===enemy.id)?.construction).toBe(.2);
    memory.construction=.9;expect(s.visibility[0].knownBuildings[enemy.id].construction).toBe(.2);
    w.x=48;w.z=34;updateVisibility(s);w.x=15;w.z=50;updateVisibility(s);
    expect(getTeamView(s,0).knownBuildings.find(e=>e.id===enemy.id)?.construction).toBe(1);
  });
  it('hides enemies, exposes scouting, then retains only last-known buildings',()=>{
    const s=createState(flat,4),w=units(s,0)[0],enemy=addBuilding(s,1,'house',{x:48,z:30},true);
    updateVisibility(s);expect(getTeamView(s,0).entities.some(e=>e.team===1)).toBe(false);
    w.x=48;w.z=34;updateVisibility(s);expect(isVisible(s,0,enemy)).toBe(true);expect(getTeamView(s,0).entities.some(e=>e.id===enemy.id)).toBe(true);
    w.x=15;w.z=50;updateVisibility(s);destroyEntity(s,enemy);updateVisibility(s);
    expect(getTeamView(s,0).entities.some(e=>e.id===enemy.id)).toBe(false);expect(getTeamView(s,0).knownBuildings.some(e=>e.id===enemy.id)).toBe(true);
    w.x=48;w.z=34;updateVisibility(s);expect(getTeamView(s,0).knownBuildings.some(e=>e.id===enemy.id)).toBe(false);
  });
  it('returns detached data without enemy queues or other team economy',()=>{
    const s=createState(flat,4),w=units(s,0)[0];w.x=74;updateVisibility(s);const view=getTeamView(s,0);
    const enemy=view.entities.find(e=>e.team===1&&e.category==='building');expect(enemy).toBeDefined();
    if(enemy?.category==='building')expect(enemy.queue).toEqual([]);
    view.entities[0].hp=0;expect(s.entities[0].hp).toBeGreaterThan(0);expect('teams' in view).toBe(false);
  });
});
