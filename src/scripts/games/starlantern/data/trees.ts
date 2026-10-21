import type { CharacterId, Effect } from '../engine/types';
import { AILMENT_IDS, type AilmentId } from '../engine/ailments';
import { MOON } from '../engine/mech';
import type { SkillMod } from './gear';
import { SKILLS } from './skills';
import { T } from './text.zh-TW';

/**
 * Skill trees. A branch holds five cells and the array index is the tier (0-4; tier 4 is the ultimate cell). A cell is one
 * node, or a pair (plan 8d): the A node carries its B node in `pair`, the two on the same tier, of the same kind and maxRank,
 * and only one side of a pair may hold points. Read a branch through `tierNodes` / `branchNodes` to see the B nodes too.
 *
 * Kinds of node:
 * - active: a skill (`id === skill`; name and desc come from SKILLS).
 * - variant: another version of a skill of the same tree; `mods[r - 1]` is the complete rewrite at rank r, never stacked on
 *   the rank before it. A variant built by `V` carries `notes` on each mod (its label after the skill's name, its rule after
 *   the words); one built by `V0` (the plan 8c strengthening nodes, until plan 8d replaces them) has a name and desc instead.
 * - mech: a mechanic node, a knob of its owner's core mechanic: rank r reads `values[r - 1]` (progression `mechKnob`).
 *
 * Rules (engine/progression.ts applies them): a node at tier t >= 1 needs at least 1 rank in some node of the same branch's
 * tier t - 1; and it needs the ranks in the branch's tiers below t to total at least TIER_GATE[t]. Branch 0's free first
 * rank of its tier-0 node does not count. A character holds ranks in at most one ultimate node.
 */
export type NodeKind = 'active' | 'variant' | 'mech';
/** The knobs a mechanic node can turn (each read by its mechanic module, falling back to the plan 8c constant). */
export type MechKnob = 'heatMax' | 'overloadSafePct' | 'markCap' | 'markTp' | 'barrierThunder' | 'barrierPair' | 'moonPct' | 'coinRefund' | 'coinCap'
  | 'aimCap' | 'aimKeep' | 'emberCap' | 'coverEmbers' | 'misstepLoss' | 'duetPct' | 'deviceLevelCap' | 'deviceCap';
export interface TreeNode {
  id: string; kind: NodeKind; maxRank: 1 | 2 | 3 | 4 | 5;
  /** The skill of an active or variant node; a mechanic node has none. */
  skill?: string;
  /** A mechanic node's name, or a `V0` variant's. */
  name?: string;
  /** A `V0` variant's words (the plan 8c strengthening nodes). */
  desc?: string;
  /** A variant's name after its skill's: 火之星彈・{label}. */
  label?: string;
  mods?: SkillMod[];
  knob?: MechKnob;
  values?: number[];
  /** The rule of rank r in one sentence, its numbers from `mods[r - 1]` / `values[r - 1]` (`nodeText`). */
  say?: (r: number) => string;
  /** The B side of this cell (this node is then its A side): the other version, one side only holds points. */
  pair?: TreeNode;
  /**
   * How the ranks of an active with nothing to scale count (plan 8c): absent, each rank above the first costs 1 TP less;
   * 'turns', each lasts a round longer (for a skill whose TP a mod node of its own already cuts).
   */
  rank?: 'turns';
}
export interface TreeBranch { name: string; nodes: TreeNode[] }
export interface TreeDef { branches: TreeBranch[] }

/**
 * Damage and heal power (a device's too) of an active node at rank 1-3, in percent; rank 1 is the skill as written.
 * It never scales a buff's or debuff's percent: only a mod node whose text says so deepens one (`buffPct`).
 */
export const ACTIVE_RANK_PCT = [100, 110, 120, 130, 140];
/** Ranks already put into the branch's lower tiers before a node of tier t can take its first rank. */
export const TIER_GATE = [0, 0, 2, 4, 7];

type Rank = 1 | 2 | 3 | 4 | 5;
const A = (skill: string, maxRank: Rank): TreeNode => ({ id: skill, kind: 'active', skill, maxRank });
/** A variant of `skill`: rank r is `mods[r - 1]`, which carries its label and `say`'s sentence as notes. */
export const V = (id: string, skill: string, label: string, mods: SkillMod[], say: (m: SkillMod) => string): TreeNode => ({
  id, kind: 'variant', skill, label, maxRank: mods.length as Rank,
  mods: mods.map((m) => ({ ...m, notes: [{ label, text: say(m) }] })), say: (r) => say(mods[r - 1]),
});
/** A mechanic node: rank r turns `knob` to `values[r - 1]`. */
export const K = (id: string, name: string, knob: MechKnob, values: number[], say: (v: number) => string): TreeNode =>
  ({ id, kind: 'mech', name, knob, values, maxRank: values.length as Rank, say: (r) => say(values[r - 1]) });
/** A pair: `a` is the A side (the standard build's), `b` the B side. */
export const P = (a: TreeNode, b: TreeNode): TreeNode => ({ ...a, pair: b });
/** A plan 8c strengthening node kept as it was (name, desc, numbers), as a variant without notes; plan 8d replaces them all. */
export const V0 = (id: string, name: string, skill: string, desc: string, mods: SkillMod[]): TreeNode =>
  ({ id, kind: 'variant', skill, maxRank: mods.length as Rank, name, desc, mods });
const pct = (...v: number[]): SkillMod[] => v.map((powerPct) => ({ powerPct }));
/** Power and the debuff riding on it, by the same percent. */
const deepen = (...v: number[]): SkillMod[] => v.map((p) => ({ powerPct: p, buffPct: p }));
const turns = (...v: number[]): SkillMod[] => v.map((t) => ({ turns: t }));
const chance = (...v: number[]): SkillMod[] => v.map((c) => ({ chance: c }));
const hp = (...v: number[]): SkillMod[] => v.map((hpCost) => ({ hpCost }));
const tp = (...v: number[]): SkillMod[] => v.map((tpDelta) => ({ tpDelta }));
/** One ailment a variant adds to its skill's hits, at each rank's chance. */
const inflicting = (status: 'burn' | 'freeze' | 'bleed', ...chances: number[]): SkillMod[] =>
  chances.map((chance): SkillMod => ({ extra: [{ kind: 'inflict', status, chance } as Effect] }));
/** 急救's cures by rank: poison; poison, burn and bleed; every ailment. */
const DRONE_CURES: AilmentId[][] = [['poison'], ['poison', 'burn', 'bleed'], [...AILMENT_IDS]];
/** The ailments a cure lists, as its words say them: 「所有異常」 for all of them. */
const curesSaid = (ids: readonly AilmentId[]): string =>
  (AILMENT_IDS.every((id) => ids.includes(id)) ? '所有異常' : ids.map((id) => T.ailment[id]).join('、'));
/** The chance of a variant's added ailment, as its words say it (30 for 0.3). */
const chanceOf = (m: SkillMod): number => Math.round(((m.extra![0] as { chance: number }).chance) * 100);

export const TREES: Record<CharacterId, TreeDef> = {
  noel: { branches: [
    { name: '火', nodes: [
      A('fire-star', 3),
      P(
        V('noel-star-twin', 'fire-star', '連星', [52, 57, 62].map((powerPct) => ({ hits: 2, powerPct })), (m) => `改為 ${m.hits} 段，每段威力 ${m.powerPct}%。`),
        V('noel-star-heavy', 'fire-star', '重星', [130, 140, 150].map((powerPct) => ({ powerPct, rules: { heat: 2 } })), (m) => `威力 ${m.powerPct}%，每次熱度 +${m.rules!.heat}。`),
      ),
      A('flame-wave', 3),
      P(
        V('noel-wave-burn', 'flame-wave', '延燒', inflicting('burn', 0.3, 0.4, 0.5), (m) => `命中時 ${chanceOf(m)}% 使目標灼燒。`),
        V('noel-wave-focus', 'flame-wave', '聚焰', [170, 180, 190].map((powerPct): SkillMod => ({ target: 'enemy', powerPct })), (m) => `改為打單體，威力 ${m.powerPct}%。`),
      ),
      A('inferno', 1),
    ] },
    { name: '冰', nodes: [
      A('ice-star', 3),
      P(
        K('noel-calm', '冷靜', 'heatMax', [6, 7, 8], (v) => `熱度上限 ${v}。`),
        K('noel-safe', '反噬無效', 'overloadSafePct', [160, 170, 180], (v) => `暴走不再傷到自己，但暴走威力只有 ${v}%。`),
      ),
      A('frost-bind', 3),
      // 冰封 keeps 寒縛強化's deepened slow (8d Task 3 ruling 2: Noel's debuff peak as it was), and adds the freeze.
      V('noel-bind-freeze', 'frost-bind', '冰封', inflicting('freeze', 0.3, 0.4, 0.5).map((m, i) => ({ ...m, buffPct: [115, 130, 150][i] })),
        (m) => `命中時 ${chanceOf(m)}% 使目標凍結（頭目改冰緩），速度削弱加深為 ${m.buffPct}%。`),
      A('blizzard', 1),
    ] },
    { name: '雷咒', nodes: [
      A('hex', 3),
      A('thunder-star', 3),
      V('noel-hex-wide', 'hex', '擴咒', [2, 3, 4].map((turns): SkillMod => ({ target: 'enemies', turns })), (m) => `改為對全體，弱點 ${m.turns} 回合。`),
      V('noel-thunder-double', 'thunder-star', '雙響', [60, 65, 75].map((powerPct) => ({ hits: 2, powerPct })), (m) => `改為 ${m.hits} 段，每段威力 ${m.powerPct}%。`),
      A('judgement', 1),
    ] },
  ] },
  chizuru: { branches: [
    { name: '槍舞', nodes: [
      A('sweep', 3),
      V('chizuru-sweep-twin', 'sweep', '雙月', [60, 65, 72].map((powerPct) => ({ hits: 2, powerPct })), (m) => `改為 ${m.hits} 段，每段威力 ${m.powerPct}%。`),
      A('spiral-spear', 3),
      P(
        K('chizuru-thunder-ward', '雷之結界', 'barrierThunder', [20, 30, 40], (v) => `有結界時，每回合結束對全體敵人雷擊（威力 ${v}）。`),
        K('chizuru-twin-ward', '重結界', 'barrierPair', [60, 80, 100], (v) => `可以同時有兩種結界，後放的那個效果 ${v}%。`),
      ),
      A('thousand-spear', 1),
    ] },
    { name: '結界', nodes: [
      A('ward', 3),
      V('chizuru-ward-long', 'ward', '久護', turns(4, 5, 6), (m) => `守之結界持續 ${m.turns} 回合。`),
      A('purify-ward', 3),
      V('chizuru-purify-wake', 'purify-ward', '祓', [100, 115, 130].map((powerPct): SkillMod => ({ powerPct, rules: { wake: true } })), (m) => `也解除睡眠；回復威力 ${m.powerPct}%。`),
      A('great-barrier', 1),
    ] },
    { name: '突刺', nodes: [
      A('pierce', 3),
      V('chizuru-pierce-twin', 'pierce', '連突', [60, 65, 72].map((powerPct) => ({ hits: 2, powerPct })), (m) => `改為 ${m.hits} 段，每段威力 ${m.powerPct}%。`),
      A('exorcism-thrust', 3),
      V('chizuru-release-keep', 'exorcism-thrust', '連解', [3, 2, 1].map((releaseKeep) => ({ rules: { releaseKeep } })), (m) => `解放後結界不消失，只少 ${m.rules!.releaseKeep} 回合。`),
      A('heaven-spear', 1),
    ] },
  ] },
  // Liz's tree, reordered (plan 8d ruling 6): her spender 大手筆 heads a branch of its own (花錢), so the standard build
  // learns it at Lv3 (DEFAULT_FIRST) and her coins are spent from then on; 幻影步 and 估價 hold the ultimate cells of 尋寶 and 花錢.
  liz: { branches: [
    { name: '雙刃', nodes: [
      A('twin-slash', 3),
      A('pickpocket', 3),
      P(
        V('liz-twin-quick', 'twin-slash', '快手', [75, 80, 87].map((powerPct) => ({ hits: 3, powerPct })), (m) => `改為 ${m.hits} 段，每段威力 ${m.powerPct}%。`),
        V('liz-twin-haggle', 'twin-slash', '殺價', [85, 90, 95].map((powerPct) => ({ tpDelta: -2, powerPct })), (m) => `TP −${-m.tpDelta!}，威力 ${m.powerPct}%。`),
      ),
      K('liz-change', '找零', 'coinRefund', [2, 3, 4], (v) => `用掉銅板的招之後，退還 ${v} 枚。`),
      A('jackpot', 1),
    ] },
    { name: '尋寶', nodes: [
      A('stealth', 1),
      A('treasure-sense', 1),
      A('smoke-bomb', 3),
      V('liz-smoke-choke', 'smoke-bomb', '嗆鼻', [15, 20, 25].map((v): SkillMod => ({ extra: [{ kind: 'buff', stat: 'spd', pct: -v, turns: 3 }] })),
        (m) => { const b = m.extra![0] as { pct: number; turns: number }; return `另使敵人速度降低 ${-b.pct}%，${b.turns} 回合。`; }),
      A('phantom-step', 1),
    ] },
    { name: '花錢', nodes: [
      A('fortune-strike', 3),
      V('liz-fortune-split', 'fortune-strike', '分期', [14, 24, 26].map((coinPowerPct): SkillMod => ({ rules: { coinSpendPct: 50, coinPowerPct } })),
        (m) => `只花 ${m.rules!.coinSpendPct}% 的銅板（進位），每枚威力多 ${m.rules!.coinPowerPct}%。`),
      A('quickstep', 3),
      K('liz-vault', '金庫', 'coinCap', [12, 14, 16], (v) => `銅板上限 ${v} 枚。`),
      A('appraise', 1),
    ] },
  ] },
  sylvie: { branches: [
    { name: '狙擊', nodes: [
      A('aimed-shot', 3),
      P(
        V('sylvie-aim-one', 'aimed-shot', '一擊', [18, 25, 30].map((aimPct): SkillMod => ({ rules: { aimPct } })), (m) => `這一箭的瞄準每層 +${m.rules!.aimPct}%。`),
        V('sylvie-aim-rapid', 'aimed-shot', '速射', [90, 95, 100].map((powerPct) => ({ tpDelta: -2, powerPct })), (m) => `TP −${-m.tpDelta!}，威力 ${m.powerPct}%。`),
      ),
      A('heart-shot', 3),
      K('sylvie-patience', '獵人的耐心', 'aimCap', [4, 5, 6], (v) => `瞄準上限 ${v} 層。`),
      A('starfall-arrow', 1),
    ] },
    { name: '牽制', nodes: [
      A('pin-shot', 3),
      K('sylvie-shift', '轉移', 'aimKeep', [1, 2, 3], (v) => `換目標時保留 ${v} 層瞄準。`),
      A('sunder-arrow', 3),
      V('sylvie-sunder-deep', 'sunder-arrow', '深鑿', turns(5, 6, 7), (m) => `降防持續 ${m.turns} 回合。`),
      A('hunters-mark', 1),
    ] },
    { name: '箭雨', nodes: [
      A('arrow-rain', 3),
      V('sylvie-rain-cover', 'arrow-rain', '覆蓋', [1, 2, 3].map((n): SkillMod => ({ extra: [{ kind: 'aim-add', n }] })),
        (m) => `命中後，她瞄準的目標瞄準 +${(m.extra![0] as { n: number }).n} 層。`),
      A('scatter-shot', 3),
      V('sylvie-scatter-more', 'scatter-shot', '多矢', [4, 5, 6].map((hits) => ({ hits })), (m) => `改為 ${m.hits} 支箭。`),
      A('deluge-volley', 1),
    ] },
  ] },
  scarlet: { branches: [
    { name: '守護', nodes: [
      A('provoke', 1),
      V('scarlet-provoke-shout', 'provoke', '高喊', [10, 15, 20].map((pct): SkillMod => ({ extra: [{ kind: 'embers', pct }] })),
        (m) => `挑釁時，存下最大 HP ${(m.extra![0] as { pct: number }).pct}% 的餘燼。`),
      A('cover', 3),
      V('scarlet-cover-both', 'cover', '雙肩', [3, 4, 5].map((turns): SkillMod => ({ turns, rules: { keep: true } })), (m) => `可以同時代受兩人；持續 ${m.turns} 回合。`),
      A('unbreakable', 1),
    ] },
    { name: '烈焰', nodes: [
      A('flame-burst', 3),
      V('scarlet-burst-heart', 'flame-burst', '赤心', [30, 40, 50].map((emberPaidPct): SkillMod => ({ rules: { emberPaidPct } })),
        (m) => `HP 消耗全部用餘燼付清時，威力多 ${m.rules!.emberPaidPct}%。`),
      A('blaze-ring', 3),
      V('scarlet-ring-blaze', 'blaze-ring', '燎原', inflicting('burn', 0.3, 0.4, 0.5), (m) => `命中時 ${chanceOf(m)}% 使目標灼燒。`),
      A('crimson-end', 1),
    ] },
    { name: '鐵壁', nodes: [
      A('iron-wall', 3),
      K('scarlet-ardent', '熾心', 'emberCap', [60, 70, 80], (v) => `餘燼上限是最大 HP 的 ${v}%。`),
      A('shield-bash', 3),
      K('scarlet-thanks', '回禮', 'coverEmbers', [5, 8, 10], (v) => `代受擋下一擊，另存最大 HP ${v}% 的餘燼。`),
      A('atoning-flame', 1),
    ] },
  ] },
  selene: { branches: [
    { name: '月光', nodes: [
      A('moonlight', 3),
      P(
        V('selene-moon-bright', 'moonlight', '凝光', [125, 135, 150].map((powerPct) => ({ powerPct, tpDelta: 1 })), (m) => `回復威力 ${m.powerPct}%，TP +${m.tpDelta}。`),
        V('selene-moon-wide', 'moonlight', '群照', [55, 60, 65].map((powerPct): SkillMod => ({ target: 'allies', powerPct })), (m) => `改為對我方全體，威力 ${m.powerPct}%。`),
      ),
      A('moon-rain', 3),
      K('selene-tide', '盈月', 'moonPct', [40, 50, 60], (v) => `月相的好處由 ${MOON.pct}% 變成 ${v}%。`),
      A('full-moon', 1),
    ] },
    // 收回 sits at tier 2, open from Lv5 (plan 8d ruling 6); the standard build leaves it and the night to the player.
    { name: '祈禱', nodes: [
      A('cleanse', 1),
      A('rebirth', 1),
      { ...A('moon-recall', 3), rank: 'turns' },
      V('selene-new-night', 'full-moon-night', '新月', [3, 4, 5].map((turns): SkillMod => ({ turns, rules: { phase: 'new' } })), (m) => `改停在新月，停 ${m.turns} 回合。`),
      A('full-moon-night', 1),
    ] },
    { name: '夢境', nodes: [
      A('dream', 1),
      V('selene-dream-deep', 'dream', '深眠', turns(4, 5, 6), (m) => `睡眠持續 ${m.turns} 回合。`),
      A('moon-arrow', 3),
      V('selene-arrow-freeze', 'moon-arrow', '寒月', inflicting('freeze', 0.25, 0.35, 0.45), (m) => `命中時 ${chanceOf(m)}% 使目標凍結（頭目改冰緩）。`),
      A('lunar-eclipse', 1),
    ] },
  ] },
  safira: { branches: [
    { name: '刃舞', nodes: [
      A('blade-dance', 3),
      V('safira-dance-four', 'blade-dance', '四拍', [82, 90, 100].map((powerPct) => ({ hits: 4, powerPct })), (m) => `改為 ${m.hits} 段，每段威力 ${m.powerPct}%。`),
      A('sand-cyclone', 3),
      // 即興: at 0 the repeat costs no beat at all, said in words (plan 8d Task 7).
      K('safira-improv', '即興', 'misstepLoss', [2, 1, 0], (v) => (v > 0 ? `同一招連用不再踩空，拍子只少 ${v}。` : '同一招連用不再踩空，拍子不變。')),
      A('thousand-shadows', 1),
    ] },
    { name: '戰舞', nodes: [
      A('war-dance', 3),
      V('safira-war-heat', 'war-dance', '熱場', [10, 15, 20].map((v): SkillMod => ({ extra: [{ kind: 'buff', stat: 'spd', pct: v, turns: 3 }] })),
        (m) => { const b = m.extra![0] as { pct: number; turns: number }; return `另使全隊速度提升 ${b.pct}%，${b.turns} 回合。`; }),
      A('clap', 3),
      V('safira-clap-encore', 'clap', '安可', pct(150, 175, 200), (m) => `拍手給的量表變成 ${m.powerPct}%。`),
      A('desert-festival', 1),
    ] },
    { name: '幻步', nodes: [
      A('mirage', 3),
      K('safira-duet', '雙人舞', 'duetPct', [20, 30, 40], (v) => `終幕之後，同一回合下一個隊友的攻擊招式威力多 ${v}%。`),
      A('shadow-step', 3),
      V('safira-shadow-sync', 'shadow-step', '切分音', [2, 3, 4].map((beats): SkillMod => ({ rules: { beats } })), (m) => `這一招讓拍子 +${m.rules!.beats}。`),
      A('mirage-step', 1),
    ] },
  ] },
  bobby: { branches: [
    { name: '砲台', nodes: [
      A('turret', 3),
      V('bobby-turret-twin', 'turret', '雙管', [55, 60, 64].map((powerPct): SkillMod => ({ powerPct, rules: { deviceHits: 2 } })),
        (m) => `砲台每次打 ${m.rules!.deviceHits} 下，每下威力 ${m.powerPct}%。`),
      A('cannon', 3),
      K('bobby-mass', '量產', 'deviceLevelCap', [4, 5, 6], (v) => `裝置最多改良到 ${v} 級。`),
      // The ultimate cell: a second turret beside the first, and the old capstone's power points and rounds, raised to keep
      // his Lv50 in parity once 加農強化 was gone (plan 8d Task 8, retune.md).
      V('bobby-turret-pair', 'turret', '雙砲台', [{ powerDelta: 80, turnsDelta: 2, rules: { deviceTwin: true } }],
        (m) => `可以同時架兩座砲台（第二座不算改良）；砲台威力 +${m.powerDelta}%，多撐 ${m.turnsDelta} 回合。`),
    ] },
    { name: '整備', nodes: [
      A('tinker', 1),
      A('repair-drone', 3),
      V('bobby-drone-aid', 'repair-drone', '急救', DRONE_CURES.map((deviceCures): SkillMod => ({ rules: { deviceCures } })), (m) => `也解除${curesSaid(m.rules!.deviceCures!)}。`),
      A('overclock', 3),
      A('emergency-repair', 1),
    ] },
    { name: '護盾', nodes: [
      A('barrier', 3),
      K('bobby-bench', '工作檯', 'deviceCap', [3, 4, 5], (v) => `裝置最多同時 ${v} 個。`),
      A('shock-mine', 3),
      V('bobby-mine-chain', 'shock-mine', '連鎖', [0.2, 0.3, 0.4].map((deviceShock): SkillMod => ({ rules: { deviceShock } })),
        (m) => `地雷每次電擊，有 ${Math.round(m.rules!.deviceShock! * 100)}% 使敵人感電。`),
      A('tesla-coil', 1),
    ] },
  ] },
  rin: { branches: [
    { name: '暗器', nodes: [
      A('rin-needle', 3),
      V('rin-needle-three', 'rin-needle', '三連', [74, 80, 85].map((powerPct) => ({ hits: 3, powerPct })), (m) => `改為 ${m.hits} 段，每段威力 ${m.powerPct}%。`),
      A('rin-fan', 3),
      A('rin-venom-needle', 3),
      A('rin-storm', 1),
    ] },
    { name: '背刺', nodes: [
      A('rin-backstab', 3),
      V('rin-backstab-bleed', 'rin-backstab', '影縫', inflicting('bleed', 0.3, 0.4, 0.5), (m) => `命中時 ${chanceOf(m)}% 使目標流血。`),
      { ...A('rin-veil', 3), rank: 'turns' },
      K('rin-names', '名單', 'markCap', [2, 3, 4], (v) => `可以同時暗記 ${v} 個目標。`),
      A('rin-shadowless', 1),
    ] },
    { name: '處決', nodes: [
      // Her mark is innate (INNATE): this cell, where the tree used to teach it, makes it cheaper.
      K('rin-mark-hone', '熟記', 'markTp', [5, 4, 3], (v) => `暗記只要 ${v} TP。`),
      P(
        V('rin-mark-steady', 'rin-mark', '不眨眼', [15, 20, 25].map((markCritPct) => ({ rules: { markCritPct } })), (m) => `打暗記的目標，暴擊傷害 +${m.rules!.markCritPct}%。`),
        V('rin-mark-hop', 'rin-mark', '轉印', [1, 2, 3].map((markHops) => ({ rules: { markHops } })), (m) => `暗記的目標倒下時，暗記跳到下一個敵人（每場最多 ${m.rules!.markHops} 次）。`),
      ),
      A('rin-execute', 3),
      V('rin-execute-chase', 'rin-execute', '追命', [1, 2, 3].map((again) => ({ rules: { again } })), (m) => `處決擊倒暗記的目標時，這回合的「還有。」多 ${m.rules!.again} 次。`),
      A('rin-deathblow', 1),
    ] },
  ] },
  hero: { branches: [
    { name: '劍技', nodes: [
      A('hero-slash', 5),
      V('hero-slash-twin', 'hero-slash', '連斬', [50, 52, 54, 56, 58].map((powerPct) => ({ hits: 2, powerPct })), (m) => `改為 ${m.hits} 段，每段威力 ${m.powerPct}%。`),
      A('hero-cleave', 5),
      A('hero-sunder', 5),
      A('abyss-sword', 1),
    ] },
    { name: '守護', nodes: [
      A('hero-guard', 5),
      V('hero-guard-steady', 'hero-guard', '不動', [104, 108, 112, 116, 120].map((buffPct): SkillMod => ({ buffPct, rules: { steady: true } })),
        (m) => `守勢期間不會被暴擊，防禦提升幅度 ${m.buffPct}%。`),
      A('hero-aegis', 5),
      A('hero-rally', 5),
      A('abyss-guard', 1),
    ] },
    { name: '星術', nodes: [
      A('hero-flare', 5),
      A('hero-frost', 5),
      V('hero-frost-chill', 'hero-frost', '凍原', inflicting('freeze', 0.1, 0.12, 0.14, 0.16, 0.18), (m) => `命中時 ${chanceOf(m)}% 使目標凍結（頭目改冰緩）。`),
      A('hero-spark', 5),
      A('abyss-star', 1),
    ] },
    { name: '祈光', nodes: [
      A('hero-mend', 5),
      V('hero-mend-overflow', 'hero-mend', '滿溢', [6, 8, 10, 12, 14].map((overflowPct): SkillMod => ({ rules: { overflowPct } })),
        (m) => `溢出的回復變成護盾，最多最大 HP 的 ${m.rules!.overflowPct}%。`),
      A('hero-prayer', 5),
      A('hero-purify', 1),
      A('abyss-light', 1),
    ] },
    { name: '枷鎖', nodes: [
      A('hero-shackle', 5),
      A('hero-slow', 5),
      A('hero-expose', 5),
      A('hero-sleep', 1),
      A('abyss-chain', 1),
    ] },
  ] },
};

/** Which branch's ultimate the default build aims for (read by the auto-allocation of skill points). The hero has none: heroTree follows his build instead. */
export const DEFAULT_CAPSTONE: Record<Exclude<CharacterId, 'hero'>, number> = {
  noel: 0, chizuru: 0, liz: 0, sylvie: 0, scarlet: 1, selene: 0, safira: 0, bobby: 0, rin: 1,
};

/** The nodes of a branch's tier: its A node, then its B node when the cell is a pair. */
export const tierNodes = (b: TreeBranch, tier: number): TreeNode[] => {
  const a = b.nodes[tier];
  return a ? (a.pair ? [a, a.pair] : [a]) : [];
};

/** Every node of a branch with its tier, tier by tier, the A side of a pair before its B side. */
export const branchNodes = (b: TreeBranch): { node: TreeNode; tier: number }[] =>
  b.nodes.flatMap((_, tier) => tierNodes(b, tier).map((node) => ({ node, tier })));

/**
 * The standard build's first-learned nodes (plan 8d ruling 5), per character: after the old skills that are due and before
 * any other upgrade, the build learns the first of these it can (rank 0 to 1; later ranks come as upgrades).
 */
export const DEFAULT_FIRST: Partial<Record<CharacterId, string[]>> = { liz: ['fortune-strike'] };

/**
 * Skills a character knows from Lv1 outside her tree, for no point (8d Task 3 ruling 1): a core mechanic's entry skill
 * must not compete with damage nodes for build points. Her tree's variants of it still apply (progression.nodeMods).
 * Reusable: another character's core-mechanic entry skill may move here the same way if it hits the same wall.
 */
export const INNATE: Partial<Record<CharacterId, string[]>> = { rin: ['rin-mark'] };

/** Every node by id, B sides too; `pair` is the id of the other side of its pair. */
export const NODES: Record<string, { node: TreeNode; owner: CharacterId; branch: number; tier: number; pair?: string }> = {};
for (const [owner, tree] of Object.entries(TREES) as [CharacterId, TreeDef][]) {
  tree.branches.forEach((b, branch) => b.nodes.forEach((node, tier) => {
    NODES[node.id] = { node, owner, branch, tier, ...(node.pair ? { pair: node.pair.id } : {}) };
    if (node.pair) NODES[node.pair.id] = { node: node.pair, owner, branch, tier, pair: node.id };
  }));
}

/** The old kit's learn levels, recorded here when the skills' own `learnLevel` field was removed. */
export const LEGACY_LEARN_LEVEL: Record<string, number> = {
  'fire-star': 1, 'ice-star': 2, hex: 4, 'thunder-star': 6,
  sweep: 1, ward: 3, pierce: 5,
  'twin-slash': 1, stealth: 2, 'treasure-sense': 4, pickpocket: 6,
  'aimed-shot': 1, 'pin-shot': 3, 'arrow-rain': 6,
  provoke: 1, 'flame-burst': 3, 'iron-wall': 5,
  moonlight: 1, cleanse: 2, dream: 4, rebirth: 6,
  'blade-dance': 1, 'war-dance': 3, mirage: 5,
  turret: 1, tinker: 2, barrier: 4,
};

/** A node's name: an active's skill; a variant's skill and label (火之星彈・連星), or a `V0` one's own; a mechanic's own. */
export const nodeName = (id: string): string => {
  const n = NODES[id].node;
  if (n.kind === 'variant' && n.label !== undefined) return `${SKILLS[n.skill!].name}・${n.label}`;
  return n.name ?? SKILLS[n.skill!].name;
};
export const nodeDesc = (id: string): string => NODES[id].node.desc ?? (NODES[id].node.skill ? SKILLS[NODES[id].node.skill!].desc : '');
/** The rule of a variant or mechanic node at `rank` in one sentence; '' for an active, a `V0` variant or a rank out of range. */
export const nodeText = (id: string, rank: number): string => {
  const n = NODES[id]?.node;
  return n?.say && Number.isInteger(rank) && rank >= 1 && rank <= n.maxRank ? n.say(rank) : '';
};
