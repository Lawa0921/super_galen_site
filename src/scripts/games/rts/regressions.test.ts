import {describe,it,expect} from 'vitest';
import {createState,addUnit,units,buildings} from './state';
import {createMap} from './maps';
import {issueCommand} from './commands';
import {stepCombat} from './combat';
import {updateVisibility} from './visibility';
import {stepAI} from './ai';
import {stepEconomy} from './economy';
const setup=()=>{const map=createMap('pass');map.blocked.fill(0);map.noBuild.fill(0);map.camps=[];const s=createState(map,1);s.aiEnabled=[false,false];updateVisibility(s);return s;};
describe('review regressions',()=>{
  it('rejects construction in unseen terrain before spending or revealing the site',()=>{
    const s=setup(),worker=units(s,0)[0],entities=s.entities.length;
    expect(issueCommand(s,0,{type:'build',workerId:worker.id,building:'house',position:{x:75,z:40}}).ok).toBe(false);
    expect(s.entities).toHaveLength(entities);expect(s.teams[0].gold).toBe(500);expect(s.teams[0].wood).toBe(200);
    expect(issueCommand(s,0,{type:'build',workerId:worker.id,building:'house',position:{x:24,z:131}}).ok).toBe(true);
  });
  it('skips an unreachable engagement without dropping the movement destination or repeating errors',()=>{
    const s=setup();for(let z=0;z<s.map.height;z++)s.map.blocked[z*s.map.width+45]=1;
    const guard=addUnit(s,0,'guard',{x:40,z:40}),enemy=addUnit(s,1,'worker',{x:49,z:40});
    updateVisibility(s);expect(issueCommand(s,0,{type:'move',unitIds:[guard.id],position:{x:35,z:40},attackMove:true}).ok).toBe(true);
    for(let i=0;i<30;i++){s.time+=.05;stepCombat(s,.05);}
    expect(s.events.filter(e=>e.type==='path-blocked'&&e.entityId===guard.id)).toHaveLength(1);
    expect(guard.x).toBeLessThan(39);expect(enemy.hp).toBe(120);
    // A changed route invalidates the rejection, so combat can resume.
    s.map.blocked.fill(0);s.navigationRevision++;guard.order={type:'idle'};enemy.x=guard.x+5;updateVisibility(s);
    for(let i=0;i<100;i++){s.time+=.05;stepCombat(s,.05);}
    expect(enemy.hp).toBeLessThan(120);
  });
  it('scouts with one unit before committing an army against undiscovered enemies',()=>{
    const s=setup();for(let i=0;i<6;i++)addUnit(s,1,'guard',{x:79+i,z:61});s.time=200;updateVisibility(s);stepAI(s,1);
    expect(units(s,1).filter(u=>u.kind==='guard'&&u.order.type==='move')).toHaveLength(1);
  });
  it('redirects depleted gatherers to visible reachable nodes of the same type and reports exhaustion',()=>{
    const s=setup(),w=units(s,0)[0];const first=s.resources.find(r=>r.kind==='gold')!;w.order={type:'gather',resourceId:first.id};first.remaining=0;
    s.resources.push({id:'replacement',kind:'gold',remaining:20,x:30,z:148});updateVisibility(s);stepEconomy(s,.05);
    expect(w.order).toEqual({type:'gather',resourceId:'replacement'});expect(s.events.some(e=>e.type==='resource-depleted'&&e.team===0)).toBe(true);
    s.resources.find(r=>r.id==='replacement')!.remaining=0;stepEconomy(s,.05);expect(w.order.type).toBe('idle');expect(s.events.some(e=>e.type==='gather-idle'&&e.entityId===w.id)).toBe(true);
  });
  it('does not accept a resource id outside player visibility',()=>{const s=setup(),w=units(s,0)[0];expect(issueCommand(s,0,{type:'gather',unitIds:[w.id],resourceId:'pass-gold-east'}).ok).toBe(false);expect(w.order.type).toBe('idle');});
  it('rejects unreachable group movement atomically and reports a later blocked route once',()=>{
    const s=setup(),u=units(s,0)[0];for(let z=0;z<s.map.height;z++)s.map.blocked[z*s.map.width+40]=1;
    expect(issueCommand(s,0,{type:'move',unitIds:[u.id],position:{x:60,z:40}}).ok).toBe(false);expect(u.order.type).toBe('idle');
    s.map.blocked.fill(0);expect(issueCommand(s,0,{type:'move',unitIds:[u.id],position:{x:60,z:40}}).ok).toBe(true);
    for(let z=0;z<s.map.height;z++)s.map.blocked[z*s.map.width+40]=1;s.navigationRevision++;stepCombat(s,.05);
    expect(u.order.type).toBe('idle');expect(s.events.filter(e=>e.type==='path-blocked'&&e.entityId===u.id)).toHaveLength(1);
    stepCombat(s,.05);expect(s.events.filter(e=>e.type==='path-blocked'&&e.entityId===u.id)).toHaveLength(1);
  });
  it('leashes after losing a target inside the radius and heals only after returning',()=>{
    const s=setup(),n=addUnit(s,-1,'neutral-raider',{x:43,z:30});n.home={x:40,z:30};n.hp=40;
    const enemy=addUnit(s,0,'guard',{x:44,z:30});n.order={type:'attack',targetId:enemy.id};enemy.alive=false;
    stepCombat(s,.05);expect(n.returning).toBe(true);const passer=addUnit(s,1,'guard',{x:42,z:30});const hp=passer.hp;
    for(let i=0;i<15;i++)stepCombat(s,.05);expect(passer.hp).toBe(hp);passer.alive=false;
    for(let i=0;i<180;i++)stepCombat(s,.05);expect(n.hp).toBe(140);
  });
  it('assigns one camp reward to the chronological final lethal hit, not entity array order',()=>{
    const s=setup(),a=addUnit(s,-1,'neutral-raider',{x:43,z:30}),b=addUnit(s,-1,'neutral-raider',{x:45,z:30});a.campId=b.campId=0;a.hp=b.hp=1;
    s.projectiles=[{id:100,sourceId:0,team:0,targetId:a.id,x:a.x,z:a.z,damage:20,speed:10,kind:'bolt'},{id:101,sourceId:0,team:1,targetId:b.id,x:b.x,z:b.z,damage:20,speed:10,kind:'bolt'}];
    stepCombat(s,.05);expect(s.teams[0].gold).toBe(500);expect(s.teams[1].gold).toBe(570);expect(s.rewardedCamps).toEqual([0]);
  });
  it('does not transfer an already lethal hit to a later overkill projectile',()=>{
    const s=setup(),a=addUnit(s,-1,'neutral-raider',{x:43,z:30});a.hp=1;
    s.projectiles=[{id:100,sourceId:0,team:0,targetId:a.id,x:a.x,z:a.z,damage:20,speed:10,kind:'bolt'},{id:101,sourceId:0,team:1,targetId:a.id,x:a.x,z:a.z,damage:20,speed:10,kind:'bolt'}];
    stepCombat(s,.05);expect(a.lastAttacker).toBe(0);expect(s.teams[0].stats.kills).toBe(1);expect(s.teams[1].stats.kills).toBe(0);
  });
  it('assigns a worker to repair a damaged completed AI building',()=>{const s=setup(),h=buildings(s,1)[0];h.hp=800;s.ai[1].nextThink=0;stepAI(s,1);expect(units(s,1).some(w=>w.order.type==='repair'&&w.order.targetId===h.id)).toBe(true);});
});
