import { describe, expect, it } from 'vitest';
import { createState, population, addUnit, destroyEntity } from './state';
import type { RtsMap } from './maps';
export const flatMap = (): RtsMap => ({id:'river',name:'Test',width:96,height:96,blocked:new Uint8Array(96*96),noBuild:new Uint8Array(96*96),spawns:[{x:15.5,z:48.5},{x:80.5,z:48.5}],resources:[{id:'g0',kind:'gold',x:8.5,z:36.5,amount:1000},{id:'w0',kind:'wood',x:10.5,z:60.5,amount:1000}],camps:[]});
describe('game state and population accounting',()=>{
  it('starts both teams with exactly five workers, a hall and fixed resources',()=>{
    const s=createState(flatMap(),17);
    for(const t of [0,1] as const){
      expect(s.teams[t].gold).toBe(500);expect(s.teams[t].wood).toBe(200);
      expect(population(s,t)).toEqual({used:5,reserved:0,cap:10});
      expect(s.entities.filter(e=>e.team===t&&e.kind==='townhall')).toHaveLength(1);
    }
  });
  it('does not retain supply from dead units or cancel queued cost on destruction',()=>{
    const s=createState(flatMap(),1);const u=addUnit(s,0,'knight',{x:22,z:40});
    expect(population(s,0).used).toBe(9);destroyEntity(s,u);
    expect(population(s,0).used).toBe(5);const hall=s.entities.find(e=>e.team===0&&e.category==='building')!;
    if(hall.category!=='building')throw Error('fixture');
    hall.queue.push({id:100,type:'train',target:'worker',cost:{gold:50,wood:0},elapsed:2,duration:6,supply:1});s.teams[0].reservedSupply=1;
    destroyEntity(s,hall);expect(s.teams[0].gold).toBe(500);expect(population(s,0)).toEqual({used:5,reserved:0,cap:0});
    destroyEntity(s,hall);expect(s.teams[0].reservedSupply).toBe(0);
  });
});
