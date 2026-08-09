import type { Move, MysticPower, PartyMember } from '../combat';
import { combatMoveDisplayName } from './combatReadability.m50';

export type MysticKind = 'mana' | 'favor';
export type MysticSchool = 'pyromancy' | 'cryomancy' | 'arcane' | 'theurgy';

export interface MysticMoveRule {
  kind: MysticKind;
  school: MysticSchool;
  cost: number;
  gain: number;
  overcast: boolean;
  strainRelief: number;
}

interface ArmoryMysticRuntime {
  mysticCapacityBonus?: Partial<Record<MysticKind, number>>;
}

const RULES: Record<string, MysticMoveRule> = {
  fireball: { kind: 'mana', school: 'pyromancy', cost: 2, gain: 0, overcast: true, strainRelief: 0 },
  'ice-spike': { kind: 'mana', school: 'cryomancy', cost: 1, gain: 0, overcast: true, strainRelief: 0 },
  'gravity-crush': { kind: 'mana', school: 'arcane', cost: 2, gain: 0, overcast: true, strainRelief: 0 },
  'frost-bind': { kind: 'mana', school: 'cryomancy', cost: 2, gain: 0, overcast: true, strainRelief: 0 },
  'meteor-fall': { kind: 'mana', school: 'pyromancy', cost: 4, gain: 0, overcast: true, strainRelief: 0 },
  'arcane-focus': { kind: 'mana', school: 'arcane', cost: 0, gain: 3, overcast: false, strainRelief: 1 },
  'salt-shard-throw': { kind: 'mana', school: 'cryomancy', cost: 2, gain: 0, overcast: false, strainRelief: 0 },
  'reliquary-silent-chorus': { kind: 'mana', school: 'arcane', cost: 3, gain: 0, overcast: false, strainRelief: 0 },
  'reliquary-lament-touch': { kind: 'mana', school: 'cryomancy', cost: 2, gain: 0, overcast: false, strainRelief: 0 },
  'reliquary-ember-breath': { kind: 'mana', school: 'pyromancy', cost: 4, gain: 0, overcast: false, strainRelief: 0 },
  'chain-lightning': { kind: 'mana', school: 'pyromancy', cost: 3, gain: 0, overcast: true, strainRelief: 0 },
  'corrosive-curse': { kind: 'mana', school: 'arcane', cost: 2, gain: 0, overcast: true, strainRelief: 0 },
  'holy-strike': { kind: 'favor', school: 'theurgy', cost: 0, gain: 1, overcast: false, strainRelief: 0 },
  heal: { kind: 'favor', school: 'theurgy', cost: 1, gain: 0, overcast: false, strainRelief: 0 },
  'holy-nova': { kind: 'favor', school: 'theurgy', cost: 2, gain: 0, overcast: false, strainRelief: 0 },
  'battle-hymn': { kind: 'favor', school: 'theurgy', cost: 2, gain: 0, overcast: false, strainRelief: 0 },
  'greater-heal': { kind: 'favor', school: 'theurgy', cost: 3, gain: 0, overcast: false, strainRelief: 0 },
  'field-prayer': { kind: 'favor', school: 'theurgy', cost: 0, gain: 1, overcast: false, strainRelief: 0 },
};

export const MYSTIC_KIND_LABELS: Record<MysticKind, string> = { mana: '秘法', favor: '神恩' };
export const MYSTIC_SCHOOL_LABELS: Record<MysticSchool, string> = {
  pyromancy: '炎術', cryomancy: '霜術', arcane: '秘術', theurgy: '神術',
};

export const ARCANE_FOCUS_MOVE: Move = {
  id: 'arcane-focus', name: '秘法護持', kind: 'support', target: 'ally', hitStat: 'int',
  applyStatus: { kind: 'ward', duration: 1, potency: 4 },
  narration: '{actor}收束散亂的魔力，將重排的符文化作護幕覆在{target}身上。',
};

export const FIELD_PRAYER_MOVE: Move = {
  id: 'field-prayer', name: '戰地祝禱', kind: 'support', target: 'ally', hitStat: 'cha',
  applyStatus: { kind: 'ward', duration: 1, potency: 3 },
  narration: '{actor}低聲重申誓詞，讓神恩回應並護佑{target}。',
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function mysticRuleForMove(move: Move): MysticMoveRule | null {
  const explicit = RULES[move.id];
  if (explicit) return explicit;
  if (move.hitStat === 'int' && (move.element === 'fire' || move.element === 'frost')) {
    return { kind: 'mana', school: move.element === 'fire' ? 'pyromancy' : 'cryomancy', cost: move.area ? 3 : 2, gain: 0, overcast: true, strainRelief: 0 };
  }
  if (move.hitStat === 'cha' && (move.element === 'holy' || move.heal)) {
    return { kind: 'favor', school: 'theurgy', cost: move.area || (move.heal?.dice ?? 0) >= 2 ? 2 : 1, gain: 0, overcast: false, strainRelief: 0 };
  }
  return null;
}

function stripM50Suffix(name: string): string {
  return name
    .replace(/〔(?:前進(?:・守勢)?(?:・盾\+\d+)?|後撤|輪替後撤|無人接替)〕$/u, '')
    .replace(/〔(?:近戰|遠程)(?: -2)?〕$/u, '')
    .replace(/〔(?:近戰|遠程)・(?:命中 -2|站位適配)〕$/u, '')
    .replace(/〔(?:護衛|自保)(?:・盾\+\d+)?〕$/u, '')
    .replace(/〔守勢・(?:可護衛|自保)(?:・盾\+\d+)?〕$/u, '');
}

function decoratedMove(move: Move): Move {
  const cleanName = stripM50Suffix(move.name);
  const cleanMove = cleanName === move.name ? move : { ...move, name: cleanName };
  const rule = mysticRuleForMove(cleanMove);
  if (!rule || cleanMove.name.includes('〔')) return { ...cleanMove };
  const resource = MYSTIC_KIND_LABELS[rule.kind];
  const school = MYSTIC_SCHOOL_LABELS[rule.school];
  const suffix = rule.cost > 0 ? `${resource} ${rule.cost}` : rule.gain > 0 ? `${resource} +${rule.gain}` : resource;
  return { ...cleanMove, name: `${school}・${cleanMove.name}〔${suffix}〕` };
}

function readableCombatMove(member: PartyMember, move: Move): Move {
  const decorated = decoratedMove(move);
  if (member.formationRow === undefined) return decorated;

  const baseForForecast = { ...decorated, name: stripM50Suffix(decorated.name) };
  const mystical = !!mysticRuleForMove(baseForForecast);
  const readable: Move = { ...decorated };
  if (readable.kind === 'guard') {
    readable.narration = '{actor}穩住腳步，以武器與護具架起防禦。';
  }
  if (readable.id === 'shield-bash') {
    Object.defineProperty(readable, 'narration', {
      enumerable: true,
      configurable: true,
      get: () => member.armoryProfile?.shieldReady
        ? '{actor}以盾面與全身重量撞向{target}，造成 {amount} 點傷害並將其震得失去平衡！'
        : '{actor}以肩甲、護具與武器架勢強行撞開{target}，造成 {amount} 點傷害並將其震得失去平衡！',
    });
  }
  Object.defineProperty(readable, 'name', {
    enumerable: true,
    configurable: true,
    get: () => combatMoveDisplayName(member, baseForForecast, mystical),
  });
  return readable;
}

function maximumPower(member: PartyMember, kind: MysticKind): number {
  const bonus = (member as PartyMember & ArmoryMysticRuntime).mysticCapacityBonus?.[kind] ?? 0;
  if (kind === 'mana') return clamp(4 + Math.floor(member.stats.int / 5) + bonus, 3, 12);
  return clamp(2 + Math.floor(member.stats.cha / 5) + bonus, 2, 10);
}

function powerFor(member: PartyMember, kind: MysticKind): MysticPower {
  const max = maximumPower(member, kind);
  return { kind, max, current: kind === 'mana' ? max : 1, strain: 0 };
}

export function prepareMysticPartyMember(member: PartyMember): PartyMember {
  const copiedMoves = member.moves.map((move) => ({ ...move }));
  const hasMana = copiedMoves.some((move) => mysticRuleForMove(move)?.kind === 'mana');
  const hasFavor = copiedMoves.some((move) => mysticRuleForMove(move)?.kind === 'favor');
  const expanded = [...copiedMoves];
  if (hasMana && !expanded.some((move) => move.id === ARCANE_FOCUS_MOVE.id)) expanded.push({ ...ARCANE_FOCUS_MOVE });
  if (!hasMana && hasFavor && !expanded.some((move) => move.id === FIELD_PRAYER_MOVE.id)) expanded.push({ ...FIELD_PRAYER_MOVE });
  const kind: MysticKind | null = hasMana ? 'mana' : hasFavor ? 'favor' : null;
  member.moves = expanded.map((move) => readableCombatMove(member, move));
  member.mystic = kind ? powerFor(member, kind) : undefined;
  return member;
}

export function mysticPowerText(power: MysticPower | undefined): string {
  if (!power) return '';
  const strain = power.kind === 'mana' && power.strain > 0 ? `｜灼傷 ${power.strain}` : '';
  return `${MYSTIC_KIND_LABELS[power.kind]} ${power.current}/${power.max}${strain}`;
}
