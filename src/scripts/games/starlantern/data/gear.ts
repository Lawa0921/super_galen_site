import type { AnyStat, Effect, GearSlot, Rarity, Sheet, SkillRules, Target, Element, WeaponKind } from '../engine/types';
import type { RegionId } from './regions';

export const GEAR_SLOTS: GearSlot[] = ['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'neck', 'ring'];
export const RARITIES: Rarity[] = ['common', 'magic', 'rare', 'epic', 'legendary', 'unique', 'set'];
export const RARITY_RANK: Record<Rarity, number> = { common: 0, magic: 1, rare: 2, epic: 3, legendary: 4, unique: 5, set: 6 };
/** Plan 5g: the rarities a starlit drop can have (a legendary-tier special; ItemInstance.starlit). */
export const STARLIT_RARITIES: readonly Rarity[] = ['legendary', 'unique', 'set'];
export const AFFIX_COUNT = { magic: [1, 2], rare: [3, 4], epic: [4, 5], legendary: [3, 3] } as const;
/** Lowest share of an affix's range a roll of this rarity can land on. */
export const ROLL_FLOOR: Record<Rarity, number> = { common: 0, magic: 0, rare: 0.25, epic: 0.5, legendary: 0.5, unique: 0.9, set: 0.75 };
/**
 * The two loot balance knobs, tuned against engine/balance.test.ts tests 10–11 (a party in random gear keeps the bands;
 * a full rare kit does not one-round a boss). Change them only with those tests.
 * AFFIX_SCALE: the one global multiplier on every affix roll range.
 */
export const AFFIX_SCALE = 0.8;
/** IMPLICIT_PER_ILVL: a base's own bonus grows by this share per item level above the base's level. */
export const IMPLICIT_PER_ILVL = 0.02;

/** Carry weight by slot. */
export const SLOT_WEIGHT: Record<GearSlot, number> = { weapon: 6, offhand: 5, head: 4, body: 8, hands: 4, feet: 4, neck: 3, ring: 3 };

/** `lo` and `hi` are the roll range at item level 1 and at item level 50. */
export interface AffixDef { slots: GearSlot[]; lo: [number, number]; hi: [number, number] }

const LETTER: Record<string, GearSlot> = { W: 'weapon', O: 'offhand', H: 'head', B: 'body', G: 'hands', F: 'feet', N: 'neck', R: 'ring' };
const slotsOf = (letters: string): GearSlot[] => [...letters].map((c) => LETTER[c]);

function pool(keys: AnyStat[], letters: string, lo: [number, number], hi: [number, number]): [AnyStat, AffixDef][] {
  return keys.map((k) => [k, { slots: slotsOf(letters), lo, hi }]);
}

export const AFFIXES = Object.fromEntries([
  ...pool(['str', 'int', 'agi', 'wil'], 'WOHBGFNR', [1, 2], [10, 18]),
  ...pool(['atk'], 'WGR', [1, 2], [12, 20]),
  ...pool(['mag'], 'WONR', [1, 2], [12, 20]),
  ...pool(['hp'], 'OHBFN', [5, 10], [60, 110]),
  ...pool(['def'], 'OHBGF', [1, 2], [10, 16]),
  ...pool(['res'], 'OHBN', [1, 2], [10, 16]),
  ...pool(['spd'], 'GFN', [1, 1], [4, 7]),
  ...pool(['tp'], 'OHNR', [2, 4], [12, 20]),
  ...pool(['crit'], 'WGNR', [1, 2], [4, 7]),
  ...pool(['critDmg'], 'WGR', [5, 10], [20, 35]),
  ...pool(['vuln'], 'WN', [3, 6], [10, 18]),
  ...pool(['eliteDmg'], 'WOR', [3, 6], [10, 18]),
  ...pool(['multi'], 'WG', [2, 4], [6, 10]),
  ...pool(['armor'], 'OHBGF', [4, 8], [150, 250]),
  ...pool(['evasion'], 'HGFN', [4, 8], [150, 250]),
  ...pool(['block'], 'O', [3, 6], [10, 16]),
  ...pool(['meleeDR'], 'OB', [2, 3], [6, 10]),
  ...pool(['rangedDR'], 'HB', [2, 3], [6, 10]),
  ...pool(['fireRes', 'iceRes', 'thunderRes'], 'OHBFNR', [3, 6], [12, 20]),
  ...pool(['fireDmg', 'iceDmg', 'thunderDmg'], 'WNR', [3, 6], [12, 20]),
  ...pool(['poisonRes', 'sleepRes'], 'HFN', [5, 10], [20, 35]),
  ...pool(['tpRegen'], 'NR', [1, 1], [2, 3]),
  ...pool(['tpCost'], 'HN', [3, 5], [8, 12]),
  ...pool(['gauge'], 'BNR', [3, 6], [10, 16]),
  ...pool(['heal'], 'WON', [3, 6], [10, 18]),
  ...pool(['goldFind'], 'HNR', [5, 10], [20, 35]),
  ...pool(['matFind'], 'GNR', [5, 10], [20, 35]),
  ...pool(['expBonus'], 'NR', [2, 4], [6, 10]),
]) as Record<AnyStat, AffixDef>;

/** Roll range at an item level: linear between level 1 and 50, carried on past 50 along the same line; below 1 counts as 1. */
export function affixRange(key: AnyStat, ilvl: number): [number, number] {
  const a = AFFIXES[key];
  const t = (Math.max(1, ilvl) - 1) / 49;
  const at = (i: 0 | 1) => (a.lo[i] + (a.hi[i] - a.lo[i]) * t) * AFFIX_SCALE;
  return [at(0), at(1)];
}

/** How a power rewrites the skill it names (applied by the battle engine). */
export interface SkillMod {
  hits?: number; target?: Target; element?: Element; hpCost?: number; turns?: number; chance?: number;
  /** Scales damage, heal and device power. Never a buff's or debuff's percent: that is `buffPct`. */
  powerPct?: number;
  /** Scales the percent of every buff and debuff the skill applies (not ones added by `extra`). */
  buffPct?: number;
  /** Relative: percentage points added to powerPct (from 100 when it has none); stacked deltas add up. */
  powerDelta?: number;
  /** Relative: turns added to every effect that lasts, after `turns`; stacked deltas add up. */
  turnsDelta?: number;
  /** Added to a TP-costing skill's cost (floored at 1); a free skill stays free. */
  tpDelta?: number;
  extra?: Effect[];
  /** A variant's label and rule (plan 8d): the label goes after the skill's name (・label), the rule after its words. */
  notes?: { label: string; text: string }[];
  /** Rules the variant writes on the skill, merged key by key (engine/types SkillRules). */
  rules?: Partial<SkillRules>;
}
export interface PowerDef { id: string; skill: string; text: string; mod: SkillMod }

const POWER_LIST: PowerDef[] = [
  { id: 'lg-noel', skill: 'fire-star', text: '火之星彈改為打全體，威力 70%', mod: { target: 'enemies', powerPct: 70 } },
  { id: 'lg-chizuru', skill: 'sweep', text: '橫掃打 2 次，威力 65%', mod: { hits: 2, powerPct: 65 } },
  { id: 'lg-liz', skill: 'twin-slash', text: '雙刃改為 3 段', mod: { hits: 3 } },
  { id: 'lg-sylvie', skill: 'aimed-shot', text: '瞄準射擊額外使目標防禦 −20%，持續 3 回合', mod: { extra: [{ kind: 'buff', stat: 'def', pct: -20, turns: 3 }] } },
  { id: 'lg-scarlet', skill: 'provoke', text: '挑釁額外使自己防禦 +25%，持續 3 回合', mod: { extra: [{ kind: 'buff', stat: 'def', pct: 25, turns: 3 }] } },
  { id: 'lg-selene', skill: 'moonlight', text: '月光改為治療全體，威力 60%', mod: { target: 'allies', powerPct: 60 } },
  { id: 'lg-safira', skill: 'blade-dance', text: '刃舞改為 4 段', mod: { hits: 4 } },
  { id: 'lg-bobby', skill: 'turret', text: '砲台持續回合固定為 5（雙砲台的 +2 回合不再疊加）', mod: { turns: 5 } },
  { id: 'blaze-heart-sword', skill: 'flame-burst', text: '爆炎斬不再消耗 HP', mod: { hpCost: 0 } },
  { id: 'frost-bloom-neck', skill: 'ice-star', text: '冰之星彈改為打全體，威力 70%', mod: { target: 'enemies', powerPct: 70 } },
  { id: 'storm-thunder-bow', skill: 'aimed-shot', text: '瞄準射擊改為雷屬性，威力 120%', mod: { element: 'thunder', powerPct: 120 } },
  { id: 'mire-whisper-gloves', skill: 'rin-venom-needle', text: '毒針必定使目標中毒（頭目減半）', mod: { chance: 1 } },
  { id: 'shade-silent-blade', skill: 'rin-needle', text: '飛針改為 3 段', mod: { hits: 3 } },
  { id: 'iron-bulwark-plate', skill: 'iron-wall', text: '鐵壁改為作用全體，威力 50%', mod: { target: 'allies', buffPct: 50 } },
];
export const POWERS: Record<string, PowerDef> = Object.fromEntries(POWER_LIST.map((p) => [p.id, p]));

export interface SpecialDef {
  id: string; name: string; rarity: 'legendary' | 'unique' | 'set'; slot: GearSlot; region: RegionId | null;
  source: 'any' | 'elite' | 'boss'; power?: string; fixed?: AnyStat[]; set?: string; lore: string;
  /** Set on every weapon: what the hero's basic attack and mastery follow (data/equipment.ts weaponKindOf). */
  weaponKind?: WeaponKind;
}
export interface SetDef {
  id: string; name: string; region: RegionId; pieces: string[]; two: Partial<Sheet>; four: Partial<Sheet>;
}

type Row = [id: string, name: string, slot: GearSlot, region: RegionId | null, lore: string];
const legendary = ([id, name, slot, region, lore]: Row, source: SpecialDef['source'] = 'any'): SpecialDef =>
  ({ id, name, rarity: 'legendary', slot, region, source, power: id, lore });
const unique = ([id, name, slot, region, lore]: Row, fixed: AnyStat[], source: SpecialDef['source'] = 'any'): SpecialDef =>
  ({ id, name, rarity: 'unique', slot, region, source, fixed, lore });

const SPECIAL_LIST: SpecialDef[] = [
  legendary(['lg-noel', '群星之戒', 'ring', null, '諾艾兒把整片星空縫進指環，一彈便落滿地星火。']),
  legendary(['lg-chizuru', '雙月槍', 'weapon', null, '槍身兩道彎月，橫掃時像兩輪月牙先後掠過。']),
  legendary(['lg-liz', '三叉刃', 'weapon', null, '多出的那一道刃，是莉茲用來說服別人的第三句話。']),
  legendary(['lg-sylvie', '破甲箭袋', 'offhand', null, '袋中的箭頭刻著細溝，專挑鎧甲的縫隙。']),
  legendary(['lg-scarlet', '挑戰者紋章', 'neck', null, '誰佩上它，誰就成了所有敵人的頭號目標，也成了最硬的那面牆。']),
  legendary(['lg-selene', '滿月頭冠', 'head', null, '滿月之夜鑄成，月光不再只照一人。']),
  legendary(['lg-safira', '四拍舞靴', 'feet', null, '舞步多了一拍，刀光便多了一道。']),
  legendary(['lg-bobby', '長效齒輪手套', 'hands', null, '波比在齒輪裡多裝了一圈彈簧，砲台因此不容易停下。']),

  legendary(['blaze-heart-sword', '灼心之劍', 'weapon', 'blaze', '劍心仍在燃燒，持劍者卻不再被火舌反噬。']),
  unique(['blaze-ember-ring', '餘燼指環', 'ring', 'blaze', '火焰熄滅之後，只剩餘燼還記得溫度。'], ['fireDmg', 'fireRes', 'atk']),
  unique(['frost-winter-staff', '永冬權杖', 'weapon', 'frost', '權杖所指之處，季節停在最冷的那一天。'], ['mag', 'iceDmg', 'int']),
  legendary(['frost-bloom-neck', '霜華頸鍊', 'neck', 'frost', '一朵冰花凝在鍊墜，綻放時整片霜凍之地都為之震動。']),
  legendary(['storm-thunder-bow', '疾雷之弓', 'weapon', 'storm', '弦響之前，雷聲已先一步落地。']),
  unique(['storm-swift-boots', '迅雷之靴', 'feet', 'storm', '穿上它的人，總是比雷聲先到。'], ['spd', 'agi', 'evasion']),
  unique(['mire-miasma-mask', '瘴氣面具', 'head', 'mire', '面具內側浸滿沼氣，戴久了連毒也學會了客氣。'], ['poisonRes', 'hp', 'armor']),
  legendary(['mire-whisper-gloves', '沼語手套', 'hands', 'mire', '指尖低語著沼澤的咒文，句句都帶毒。']),
  legendary(['shade-silent-blade', '無聲之刃', 'weapon', 'shade', '它出鞘時沒有任何聲響，只多了一道看不見的傷口。'], 'elite'),
  unique(['shade-raven-cloak', '夜鴉披風', 'body', 'shade', '披風展開，便只剩一片羽影。'], ['evasion', 'agi', 'crit']),
  unique(['iron-unbroken-shield', '不破之盾', 'offhand', 'iron', '千次重擊之後，盾面仍沒有一道裂痕。'], ['block', 'armor', 'meleeDR'], 'boss'),
  legendary(['iron-bulwark-plate', '鐵壁胸甲', 'body', 'iron', '胸甲張開的一瞬，整支隊伍都站進了同一面牆後。']),
];

const NOUN: Record<GearSlot, string> = {
  weapon: '之刃', offhand: '之盾', head: '之冠', body: '之鎧', hands: '之手甲', feet: '之靴', neck: '之鍊', ring: '之戒',
};

const SET_DEFS: { id: string; stem: string; region: RegionId; slots: GearSlot[]; theme: AnyStat[]; two: Partial<Sheet>; four: Partial<Sheet> }[] = [
  { id: 'set-blaze', stem: '焰紋', region: 'blaze', slots: ['weapon', 'body', 'hands', 'ring'], theme: ['fireDmg', 'atk', 'str'], two: { fireDmg: 15 }, four: { crit: 8, fireDmg: 20 } },
  { id: 'set-frost', stem: '霜語', region: 'frost', slots: ['weapon', 'head', 'neck', 'ring'], theme: ['iceDmg', 'mag', 'int'], two: { iceDmg: 15 }, four: { tpCost: 15, iceRes: 20 } },
  { id: 'set-storm', stem: '雷鳴', region: 'storm', slots: ['weapon', 'hands', 'feet', 'ring'], theme: ['thunderDmg', 'spd', 'agi'], two: { thunderDmg: 15 }, four: { multi: 12, spd: 5 } },
  { id: 'set-mire', stem: '沼行', region: 'mire', slots: ['head', 'body', 'feet', 'neck'], theme: ['poisonRes', 'hp', 'wil'], two: { poisonRes: 30 }, four: { heal: 20, tpRegen: 2 } },
  { id: 'set-shade', stem: '夜幕', region: 'shade', slots: ['weapon', 'head', 'hands', 'feet'], theme: ['evasion', 'crit', 'agi'], two: { crit: 6 }, four: { critDmg: 30, vuln: 15 } },
  { id: 'set-iron', stem: '鐵壁', region: 'iron', slots: ['offhand', 'head', 'body', 'feet'], theme: ['armor', 'def', 'str'], two: { meleeDR: 10 }, four: { block: 15, rangedDR: 10 } },
];

const SET_PIECES: SpecialDef[] = SET_DEFS.flatMap((s) => s.slots.map((slot): SpecialDef => ({
  id: `${s.id}-${slot}`, name: `${s.stem}${NOUN[slot]}`, rarity: 'set', slot, region: s.region, source: 'any', set: s.id,
  fixed: s.theme.slice(0, slot === 'weapon' || slot === 'body' ? 3 : 2), lore: `${s.stem}套裝的一件，湊齊整套才顯出真正的力量。`,
})));

export const SETS: Record<string, SetDef> = Object.fromEntries(SET_DEFS.map((s) => [s.id, {
  id: s.id, name: `${s.stem}套裝`, region: s.region, pieces: s.slots.map((slot) => `${s.id}-${slot}`), two: s.two, four: s.four,
}]));

/** The kind of each legendary and unique weapon, by its name: 槍 and 叉 spear, 劍 sword, 杖 staff, 弓 bow, 刃 dagger. */
const SPECIAL_WEAPON_KIND: Record<string, WeaponKind> = {
  'lg-chizuru': 'spear', 'lg-liz': 'spear', 'blaze-heart-sword': 'sword', 'frost-winter-staff': 'staff',
  'storm-thunder-bow': 'bow', 'shade-silent-blade': 'dagger',
};
/** Set weapons are all named "...之刃" and are swords. */
const withKind = (s: SpecialDef): SpecialDef => s.slot !== 'weapon' ? s : { ...s, weaponKind: s.set ? 'sword' : SPECIAL_WEAPON_KIND[s.id] };

export const SPECIALS: Record<string, SpecialDef> = Object.fromEntries([...SPECIAL_LIST, ...SET_PIECES].map(withKind).map((s) => [s.id, s]));

/** A region's legendary and unique; set pieces are reached through SETS. */
export function regionSpecials(region: RegionId): SpecialDef[] {
  return SPECIAL_LIST.filter((s) => s.region === region);
}

/** The eight character legendaries, which drop anywhere. */
export function generalLegendaries(): SpecialDef[] {
  return SPECIAL_LIST.filter((s) => s.region === null && s.rarity === 'legendary');
}

/** Display name of a special item or a set; an unknown id comes back as itself. */
export function codexName(id: string): string {
  return SPECIALS[id]?.name ?? SETS[id]?.name ?? id;
}
