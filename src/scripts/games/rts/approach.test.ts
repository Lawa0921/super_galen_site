import {describe,it,expect} from 'vitest';
import {createState,buildings,units} from './state';
import {createMap} from './maps';
import {approach} from './movement';

describe('stable building approaches',()=>{
  it('keeps the same perimeter destination across floating point ties on a diagonal',()=>{
    const s=createState(createMap('river'),1),hall=buildings(s,0)[0],worker=units(s,0)[0];
    hall.x=15.5;hall.z=48.5;
    const goals=[7.73922021851097,7.852357303500817,7.965494388490665].map(offset=>{
      worker.x=hall.x+offset;worker.z=hall.z+offset;return approach(s,worker,hall,1);
    });
    expect(goals[0]).not.toBeNull();expect(goals[1]).toEqual(goals[0]);expect(goals[2]).toEqual(goals[0]);
  });
  it('still chooses the closer side when the unit changes its approach direction',()=>{
    const s=createState(createMap('river'),1),hall=buildings(s,0)[0],worker=units(s,0)[0];
    worker.x=hall.x+10;worker.z=hall.z;const east=approach(s,worker,hall,1)!;
    worker.x=hall.x;worker.z=hall.z+10;const south=approach(s,worker,hall,1)!;
    expect(east.x).toBeGreaterThan(hall.x);expect(east.z).toBeCloseTo(hall.z);
    expect(south.z).toBeGreaterThan(hall.z);expect(south.x).toBeCloseTo(hall.x);
  });
});

describe('worker building approach hysteresis',()=>{
  // Reproduces the river AI deadlock: a builder between its house and barracks
  // saw two near-equidistant stable entrances, swapped goals every few ticks and
  // re-pathed back to its start cell for minutes without ever reaching the site.
  it('reaches a construction site whose two nearest entrances are nearly equidistant',async()=>{
    const {createGame,stepGame}=await import('./simulation');
    const {addBuilding}=await import('./state');
    const {issueCommand}=await import('./commands');
    const {updateVisibility}=await import('./visibility');
    const s=createGame('river',1);s.aiEnabled=[false,false];
    addBuilding(s,1,'barracks',{x:82,z:35},true);addBuilding(s,1,'house',{x:69,z:35},true);
    const stable=addBuilding(s,1,'stable',{x:69,z:22});
    const worker=units(s,1).find(u=>u.kind==='worker')!;worker.x=71.5;worker.z=35.41378830703493;
    updateVisibility(s);
    expect(issueCommand(s,1,{type:'resume',unitIds:[worker.id],targetId:stable.id})).toEqual({ok:true});
    for(let i=0;i<20*10&&stable.construction===0;i++)stepGame(s);
    expect(stable.construction).toBeGreaterThan(0);
  });
});
