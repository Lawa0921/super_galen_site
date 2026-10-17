import type {GameEvent,GameState} from './types';
import type {Vec2} from './maps';
import type {TeamView} from './scene';
import {formatDuration} from './ui';
/** Events appended after `last` (the log is trimmed from the front, so a vanished cursor means everything retained is new). */
export function drainEvents(events:readonly GameEvent[],last:GameEvent|undefined):GameEvent[]{return events.slice(last?events.lastIndexOf(last)+1:0);}

interface AlertEntity {id:number;team:number;category:string;kind:string;hp:number;x:number;z:number}
export interface AttackAlert {x:number;z:number;base:boolean;text:string}
/** Own entities losing health raise one alert per area per `interval` simulated seconds; army fights already on screen stay quiet. */
export class AttackAlerts {
  private hp=new Map<number,number>();
  private last=new Map<string,number>();
  constructor(private interval=8,private cell=16){}
  observe(view:{time:number;entities:readonly AlertEntity[]},onScreen?:(p:Vec2)=>boolean):AttackAlert[]{
    const alerts:AttackAlert[]=[],next=new Map<number,number>();
    for(const e of view.entities){if(e.team!==0)continue;const old=this.hp.get(e.id);next.set(e.id,e.hp);if(old===undefined||e.hp>=old)continue;
      const base=e.category==='building'||e.kind==='worker';if(!base&&onScreen?.(e))continue;
      const key=`${base?'b':'u'}:${Math.floor(e.x/this.cell)},${Math.floor(e.z/this.cell)}`,at=this.last.get(key);if(at!==undefined&&view.time-at<this.interval)continue;
      this.last.set(key,view.time);alerts.push({x:e.x,z:e.z,base,text:base?'我方基地遭受攻擊！':'我方部隊遭受攻擊！'});
    }
    this.hp=next;return alerts;
  }
}

export interface MatchSummary {duration:string;rows:Array<{label:string;player:number;enemy:number}>}
export function matchSummary(s:GameState):MatchSummary{
  const [a,b]=s.teams.map(t=>t.stats),row=(label:string,key:keyof typeof a)=>({label,player:Math.floor(a[key]),enemy:Math.floor(b[key])});
  return {duration:formatDuration(s.time),rows:[row('擊殺','kills'),row('陣亡部隊','unitsLost'),row('訓練部隊','unitsTrained'),row('建成建築','buildingsBuilt'),row('失去建築','buildingsLost'),row('採集金幣','gatheredGold'),row('採集木材','gatheredWood')]};
}

export interface RallyMarker {from:Vec2 & {id:number};to:Vec2;resource:boolean}
export function rallyMarkers(view:Pick<TeamView,'entities'>,selection:readonly number[]):RallyMarker[]{
  return view.entities.flatMap(e=>e.alive&&e.team===0&&e.category==='building'&&e.rally&&selection.includes(e.id)?[{from:{id:e.id,x:e.x,z:e.z},to:{x:e.rally.x,z:e.rally.z},resource:e.rally.resourceId!==undefined}]:[]);
}
