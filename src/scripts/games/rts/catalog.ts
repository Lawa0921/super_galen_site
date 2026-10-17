export type TeamId = 0 | 1;
export type BuildingKind = 'townhall' | 'house' | 'barracks' | 'lumbermill' | 'forge' | 'altar' | 'tower' | 'chapel' | 'stable' | 'workshop';
export type UnitKind = 'worker' | 'guard' | 'crossbow' | 'priest' | 'knight' | 'siege' | 'commander' | 'neutral-raider'
  | 'pikeman' | 'ranger' | 'mage' | 'gryphon' | 'sage' | 'ranger-captain';
export type PlayableUnit = Exclude<UnitKind, 'neutral-raider'>;
/** Heroes: one of each per seat, revived at the altar, at most one per town hall tier (WC3 style). */
export type HeroKind = 'commander' | 'sage' | 'ranger-captain';
export const HERO_KINDS: readonly HeroKind[] = ['commander', 'sage', 'ranger-captain'];
export const isHero = (kind: string): kind is HeroKind => (HERO_KINDS as readonly string[]).includes(kind);
export type ResearchId = 'timber' | 'weapons1' | 'weapons2' | 'weapons3' | 'armor1' | 'armor2' | 'armor3';
export type SkillId = 'cleave' | 'mend' | 'banner' | 'sunburst' | 'radiance' | 'daybreak' | 'volley' | 'sprint' | 'mark';
/**
 * Attack and armour classes. Every pairing among the original units and
 * buildings stays at 1.0, so the shipped balance is unchanged; the matrix only
 * adds the new counters (spears vs cavalry, piercing vs air, magic vs light).
 * Documented in docs/games/rts.md.
 */
export type AttackType = 'normal' | 'pierce' | 'spear' | 'siege' | 'magic' | 'hero';
export type ArmorType = 'light' | 'heavy' | 'cavalry' | 'air' | 'fortified' | 'hero';
export const DAMAGE_MATRIX: Readonly<Record<AttackType, Readonly<Record<ArmorType, number>>>> = {
  normal: {light:1,heavy:1,cavalry:1,air:1,fortified:1,hero:1},
  pierce: {light:1,heavy:1,cavalry:1,air:1.5,fortified:1,hero:1},
  spear: {light:1,heavy:1,cavalry:1.75,air:1,fortified:.6,hero:1},
  siege: {light:1,heavy:1,cavalry:1,air:1,fortified:1,hero:1},
  magic: {light:1.25,heavy:.8,cavalry:1,air:1.25,fortified:.5,hero:.75},
  hero: {light:1,heavy:1,cavalry:1,air:1,fortified:1,hero:1},
};
/** Watch towers fire piercing bolts and can hit air. */
export const TOWER_ATTACK: AttackType = 'pierce';
export const damageMultiplier = (attack: AttackType, armor: ArmorType): number => DAMAGE_MATRIX[attack][armor];
export interface Cost { gold: number; wood: number }
export interface Requirements { tier: number; buildings?: BuildingKind[]; anyBuildings?: BuildingKind[] }
export interface UnitDefinition {
  name: string; cost: Cost; duration: number; supply: number; hp: number; damage: number;
  armor: number; range: number; interval: number; speed: number; radius: number; sight: number;
  mana: number; trainedAt?: BuildingKind; requires: Requirements; projectileSpeed?: number; buildingMultiplier?: number;
  attackType: AttackType; armorType: ArmorType;
  /** Air layer: flies straight over terrain and through ground bodies; only `targetsAir` attackers can hit it. */
  flying?: true;
  /** May attack flying units (ground targets are always allowed). */
  targetsAir?: true;
  /**
   * Roster preview: the simulation rules exist but the production model is not
   * published. Hidden from the command card, train commands and the AI unless
   * the match enables `rosterPreview`. Remove the flag when the model ships.
   */
  preview?: true;
}
export interface BuildingDefinition {
  name: string; cost: Cost; duration: number; hp: number; width: number; depth: number;
  supply: number; sight: number; requires: Requirements; accepts?: Array<'gold' | 'wood'>;
  /** Same gate as UnitDefinition.preview (no building needs it yet). */
  preview?: true;
}
const cost = (gold: number, wood = 0): Cost => ({ gold, wood });
const req = (tier = 1, ...buildings: BuildingKind[]): Requirements => ({ tier, buildings });
export const BUILDINGS: Record<BuildingKind, BuildingDefinition> = {
  townhall: {name:'領主府',cost:cost(380,160),duration:35,hp:1800,width:8,depth:8,supply:10,sight:20,requires:req(),accepts:['gold','wood']},
  house: {name:'民居',cost:cost(80,30),duration:10,hp:500,width:4,depth:4,supply:10,sight:10,requires:req()},
  barracks: {name:'兵營',cost:cost(150,60),duration:18,hp:1100,width:6,depth:6,supply:0,sight:12,requires:req()},
  lumbermill: {name:'伐木場',cost:cost(100,40),duration:14,hp:800,width:5,depth:5,supply:0,sight:12,requires:req(),accepts:['wood']},
  forge: {name:'鍛造所',cost:cost(130,80),duration:18,hp:950,width:5,depth:5,supply:0,sight:12,requires:req(1,'barracks')},
  altar: {name:'誓約祭壇',cost:cost(140,60),duration:18,hp:900,width:5,depth:5,supply:0,sight:14,requires:req(1,'barracks')},
  tower: {name:'守望塔',cost:cost(100,70),duration:16,hp:700,width:3,depth:3,supply:0,sight:18,requires:req(1,'lumbermill')},
  chapel: {name:'禮拜堂',cost:cost(160,100),duration:22,hp:1050,width:6,depth:6,supply:0,sight:12,requires:req(2)},
  stable: {name:'馬廄',cost:cost(180,100),duration:24,hp:1200,width:7,depth:6,supply:0,sight:12,requires:req(2,'forge')},
  workshop: {name:'工坊',cost:cost(200,140),duration:26,hp:1200,width:7,depth:6,supply:0,sight:12,requires:req(3,'forge')},
};
export const GUARD_MOTION = {version:1,locomotion:{clip:'Walk',strideMeters:2,cycleSeconds:2/3},attack:{clip:'Attack',durationSeconds:1.2,contactSeconds:16/30}} as const;
// Authored crossbow recoil at frame 16/24; siege bolt leaves its rail at
// source frame 13, exported relative to frame 1 at 24 fps.
export const PROJECTILE_RELEASE_SECONDS:Partial<Record<UnitKind,number>>={crossbow:16/24,siege:12/24,ranger:.4,'ranger-captain':.4};
export const UNITS: Record<UnitKind, UnitDefinition> = {
  worker: {name:'工人',cost:cost(50),duration:6,supply:1,hp:120,damage:5,armor:0,range:1.2,interval:1.5,speed:3.2,radius:.38,sight:12,mana:0,trainedAt:'townhall',requires:req(),attackType:'normal',armorType:'light'},
  guard: {name:'王國衛兵',cost:cost(95,15),duration:10,supply:2,hp:320,damage:20,armor:2,range:.58,interval:1.2,speed:3,radius:.48,sight:14,mana:0,trainedAt:'barracks',requires:req(),attackType:'normal',armorType:'heavy'},
  crossbow: {name:'弩手',cost:cost(110,40),duration:12,supply:2,hp:200,damage:24,armor:0,range:8,interval:1.7,speed:2.8,radius:.42,sight:16,mana:0,trainedAt:'barracks',requires:req(1,'lumbermill'),projectileSpeed:17,attackType:'pierce',armorType:'light',targetsAir:true},
  priest: {name:'牧師',cost:cost(130,50),duration:14,supply:2,hp:180,damage:8,armor:0,range:6,interval:1.8,speed:2.9,radius:.42,sight:14,mana:140,trainedAt:'chapel',requires:req(2),attackType:'normal',armorType:'light'},
  knight: {name:'騎士',cost:cost(200,70),duration:18,supply:4,hp:640,damage:38,armor:4,range:1.9,interval:1.4,speed:4.6,radius:.68,sight:16,mana:0,trainedAt:'stable',requires:req(2,'forge'),attackType:'normal',armorType:'cavalry'},
  siege: {name:'攻城車',cost:cost(230,140),duration:22,supply:5,hp:440,damage:52,armor:1,range:12,interval:3,speed:2,radius:.78,sight:16,mana:0,trainedAt:'workshop',requires:req(3,'forge'),projectileSpeed:12,buildingMultiplier:2.7,attackType:'siege',armorType:'heavy'},
  commander: {name:'誓衛統領',cost:cost(180,40),duration:16,supply:5,hp:720,damage:32,armor:3,range:1.8,interval:1.3,speed:3.4,radius:.5,sight:18,mana:200,trainedAt:'altar',requires:req(),attackType:'hero',armorType:'hero'},
  'neutral-raider': {name:'灰斗篷掠兵',cost:cost(0),duration:1,supply:0,hp:140,damage:10,armor:0,range:1.5,interval:1.4,speed:2.7,radius:.45,sight:10,mana:0,requires:req(),attackType:'normal',armorType:'light'},
  // Roster expansion: preview until each production model is published.
  pikeman: {name:'長槍兵',cost:cost(80,10),duration:9,supply:2,hp:270,damage:16,armor:1,range:1.1,interval:1.3,speed:3,radius:.46,sight:13,mana:0,trainedAt:'barracks',requires:req(),attackType:'spear',armorType:'heavy',preview:true},
  ranger: {name:'遊俠',cost:cost(120,50),duration:13,supply:2,hp:210,damage:18,armor:0,range:7,interval:1.3,speed:3.7,radius:.42,sight:20,mana:0,trainedAt:'barracks',requires:req(2,'lumbermill'),projectileSpeed:20,attackType:'pierce',armorType:'light',targetsAir:true,preview:true},
  mage: {name:'曦光法師',cost:cost(140,70),duration:16,supply:2,hp:170,damage:14,armor:0,range:7,interval:1.9,speed:2.8,radius:.42,sight:14,mana:180,trainedAt:'chapel',requires:req(2,'lumbermill'),attackType:'magic',armorType:'light',targetsAir:true,preview:true},
  gryphon: {name:'獅鷲騎士',cost:cost(260,100),duration:24,supply:4,hp:560,damage:34,armor:2,range:2.2,interval:1.6,speed:4.8,radius:.7,sight:18,mana:0,trainedAt:'stable',requires:req(3,'lumbermill'),attackType:'normal',armorType:'air',flying:true,targetsAir:true,preview:true},
  sage: {name:'曦光賢者',cost:cost(180,40),duration:16,supply:5,hp:540,damage:22,armor:1,range:6,interval:1.6,speed:3.2,radius:.5,sight:18,mana:260,trainedAt:'altar',requires:req(),attackType:'hero',armorType:'hero',targetsAir:true,preview:true},
  'ranger-captain': {name:'遊俠隊長',cost:cost(180,40),duration:16,supply:5,hp:620,damage:26,armor:2,range:7,interval:1.2,speed:4.2,radius:.5,sight:22,mana:200,trainedAt:'altar',requires:req(),projectileSpeed:20,attackType:'hero',armorType:'hero',targetsAir:true,preview:true},
};
/** Whether a roster-preview item may be used in this match (shipped items always). */
export const unlocked = (item: {preview?: true}, rosterPreview = false): boolean => !item.preview || !!rosterPreview;
export const RESEARCH: Record<ResearchId, {name:string;cost:Cost;duration:number;at:BuildingKind;requires:Requirements;previous?:ResearchId}> = {
  timber: {name:'精工斧具',cost:cost(100,80),duration:18,at:'lumbermill',requires:req()},
  weapons1: {name:'精鍛兵刃 I',cost:cost(100,60),duration:20,at:'forge',requires:req()},
  weapons2: {name:'精鍛兵刃 II',cost:cost(160,100),duration:24,at:'forge',requires:req(2),previous:'weapons1'},
  weapons3: {name:'精鍛兵刃 III',cost:cost(220,140),duration:28,at:'forge',requires:req(3),previous:'weapons2'},
  armor1: {name:'層疊護甲 I',cost:cost(100,60),duration:20,at:'forge',requires:req()},
  armor2: {name:'層疊護甲 II',cost:cost(160,100),duration:24,at:'forge',requires:req(2),previous:'armor1'},
  armor3: {name:'層疊護甲 III',cost:cost(220,140),duration:28,at:'forge',requires:req(3),previous:'armor2'},
};
export const TIER_UPGRADES: Record<2|3,{name:string;cost:Cost;duration:number;requires:Requirements}> = {
  2: {name:'城堡',cost:cost(280,160),duration:35,requires:req(1,'barracks','forge')},
  3: {name:'王城',cost:cost(420,240),duration:45,requires:{tier:2,anyBuildings:['chapel','stable']}},
};
/** point: ground target in sight; ally/enemy: a unit; self: confirm click (range is then the effect radius). */
export type SkillTarget = 'point' | 'ally' | 'enemy' | 'self';
export interface SkillDefinition {name:string;mana:number;cooldown:number;range:number;minLevel:number;hero:HeroKind;target:SkillTarget;radius?:number}
export const SKILLS: Record<SkillId,SkillDefinition> = {
  cleave:{name:'破陣斬',mana:45,cooldown:10,range:5,minLevel:1,hero:'commander',target:'point'},
  mend:{name:'戰地救援',mana:50,cooldown:12,range:10,minLevel:1,hero:'commander',target:'ally'},
  banner:{name:'王旗',mana:70,cooldown:25,range:8,minLevel:3,hero:'commander',target:'self'},
  sunburst:{name:'曦光爆裂',mana:60,cooldown:10,range:9,minLevel:1,hero:'sage',target:'point',radius:3},
  radiance:{name:'晨輝療癒',mana:70,cooldown:14,range:6,minLevel:1,hero:'sage',target:'self'},
  daybreak:{name:'破曉',mana:110,cooldown:30,range:10,minLevel:3,hero:'sage',target:'point',radius:5},
  volley:{name:'箭雨',mana:55,cooldown:9,range:10,minLevel:1,hero:'ranger-captain',target:'point',radius:3},
  sprint:{name:'疾行號令',mana:50,cooldown:18,range:7,minLevel:1,hero:'ranger-captain',target:'self'},
  mark:{name:'獵殺標記',mana:60,cooldown:20,range:11,minLevel:3,hero:'ranger-captain',target:'enemy'},
};
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
export const heroSkills = (hero: HeroKind): SkillId[] => SKILL_IDS.filter(id => SKILLS[id].hero === hero);
/** Mage autocast 曦光術: area damage plus a movement slow, paid with mana like the priest heal. */
export const MAGE_SPELL = {name:'曦光術',mana:45,cooldown:8,range:7,radius:2.5,damage:40,slowSeconds:4} as const;
/** Movement multipliers for slow (曦光術, 破曉) and haste (疾行號令); damage taken while marked (獵殺標記). */
export const SLOW_FACTOR = .6, HASTE_FACTOR = 1.5, MARK_FACTOR = 1.25;
export const XP_THRESHOLDS = [0,80,200,360,560] as const;
/** The house hint is appended to supply shortages in tooltips and notices but dropped on the narrow command card. */
export const SUPPLY_SHORTAGE_HINT=`，需建造${BUILDINGS.house.name}`;
/** One shared wording for command tooltips and rejected train commands. */
export const supplyShortage=(missing:number)=>`人口不足 ${missing}${SUPPLY_SHORTAGE_HINT}`;
export function requirementsMet(requires: Requirements, tier: number, buildings: BuildingKind[]): boolean {
  return tier >= requires.tier && (requires.buildings ?? []).every(k => buildings.includes(k))
    && (!requires.anyBuildings || requires.anyBuildings.some(k => buildings.includes(k)));
}
