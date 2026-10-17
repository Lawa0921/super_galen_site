import type {Building,BuildingDamageCue} from './types';
import type {Vec2} from './maps';

export const BUILDING_DEATH_SECONDS=3;
const CUE_SECONDS=.6;
/** Unfinished buildings normally have 10% base HP plus their built portion. */
export function buildingIntegrity(building:Pick<Building,'hp'|'maxHp'|'construction'>):number {
  const expected=building.maxHp*(.1+.9*Math.max(0,Math.min(1,building.construction)));
  return expected>0?Math.max(0,Math.min(1,building.hp/expected)):0;
}
/** Bounded visual history preserves separate simultaneous impacts. Damage and
 * fatal-hit ordering remain simulation facts, independent of this FX budget. */
export function recordBuildingImpact(building:Building,time:number,source?:Vec2):void {
  const history=building.damageCues??[],sequence=(history.at(-1)?.sequence??0)+1;
  const cue:BuildingDamageCue={sequence,time};
  if(source&&Number.isFinite(source.x)&&Number.isFinite(source.z))cue.source={x:source.x,z:source.z};
  building.damageCues=[...history.filter(c=>time-c.time<=CUE_SECONDS).slice(-15),cue];
}
/** One observer per visible instance. A new instance never replays old fog
 * events. Multiple renders of a paused snapshot consume nothing twice. */
export class BuildingCueHistory {
  private damage:number|undefined;
  private repair=0;
  private time=-Infinity;
  observe(building:Pick<Building,'damageCues'|'repairCue'|'alive'>,time:number):{impacts:BuildingDamageCue[];repair:boolean} {
    const baseline=this.damage===undefined||time<this.time,damage=building.damageCues??[],repair=building.repairCue;
    const recent=(at:number)=>at<=time&&time-at<=CUE_SECONDS;
    const result={impacts:baseline?[]:damage.filter(c=>c.sequence>this.damage!&&recent(c.time)),repair:!baseline&&building.alive&&!!repair&&repair.sequence>this.repair&&recent(repair.time)};
    this.damage=damage.at(-1)?.sequence??0;this.repair=repair?.sequence??0;this.time=time;return result;
  }
}
