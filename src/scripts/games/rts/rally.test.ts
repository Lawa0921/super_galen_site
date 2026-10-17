import {describe,it,expect} from 'vitest';
import {createState,buildings,units,addBuilding,addUnit} from './state';
import {issueCommand} from './commands';
import {stepGame} from './simulation';
import {stepEconomy} from './economy';
import {getTeamView,updateVisibility} from './visibility';
import type {RtsMap} from './maps';
const setup=()=>{
  const map:RtsMap={id:'river',name:'Rally',width:96,height:96,blocked:new Uint8Array(9216),noBuild:new Uint8Array(9216),spawns:[{x:15.5,z:48.5},{x:80.5,z:48.5}],resources:[{id:'gold',kind:'gold',x:24.5,z:48.5,amount:1000},{id:'wood',kind:'wood',x:24.5,z:57.5,amount:1000}],camps:[]};
  const s=createState(map,1);s.aiEnabled=[false,false];return {s,h:buildings(s,0)[0]};
};
const advance=(s:ReturnType<typeof createState>,seconds:number)=>{for(let i=0;i<seconds*20;i++)stepGame(s);};

describe('worker resource rally',()=>{
  it.each(['gold','wood'])('new workers automatically harvest and deposit %s from their townhall rally',kind=>{
    const {s,h}=setup(),r=s.resources.find(r=>r.kind===kind)!;
    expect(issueCommand(s,0,{type:'rally',buildingId:h.id,position:r,resourceId:r.id})).toEqual({ok:true});
    expect(h.rally).toEqual({x:r.x,z:r.z,resourceId:r.id});
    expect(issueCommand(s,0,{type:'train',buildingId:h.id,unit:'worker'}).ok).toBe(true);
    advance(s,6);const worker=units(s,0).at(-1)!;
    expect(worker.order).toEqual({type:'gather',resourceId:r.id});
    advance(s,22);expect(s.teams[0].stats[kind==='gold'?'gatheredGold':'gatheredWood']).toBeGreaterThan(0);
  });
  it.each(['hidden','exhausted','missing'])('rejects a %s resource without overwriting the previous rally',reason=>{
    const {s,h}=setup(),r=s.resources[0];
    expect(issueCommand(s,0,{type:'rally',buildingId:h.id,position:{x:20,z:40}}).ok).toBe(true);
    if(reason==='hidden')s.visibility[0].visible.fill(0);
    if(reason==='exhausted')r.remaining=0;
    expect(issueCommand(s,0,{type:'rally',buildingId:h.id,position:r,resourceId:reason==='missing'?'absent':r.id}).ok).toBe(false);
    expect(h.rally).toEqual({x:20,z:40});
  });
  it('clears a resource rally when the player changes it to a ground destination',()=>{
    const {s,h}=setup(),r=s.resources[0];
    issueCommand(s,0,{type:'rally',buildingId:h.id,position:r,resourceId:r.id});
    issueCommand(s,0,{type:'rally',buildingId:h.id,position:{x:20,z:40}});
    issueCommand(s,0,{type:'train',buildingId:h.id,unit:'worker'});advance(s,6);
    expect(h.rally).toEqual({x:20,z:40});
    expect(units(s,0).at(-1)!.order).toEqual({type:'move',position:{x:20,z:40},attackMove:false});
  });
  it('does not expose an opposing building resource rally through the player view',()=>{
    const {s,h}=setup();h.rally={x:24.5,z:48.5,resourceId:'gold'};
    addUnit(s,1,'guard',{x:20,z:48});updateVisibility(s);
    expect(getTeamView(s,1).entities.find(e=>e.id===h.id)).not.toHaveProperty('rally');
  });
  it('reassigns a visible resource exhausted during training instead of abandoning the new worker',()=>{
    const {s,h}=setup(),r=s.resources[0];s.resources.push({id:'gold-next',kind:'gold',x:23.5,z:44.5,remaining:100});
    issueCommand(s,0,{type:'rally',buildingId:h.id,position:r,resourceId:r.id});
    issueCommand(s,0,{type:'train',buildingId:h.id,unit:'worker'});r.remaining=0;
    advance(s,6.1);expect(units(s,0).at(-1)!.order).toEqual({type:'gather',resourceId:'gold-next'});
  });
  it('does not discover depletion remotely when following a previously visible resource rally',()=>{
    const {s}=setup(),r=s.resources[0],w=units(s,0)[0];
    w.order={type:'gather',resourceId:r.id};r.remaining=0;s.visibility[0].visible.fill(0);
    const start={x:w.x,z:w.z};stepEconomy(s,.05);
    expect(w.order).toEqual({type:'gather',resourceId:r.id});
    expect(s.events.some(e=>e.type==='resource-depleted')).toBe(false);
    expect(Math.hypot(w.x-start.x,w.z-start.z)).toBeGreaterThan(0);
  });
  it('rejects resource gathering rallies at a military building and retains ordinary army rallying',()=>{
    const {s}=setup(),b=addBuilding(s,0,'barracks',{x:20,z:35},true),r=s.resources[0];
    expect(issueCommand(s,0,{type:'rally',buildingId:b.id,position:r,resourceId:r.id}).ok).toBe(false);
    expect(issueCommand(s,0,{type:'rally',buildingId:b.id,position:{x:24,z:30}}).ok).toBe(true);
    expect(issueCommand(s,0,{type:'train',buildingId:b.id,unit:'guard'}).ok).toBe(true);advance(s,10);
    expect(units(s,0).at(-1)!.order).toMatchObject({type:'move',attackMove:true});
  });
});
