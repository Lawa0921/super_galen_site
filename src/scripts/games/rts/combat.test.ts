import {describe,it,expect} from 'vitest';
import {UNITS} from './catalog';
import {createState,addUnit,addBuilding,buildings,units,distance,distanceToEntity} from './state';
import {stepCombat,resolveVictory} from './combat';
import {heroCommand} from './hero';
import {updateVisibility} from './visibility';
import {createGame,stepGame} from './simulation';
import {issueCommand} from './commands';
import type {RtsMap} from './maps';
const flat=():RtsMap=>({id:'river',name:'Test',width:96,height:96,blocked:new Uint8Array(9216),noBuild:new Uint8Array(9216),spawns:[{x:15,z:48},{x:80,z:48}],resources:[],camps:[]});
const guardContact=UNITS.guard.radius+UNITS.guard.range-.01;
const workerContact=UNITS.worker.radius+UNITS.guard.range-.01;
const setup=()=>{const s=createState(flat(),1);s.aiEnabled=[false,false];return s;};
describe('combat, hero and game resolution',()=>{
  it.each(['attack','move'] as const)('prioritizes a priest explicit %s over automatic healing',order=>{
    const s=setup(),priest=addUnit(s,0,'priest',{x:40,z:40}),ally=addUnit(s,0,'guard',{x:39,z:40}),enemy=addUnit(s,1,'worker',{x:44,z:40});
    ally.hp=10;ally.cooldown=enemy.cooldown=99;updateVisibility(s);
    const command=order==='attack'?{type:'attack' as const,unitIds:[priest.id],targetId:enemy.id}:{type:'move' as const,unitIds:[priest.id],position:{x:40,z:35}};
    expect(issueCommand(s,0,command).ok).toBe(true);stepCombat(s,.05);
    expect(ally.hp).toBe(10);expect(priest.mana).toBe(UNITS.priest.mana);
    if(order==='attack'){expect(enemy.hp).toBeLessThan(enemy.maxHp);expect(priest.attackCue?.targetId).toBe(enemy.id);}
    else expect(priest.z).toBeLessThan(40);
  });
  it.each(['idle','hold','attack-move'] as const)('retains priest automatic healing during %s',order=>{
    const s=setup(),priest=addUnit(s,0,'priest',{x:40,z:40}),ally=addUnit(s,0,'guard',{x:39,z:40});ally.hp=10;
    priest.order=order==='attack-move'?{type:'move',position:{x:40,z:35},attackMove:true}:{type:order};updateVisibility(s);stepCombat(s,.05);
    expect(ally.hp).toBe(45);expect(priest.animation).toBe('cast');
  });
  it.each(['idle','hold','attack-move'] as const)('acquires a visible enemy inside siege range during %s',order=>{
    const s=setup(),siege=addUnit(s,0,'siege',{x:40,z:40}),enemy=addUnit(s,1,'worker',{x:51.5,z:40});enemy.cooldown=99;
    siege.order=order==='attack-move'?{type:'move',position:{x:30,z:40},attackMove:true}:{type:order};updateVisibility(s);stepCombat(s,.05);
    expect(siege.attackCue?.targetId).toBe(enemy.id);expect(s.projectiles).toHaveLength(0);expect(siege.x).toBe(40);
    s.time=.5;stepCombat(s,.05);expect(s.projectiles.some(p=>p.sourceId===siege.id&&p.targetId===enemy.id)).toBe(true);
  });
  it.each([{kind:'crossbow' as const,release:16/24},{kind:'siege' as const,release:.5}])('releases one $kind projectile at its authored release, before damage',({kind,release})=>{
    const s=setup(),shooter=addUnit(s,0,kind,{x:40,z:40}),target=addUnit(s,1,'guard',{x:47,z:40});target.cooldown=99;target.order={type:'hold'};shooter.order={type:'attack',targetId:target.id};updateVisibility(s);
    s.time=.05;stepCombat(s,.05);expect(s.projectiles).toHaveLength(0);expect(target.hp).toBe(target.maxHp);
    s.time=.05+release-.001;stepCombat(s,.05);expect(s.projectiles).toHaveLength(0);
    s.time=.05+release;stepCombat(s,.05);expect(s.projectiles).toHaveLength(1);expect(s.projectiles[0]).toMatchObject({sourceId:shooter.id,targetId:target.id,kind:kind==='siege'?'shell':'bolt'});expect(target.hp).toBe(target.maxHp);
    const id=s.projectiles[0].id;s.time+=.05;stepCombat(s,.05);expect(s.projectiles.map(p=>p.id)).toEqual([id]);expect(s.projectiles[0].x).toBeGreaterThan(shooter.x);
    for(let i=0;i<12;i++){s.time+=.05;stepCombat(s,.05);}expect(s.projectiles).toHaveLength(0);expect(target.hp).toBeLessThan(target.maxHp);
  });
  it.each(['death','range','order'] as const)('cancels a ranged windup after target %s changes',reason=>{
    const s=setup(),shooter=addUnit(s,0,'crossbow',{x:40,z:40}),target=addUnit(s,1,'guard',{x:47,z:40});target.cooldown=99;target.order={type:'hold'};shooter.order={type:'attack',targetId:target.id};updateVisibility(s);stepCombat(s,.05);expect(shooter.attackCue).toBeDefined();expect(s.projectiles).toHaveLength(0);
    if(reason==='death')target.hp=0;else if(reason==='range')target.x=70;else expect(issueCommand(s,0,{type:'move',unitIds:[shooter.id],position:{x:35,z:40}}).ok).toBe(true);
    s.time=.6;stepCombat(s,.05);expect(s.projectiles).toHaveLength(0);expect(shooter.attackCue).toBeUndefined();
  });
  it.each(['crossbow','siege'] as const)('freezes %s windup on pause and cancels it on shooter death',kind=>{
    const s=setup(),shooter=addUnit(s,0,kind,{x:40,z:40}),target=addUnit(s,1,'guard',{x:47,z:40});target.cooldown=99;target.order={type:'hold'};shooter.order={type:'attack',targetId:target.id};stepGame(s);const started=shooter.attackCue!.startedAt;
    s.paused=true;for(let i=0;i<30;i++)stepGame(s);expect(s.time).toBe(started);expect(s.projectiles).toHaveLength(0);expect(shooter.attackCue!.startedAt).toBe(started);
    s.paused=false;shooter.hp=0;for(let i=0;i<20;i++)stepGame(s);expect(shooter.alive).toBe(false);expect(shooter.attackCue).toBeUndefined();expect(s.projectiles).toHaveLength(0);
  });
  it('does not acquire hidden targets or chase beyond siege hold range',()=>{
    const s=setup(),siege=addUnit(s,0,'siege',{x:40,z:40}),enemy=addUnit(s,1,'worker',{x:51.5,z:40});enemy.cooldown=99;
    updateVisibility(s);s.visibility[0].visible.fill(0);stepCombat(s,.05);expect(s.projectiles).toHaveLength(0);
    siege.order={type:'hold'};enemy.x=53;updateVisibility(s);stepCombat(s,.05);
    expect(s.projectiles).toHaveLength(0);expect(siege.x).toBe(40);
  });
  it.each(['worker','house'] as const)('walks into short melee reach of a %s without overlapping its footprint',kind=>{
    const s=setup(),a=addUnit(s,0,'guard',{x:40,z:40});
    const b=kind==='worker'?addUnit(s,1,kind,{x:45,z:40}):addBuilding(s,1,kind,{x:45,z:40},true);
    if(b.category==='unit'){b.order={type:'hold'};b.cooldown=99;}
    a.order={type:'attack',targetId:b.id};
    for(let tick=0;tick<120;tick++){
      stepGame(s);
      expect(distanceToEntity(a,b)).toBeGreaterThanOrEqual(UNITS.guard.radius-1e-8);
    }
    expect(b.hp).toBeLessThan(b.maxHp);
  });
  it('lets a group close to melee contact while keeping every pair of feet separate',()=>{
    const s=setup(),target=addUnit(s,1,'guard',{x:45,z:40});target.order={type:'hold'};target.cooldown=99;
    const attackers=[-1.5,-.5,.5,1.5].map(z=>addUnit(s,0,'guard',{x:42,z:40+z}));
    for(const u of attackers)u.order={type:'attack',targetId:target.id};
    for(let tick=0;tick<120;tick++){
      stepGame(s);
      const group=[target,...attackers];
      for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++)
        expect(distance(group[i],group[j])).toBeGreaterThanOrEqual(2*UNITS.guard.radius-1e-8);
    }
    for(const u of attackers)expect(u.attackContactSequence).toBeGreaterThanOrEqual(1);
  });
  it('issues a cue at windup, applies guard damage at authored contact, and keeps the recovery cue',()=>{
    const s=setup(),a=addUnit(s,0,'guard',{x:40,z:40}),b=addUnit(s,1,'guard',{x:40+guardContact,z:40});
    b.cooldown=99;updateVisibility(s);s.time=.05;stepCombat(s,.05);
    expect(a.attackCue).toEqual({sequence:1,startedAt:.05,targetId:b.id});expect(b.hp).toBe(b.maxHp);
    const first=structuredClone(a.attackCue);
    for(let tick=2;tick<=11;tick++){s.time=tick*.05;stepCombat(s,.05);expect(a.attackCue).toEqual(first);expect(b.hp).toBe(b.maxHp);}
    s.time=.6;stepCombat(s,.05);expect(b.hp).toBeLessThan(b.maxHp);expect(a.attackCue).toEqual(first);
    a.cooldown=0;s.time=1.25;stepCombat(s,.05);
    expect(a.attackCue).toEqual({sequence:2,startedAt:1.25,targetId:b.id});expect(Object.keys(a.attackCue!).sort()).toEqual(['sequence','startedAt','targetId']);
  });
  it('never transfers a guard windup to an automatically acquired or explicitly ordered target',()=>{
    const s=setup(),a=addUnit(s,0,'guard',{x:40,z:40}),first=addUnit(s,1,'worker',{x:40+workerContact,z:40}),next=addUnit(s,1,'worker',{x:40-workerContact,z:40}),explicit=addUnit(s,1,'worker',{x:52,z:40});first.cooldown=next.cooldown=explicit.cooldown=99;
    updateVisibility(s);stepCombat(s,.05);expect(a.attackCue?.targetId).toBe(first.id);expect(first.hp).toBe(first.maxHp);expect(next.hp).toBe(next.maxHp);
    first.hp=0;s.time=.1;stepCombat(s,.05);expect(a.attackCue).toBeUndefined();expect(next.hp).toBe(next.maxHp);
    for(let i=0;i<22;i++){s.time+=.05;stepCombat(s,.05);expect(next.hp).toBe(next.maxHp);}
    s.time+=.05;stepCombat(s,.05);expect(a.attackCue).toMatchObject({sequence:2,targetId:next.id});expect(next.hp).toBe(next.maxHp);
    explicit.x=40+workerContact;explicit.z=40;a.cooldown=1.2;expect(issueCommand(s,0,{type:'attack',unitIds:[a.id],targetId:first.id}).ok).toBe(false);
    expect(issueCommand(s,0,{type:'attack',unitIds:[a.id],targetId:explicit.id}).ok).toBe(true);expect(a.attackCue).toBeUndefined();
    a.cooldown=0;s.time+=.05;stepCombat(s,.05);expect(explicit.hp).toBe(explicit.maxHp);expect(a.attackCue).toMatchObject({sequence:3,targetId:explicit.id});
  });
  it('freezes both attack windup time and target health while the simulation is paused',()=>{
    const s=setup(),a=addUnit(s,0,'guard',{x:40,z:40}),b=addUnit(s,1,'guard',{x:40+guardContact,z:40});b.cooldown=99;
    a.order={type:'attack',targetId:b.id};stepGame(s);expect(a.attackCue).toBeDefined();expect(b.hp).toBe(b.maxHp);
    const startedAt=a.attackCue!.startedAt;s.paused=true;for(let i=0;i<30;i++)stepGame(s);
    expect(s.time).toBe(startedAt);expect(a.attackCue?.startedAt).toBe(startedAt);expect(b.hp).toBe(b.maxHp);
    s.paused=false;for(let i=0;i<11;i++)stepGame(s);expect(b.hp).toBeLessThan(b.maxHp);
  });
  it('cancels an uncontacted windup if the target dies or leaves melee reach',()=>{
    const dead=setup(),a=addUnit(dead,0,'guard',{x:40,z:40}),b=addUnit(dead,1,'guard',{x:40+guardContact,z:40});b.cooldown=99;
    a.order={type:'attack',targetId:b.id};updateVisibility(dead);stepCombat(dead,.05);expect(a.attackCue).toBeDefined();b.hp=0;dead.time=.1;stepCombat(dead,.05);
    expect(a.attackCue).toBeUndefined();expect(b.hp).toBe(0);
    const out=setup(),c=addUnit(out,0,'guard',{x:40,z:40}),target=addUnit(out,1,'guard',{x:40+guardContact,z:40});target.cooldown=99;
    c.order={type:'attack',targetId:target.id};updateVisibility(out);stepCombat(out,.05);expect(c.attackCue).toBeDefined();target.x=42.1;out.time=.1;stepCombat(out,.05);
    expect(c.attackCue).toBeUndefined();expect(target.hp).toBe(target.maxHp);
  });
  it('cancels a displayed swing on a successful move and never reuses its sequence',()=>{
    const s=setup(),a=addUnit(s,0,'guard',{x:40,z:40});addUnit(s,1,'guard',{x:40+guardContact,z:40});
    updateVisibility(s);stepCombat(s,.05);expect(a.attackCue?.sequence).toBe(1);
    expect(issueCommand(s,0,{type:'move',unitIds:[a.id],position:{x:35,z:40}}).ok).toBe(true);
    expect(a.attackCue).toBeUndefined();expect(a.animation).toBe('idle');
    expect(issueCommand(s,0,{type:'hold',unitIds:[a.id]}).ok).toBe(true);
    stepCombat(s,.05);expect(a.attackCue).toBeUndefined();expect(a.animation).toBe('idle');
    a.cooldown=0;stepCombat(s,.05);expect(a.attackCue?.sequence).toBe(2);
  });
  it('removes the previous attack cue on death',()=>{
    const s=setup(),a=addUnit(s,0,'guard',{x:40,z:40});addUnit(s,1,'guard',{x:40+guardContact,z:40});
    updateVisibility(s);stepCombat(s,.05);expect(a.attackCue).toBeDefined();
    a.hp=0;stepCombat(s,.05);expect(a.animation).toBe('death');expect(a.attackCue).toBeUndefined();
  });
  it.each(['dead','hidden','blocked'])('ends the displayed swing when its target becomes %s',reason=>{
    const s=setup(),a=addUnit(s,0,'guard',{x:40,z:40}),b=addUnit(s,1,'guard',{x:40+guardContact,z:40});
    a.order={type:'attack',targetId:b.id};updateVisibility(s);stepCombat(s,.05);
    expect(a.attackCue).toBeDefined();
    if(reason==='dead')b.hp=0;
    if(reason==='hidden'){b.x=80;b.z=80;updateVisibility(s);}
    if(reason==='blocked'){b.x=45;s.map.blocked.fill(1);}
    stepCombat(s,.05);expect(a.attackCue).toBeUndefined();expect(a.animation).toBe('idle');
  });
  it.each(['priest','commander'] as const)('keeps %s casting after an earlier attack while an enemy is nearby',kind=>{
    const s=setup(),caster=addUnit(s,0,kind,{x:40,z:40}),ally=addUnit(s,0,'guard',{x:39,z:40});
    addUnit(s,1,'guard',{x:40+guardContact,z:40});updateVisibility(s);stepCombat(s,.05);expect(caster.attackCue).toBeDefined();
    caster.hp=caster.maxHp;ally.hp=10;
    if(kind==='priest'){caster.cooldown=0;stepCombat(s,.05);}
    else{expect(heroCommand(s,0,{type:'learn',heroId:caster.id,skill:'mend'}).ok).toBe(true);expect(heroCommand(s,0,{type:'cast',heroId:caster.id,skill:'mend',targetId:ally.id}).ok).toBe(true);}
    expect(caster.animation).toBe('cast');expect(caster.attackCue).toBeUndefined();
    for(let i=0;i<5;i++)stepCombat(s,.05);expect(caster.animation).toBe('cast');expect(caster.attackCue).toBeUndefined();
  });
  it('retains an attack-move target while routing briefly beyond acquisition range',()=>{
    const s=createGame('pass',1);s.aiEnabled=[false,false];
    // Offsets from the west spawn (24,144) are those of the original fixture at (14,48).
    const guard=addUnit(s,1,'guard',{x:37.270136723221377,z:150.5});
    const worker=units(s,0).find(u=>u.x===27&&u.z===149.5)!;
    updateVisibility(s);expect(issueCommand(s,1,{type:'move',unitIds:[guard.id],position:{x:33,z:151},attackMove:true}).ok).toBe(true);
    for(let i=0;i<200;i++)stepGame(s);
    expect(worker.hp).toBeLessThan(120);
  });
  it('resumes its attack-move destination after the acquired enemy leaves vision',()=>{
    const s=setup(),guard=addUnit(s,0,'guard',{x:40,z:40}),enemy=addUnit(s,1,'worker',{x:49,z:40});
    guard.order={type:'move',position:{x:30,z:40},attackMove:true};updateVisibility(s);stepCombat(s,.05);
    enemy.x=80;enemy.z=80;updateVisibility(s);
    for(let i=0;i<80;i++)stepCombat(s,.05);
    expect(guard.x).toBeLessThan(35);expect(enemy.hp).toBe(120);
  });
  it('resolves simultaneous lethal melee attacks fairly at contact',()=>{const s=setup();const a=addUnit(s,0,'guard',{x:46,z:48}),b=addUnit(s,1,'guard',{x:46+guardContact,z:48});a.hp=b.hp=1;updateVisibility(s);stepCombat(s,.05);for(let tick=1;tick<=11;tick++){s.time=tick*.05;stepCombat(s,.05);}expect(a.alive).toBe(false);expect(b.alive).toBe(false);});
  it('fires ranged projectiles and deals building siege damage at impact',()=>{const s=setup(),u=addUnit(s,0,'siege',{x:40,z:40}),b=addBuilding(s,1,'house',{x:50,z:40},true);u.order={type:'attack',targetId:b.id};updateVisibility(s);stepCombat(s,.05);expect(s.projectiles).toHaveLength(0);s.time=.5;stepCombat(s,.05);expect(s.projectiles).toHaveLength(1);expect(b.hp).toBe(500);
    // 140.4 siege damage before the building's three armor points (18% divisor).
    for(let i=0;i<20;i++){s.time+=.05;stepCombat(s,.05);}expect(b.hp).toBeCloseTo(381.01695,4);
  });
  it('awards a cleared neutral camp only once and levels a nearby killing-team hero',()=>{const s=setup(),h=addUnit(s,0,'commander',{x:44,z:40});
    for(let i=0;i<3;i++){const n=addUnit(s,-1,'neutral-raider',{x:45,z:40+i*.2});n.campId=0;n.home={x:n.x,z:n.z};n.hp=1;}
    const before=s.teams[0].gold;h.order={type:'hold'};updateVisibility(s);
    for(let i=0;i<100;i++){s.time+=.05;stepCombat(s,.05);}expect(s.teams[0].gold).toBe(before+70);expect(s.teams[0].hero.xp).toBe(105);expect(s.teams[0].hero.level).toBe(2);expect(s.teams[0].hero.points).toBe(2);
    stepCombat(s,1);expect(s.teams[0].gold).toBe(before+70);
  });
  it('validates level, points, mana, range and cooldown before mutating skills',()=>{const s=setup(),h=addUnit(s,0,'commander',{x:40,z:40}),ally=addUnit(s,0,'guard',{x:42,z:40});ally.hp=10;
    expect(heroCommand(s,0,{type:'learn',heroId:h.id,skill:'banner'}).ok).toBe(false);
    expect(heroCommand(s,0,{type:'learn',heroId:h.id,skill:'mend'}).ok).toBe(true);expect(s.teams[0].hero.points).toBe(0);
    expect(heroCommand(s,0,{type:'cast',heroId:h.id,skill:'mend',targetId:ally.id}).ok).toBe(true);expect(ally.hp).toBeGreaterThan(10);expect(h.mana).toBe(150);
    const hp=ally.hp;expect(heroCommand(s,0,{type:'cast',heroId:h.id,skill:'mend',targetId:ally.id}).ok).toBe(false);expect(ally.hp).toBe(hp);expect(h.mana).toBe(150);
    h.skillCooldowns.mend=0;ally.x=80;expect(heroCommand(s,0,{type:'cast',heroId:h.id,skill:'mend',targetId:ally.id}).ok).toBe(false);expect(h.mana).toBe(150);
  });
  it('returns a draw for mutual destruction or 30 minutes, and a winner for one surviving base',()=>{const a=setup();buildings(a).forEach(b=>{b.hp=0;});stepCombat(a,.05);resolveVictory(a);expect(a.status).toBe('draw');expect(a.endReason).toBe('mutual-destruction');
    const b=setup();buildings(b,1)[0].hp=0;stepCombat(b,.05);resolveVictory(b);expect(b.winner).toBe(0);
    const c=setup();c.time=1800;resolveVictory(c);expect(c.status).toBe('draw');expect(c.endReason).toBe('time-limit');
  });
  it('leashes neutral units, heals them at home, and never respawns dead guards',()=>{const s=setup(),n=addUnit(s,-1,'neutral-raider',{x:70,z:30});n.home={x:45,z:30};n.campId=0;n.hp=50;
    for(let i=0;i<400;i++){s.time+=.05;stepCombat(s,.05);}expect(Math.hypot(n.x-45,n.z-30)).toBeLessThan(1);expect(n.hp).toBe(140);
    n.hp=0;stepCombat(s,.05);for(let i=0;i<10;i++)stepCombat(s,1);expect(units(s,-1)).toHaveLength(0);
  });
});
