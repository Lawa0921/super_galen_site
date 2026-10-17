import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {createState,addBuilding,addUnit,buildings,units,destroyEntity} from './state';
import {issueCommand} from './commands';
import {stepEconomy} from './economy';
import {grantXp} from './hero';
import {getTeamView} from './visibility';
import {createGame} from './simulation';
import {drainEvents,AttackAlerts,matchSummary,rallyMarkers} from './feedback';
import {groundFootprint,pointInPolygon} from './camera-footprint';
import type {RtsMap} from './maps';
import type {GameEvent} from './types';
const flat=():RtsMap=>({id:'river',name:'Test',width:96,height:96,blocked:new Uint8Array(9216),noBuild:new Uint8Array(9216),spawns:[{x:15.5,z:48.5},{x:80.5,z:48.5}],resources:[{id:'gold',kind:'gold',x:15.5,z:57.5,amount:1000},{id:'wood',kind:'wood',x:25.5,z:57.5,amount:1000}],camps:[]});
const advance=(s:ReturnType<typeof createState>,seconds:number)=>{for(let i=0;i<seconds*20;i++){s.time+=.05;stepEconomy(s,.05);}};

describe('event feed',()=>{
  it('returns every event pushed after the last consumed one, including several in the same tick',()=>{
    const a:GameEvent={time:1,type:'a'},b:GameEvent={time:2,type:'b'},c:GameEvent={time:2,type:'c'},events=[a,b,c];
    expect(drainEvents(events,a)).toEqual([b,c]);expect(drainEvents(events,c)).toEqual([]);expect(drainEvents(events,undefined)).toEqual([a,b,c]);
  });
  it('returns the retained window when the last consumed event was trimmed from the log',()=>{
    const old:GameEvent={time:0,type:'old'},kept:GameEvent[]=[{time:5,type:'x'},{time:5,type:'y'}];
    expect(drainEvents(kept,old)).toEqual(kept);
  });
  it('labels own training, research, town hall upgrade, construction and hero level-up events with player-facing text',()=>{
    const s=createState(flat(),1),hall=buildings(s,0)[0];s.teams[0].gold=s.teams[0].wood=9000;
    const forge=addBuilding(s,0,'forge',{x:30,z:29},true),altar=addBuilding(s,0,'altar',{x:38,z:20},true);addBuilding(s,0,'barracks',{x:30,z:20},true);addBuilding(s,0,'house',{x:40,z:60},true);
    expect(issueCommand(s,0,{type:'train',buildingId:hall.id,unit:'worker'}).ok).toBe(true);
    expect(issueCommand(s,0,{type:'research',buildingId:forge.id,research:'weapons1'}).ok).toBe(true);
    expect(issueCommand(s,0,{type:'train',buildingId:altar.id,unit:'commander'}).ok).toBe(true);
    advance(s,25);expect(issueCommand(s,0,{type:'upgrade',buildingId:hall.id}).ok).toBe(true);advance(s,90);
    const texts=s.events.filter(e=>e.team===0).map(e=>e.text);
    expect(texts).toEqual(expect.arrayContaining(['工人已完成訓練','研究完成：精鍛兵刃 I','誓衛統領已完成訓練','主城已升級為城堡']));
    const hero=units(s,0).find(u=>u.kind==='commander')!;grantXp(s,hero,100000);
    expect(s.events.filter(e=>e.type==='hero-level').map(e=>e.text)).toEqual(['誓衛統領升至 2 級','誓衛統領升至 3 級','誓衛統領升至 4 級','誓衛統領升至 5 級']);
    destroyEntity(s,hero);expect(issueCommand(s,0,{type:'train',buildingId:altar.id,unit:'commander'}).ok).toBe(true);advance(s,20);
    expect(s.events.at(-1)).toMatchObject({type:'train-complete',text:'誓衛統領已復活'});
    const worker=units(s,0).find(u=>u.kind==='worker')!;
    expect(issueCommand(s,0,{type:'build',workerId:worker.id,building:'house',position:{x:22.5,z:40.5}}).ok).toBe(true);advance(s,60);
    expect(s.events.find(e=>e.type==='construction-complete')).toMatchObject({team:0,text:'民居已完工'});
  });
});

describe('attack alerts',()=>{
  const view=(time:number,entities:Array<{id:number;team:number;category:string;kind:string;hp:number;x:number;z:number}>)=>({time,entities});
  it('warns once per area for damaged own buildings and suppresses repeats inside the throttle window',()=>{
    const alerts=new AttackAlerts(),hall={id:1,team:0,category:'building',kind:'townhall',hp:1000,x:15,z:48},enemy={id:2,team:1,category:'building',kind:'townhall',hp:1000,x:80,z:48};
    expect(alerts.observe(view(0,[hall,enemy]))).toEqual([]);
    expect(alerts.observe(view(1,[{...hall,hp:990},{...enemy,hp:900}]))).toEqual([{x:15,z:48,base:true,text:'我方基地遭受攻擊！'}]);
    expect(alerts.observe(view(5,[{...hall,hp:980}]))).toEqual([]);
    expect(alerts.observe(view(9.5,[{...hall,hp:970}]))).toHaveLength(1);
  });
  it('treats separate areas independently and skips army alerts the camera already shows',()=>{
    const alerts=new AttackAlerts(),a={id:1,team:0,category:'unit',kind:'worker',hp:100,x:10,z:10},b={id:2,team:0,category:'unit',kind:'guard',hp:300,x:70,z:70},c={id:3,team:0,category:'unit',kind:'guard',hp:300,x:40,z:80};
    alerts.observe(view(0,[a,b,c]));
    const result=alerts.observe(view(1,[{...a,hp:90},{...b,hp:290},{...c,hp:250}]),p=>p.x>60);
    expect(result).toEqual([{x:10,z:10,base:true,text:'我方基地遭受攻擊！'},{x:40,z:80,base:false,text:'我方部隊遭受攻擊！'}]);
  });
});

describe('match summary',()=>{
  it('compares both sides, counts lost buildings and formats the match duration',()=>{
    const s=createState(flat(),1);s.time=754.4;
    const house=addBuilding(s,1,'house',{x:70,z:30},true);destroyEntity(s,house);destroyEntity(s,addBuilding(s,1,'house',{x:70,z:40}),'cancelled');
    destroyEntity(s,units(s,0)[0]);s.teams[0].stats.kills=3;s.teams[1].stats.buildingsBuilt=2;
    const summary=matchSummary(s);
    expect(summary.duration).toBe('12:34');
    expect(summary.rows).toEqual([
      {label:'擊殺',player:3,enemy:0},{label:'陣亡部隊',player:1,enemy:0},{label:'訓練部隊',player:0,enemy:0},
      {label:'建成建築',player:0,enemy:2},{label:'失去建築',player:0,enemy:1},{label:'採集金幣',player:0,enemy:0},{label:'採集木材',player:0,enemy:0},
    ]);
  });
});

describe('rally markers',()=>{
  it('marks only selected own buildings with a rally point, flagging resource rallies',()=>{
    const s=createGame('river',1),hall=buildings(s,0)[0],enemy=buildings(s,1)[0],barracks=addBuilding(s,0,'barracks',{x:24,z:30},true);
    hall.rally={x:20,z:57,resourceId:s.resources[0].id};barracks.rally={x:30,z:30};enemy.rally={x:70,z:40};addUnit(s,0,'guard',{x:20,z:20});
    const view=getTeamView(s,0);
    expect(rallyMarkers(view,[hall.id,barracks.id,enemy.id])).toEqual([
      {from:{id:hall.id,x:hall.x,z:hall.z},to:{x:20,z:57},resource:true},{from:{id:barracks.id,x:24,z:30},to:{x:30,z:30},resource:false}]);
    expect(rallyMarkers(view,[])).toEqual([]);
  });
});

describe('camera ground footprint',()=>{
  const camera=(span:number)=>{const c=new THREE.OrthographicCamera(-span*.8,span*.8,span/2,-span/2,.1,250);c.position.set(48+24,52,48+35);c.lookAt(48,0,48);c.updateProjectionMatrix();c.updateMatrixWorld();return c;};
  it('returns the four ground points that project onto the screen corners',()=>{
    const c=camera(48),points=groundFootprint(c);expect(points).toHaveLength(4);
    const corners=points.map(p=>new THREE.Vector3(p.x,0,p.z).project(c)).map(v=>[Math.round(v.x*1000)/1000,Math.round(v.y*1000)/1000]);
    expect(corners).toEqual([[-1,1],[1,1],[1,-1],[-1,-1]]);
    expect(pointInPolygon({x:48,z:48},points)).toBe(true);expect(pointInPolygon({x:5,z:5},points)).toBe(false);
  });
  it('grows with zoom instead of staying a fixed rectangle',()=>{
    const area=(p:{x:number;z:number}[])=>Math.abs(p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a.x*b.z-b.x*a.z;},0))/2;
    expect(area(groundFootprint(camera(76)))).toBeGreaterThan(area(groundFootprint(camera(24)))*9);
  });
});
