import {describe,it,expect} from 'vitest';
import {createGame} from './simulation';
import {createMap} from './maps';
import {channelBanks} from './river-layout';

describe('published river landscape integration',()=>{
  it('starts real games with the reviewed channel and relocated expansion mines',()=>{
    const state=createGame('river',7);
    expect(state.map).toHaveProperty('terrainProfile','meandering-river');
    const W=state.map.width,water=channelBanks(72.5);
    expect(state.map.blocked[144*W+147]).toBe(0);expect(state.map.blocked[72*W+Math.floor((water.left+water.right)/2)]).toBe(1);
    expect(state.resources.find(r=>r.id==='river-gold-north')).toMatchObject({x:183.5,z:77.5,remaining:3500});
    expect(state.resources.find(r=>r.id==='river-gold-south')).toMatchObject({x:104.5,z:210.5,remaining:3500});
    expect(state.resources.find(r=>r.id==='river-gold-west-natural')).toMatchObject({x:32.5,z:91.5,remaining:4000});
    expect(state.map.scenery?.filter(p=>p.kind==='rock')).toHaveLength(24);
  });
  it('keeps the pass map outside the river terrain profile',()=>{
    const map=createMap('pass');expect(map).not.toHaveProperty('terrainProfile');
    expect(map.resources.find(r=>r.id==='pass-gold-north')).toMatchObject({x:187.5,z:61.5});
  });
});
