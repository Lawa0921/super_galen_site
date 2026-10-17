import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {UNITS,BUILDINGS,SKILLS,DAMAGE_MATRIX,MAGE_SPELL,SLOW_FACTOR,unlocked,isHero,heroSkills,type PlayableUnit,type UnitKind} from './catalog';
import {createState,addUnit,addBuilding,units,distance,heroProgress} from './state';
import {stepCombat,canAttack} from './combat';
import {heroCommand} from './hero';
import {updateVisibility,getTeamView} from './visibility';
import {createGame} from './simulation';
import {issueCommand} from './commands';
import {moveToward} from './movement';
import {stepEconomy} from './economy';
import {REQUIRED_MODELS} from './models';
import type {RtsMap} from './maps';
import type {GameState,Building} from './types';

/** Flat test field with a solid north-south wall at x = 48..49 (z 10..86). */
const walled=():RtsMap=>{const blocked=new Uint8Array(9216);for(let z=10;z<86;z++)for(const x of [48,49])blocked[z*96+x]=1;
  return {id:'river',name:'Test',width:96,height:96,blocked,noBuild:new Uint8Array(9216),spawns:[{x:15,z:48},{x:80,z:48}],resources:[],camps:[]};};
const setup=(preview=true)=>{const s=createState(walled(),1);s.aiEnabled=[false,false];s.rosterPreview=preview;return s;};
const NEW_UNITS:PlayableUnit[]=['pikeman','ranger','mage','gryphon','sage','ranger-captain'];
const SHIPPED:PlayableUnit[]=['worker','guard','crossbow','priest','knight','siege','commander'];
const armorFactor=(kind:UnitKind)=>1+UNITS[kind].armor*.06;
const hall=(s:GameState,t:0|1)=>s.entities.find((e):e is Building=>e.category==='building'&&e.team===t&&e.kind==='townhall')!;

describe('roster gate (preview units stay out of the shipped game)',()=>{
  it('flags exactly the new roster as preview and keeps the flag in step with model publication',()=>{
    const flagged=(Object.keys(UNITS) as UnitKind[]).filter(k=>UNITS[k].preview);
    expect(flagged.sort()).toEqual([...NEW_UNITS].sort());
    for(const kind of Object.keys(UNITS) as UnitKind[])expect(REQUIRED_MODELS.includes(kind),kind).toBe(!UNITS[kind].preview);
    for(const kind of Object.keys(BUILDINGS) as Array<keyof typeof BUILDINGS>)expect(REQUIRED_MODELS.includes(kind),kind).toBe(!BUILDINGS[kind].preview);
    expect(SHIPPED.every(k=>unlocked(UNITS[k],false))).toBe(true);
    expect(NEW_UNITS.some(k=>unlocked(UNITS[k],false))).toBe(false);
    expect(NEW_UNITS.every(k=>unlocked(UNITS[k],true))).toBe(true);
  });
  // A production model may be published for style review while the user has not approved it yet;
  // such a unit must keep its preview flag (and stay out of REQUIRED_MODELS) until approval.
  const ROOT=path.resolve(__dirname,'../../../..');
  const registry=JSON.parse(readFileSync(path.join(ROOT,'public/assets/games/rts/model-registry.json'),'utf8'));
  it('keeps every model that awaits user style approval behind the preview gate',()=>{
    for(const kind of Object.keys(UNITS) as UnitKind[]){
      const entry=registry.assets[kind];if(!entry)continue;
      const pending=entry.user_style_approval==='pending';
      if(pending){expect(UNITS[kind].preview,kind).toBe(true);expect(REQUIRED_MODELS.includes(kind),kind).toBe(false);}
      if(UNITS[kind].preview)expect(entry.user_style_approval,kind).toBe('pending');
    }
  });
  it.each(['pikeman','ranger','mage'])('publishes the %s production model for style review without shipping it',kind=>{
    const entry=registry.assets[kind];
    expect(entry).toMatchObject({status:'published',url:`/assets/games/rts/models/${kind}.glb`,lod1:`/assets/games/rts/models/${kind}-lod1.glb`,user_style_approval:'pending'});
    for(const [url,sha] of [[entry.url,entry.sha256],[entry.lod1,entry.lod1Sha256]]){
      const file=path.join(ROOT,'public',url);expect(existsSync(file),url).toBe(true);
      expect(createHash('sha256').update(readFileSync(file)).digest('hex'),url).toBe(sha);
    }
    expect(UNITS[kind as UnitKind].preview).toBe(true);expect(unlocked(UNITS[kind as UnitKind],false)).toBe(false);
  });
  it('ships the mage area-blast clip under the name the runtime plays for the blast cue',()=>{
    // models.ts plays 'cast'+cue.kind for non-heal casts; combat.ts emits kind 'blast' for 曦光術.
    const b=readFileSync(path.join(ROOT,'public',registry.assets.mage.url));
    const doc=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
    const names=doc.animations.map((a:{name:string})=>a.name.toLowerCase());
    expect(names).toContain('castblast');
    for(const clip of ['idle','walk','attack','hurt','death'])expect(names).toContain(clip);
  });
  it('registers the ranger arrow projectile for style review only',()=>{
    const entry=registry.assets.arrow;
    expect(entry).toMatchObject({status:'published',url:'/assets/games/rts/models/arrow.glb',user_style_approval:'pending'});
    expect(createHash('sha256').update(readFileSync(path.join(ROOT,'public',entry.url))).digest('hex')).toBe(entry.sha256);
    expect(REQUIRED_MODELS.includes('arrow')).toBe(false);
  });
  it('defaults matches to the shipped roster and rejects preview training unless enabled',()=>{
    const off=createGame('river',1);expect(off.rosterPreview).toBeFalsy();expect(getTeamView(off,0).rosterPreview).toBe(false);
    const on=createGame('river',1,'normal',{rosterPreview:true});expect(on.rosterPreview).toBe(true);expect(getTeamView(on,0).rosterPreview).toBe(true);
    for(const s of [off,on]){s.aiEnabled=[false,false];s.teams[0].gold=s.teams[0].wood=5000;
      const barracks=addBuilding(s,0,'barracks',{x:22,z:36},true);addBuilding(s,0,'house',{x:26,z:60},true);
      const result=issueCommand(s,0,{type:'train',buildingId:barracks.id,unit:'pikeman'});
      expect(result.ok).toBe(s===on);if(!result.ok)expect(result.reason).toBe('尚未開放');
      expect(issueCommand(s,0,{type:'train',buildingId:barracks.id,unit:'guard'}).ok).toBe(true);
    }
  });
  it('places the new units in the existing building and tier structure',()=>{
    expect(UNITS.pikeman).toMatchObject({trainedAt:'barracks',requires:{tier:1}});
    expect(UNITS.ranger).toMatchObject({trainedAt:'barracks',requires:{tier:2,buildings:['lumbermill']}});
    expect(UNITS.mage).toMatchObject({trainedAt:'chapel',requires:{tier:2,buildings:['lumbermill']}});
    expect(UNITS.gryphon).toMatchObject({trainedAt:'stable',requires:{tier:3,buildings:['lumbermill']},flying:true});
    expect(UNITS.sage.trainedAt).toBe('altar');expect(UNITS['ranger-captain'].trainedAt).toBe('altar');
    expect(Object.keys(BUILDINGS)).toHaveLength(10);
    // New bodies must not widen the clearance every placement and path check uses.
    expect(Math.max(...Object.values(UNITS).map(d=>d.radius))).toBe(UNITS.siege.radius);
  });
});

describe('air layer',()=>{
  it('flies straight over blocked terrain but stays inside the map',()=>{
    const s=setup(),g=addUnit(s,0,'gryphon',{x:40,z:48});updateVisibility(s);
    expect(issueCommand(s,0,{type:'move',unitIds:[g.id],position:{x:58,z:48}}).ok).toBe(true);
    let crossed=false;for(let i=0;i<100&&g.order.type==='move';i++){stepCombat(s,.05);s.time+=.05;if(s.map.blocked[Math.floor(g.z)*96+Math.floor(g.x)])crossed=true;}
    expect(crossed).toBe(true);expect(distance(g,{x:58,z:48})).toBeLessThan(.5);
    // 18 m straight at 4.8 m/s: no detour around the 76 m wall.
    expect(s.time).toBeLessThan(18/UNITS.gryphon.speed+.5);
    expect(issueCommand(s,0,{type:'move',unitIds:[g.id],position:{x:120,z:48}}).ok).toBe(false);
    const knight=addUnit(s,0,'knight',{x:40,z:20});expect(issueCommand(s,0,{type:'move',unitIds:[knight.id],position:{x:48.5,z:30}}).ok).toBe(false);
    expect(issueCommand(s,0,{type:'move',unitIds:[g.id],position:{x:48.5,z:30}}).ok).toBe(true);
  });
  it('is not body-blocked by ground units and does not block them',()=>{
    const s=setup(),g=addUnit(s,0,'gryphon',{x:30,z:30});
    for(let i=-3;i<=3;i++)addUnit(s,0,'guard',{x:33,z:30+i*.95});
    updateVisibility(s);for(let i=0;i<40;i++){moveToward(s,g,{x:36,z:30},.05,.15);}
    expect(g.x).toBeGreaterThan(35.5);expect(Math.abs(g.z-30)).toBeLessThan(.01);
    const parked=addUnit(s,0,'gryphon',{x:20,z:60}),walker=addUnit(s,0,'guard',{x:17,z:60});
    for(let i=0;i<40;i++)moveToward(s,walker,{x:23,z:60},.05,.15);
    expect(walker.x).toBeGreaterThan(22.5);expect(parked.x).toBe(20);
  });
  it('can only be attacked by units and towers that target air',()=>{
    const s=setup(),g=addUnit(s,1,'gryphon',{x:30,z:30});g.cooldown=99;g.order={type:'hold'};
    const guard=addUnit(s,0,'guard',{x:30.9,z:30}),knight=addUnit(s,0,'knight',{x:29,z:30}),cross=addUnit(s,0,'crossbow',{x:30,z:24});
    updateVisibility(s);
    for(const kind of ['guard','knight','siege','priest','worker','commander','pikeman','neutral-raider'] as const)expect(canAttack(kind,g),kind).toBe(false);
    for(const kind of ['crossbow','ranger','mage','gryphon','sage','ranger-captain','tower'] as const)expect(canAttack(kind,g),kind).toBe(true);
    expect(issueCommand(s,0,{type:'attack',unitIds:[guard.id,knight.id],targetId:g.id})).toEqual({ok:false,reason:'無法攻擊空中單位'});
    expect(issueCommand(s,0,{type:'attack',unitIds:[guard.id,cross.id],targetId:g.id}).ok).toBe(true);
    expect(cross.order).toEqual({type:'attack',targetId:g.id});expect(guard.order.type).toBe('idle');
    for(let i=0;i<20;i++){stepCombat(s,.05);s.time+=.05;}
    expect(guard.attackCue).toBeUndefined();expect(knight.attackCue).toBeUndefined();expect(cross.attackCue?.targetId).toBe(g.id);
    const tower=addBuilding(s,0,'tower',{x:36,z:30},true);updateVisibility(s);
    for(let i=0;i<5;i++){stepCombat(s,.05);s.time+=.05;}
    expect(s.projectiles.some(p=>p.sourceId===tower.id&&p.targetId===g.id)).toBe(true);
  });
  it('excludes flyers from melee hero cleave but not from area spells',()=>{
    const s=setup(),hero=addUnit(s,0,'commander',{x:30,z:30}),g=addUnit(s,1,'gryphon',{x:31.5,z:30}),foot=addUnit(s,1,'guard',{x:31.5,z:30.8});
    heroProgress(s.teams[0],'commander').skills.cleave=1;updateVisibility(s);
    expect(heroCommand(s,0,{type:'cast',heroId:hero.id,skill:'cleave',position:{x:31.5,z:30}}).ok).toBe(true);
    expect(g.hp).toBe(g.maxHp);expect(foot.hp).toBeLessThan(foot.maxHp);
    const sage=addUnit(s,0,'sage',{x:26,z:30});heroProgress(s.teams[0],'sage').skills.sunburst=1;updateVisibility(s);
    expect(heroCommand(s,0,{type:'cast',heroId:sage.id,skill:'sunburst',position:{x:31.5,z:30.4}}).ok).toBe(true);
    expect(g.hp).toBeLessThan(g.maxHp);
  });
  it('places foundations under hovering flyers and keeps flyer sight a plain disk',()=>{
    const s=setup(),g=addUnit(s,0,'gryphon',{x:30,z:60}),worker=addUnit(s,0,'worker',{x:24,z:60});s.teams[0].gold=s.teams[0].wood=999;updateVisibility(s);
    expect(issueCommand(s,0,{type:'build',workerId:worker.id,building:'house',position:{x:30,z:60}}).ok).toBe(true);
    const over=addUnit(s,0,'gryphon',{x:48.5,z:40});updateVisibility(s);
    expect(s.visibility[0].visible[40*96+48]).toBe(1);expect(s.visibility[0].visible[40*96+(48+UNITS.gryphon.sight-1)]).toBe(1);void over;void g;
  });
});

describe('damage and armour counters',()=>{
  const hit=(attacker:UnitKind,target:UnitKind)=>{const s=setup(),a=addUnit(s,0,attacker,{x:30,z:30}),t=addUnit(s,1,target,{x:30+UNITS[attacker].radius+UNITS[target].radius+Math.min(UNITS[attacker].range,1)-.05,z:30});
    t.cooldown=99;t.order={type:'hold'};a.order={type:'attack',targetId:t.id};updateVisibility(s);
    for(let i=0;i<60&&t.hp===t.maxHp;i++){stepCombat(s,.05);s.time+=.05;}return t.maxHp-t.hp;};
  it('keeps every original pairing at 1.0 and adds the documented counters',()=>{
    const original:UnitKind[]=['worker','guard','crossbow','priest','knight','siege','commander','neutral-raider'];
    for(const a of original)for(const t of original)expect(DAMAGE_MATRIX[UNITS[a].attackType][UNITS[t].armorType],`${a}->${t}`).toBe(1);
    expect(DAMAGE_MATRIX[UNITS.pikeman.attackType][UNITS.knight.armorType]).toBe(1.75);
    expect(DAMAGE_MATRIX[UNITS.crossbow.attackType][UNITS.gryphon.armorType]).toBe(1.5);
    expect(DAMAGE_MATRIX.magic.light).toBeGreaterThan(1);
  });
  it('applies the matrix to real hits',()=>{
    expect(hit('guard','guard')).toBeCloseTo(20/armorFactor('guard'));
    expect(hit('pikeman','knight')).toBeCloseTo(16*1.75/armorFactor('knight'));
    expect(hit('pikeman','guard')).toBeCloseTo(16/armorFactor('guard'));
    expect(hit('gryphon','guard')).toBeCloseTo(34/armorFactor('guard'));
  });
});

describe('mage area spell',()=>{
  it('autocasts a mana-paid area blast that damages and slows a cluster',()=>{
    const s=setup(),mage=addUnit(s,0,'mage',{x:30,z:30}),a=addUnit(s,1,'guard',{x:35,z:30}),b=addUnit(s,1,'guard',{x:35.9,z:30.5}),far=addUnit(s,1,'guard',{x:35,z:36});
    for(const e of [a,b,far]){e.cooldown=99;e.order={type:'hold'};}updateVisibility(s);stepCombat(s,.05);
    expect(mage.mana).toBe(UNITS.mage.mana-MAGE_SPELL.mana);expect(mage.castCue?.kind).toBe('blast');expect(mage.animation).toBe('cast');
    for(const e of [a,b]){expect(e.maxHp-e.hp).toBeCloseTo(MAGE_SPELL.damage*DAMAGE_MATRIX.magic.heavy/armorFactor('guard'));expect(e.slowUntil).toBeGreaterThan(s.time);}
    expect(far.hp).toBe(far.maxHp);
    // Slowed units walk at the reduced speed.
    a.x=40.5;a.z=20.5;a.order={type:'idle'};moveToward(s,a,{x:45.5,z:20.5},.05,.15);expect(a.x-40.5).toBeCloseTo(UNITS.guard.speed*SLOW_FACTOR*.05,5);
    b.x=40.5;b.z=24.5;b.slowUntil=0;moveToward(s,b,{x:45.5,z:24.5},.05,.15);expect(b.x-40.5).toBeCloseTo(UNITS.guard.speed*.05,5);
  });
});

describe('heroes',()=>{
  const altarState=()=>{const s=setup();s.teams[0].gold=s.teams[0].wood=9000;addBuilding(s,0,'barracks',{x:22,z:36},true);
    const altar=addBuilding(s,0,'altar',{x:30,z:36},true);for(let i=0;i<4;i++)addBuilding(s,0,'house',{x:20+i*5,z:70},true);return {s,altar};};
  it('allows one of each hero, with one hero slot per town hall tier',()=>{
    const {s,altar}=altarState();
    expect(issueCommand(s,0,{type:'train',buildingId:altar.id,unit:'commander'}).ok).toBe(true);
    expect(issueCommand(s,0,{type:'train',buildingId:altar.id,unit:'sage'})).toEqual({ok:false,reason:'英雄數量已達主城階級上限'});
    hall(s,0).tier=2;
    expect(issueCommand(s,0,{type:'train',buildingId:altar.id,unit:'sage'}).ok).toBe(true);
    expect(issueCommand(s,0,{type:'train',buildingId:altar.id,unit:'sage'}).ok).toBe(false);
    expect(issueCommand(s,0,{type:'train',buildingId:altar.id,unit:'ranger-captain'}).ok).toBe(false);
    hall(s,0).tier=3;expect(issueCommand(s,0,{type:'train',buildingId:altar.id,unit:'ranger-captain'}).ok).toBe(true);
    expect(issueCommand(s,0,{type:'train',buildingId:altar.id,unit:'commander'})).toEqual({ok:false,reason:'只能擁有一名統領'});
    expect(HERO_SET.every(isHero)).toBe(true);
  });
  it('keeps per-hero levels, skills and revival',()=>{
    const {s,altar}=altarState();hall(s,0).tier=2;
    const sage=addUnit(s,0,'sage',{x:40,z:40});const p=heroProgress(s.teams[0],'sage');
    expect(p.recruited).toBe(true);expect(heroProgress(s.teams[0],'commander').recruited).toBe(false);
    p.xp=200;p.level=3;p.points=2;sage.alive=false;
    expect(issueCommand(s,0,{type:'train',buildingId:altar.id,unit:'sage'}).ok).toBe(true);
    for(let i=0;i<20*17;i++){stepEconomy(s,.05);s.time+=.05;}
    const revived=units(s,0).find(u=>u.kind==='sage')!;expect(revived.maxHp).toBe(UNITS.sage.hp+2*60);
    expect(s.events.some(e=>e.text==='曦光賢者已復活')).toBe(true);
    expect(heroCommand(s,0,{type:'learn',heroId:revived.id,skill:'cleave'}).ok).toBe(false);
    expect(heroCommand(s,0,{type:'learn',heroId:revived.id,skill:'daybreak'}).ok).toBe(true);
    expect(heroSkills('sage')).toEqual(['sunburst','radiance','daybreak']);
    expect(heroSkills('ranger-captain')).toEqual(['volley','sprint','mark']);
    expect(heroSkills('commander')).toEqual(['cleave','mend','banner']);
  });
  it('resolves the sage and ranger captain skills',()=>{
    const s=setup(),sage=addUnit(s,0,'sage',{x:30,z:30}),cap=addUnit(s,0,'ranger-captain',{x:30,z:33}),ally=addUnit(s,0,'guard',{x:31,z:31});
    const foe=addUnit(s,1,'guard',{x:36,z:30});foe.cooldown=99;foe.order={type:'hold'};ally.hp=100;updateVisibility(s);
    const sp=heroProgress(s.teams[0],'sage'),rp=heroProgress(s.teams[0],'ranger-captain');sp.level=rp.level=3;
    Object.assign(sp.skills,{sunburst:1,radiance:1,daybreak:1});Object.assign(rp.skills,{volley:1,sprint:1,mark:1});
    expect(heroCommand(s,0,{type:'cast',heroId:sage.id,skill:'radiance'}).ok).toBe(true);expect(ally.hp).toBe(100+90);
    expect(heroCommand(s,0,{type:'cast',heroId:cap.id,skill:'mark',targetId:foe.id}).ok).toBe(true);expect(foe.markedUntil).toBeGreaterThan(s.time);
    const before=foe.hp;expect(heroCommand(s,0,{type:'cast',heroId:cap.id,skill:'volley',position:{x:36,z:30}}).ok).toBe(true);
    expect(before-foe.hp).toBeCloseTo(70*1.25/armorFactor('guard'));
    expect(heroCommand(s,0,{type:'cast',heroId:sage.id,skill:'daybreak',position:{x:36,z:30}}).ok).toBe(true);expect(foe.slowUntil).toBeGreaterThan(s.time);
    expect(heroCommand(s,0,{type:'cast',heroId:cap.id,skill:'sprint'}).ok).toBe(true);expect(ally.hasteUntil).toBeGreaterThan(s.time);
    expect(heroCommand(s,0,{type:'cast',heroId:sage.id,skill:'volley',position:{x:36,z:30}})).toEqual({ok:false,reason:'此英雄不會這項技能'});
    expect(SKILLS.daybreak.minLevel).toBe(3);
  });
  it('shares kill XP with every nearby hero',()=>{
    const s=setup(),c=addUnit(s,0,'commander',{x:30,z:30}),sage=addUnit(s,0,'sage',{x:31,z:31}),foe=addUnit(s,1,'worker',{x:30.9,z:30});
    foe.hp=1;foe.cooldown=99;c.order={type:'attack',targetId:foe.id};updateVisibility(s);
    for(let i=0;i<10&&foe.alive;i++){stepCombat(s,.05);s.time+=.05;}
    expect(foe.alive).toBe(false);expect(heroProgress(s.teams[0],'commander').xp).toBeGreaterThan(0);expect(heroProgress(s.teams[0],'sage').xp).toBeGreaterThan(0);void sage;
  });
});
const HERO_SET=['commander','sage','ranger-captain'];
