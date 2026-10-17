import type { BuildingKind, Cost, PlayableUnit, ResearchId, SkillId, TeamId, UnitKind } from './catalog';
import type { RtsMap, Vec2 } from './maps';
export type Order = {type:'idle'|'hold'} | {type:'move';position:Vec2;attackMove:boolean} | {type:'attack';targetId:number} | {type:'gather';resourceId:string} | {type:'build'|'repair';targetId:number};
interface EntityBase extends Vec2 {
  id:number;team:TeamId|-1;hp:number;maxHp:number;alive:boolean;facing:number;cooldown:number;
  animation:'idle'|'walk'|'attack'|'work'|'cast'|'hurt'|'death';lastAttacker?:TeamId|-1;deathTime?:number;fatalHitOrder?:number;
}
export interface Unit extends EntityBase {
  category:'unit';kind:UnitKind;order:Order;mana:number;taskTime:number;cargo:{kind:'gold'|'wood';amount:number};
  path:Vec2[];pathGoal?:Vec2;pathRevision:number;blockedTime:number;campId?:number;returning?:boolean;home?:Vec2;
  skillCooldowns:Record<SkillId,number>;bannerUntil:number;engagedTargetId?:number;
  approachSlot?:{targetId:number;target:Vec2;position:Vec2;revision:number;range:number;progress:Vec2;checkedAt:number};
  /** Last position with real progress toward the current move goal (settle timer). */
  /** Consecutive ticks a mover has waited on a neighbour (deadlock breaker). */
  waitTicks?:number;
  /** Follow grid waypoints without shortcuts until this time (after a clipped shortcut). */
  strictPathUntil?:number;
  moveWatch?:{x:number;z:number;at:number;goal:Vec2;best:number};
  unreachableTargets?:Array<{id:number;x:number;z:number;revision:number}>;
  attackSequence?:number;attackCue?:{sequence:number;startedAt:number;targetId:number};attackContactSequence?:number;
  /** Cosmetic hit reaction, independent of orders, cooldowns and attack contact. */
  hurtCue?:{sequence:number;startedAt:number};
  /** Successful spell/heal presentation; retained independently of combat AI. */
  castCue?:{kind:SkillId|'heal'|'blast';sequence:number;startedAt:number};
  /** Timed effects: slowed (曦光術, 破曉), hasted (疾行號令), marked for extra damage (獵殺標記). */
  slowUntil?:number;hasteUntil?:number;markedUntil?:number;
  /** Mage area-spell cooldown, separate from the attack cooldown. */
  spellCooldown?:number;
}
export interface QueueItem {id:number;type:'train'|'research'|'upgrade';target:PlayableUnit|ResearchId|2|3;cost:Cost;elapsed:number;duration:number;supply:number}
export type RallyPoint=Vec2 & {resourceId?:string};
export interface BuildingDamageCue {sequence:number;time:number;source?:Vec2}
export interface Building extends EntityBase {category:'building';kind:BuildingKind;team:TeamId;construction:number;tier:1|2|3;queue:QueueItem[];rally?:RallyPoint;spent:Cost;
  damageCues?:BuildingDamageCue[];repairCue?:{sequence:number;time:number};removalReason?:'combat'|'cancelled';
}
export type Entity = Unit | Building;
export interface ResourceNode extends Vec2 {id:string;kind:'gold'|'wood';remaining:number}
export interface HeroProgress {recruited:boolean;xp:number;level:number;points:number;skills:Record<SkillId,number>}
export interface TeamState {
  gold:number;wood:number;reservedSupply:number;research:ResearchId[];
  /** 誓衛統領 progress (the original hero); heroProgress() resolves every hero. */
  hero:HeroProgress;
  /** Progress of the roster-expansion heroes. */
  heroes:{sage:HeroProgress;'ranger-captain':HeroProgress};
  stats:{gatheredGold:number;gatheredWood:number;unitsTrained:number;unitsLost:number;kills:number;buildingsBuilt:number;buildingsLost:number};
}
export interface Projectile extends Vec2 {id:number;sourceId:number;team:TeamId|-1;targetId:number;damage:number;speed:number;kind:'bolt'|'shell'}
export interface GameEvent {time:number;type:string;team?:TeamId|-1;entityId?:number;text?:string}
export interface EconomyRecord {time:number;team:TeamId;reason:string;gold:number;wood:number}
/** Older manually created memories can lack construction; render only a foundation. */
export interface KnownBuilding {id:number;kind:BuildingKind;x:number;z:number;team:TeamId;tier:number;lastSeen:number;construction?:number;integrity?:number}
export interface TeamVisibility {visible:Uint8Array;explored:Uint8Array;knownBuildings:Record<number,KnownBuilding>}
export interface AIState {
  nextThink:number;nextAttack:number;lastScout:number;
  scoutId?:number;scoutTarget?:Vec2;scoutRevision?:number;scoutRejected?:number[];
  /** Build sites refused by the build command, valid for one navigation revision. */
  siteRevision?:number;siteRejected?:string[];
  /** Difficulty profile (absent = normal); see AI_PROFILES. */
  difficulty?:'easy'|'normal'|'hard';
  /** Resources and neutral camps this seat has seen, as last seen (never read through fog). */
  knownResources?:Record<string,{kind:'gold'|'wood';x:number;z:number;remaining:number;initial:number}>;knownCamps?:Record<number,Vec2>;
  /** Worker sent to explore the home half for expansion gold; prospectAt delays the next attempt. */
  prospectorId?:number;prospectAt?:number;prospected?:boolean;
  /** Army regroups at home until this time after a retreat; swept holds the stale-fog sweep cells already visited. */
  retreatUntil?:number;swept?:number[];
  /** Cells of the enemy start and gold sites a wave has already checked while no enemy building was known. */
  hunted?:number[];
  /** The known building the last wave was sent against. */
  waveTarget?:number;
  /** Largest count of each enemy unit kind seen at once (own sight only), for counter-building. */
  enemySeen?:Partial<Record<UnitKind,number>>;
}
export interface GameState {
  map:RtsMap;seed:number;rng:number;time:number;tick:number;nextId:number;navigationRevision:number;damageSerial:number;
  status:'playing'|'won'|'draw';winner:TeamId|null;endReason?:'elimination'|'surrender'|'time-limit'|'mutual-destruction';paused:boolean;
  teams:[TeamState,TeamState];entities:Entity[];resources:ResourceNode[];projectiles:Projectile[];
  visibility:[TeamVisibility,TeamVisibility];events:GameEvent[];economyLog:EconomyRecord[];rewardedCamps:number[];
  seenCommandIds:[Set<string>,Set<string>];aiEnabled:[boolean,boolean];ai:AIState[];
  /** Enables the preview roster (catalog `preview` items) for this match; off in the shipped game. */
  rosterPreview?:boolean;
}
export type Command = (
  {type:'train';buildingId:number;unit:PlayableUnit} | {type:'research';buildingId:number;research:ResearchId} |
  {type:'upgrade';buildingId:number} | {type:'cancel';buildingId:number;queueId?:number} |
  {type:'build';workerId:number;building:BuildingKind;position:Vec2} | {type:'gather';unitIds:number[];resourceId:string} |
  {type:'repair'|'resume';unitIds:number[];targetId:number} | {type:'move';unitIds:number[];position:Vec2;attackMove?:boolean} |
  {type:'attack';unitIds:number[];targetId:number} | {type:'stop'|'hold';unitIds:number[]} |
  {type:'rally';buildingId:number;position:Vec2;resourceId?:string} | {type:'learn';heroId:number;skill:SkillId} |
  {type:'cast';heroId:number;skill:SkillId;targetId?:number;position?:Vec2} | {type:'surrender'}
) & {commandId?:string};
export type CommandResult = {ok:true} | {ok:false;reason:string};
