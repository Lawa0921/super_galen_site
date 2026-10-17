import {afterEach,describe,expect,it,vi} from 'vitest';
import {addBuilding,addUnit,createState,units} from './state';
import {getTeamView,updateVisibility} from './visibility';
import type {RtsMap} from './maps';

const flat:RtsMap={id:'river',name:'Snapshot',width:96,height:96,blocked:new Uint8Array(9216),noBuild:new Uint8Array(9216),spawns:[{x:15.5,z:48.5},{x:80.5,z:48.5}],resources:[],camps:[]};
afterEach(()=>vi.restoreAllMocks());

describe('player snapshot copy boundary',()=>{
  it('keeps native serialization work bounded as the visible army grows',()=>{
    const s=createState(flat,4);
    for(let i=0;i<80;i++)addUnit(s,0,'guard',{x:16+i%8,z:45+Math.floor(i/8)});
    updateVisibility(s);
    // A native serialization call has per-call overhead. This budget prevents
    // an army-sized number of crossings on each 20 Hz simulation tick.
    const clone=vi.spyOn(globalThis,'structuredClone');
    const view=getTeamView(s,0);
    expect(view.entities.filter(e=>e.category==='unit'&&e.team===0)).toHaveLength(85);
    expect(clone.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('preserves all nested unit data and separates snapshots from simulation state',()=>{
    const s=createState(flat,4),unit=units(s,0)[0];
    Object.assign(unit,{
      order:{type:'move',position:{x:30,z:31},attackMove:true},cargo:{kind:'wood',amount:12},
      path:[{x:18,z:48},{x:20,z:48}],pathGoal:{x:30,z:31},home:{x:15,z:48},
      skillCooldowns:{cleave:1,banner:2,mend:3},
      approachSlot:{targetId:123,target:{x:31,z:32},position:{x:30,z:31},revision:2,range:2,progress:{x:20,z:48},checkedAt:5},
      moveWatch:{x:18,z:48,at:3,goal:{x:30,z:31},best:12},
      unreachableTargets:[{id:222,x:70,z:70,revision:3}],
      attackCue:{sequence:2,startedAt:4,targetId:123},hurtCue:{sequence:3,startedAt:5},
      castCue:{kind:'banner',sequence:4,startedAt:6},returning:undefined,
    });
    updateVisibility(s);const expected=structuredClone(unit);
    const view=getTeamView(s,0),copy=view.entities.find(e=>e.id===unit.id)!;
    expect(copy).toStrictEqual(expected);
    if(copy.category!=='unit'||copy.order.type!=='move')throw new Error('Expected moving unit');
    copy.order.position.x=0;copy.path[0].z=0;copy.pathGoal!.x=0;copy.home!.z=0;
    copy.cargo.amount=0;copy.skillCooldowns.banner=0;copy.approachSlot!.target.x=0;
    copy.approachSlot!.position.x=0;copy.approachSlot!.progress.x=0;
    copy.moveWatch!.goal.x=0;copy.unreachableTargets![0].revision=0;
    copy.attackCue!.sequence=0;copy.hurtCue!.sequence=0;copy.castCue!.sequence=0;
    view.team.hero.skills.banner=99;view.team.stats.kills=99;view.visible.fill(0);
    expect(unit).toStrictEqual(expected);
    expect(s.teams[0].hero.skills.banner).toBe(0);expect(s.teams[0].stats.kills).toBe(0);
    expect(s.visibility[0].visible.some(v=>v===1)).toBe(true);
  });

  it('filters hidden data before serialization and keeps enemy orders and impact sources secret',()=>{
    const s=createState(flat,4),own=addBuilding(s,0,'barracks',{x:16,z:48},true);
    const enemy=addBuilding(s,1,'barracks',{x:19,z:48},true);
    const hidden=addBuilding(s,1,'house',{x:70,z:70},true);
    const queue=[{id:1,type:'train' as const,target:'guard' as const,cost:{gold:55,wood:15},elapsed:1,duration:10,supply:2}];
    own.queue=enemy.queue=queue;own.rally=enemy.rally={x:25,z:26,resourceId:'gold-1'};
    own.damageCues=enemy.damageCues=[{sequence:1,time:0,source:{x:70,z:70}},{sequence:2,time:0,source:{x:17,z:48}}];
    // Hidden state must never enter the serializer, even if it cannot be cloned.
    Object.assign(hidden,{privateDiagnostic:()=>{}});
    updateVisibility(s);const before=structuredClone([own,enemy]);
    const view=getTeamView(s,0),a=view.entities.find(e=>e.id===own.id)!,b=view.entities.find(e=>e.id===enemy.id)!;
    expect(view.entities.some(e=>e.id===hidden.id)).toBe(false);
    if(a.category!=='building'||b.category!=='building')throw new Error('Expected buildings');
    expect(a.queue).toStrictEqual(queue);expect(a.rally).toStrictEqual(own.rally);
    expect(b.queue).toEqual([]);expect(b).not.toHaveProperty('rally');
    for(const e of [a,b]){
      expect(e.damageCues).toStrictEqual([{sequence:1,time:0},{sequence:2,time:0,source:{x:17,z:48}}]);
    }
    a.queue[0].cost.gold=0;a.spent.gold=0;a.rally!.x=0;a.damageCues![1].source!.x=0;
    expect(b.damageCues![1].source!.x).toBe(17);
    expect([own,enemy]).toStrictEqual(before);
  });

  it('returns a stable snapshot when shared source orders change after the next tick',()=>{
    const s=createState(flat,4),[a,b]=units(s,0),position={x:30,z:31};
    a.order={type:'move',position,attackMove:false};b.order={type:'move',position,attackMove:true};
    updateVisibility(s);const view=getTeamView(s,0);
    const copies=view.entities.filter(e=>e.id===a.id||e.id===b.id);
    const expected=structuredClone(copies);position.x=90;a.hp=0;
    expect(copies).toStrictEqual(expected);
    expect(getTeamView(s,0).entities.find(e=>e.id===b.id)).not.toStrictEqual(copies.find(e=>e.id===b.id));
  });
});
