import {describe,expect,it} from 'vitest';
import {createGame,stepGame} from './simulation';
import {addBuilding,addUnit,destroyEntity} from './state';
import {stepAI} from './ai';
import {updateVisibility} from './visibility';
import {canPlace,isWalkable} from './navigation';
import type {GameState,Unit} from './types';

/** The last west building on open ground (84,8 is clear on both 288 m maps). */
function remnant(map:'river'|'pass'='river',x=84,z=8){
  const state=createGame(map,123);
  for(const entity of state.entities)if(entity.team===0||entity.category==='unit')destroyEntity(state,entity);
  const house=addBuilding(state,0,'house',{x,z},true);
  const scout=addUnit(state,1,'guard',{x:72,z:62});
  state.teams[1].gold=0;state.teams[1].wood=0;state.time=61;state.tick=1220;updateVisibility(state);
  return {state,house,scout};
}
function destination(scout:Unit){expect(scout.order.type).toBe('move');return scout.order.type==='move'?scout.order.position:{x:NaN,z:NaN};}
function arrive(state:GameState,scout:Unit){const p=destination(scout);Object.assign(scout,p);scout.order={type:'idle'};state.time+=61;state.tick=Math.round(state.time*20);updateVisibility(state);return p;}

describe('fog-limited scouting after the original base is gone',()=>{
  it('continues to an unexplored destination instead of repeating the empty spawn',()=>{
    const {state,scout}=remnant();stepAI(state,1);const first=arrive(state,scout);
    const explored=state.visibility[1].explored.slice();stepAI(state,1);const next=destination(scout);
    expect(next).not.toEqual(first);expect(explored[Math.floor(next.z)*state.map.width+Math.floor(next.x)]).toBe(0);
  });
  it('does not choose a target from hidden enemy entity positions',()=>{
    const a=remnant('river',80,20),b=remnant('river',30,85);
    expect(a.state.visibility[1].explored).toEqual(b.state.visibility[1].explored);
    stepAI(a.state,1);stepAI(b.state,1);expect(destination(a.scout)).toEqual(destination(b.scout));
    expect(a.scout.path).toEqual(b.scout.path);
  });
  it('stops dispatching when every cell is explored',()=>{
    const {state,scout}=remnant();state.visibility[1].explored.fill(1);stepAI(state,1);
    expect(scout.order.type).toBe('idle');
  });
  it.each([false,true])('uses a reachable approach to the remembered building even if its hidden position changes: %s',moved=>{
    const {state,house,scout}=remnant('river',84,8);
    expect(canPlace(state.map,{x:house.x,z:house.z,width:4,depth:4})).toBe(true);
    for(let i=0;i<5;i++)addUnit(state,1,'guard',{x:scout.x+i*1.2,z:scout.z+2});
    state.visibility[1].knownBuildings[house.id]={id:house.id,kind:house.kind,x:house.x,z:house.z,team:0,tier:1,lastSeen:60};
    state.time=181;state.tick=3620;
    // Fixture: block the AI's preferred staging point (east attacker: x+6, z−6 after
    // the 180° map symmetry change) so it must fall back to a perimeter approach.
    const stage={x:house.x+6,z:house.z-6};
    for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)state.map.blocked[(Math.floor(stage.z)+dz)*state.map.width+Math.floor(stage.x)+dx]=1;
    expect(isWalkable(state.map,stage)).toBe(false);
    if(moved){house.x=30;house.z=85;}
    stepAI(state,1);
    expect(scout.order.type).toBe('move');
    if(scout.order.type==='move'){expect(scout.order.attackMove).toBe(true);expect(isWalkable(state.map,scout.order.position)).toBe(true);expect(Math.hypot(scout.order.position.x-84,scout.order.position.z-8)).toBeLessThan(9);}
    expect(scout.path.length).toBeGreaterThan(0);expect(state.ai[1].nextAttack).toBe(251);
  });
  it('keeps orders unchanged when every remembered attack approach is blocked',()=>{
    const {state,house,scout}=remnant('river',84,8);
    for(let i=0;i<5;i++)addUnit(state,1,'guard',{x:scout.x+i*1.2,z:scout.z+2});
    state.visibility[1].knownBuildings[house.id]={id:house.id,kind:house.kind,x:84,z:8,team:0,tier:1,lastSeen:60};
    for(let z=1;z<=15;z++)for(let x=77;x<=91;x++)state.map.blocked[z*state.map.width+x]=1;
    state.time=181;state.tick=3620;stepAI(state,1);
    expect(scout.order.type).toBe('idle');expect(scout.path).toEqual([]);expect(state.ai[1].nextAttack).toBe(186);
    state.time=182;stepAI(state,1);expect(state.ai[1].nextAttack).toBe(186);
  });
  it('reaches a legal edge building when all fixed six-metre offsets are blocked',()=>{
    const {state,house,scout}=remnant('river',37,5);
    expect(canPlace(state.map,{x:37,z:5,width:4,depth:4})).toBe(true);
    for(let i=0;i<5;i++)addUnit(state,1,'guard',{x:scout.x+i*1.2,z:scout.z+2});
    state.visibility[1].knownBuildings[house.id]={id:house.id,kind:house.kind,x:37,z:5,team:0,tier:1,lastSeen:60};
    state.time=181;state.tick=3620;stepAI(state,1);
    expect(scout.order.type).toBe('move');expect(scout.path.length).toBeGreaterThan(0);
    for(let i=0;i<12000&&state.status==='playing';i++)stepGame(state);
    expect(house.alive).toBe(false);expect(state.winner).toBe(1);
  });
  it.each(['river','pass'] as const)('finds and defeats a hidden last house on %s through normal movement',map=>{
    const {state,house,scout}=remnant(map);
    for(let i=0;i<5;i++)addUnit(state,1,'guard',{x:scout.x+i*1.2,z:scout.z+2});
    expect(state.visibility[1].explored[Math.floor(house.z)*state.map.width+Math.floor(house.x)]).toBe(0);
    // 288 m maps hold 2.25x the frontier of the 192 m ones: allow a 25-minute whole-map sweep (the scout first checks the enemy start).
    for(let i=0;i<30000&&state.status==='playing';i++)stepGame(state);
    console.info(`[scout-sweep] ${map} house found and razed by t=${state.time.toFixed(0)}s`);
    expect(house.alive).toBe(false);expect(state.winner).toBe(1);
  },60000);
});
