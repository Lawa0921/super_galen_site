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
  // M44：鹽晶亡魂的投刃由寒鹽魔力凝成，敵方同樣受秘法資源限制。
  'salt-shard-throw': { kind: 'mana', school: 'cryomancy', cost: 2, gain: 0, overcast: false, strainRelief: 0 },
  // M44：無舌領唱者是以亡魂秘法模仿聖歌，不應同時要求另一條神恩資源。
  'reliquary-silent-chorus': { kind: 'mana', school: 'arcane', cost: 3, gain: 0, overcast: false, strainRelief: 0 },
  'reliquary-lament-touch': { kind: 'mana', school: 'cryomancy', cost: 2, gain: 0, overcast: false, strainRelief: 0 },
  // M45：心火吐息是古龍心火術式，不再被當成無限免費的魅力系普通攻擊。
  'reliquary-ember-breath': { kind: 'mana', school: 'pyromancy', cost: 4, gain: 0, overcast: false, strainRelief: 0 },
  // M44：兩個 Lv4 法師專精的代表招式明確歸屬學派，不再只靠元素 fallback 推斷。
  'chain-lightning': { kind: 'mana', school: 'pyromancy', cost: 3, gain: 0, overcast: true, strainRelief: 0 },
  'corrosive-curse': { kind: 'mana', school: 'arcane', cost: 2, gain: 0, overcast: true, strainRelief: 0 },

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

/**
 * M44：秘法恢復不再只是空過一回合。
 * 施法者在收束魔力時，可把護幕覆到一名隊友身上；護法只抵擋下一次魔法命中。
 */
export const ARCANE_FOCUS_MOVE: Move = {
  id: 'arcane-focus',
  name: '秘法護持',
  kind: 'support',
  target: 'ally',
  hitStat: 'int',
  applyStatus: { kind: 'ward', duration: 1, potency: 4 },
  narration: '{actor}收束散亂的魔力，將重排的符文化作護幕覆在{target}身上。',
};

/** M44：戰地禱告同時把一次神聖護佑交給一名隊友。 */
export const FIELD_PRAYER_MOVE: Move = {
  id: 'field-prayer',
  name: '戰地祝禱',
  kind: 'support',
  target: 'ally',
  hitStat: 'cha',
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

function stripM50Suffix(name: string): string {
  return name
    .replace(/〔(?:近戰|遠程)(?: -2)?〕$/u, '')
    .replace(/〔(?:近戰|遠程)・(?:命中 -2|站位適配)〕$/u, '')
    .replace(/〔(?:護衛|自保)〕$/u, '')
    .replace(/〔守勢・(?:可護衛|自保)〕$/u, '');
}

function decoratedMove(move: Move): Move {
  const cleanName = stripM50Suffix(move.name);
  const cleanMove = cleanName === move.name ? move : { ...move, name: cleanName };
  const rule = mysticRuleForMove(cleanMove);
  if (!rule || cleanMove.name.includes('〔')) return { ...cleanMove };
  const resource = MYSTIC_KIND_LABELS[rule.kind];
  const school = MYSTIC_SCHOOL_LABELS[rule.school];
  const suffix = rule.cost > 0
    ? `${resource} ${rule.cost}`
    : rule.gain > 0
      ? `${resource} +${rule.gain}`
      : resource;
  return { ...cleanMove, name: `${school}・${cleanMove.name}〔${suffix}〕` };
}

function readableCombatMove(member: PartyMember, move: Move): Move {
  const decorated = decoratedMove(move);
  // 敵人沒有玩家編隊 row，不額外灌入玩家站位 UI；維持公開意圖文案乾淨。
  if (member.formationRow === undefined) return decorated;

  const baseForForecast = { ...decorated, name: stripM50Suffix(decorated.name) };
  const mystical = !!mysticRuleForMove(baseForForecast);
  const readable: Move = { ...decorated };
  if (readable.kind === 'guard') {
    readable.narration = '{actor}穩住腳步，以武器與護具架起防禦。';
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
  return {
    kind,
    max,
    current: kind === 'mana' ? max : 1,
    strain: 0,
  };
}

/**
 * 雖沿用 M41 名稱，M44 開始敵人也會走同一條初始化路徑。
 * EnemyUnit 在結構上相容 PartyMember（額外欄位不影響），因此可共享同一套魔力公平規則。
 * M50 再把玩家目前前後排對招式的影響直接灌進 runtime 名稱，所有戰鬥頁自動共用。
 */
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
