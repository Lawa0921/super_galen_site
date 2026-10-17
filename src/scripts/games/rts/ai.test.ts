import {describe,it,expect} from 'vitest';
import {createGame,stepGame} from './simulation';
import {buildings} from './state';
describe('honest deterministic opponent',()=>{
  it('gathers and constructs from its opening treasury on both maps',()=>{
    for(const id of ['river','pass'] as const){const s=createGame(id,17);for(let i=0;i<3600;i++)stepGame(s);
      expect(s.teams[1].stats.gatheredGold).toBeGreaterThan(50);expect(s.teams[1].stats.gatheredWood).toBeGreaterThan(25);
      expect(buildings(s,1).some(b=>b.kind==='barracks'&&b.construction===1)).toBe(true);
      const ledger=s.economyLog.filter(e=>e.team===1);expect(s.teams[1].gold).toBeCloseTo(500+ledger.reduce((n,e)=>n+e.gold,0),6);
      expect(s.teams[1].gold).toBeGreaterThanOrEqual(0);expect(s.teams[1].wood).toBeGreaterThanOrEqual(0);
    }
  },30000);
  it('pauses simulation time and repeats a seed exactly',()=>{const a=createGame('river',31),b=createGame('river',31);
    a.paused=true;stepGame(a);expect(a.time).toBe(0);a.paused=false;
    for(let i=0;i<200;i++){stepGame(a);stepGame(b);}expect(a.entities).toEqual(b.entities);expect(a.economyLog).toEqual(b.economyLog);expect(a.time).toBeCloseTo(10);
  });
});
