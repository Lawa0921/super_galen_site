import {BUILDINGS,RESEARCH,UNITS,SUPPLY_SHORTAGE_HINT,supplyShortage,type BuildingKind,type Cost,type Requirements,type ResearchId} from './catalog';
import {ABILITY_CUES,type AudioCue} from './audio-score';

export const formatDuration=(seconds:number)=>`${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
export function formatBattleTime(time:number):{text:string;remaining:boolean}{
  const remaining=time>=1500;
  return {text:formatDuration(remaining?Math.max(0,Math.ceil(1800-time)):Math.max(0,time)),remaining};
}

interface CommandResources {gold:number;wood:number;used:number;reserved:number;cap:number;tier:number;buildings:BuildingKind[];research:ResearchId[]}
interface CommandNeed {cost?:Cost;supply?:number;requires?:Requirements;previous?:ResearchId;mana?:number;currentMana?:number;cooldown?:number}
export function commandBlockReasons(have:CommandResources,need:CommandNeed):string[]{
  const reasons:string[]=[],r=need.requires;
  if(r){
    if(have.tier<r.tier)reasons.push(`需要主城 ${['','I','II','III'][r.tier]??r.tier} 階`);
    for(const k of r.buildings??[])if(!have.buildings.includes(k))reasons.push(`需要${BUILDINGS[k].name}`);
    if(r.anyBuildings?.length&&!r.anyBuildings.some(k=>have.buildings.includes(k)))reasons.push(`需要${r.anyBuildings.map(k=>BUILDINGS[k].name).join('或')}`);
  }
  if(need.previous&&!have.research.includes(need.previous))reasons.push(`需要先完成${RESEARCH[need.previous].name}`);
  if(need.cost){if(have.gold<need.cost.gold)reasons.push(`金幣不足 ${Math.ceil(need.cost.gold-have.gold)}`);if(have.wood<need.cost.wood)reasons.push(`木材不足 ${Math.ceil(need.cost.wood-have.wood)}`);}
  if(need.supply&&have.used+have.reserved+need.supply>have.cap)reasons.push(supplyShortage(have.used+have.reserved+need.supply-have.cap));
  if(need.mana!==undefined&&need.currentMana!==undefined&&need.currentMana<need.mana)reasons.push(`魔力不足 ${Math.ceil(need.mana-need.currentMana)}`);
  if(need.cooldown&&need.cooldown>0)reasons.push(`冷卻中 ${Math.ceil(need.cooldown)} 秒`);
  return reasons;
}
/** Command-card wording: the same reasons, minus hints that only fit the tooltip. */
export const commandCardReasons=(reasons:readonly string[])=>reasons.map(r=>r.endsWith(SUPPLY_SHORTAGE_HINT)?r.slice(0,-SUPPLY_SHORTAGE_HINT.length):r).join(' · ');

interface AudibleEntity {id:number;team:number;category:string;kind:string;animation:string;order?:{type:string};construction?:number;tier?:number;hp:number;maxHp:number;mana?:number;cargo?:{amount:number};attackCue?:{sequence:number};castCue?:{kind:string;sequence:number};skillCooldowns?:{cleave:number;mend:number;banner:number}}
interface VisibleCueView {time?:number;entities:AudibleEntity[];projectiles:Array<{id:number;team:number;kind?:'bolt'|'shell'}>;team?:{research?:readonly string[]}}
interface CueSnapshot {animation:string;order?:string;hp:number;mana?:number;cargo?:number;sequence?:number;cast?:number;construction?:number;tier?:number;workAt:number;skills?:AudibleEntity['skillCooldowns']}
export class VisibleAudioCues {
  private previous=new Map<number,CueSnapshot>();
  private projectiles=new Set<number>();
  private research=0;
  private initialized=false;
  reset(){this.previous.clear();this.projectiles.clear();this.research=0;this.initialized=false;}
  observe(view:VisibleCueView):AudioCue[]{
    const cues=new Set<AudioCue>(),next=new Map<number,CueSnapshot>(),shots=new Set<number>(),now=view.time??0;
    for(const e of view.entities){
      const old=this.previous.get(e.id),snapshot:CueSnapshot={animation:e.animation,order:e.order?.type,hp:e.hp,mana:e.mana,cargo:e.cargo?.amount,sequence:e.attackCue?.sequence,cast:e.castCue?.sequence,construction:e.construction,tier:e.tier,workAt:old?.workAt??now,skills:e.skillCooldowns?{...e.skillCooldowns}:undefined};
      next.set(e.id,snapshot);
      // An enemy entering sight must not replay actions or damage from fog.
      // Allied units are always visible, so a new ally is a completed training.
      if(this.initialized&&!old&&e.team===0&&e.category==='unit')cues.add('complete');
      if(!this.initialized||!old)continue;
      if(e.team===0&&e.kind==='worker'&&e.animation==='work'){
        const changed=old.animation!=='work'||old.order!==e.order?.type;
        if(e.order?.type==='gather'){
          if(changed||(e.cargo?.amount??0)>(old.cargo??0))cues.add('gather');
        }else if(changed||now-old.workAt>=.5){cues.add(e.order?.type==='repair'?'repair':'build');snapshot.workAt=now;}
      }
      // Projectile shooters are heard through their bolt; casters' attacks are spells.
      const shooter=Object.hasOwn(UNITS,e.kind)&&!!UNITS[e.kind as keyof typeof UNITS].projectileSpeed;
      if(e.animation==='attack'&&!shooter&&(old.animation!=='attack'||e.attackCue?.sequence!==old.sequence))cues.add(['priest','mage','sage'].includes(e.kind)?'spell':'attack');
      // Preview-roster abilities follow the real cast sequence, so a cast
      // replaced by combat in the same tick is still heard exactly once.
      if(e.castCue&&e.castCue.sequence!==old.cast){const cue=ABILITY_CUES[e.castCue.kind as keyof typeof ABILITY_CUES];if(cue)cues.add(cue);}
      if(e.kind==='priest'&&e.animation==='cast'&&(old.animation!=='cast'||(e.mana??0)<(old.mana??0)))cues.add('heal');
      if(e.kind==='commander'&&e.skillCooldowns&&old.skills){
        if(e.skillCooldowns.cleave>old.skills.cleave)cues.add('attack');
        if(e.skillCooldowns.mend>old.skills.mend)cues.add('heal');
        if(e.skillCooldowns.banner>old.skills.banner)cues.add('banner');
      }
      if(e.hp<old.hp)cues.add(e.hp<=0?'death':'impact');
      if(e.team===0&&e.hp<old.hp)cues.add('warning');
      if(e.team===0&&e.category==='building'&&((old.construction??1)<1&&e.construction===1||(e.tier??1)>(old.tier??1)))cues.add('complete');
    }
    for(const p of view.projectiles){shots.add(p.id);if(this.initialized&&!this.projectiles.has(p.id))cues.add(p.kind??'attack');}
    const research=view.team?.research?.length??0;if(this.initialized&&research>this.research)cues.add('complete');this.research=research;
    this.previous=next;this.projectiles=shots;this.initialized=true;return [...cues];
  }
}
