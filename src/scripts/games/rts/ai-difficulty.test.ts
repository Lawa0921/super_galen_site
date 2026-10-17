import {describe,it,expect} from 'vitest';
import {createGame,stepGame} from './simulation';
import {addUnit,buildings,units,distance} from './state';
import {stepAI,AI_PROFILES,type Difficulty} from './ai';
import {isVisible,updateVisibility} from './visibility';
import type {GameState} from './types';

/** Seat 1 runs the AI against an idle seat 0; waves are held so the economy, not a base race, is measured. */
function solo(id:'river'|'pass',difficulty:Difficulty='normal',seed=1){const s=createGame(id,seed,difficulty);s.aiEnabled=[false,true];return s;}
function run(s:GameState,until:number,stop:(s:GameState)=>boolean=()=>false){
  while(s.time<until&&s.status==='playing'&&!stop(s)){s.ai[1].nextAttack=Infinity;stepGame(s);}
}
/** The east seat's natural expansion gold (the 180° twin of the west seat's). */
const expansion=(id:'river'|'pass')=>`${id}-gold-east-natural`;

describe('AI difficulty profiles',()=>{
  it('parameterises reaction, waves, economy and the optional behaviours',()=>{
    const {easy,normal,hard}=AI_PROFILES;
    expect(easy.think).toBeGreaterThan(normal.think);expect(hard.think).toBeLessThan(normal.think);
    expect(easy.firstAttack).toBeGreaterThan(normal.firstAttack);expect(hard.firstAttack).toBeLessThan(normal.firstAttack);
    expect(easy.workers[1]).toBeLessThan(normal.workers[1]);expect(hard.workers[1]).toBeGreaterThan(normal.workers[1]);
    expect([easy.expand,easy.creep,easy.retreat]).toEqual([false,false,false]);
    expect([normal.expand,normal.creep,normal.retreat,hard.expand,hard.creep,hard.retreat]).toEqual([true,true,true,true,true,true]);
  });
  it('defaults to normal and records the chosen profile on both seats',()=>{
    expect(createGame('river',1).ai.map(ai=>ai.difficulty)).toEqual(['normal','normal']);
    const s=createGame('pass',1,'hard');expect(s.ai.map(ai=>ai.difficulty)).toEqual(['hard','hard']);expect(s.ai[1].nextAttack).toBe(AI_PROFILES.hard.firstAttack);
  });
  it.each(['river','pass'] as const)('fields a larger army at 8 minutes on harder settings (%s)',id=>{
    // Production only: waves are held and the idle opponent's buildings are
    // kept standing, so no scout can end the match before the 8-minute mark.
    const size=(d:Difficulty)=>{const s=solo(id,d);
      while(s.time<480&&s.status==='playing'){s.ai[1].nextAttack=Infinity;stepGame(s);for(const b of buildings(s,0))b.hp=b.maxHp;}
      expect(s.time).toBeGreaterThanOrEqual(480);return s.economyLog.filter(r=>r.team===1&&r.reason.startsWith('train:')&&r.reason!=='train:worker').length;};
    const [easy,normal,hard]=(['easy','normal','hard'] as const).map(size);
    console.info(`[ai-difficulty] ${id} soldiers recruited by 480s easy=${easy} normal=${normal} hard=${hard}`);
    expect(easy).toBeLessThan(normal);expect(normal).toBeLessThan(hard);
  },120_000);
});

describe('AI scouting and expansion under fog',()=>{
  it.each(['river','pass'] as const)('does not know the fogged expansion gold at the start but discovers it with a worker scout (%s)',id=>{
    const s=solo(id),gold=s.resources.find(r=>r.id===expansion(id))!;
    expect(isVisible(s,1,gold)).toBe(false);stepAI(s,1);expect(s.ai[1].knownResources?.[gold.id]).toBeUndefined();
    let scoutKind:string|undefined;
    run(s,240,s=>{const id=s.ai[1].prospectorId,u=id===undefined?undefined:units(s,1).find(u=>u.id===id);if(u)scoutKind=u.kind;return !!s.ai[1].knownResources?.[gold.id];});
    console.info(`[ai-scout] ${id} found expansion gold at t=${s.time.toFixed(1)}s by ${scoutKind}`);
    expect(scoutKind).toBe('worker');expect(s.ai[1].knownResources?.[gold.id]).toMatchObject({kind:'gold',x:gold.x,z:gold.z});
    // The prospector heads for the map's gold sites first (~2 minutes on the 288 m maps).
    expect(s.time).toBeLessThan(160);
  },60_000);
  it.each(['river','pass'] as const)('builds a second town hall at the expansion gold once home gold runs low and mines it (%s)',id=>{
    const s=solo(id),home=s.resources.find(r=>r.id===`${id}-gold-east`)!,gold=s.resources.find(r=>r.id===expansion(id))!;
    const hallAt=()=>buildings(s,1).find(b=>b.kind==='townhall'&&b.construction>=1&&distance(b,gold)<14);
    let started:number|undefined,left:number|undefined;
    run(s,300);expect(buildings(s,1).filter(b=>b.kind==='townhall')).toHaveLength(1);
    run(s,720,s=>{if(started===undefined&&buildings(s,1).filter(b=>b.kind==='townhall').length>1){started=s.time;left=home.remaining;}
      return !!hallAt()&&units(s,1).filter(u=>u.order.type==='gather'&&u.order.resourceId===gold.id).length>=4;});
    console.info(`[ai-expand] ${id} hall placed t=${started?.toFixed(1)}s with home gold ${left}`);
    expect(left).toBeLessThan(5000*.3+1);
    const miners=units(s,1).filter(u=>u.order.type==='gather'&&u.order.resourceId===gold.id).length;
    console.info(`[ai-expand] ${id} expansion hall=${!!hallAt()} at t=${s.time.toFixed(1)}s miners=${miners} home=${home.remaining} camp-cleared=${s.economyLog.some(r=>r.team===1&&r.reason==='camp-cleared')}`);
    expect(hallAt()).toBeDefined();expect(miners).toBeGreaterThanOrEqual(4);
    // The camp guarding the expansion is cleared on the way (creeping).
    expect(s.economyLog.some(r=>r.team===1&&r.reason==='camp-cleared')).toBe(true);
  },60_000);
  it('keeps every seat on one hall on easy (no expansion)',()=>{
    const s=solo('river','easy');s.resources.find(r=>r.id==='river-gold-east')!.remaining=600;run(s,420);
    expect(buildings(s,1).filter(b=>b.kind==='townhall')).toHaveLength(1);
  },60_000);
});

describe('AI retreat',()=>{
  /** Three east guards caught near the west base by eight west guards. */
  function ambush(difficulty:Difficulty,enemies=8){
    const s=createGame('river',1,difficulty);s.aiEnabled=[false,false];
    // Offsets from the west spawn (24,144) match the original fixture at (14,48).
    for(let i=0;i<3;i++)addUnit(s,1,'guard',{x:44,z:140+i*1.5});
    for(let i=0;i<enemies;i++)addUnit(s,0,'guard',{x:37+(i%2)*1.2,z:138+Math.floor(i/2)*1.5});
    s.time=200;s.tick=4000;updateVisibility(s);s.ai[1].nextThink=0;return s;
  }
  const guards=(s:GameState)=>units(s,1).filter(u=>u.kind==='guard');
  it('pulls an outnumbered army back toward its base and regroups before the next wave',()=>{
    const s=ambush('normal'),hall=buildings(s,1)[0];stepAI(s,1);
    for(const g of guards(s)){expect(g.order.type).toBe('move');if(g.order.type==='move'){expect(g.order.attackMove).toBe(false);expect(distance(g.order.position,hall)).toBeLessThan(16);}}
    expect(s.ai[1].retreatUntil).toBeGreaterThan(s.time);expect(s.ai[1].nextAttack).toBeGreaterThanOrEqual(s.ai[1].retreatUntil!);
    const start=Math.min(...guards(s).map(g=>distance(g,hall))),ambushers={x:37.6,z:140.25};s.aiEnabled=[false,true];
    for(let i=0;i<20*10;i++)stepGame(s);
    expect(guards(s)).toHaveLength(3);expect(Math.min(...guards(s).map(g=>distance(g,hall)))).toBeLessThan(start-5);
    for(const g of guards(s))expect(distance(g,ambushers)).toBeGreaterThan(14);
  });
  it('holds its ground when the fight is even and on easy, which never retreats',()=>{
    for(const s of [ambush('normal',2),ambush('easy')]){stepAI(s,1);expect(guards(s).every(g=>g.order.type!=='move'||g.order.attackMove)).toBe(true);expect(s.ai[1].retreatUntil??0).toBeLessThanOrEqual(s.time);}
  });
});

describe('AI-vs-AI matches conclude',()=>{
  it.each(['river','pass'] as const)('ends by elimination inside the 30-minute cap on normal (%s)',id=>{
    const s=createGame(id,1);s.aiEnabled=[true,true];while(s.status==='playing')stepGame(s);
    console.info(`[ai-vs-ai] ${id} ended t=${s.time.toFixed(0)}s ${s.status} winner=${s.winner}`);
    expect(s.status).toBe('won');expect(s.endReason).toBe('elimination');expect(s.time).toBeLessThan(1800);
  },120_000);
});
