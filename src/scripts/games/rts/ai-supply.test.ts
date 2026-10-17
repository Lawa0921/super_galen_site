import {describe,it,expect,vi} from 'vitest';
const failures:Record<string,number>={};
vi.mock('./commands',async importOriginal=>{const real=await importOriginal<typeof import('./commands')>();
  return {...real,issueCommand:(...args:Parameters<typeof real.issueCommand>)=>{const r=real.issueCommand(...args);
    if(!r.ok&&args[2].type==='build'){const key=args[2].building+':'+r.reason;failures[key]=(failures[key]??0)+1;}return r;}};});
import {createGame,stepGame} from './simulation';
import {buildings,population} from './state';

describe('AI supply growth',()=>{
  // Regression: after the twelve fixed slots ran out, houses failed thousands of
  // times ("此處無法建造" / "需要先探索建造位置") and supply stayed at 30.
  it.each(['river','pass'] as const)('keeps placing houses past 30 supply on %s',map=>{
    const s=createGame(map,1);s.aiEnabled=[false,true];
    // Scenario fixture: an indestructible passive opponent keeps the match running,
    // and a topped-up treasury isolates placement from economy and combat.
    const enemy=buildings(s,0)[0];enemy.maxHp=enemy.hp=1e9;
    let cap=0;
    for(let i=0;i<20*600&&s.status==='playing';i++){
      if(i%20===0){s.teams[1].gold=Math.max(s.teams[1].gold,1500);s.teams[1].wood=Math.max(s.teams[1].wood,1000);}
      stepGame(s);cap=Math.max(cap,population(s,1).cap);
    }
    const houseFailures=Object.entries(failures).filter(([k])=>k.startsWith('house:')).reduce((n,[,v])=>n+v,0);
    console.info(`[ai-supply:${map}] cap=${cap} houses=${buildings(s,1).filter(b=>b.kind==='house').length} failures=${JSON.stringify(failures)}`);
    expect(cap).toBeGreaterThanOrEqual(60);
    expect(houseFailures).toBeLessThan(10);
    for(const k of Object.keys(failures))delete failures[k];
  },60_000);
});
