import {describe,expect,it} from 'vitest';
import {formatBattleTime,commandBlockReasons,commandCardReasons,VisibleAudioCues} from './ui';
import {createState,addBuilding,buildings} from './state';
import {issueCommand} from './commands';
import type {RtsMap} from './maps';

describe('battle UI rules',()=>{
  it('shows elapsed time until the last five minutes, then remaining time',()=>{
    expect(formatBattleTime(60)).toEqual({text:'01:00',remaining:false});
    expect(formatBattleTime(1500)).toEqual({text:'05:00',remaining:true});
    expect(formatBattleTime(1799.2)).toEqual({text:'00:01',remaining:true});
    expect(formatBattleTime(1800)).toEqual({text:'00:00',remaining:true});
  });
  it('names missing resources, supply and technology rather than a generic lock',()=>{
    const reasons=commandBlockReasons({gold:80,wood:20,used:9,reserved:0,cap:10,tier:1,buildings:['townhall'],research:[]},{cost:{gold:110,wood:40},supply:2,requires:{tier:2,buildings:['lumbermill']}});
    expect(reasons).toEqual(['需要主城 II 階','需要伐木場','金幣不足 30','木材不足 20','人口不足 1，需建造民居']);
    expect(commandBlockReasons({gold:500,wood:200,used:5,reserved:0,cap:10,tier:2,buildings:['lumbermill'],research:['weapons1']},{previous:'weapons1'})).toEqual([]);
    expect(commandBlockReasons({gold:500,wood:200,used:5,reserved:0,cap:10,tier:2,buildings:[],research:[]},{previous:'weapons1',mana:70,currentMana:30,cooldown:2.2})).toEqual(['需要先完成精鍛兵刃 I','魔力不足 40','冷卻中 3 秒']);
  });
  it('reports a supply shortage with the same message on the command card and the rejected command',()=>{
    const map:RtsMap={id:'river',name:'Test',width:96,height:96,blocked:new Uint8Array(9216),noBuild:new Uint8Array(9216),spawns:[{x:15.5,z:48.5},{x:80.5,z:48.5}],resources:[],camps:[]};
    const s=createState(map,1),h=buildings(s,0)[0]!,b=addBuilding(s,0,'barracks',{x:30,z:20},true);s.teams[0].gold=5000;s.teams[0].wood=5000;
    for(let i=0;i<4;i++)expect(issueCommand(s,0,{type:'train',buildingId:h.id,unit:'worker'}).ok).toBe(true);
    const card=commandBlockReasons({gold:5000,wood:5000,used:5,reserved:4,cap:10,tier:1,buildings:['townhall','barracks'],research:[]},{supply:2});
    expect(card).toEqual(['人口不足 1，需建造民居']);
    expect(commandCardReasons(card)).toBe('人口不足 1');
    expect(commandCardReasons(['金幣不足 30','人口不足 2，需建造民居'])).toBe('金幣不足 30 · 人口不足 2');
    expect(commandCardReasons(['需要兵營'])).toBe('需要兵營');
    expect(issueCommand(s,0,{type:'train',buildingId:b.id,unit:'guard'})).toEqual({ok:false,reason:card[0]});
  });
  it('observes only visible player-side action changes once and resets after a new game',()=>{
    const cues=new VisibleAudioCues();
    const view=(workerAnimation:'idle'|'work',enemyVisible:boolean,projectile=false)=>({
      time:1,entities:[{id:1,team:0,category:'unit',kind:'worker',animation:workerAnimation,order:{type:'gather'},construction:1,hp:100,maxHp:100},...(enemyVisible?[{id:2,team:1,category:'unit',kind:'guard',animation:'attack',order:{type:'attack'},hp:100,maxHp:100}]:[])],
      projectiles:projectile?[{id:3,team:0}]:[],team:{research:[],stats:{gatheredGold:0,gatheredWood:0}},status:'playing',winner:null
    });
    expect(cues.observe(view('idle',false))).toEqual([]);
    expect(cues.observe(view('work',false))).toEqual(['gather']);
    expect(cues.observe(view('work',false))).toEqual([]);
    expect(cues.observe(view('work',true,true))).toContain('attack');
    const wounded=view('idle',false);wounded.entities[0]!.hp=60;expect(cues.observe(wounded)).toContain('warning');
    cues.reset();expect(cues.observe(view('work',false))).toEqual([]);
  });
});
