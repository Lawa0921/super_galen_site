import {describe,expect,it} from 'vitest';
import {createGame,stepGame} from './simulation';
import {addBuilding,addUnit,destroyEntity,distance,units} from './state';
import {stepAI} from './ai';
import {updateVisibility} from './visibility';

// On the 288 m maps a seat whose scouts die on the way (camps, the enemy
// scout) never learned where the enemy was and its waves never left home,
// so AI-vs-AI matches ran into the 30-minute draw. In a 1v1 map the enemy
// start is public knowledge, and expansions can only be at the map's gold.
describe('AI hunts for an unseen enemy',()=>{
  function due(){
    const s=createGame('pass',1);s.aiEnabled=[false,false];
    for(const u of units(s,-1))destroyEntity(s,u);
    const army=Array.from({length:6},(_,i)=>addUnit(s,1,'guard',{x:250+(i%3)*1.5,z:150+Math.floor(i/3)*1.5}));
    // Past the first wave plus the scout's head start.
    s.time=s.ai[1].nextAttack+91;s.tick=Math.round(s.time*20);s.ai[1].nextThink=0;updateVisibility(s);
    return {s,army};
  }
  it('marches a due wave on the enemy start when no enemy building has been seen',()=>{
    const {s,army}=due();expect(Object.keys(s.visibility[1].knownBuildings)).toHaveLength(0);
    stepAI(s,1);
    const moving=army.filter(u=>u.order.type==='move'&&u.order.attackMove);
    expect(moving.length).toBeGreaterThanOrEqual(5);
    for(const u of moving)if(u.order.type==='move')expect(distance(u.order.position,s.map.spawns[0])).toBeLessThan(20);
  });
  it('then checks the gold sites for a hidden expansion instead of idling',()=>{
    const {s,army}=due();
    for(const e of s.entities)if(e.team===0)destroyEntity(s,e);
    const third=s.resources.find(r=>r.id==='pass-gold-west-third')!,hall=addBuilding(s,0,'house',{x:third.x+7,z:third.z+6},true);
    // The enemy start has already been seen empty.
    const [west]=s.map.spawns,W=s.map.width;
    for(let z=west.z-30;z<west.z+30;z++)for(let x=Math.max(0,west.x-24);x<west.x+30;x++)s.visibility[1].explored[z*W+x]=1;
    s.aiEnabled=[false,true];
    for(let i=0;i<20*60*8&&hall.alive;i++)stepGame(s);
    console.info(`[ai-hunt] expansion house razed=${!hall.alive} at t=${s.time.toFixed(0)}s`);
    expect(hall.alive).toBe(false);expect(army.some(u=>u.alive)).toBe(true);
  },60_000);
  it('presses on to the nearest known building once its wave target falls deep in enemy land',()=>{
    const {s,army}=due();
    for(const e of s.entities)if(e.team===0)destroyEntity(s,e);
    const near=addBuilding(s,0,'house',{x:50,z:120},true),far=addBuilding(s,0,'house',{x:40,z:230},true),gone=addBuilding(s,0,'house',{x:60,z:150},true);
    army.forEach((u,i)=>{u.x=79+(i%3)*1.5;u.z=149+Math.floor(i/3)*1.5;});
    const memory=(b:typeof near)=>({id:b.id,kind:b.kind,x:b.x,z:b.z,team:0 as const,tier:1,lastSeen:s.time});
    s.visibility[1].knownBuildings={[far.id]:memory(far),[near.id]:memory(near)};
    // The last wave razed `gone`; the next one is not due for a minute.
    destroyEntity(s,gone);s.ai[1].waveTarget=gone.id;s.ai[1].nextAttack=s.time+60;s.ai[1].nextThink=0;
    stepAI(s,1);
    const orders=army.map(u=>u.order).filter(o=>o.type==='move'&&o.attackMove);
    expect(orders.length).toBeGreaterThanOrEqual(5);
    for(const o of orders)if(o.type==='move')expect(Math.hypot(o.position.x-near.x,o.position.z-near.z)).toBeLessThan(12);
    expect(s.ai[1].waveTarget).toBe(near.id);
  });
});
