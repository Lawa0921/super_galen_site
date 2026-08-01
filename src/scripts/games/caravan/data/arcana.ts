import type { Move, MysticPower, PartyMember } from '../combat';

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

const RULES: Record<string, MysticMoveRule> = {
  // 法師核心：炎術偏爆發，霜術偏節制與控制。
  fireball: { kind: 'mana', school: 'pyromancy', cost: 2, gain: 0, overcast: true, strainRelief: 0 },
  'ice-spike': { kind: 'mana', school: 'cryomancy', cost: 1, gain: 0, overcast: true, strainRelief: 0 },
  'gravity-crush': { kind: 'mana', school: 'arcane', cost: 2, gain: 0, overcast: true, strainRelief: 0 },
  'frost-bind': { kind: 'mana', school: 'cryomancy', cost: 2, gain: 0, overcast: true, strainRelief: 0 },
  'meteor-fall': { kind: 'mana', school: 'pyromancy', cost: 4, gain: 0, overcast: true, strainRelief: 0 },
  'arcane-focus': { kind: 'mana', school: 'arcane', cost: 0, gain: 3, overcast: false, strainRelief: 1 },

  // 教士核心：聖擊建立神恩，奇蹟消耗神恩。
  'holy-strike': { kind: 'favor', school: 'theurgy', cost: 0, gain: 1, overcast: false, strainRelief: 0 },
  heal: { kind: 'favor', school: 'theurgy', cost: 1, gain: 0, overcast: false, strainRelief: 0 },
  'holy-nova': { kind: 'favor', school: 'theurgy', cost: 2, gain: 0, overcast: false, strainRelief: 0 },
  'battle-hymn': { kind: 'favor', school: 'theurgy', cost: 2, gain: 0, overcast: false, strainRelief: 0 },
  'greater-heal': { kind: 'favor', school: 'theurgy', cost: 3, gain: 0, overcast: false, strainRelief: 0 },
  'field-prayer': { kind: 'favor', school: 'theurgy', cost: 0, gain: 1, overcast: false, strainRelief: 0 },
};

export const MYSTIC_KIND_LABELS: Record<MysticKind, string> = {
  mana: '秘法',
  favor: '神恩',
};

export const MYSTIC_SCHOOL_LABELS: Record<MysticSchool, string> = {
  pyromancy: '炎術',
  cryomancy: '霜術',
  arcane: '秘術',
  theurgy: '神術',
};

export const ARCANE_FOCUS_MOVE: Move = {
  id: 'arcane-focus',
  name: '秘法專注',
  kind: 'support',
  target: 'self',
  hitStat: 'int',
  narration: '{actor}收束散亂的魔力，在呼吸間重新排列符文。',
};

export const FIELD_PRAYER_MOVE: Move = {
  id: 'field-prayer',
  name: '戰地禱告',
  kind: 'support',
  target: 'self',
  hitStat: 'cha',
  narration: '{actor}低聲重申誓詞，讓神恩再次回應。',
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * 未逐招登記的裝備／專精法術仍會依命中屬性與傷害屬性取得保守規則，
 * 避免日後新增魔法招式時意外繞過秘法或神恩成本。
 */
export function mysticRuleForMove(move: Move): MysticMoveRule | null {
  const explicit = RULES[move.id];
  if (explicit) return explicit;
  if (move.hitStat === 'int' && (move.element === 'fire' || move.element === 'frost')) {
    return {
      kind: 'mana',
      school: move.element === 'fire' ? 'pyromancy' : 'cryomancy',
      cost: move.area ? 3 : 2,
      gain: 0,
      overcast: true,
      strainRelief: 0,
    };
  }
  if (move.hitStat === 'cha' && (move.element === 'holy' || move.heal)) {
    return {
      kind: 'favor',
      school: 'theurgy',
      cost: move.area || (move.heal?.dice ?? 0) >= 2 ? 2 : 1,
      gain: 0,
      overcast: false,
      strainRelief: 0,
    };
  }
  return null;
}

function decoratedMove(move: Move): Move {
  const rule = mysticRuleForMove(move);
  if (!rule) return { ...move };
  const resource = MYSTIC_KIND_LABELS[rule.kind];
  const school = MYSTIC_SCHOOL_LABELS[rule.school];
  const suffix = rule.cost > 0
    ? `${resource} ${rule.cost}`
    : rule.gain > 0
      ? `${resource} +${rule.gain}`
      : resource;
  return { ...move, name: `${school}・${move.name}〔${suffix}〕` };
}

function maximumPower(member: PartyMember, kind: MysticKind): number {
  if (kind === 'mana') return clamp(4 + Math.floor(member.stats.int / 5), 5, 9);
  return clamp(2 + Math.floor(member.stats.cha / 5), 4, 7);
}

function powerFor(member: PartyMember, kind: MysticKind): MysticPower {
  const max = maximumPower(member, kind);
  return {
    kind,
    max,
    current: kind === 'mana' ? max : 1,
    strain: 0,
  };
}

/** 建立戰鬥用副本，不修改角色存檔或共用的 JOBS 招式物件。 */
export function prepareMysticPartyMember(member: PartyMember): PartyMember {
  const copiedMoves = member.moves.map((move) => ({ ...move }));
  const hasMana = copiedMoves.some((move) => mysticRuleForMove(move)?.kind === 'mana');
  const hasFavor = copiedMoves.some((move) => mysticRuleForMove(move)?.kind === 'favor');
  const expanded = [...copiedMoves];
  if (hasMana && !expanded.some((move) => move.id === ARCANE_FOCUS_MOVE.id)) expanded.push({ ...ARCANE_FOCUS_MOVE });
  if (!hasMana && hasFavor && !expanded.some((move) => move.id === FIELD_PRAYER_MOVE.id)) expanded.push({ ...FIELD_PRAYER_MOVE });
  const kind: MysticKind | null = hasMana ? 'mana' : hasFavor ? 'favor' : null;
  return {
    ...member,
    stats: { ...member.stats },
    statuses: member.statuses?.map((status) => ({ ...status })) ?? [],
    moves: expanded.map(decoratedMove),
    mystic: kind ? powerFor(member, kind) : undefined,
  };
}

export function mysticPowerText(power: MysticPower | undefined): string {
  if (!power) return '';
  const strain = power.kind === 'mana' && power.strain > 0 ? `｜灼傷 ${power.strain}` : '';
  return `${MYSTIC_KIND_LABELS[power.kind]} ${power.current}/${power.max}${strain}`;
}
