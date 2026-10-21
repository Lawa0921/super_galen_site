import type { CharacterId } from '../engine/types';
import type { SkillMod } from './gear';
import { SKILLS } from './skills';

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
export type MechKnob = 'heatMax' | 'overloadSafePct' | 'markCap' | 'barrierThunder' | 'barrierPair' | 'moonPct' | 'coinRefund' | 'coinCap'
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
const buff = (...v: number[]): SkillMod[] => v.map((buffPct) => ({ buffPct }));
/** Power and the debuff riding on it, by the same percent. */
const deepen = (...v: number[]): SkillMod[] => v.map((p) => ({ powerPct: p, buffPct: p }));
const turns = (...v: number[]): SkillMod[] => v.map((t) => ({ turns: t }));
const chance = (...v: number[]): SkillMod[] => v.map((c) => ({ chance: c }));
const hp = (...v: number[]): SkillMod[] => v.map((hpCost) => ({ hpCost }));
const tp = (...v: number[]): SkillMod[] => v.map((tpDelta) => ({ tpDelta }));

export const TREES: Record<CharacterId, TreeDef> = {
  noel: { branches: [
    { name: '火', nodes: [
      A('fire-star', 3),
      V0('noel-fire-up', '火星強化', 'fire-star', '強化火之星彈的威力', pct(110, 120, 135)),
      A('flame-wave', 3),
      V0('noel-wave-up', '炎波節流', 'flame-wave', '降低炎之波的 TP 消耗', tp(-1, -2, -3)),
      A('inferno', 1),
    ] },
    { name: '冰', nodes: [
      A('ice-star', 3),
      V0('noel-ice-up', '冰星強化', 'ice-star', '強化冰之星彈的威力', pct(110, 120, 135)),
      A('frost-bind', 3),
      V0('noel-bind-up', '寒縛強化', 'frost-bind', '強化冰縛的威力，並加深速度削弱', deepen(115, 130, 150)),
      A('blizzard', 1),
    ] },
    { name: '雷咒', nodes: [
      A('hex', 3),
      A('thunder-star', 3),
      V0('noel-hex-up', '弱點延長', 'hex', '延長衰弱咒的弱點回合', turns(4, 5, 6)),
      V0('noel-thunder-up', '雷星強化', 'thunder-star', '強化雷之星彈的威力', pct(115, 130, 150)),
      A('judgement', 1),
    ] },
  ] },
  chizuru: { branches: [
    { name: '槍舞', nodes: [
      A('sweep', 3),
      V0('chizuru-sweep-up', '橫掃強化', 'sweep', '強化橫掃的威力', pct(110, 120, 135)),
      A('spiral-spear', 3),
      V0('chizuru-spiral-up', '旋槍節流', 'spiral-spear', '降低旋槍的 TP 消耗', tp(-1, -2, -3)),
      A('thousand-spear', 1),
    ] },
    { name: '結界', nodes: [
      A('ward', 3),
      V0('chizuru-ward-up', '結界延長', 'ward', '延長守之結界的持續回合', turns(4, 5, 6)),
      A('purify-ward', 3),
      V0('chizuru-sake-up', '淨結強化', 'purify-ward', '強化淨之結界的回復量', pct(115, 130, 150)),
      A('great-barrier', 1),
    ] },
    { name: '突刺', nodes: [
      A('pierce', 3),
      V0('chizuru-pierce-up', '貫槍強化', 'pierce', '強化貫槍的威力', pct(110, 120, 135)),
      A('exorcism-thrust', 3),
      V0('chizuru-thrust-up', '破邪強化', 'exorcism-thrust', '強化破邪突的威力', pct(115, 130, 150)),
      A('heaven-spear', 1),
    ] },
  ] },
  liz: { branches: [
    { name: '雙刃', nodes: [
      A('twin-slash', 3),
      A('pickpocket', 3),
      V0('liz-twin-up', '雙刃強化', 'twin-slash', '強化雙刃的威力', pct(110, 120, 135)),
      V0('liz-triple-up', '順手強化', 'pickpocket', '強化順手牽羊的威力', pct(115, 130, 150)),
      A('jackpot', 1),
    ] },
    { name: '尋寶', nodes: [
      A('stealth', 1),
      A('treasure-sense', 1),
      A('smoke-bomb', 3),
      V0('liz-smoke-up', '濃煙', 'smoke-bomb', '加深煙霧彈的攻擊削弱', buff(120, 140, 160)),
      A('fortune-strike', 1),
    ] },
    { name: '身法', nodes: [
      A('quickstep', 3),
      V0('liz-quick-up', '疾步延長', 'quickstep', '延長疾步的持續回合', turns(4, 5, 6)),
      A('appraise', 3),
      V0('liz-venom-up', '估價節流', 'appraise', '降低估價的 TP 消耗', tp(-1, -2, -3)),
      A('phantom-step', 1),
    ] },
  ] },
  sylvie: { branches: [
    { name: '狙擊', nodes: [
      A('aimed-shot', 3),
      V0('sylvie-aim-up', '瞄準強化', 'aimed-shot', '強化瞄準射擊的威力', pct(110, 120, 135)),
      A('heart-shot', 3),
      V0('sylvie-heart-up', '穿心節流', 'heart-shot', '降低穿心箭的 TP 消耗', tp(-1, -2, -3)),
      A('starfall-arrow', 1),
    ] },
    { name: '牽制', nodes: [
      A('pin-shot', 3),
      V0('sylvie-pin-up', '釘足強化', 'pin-shot', '強化釘足箭的威力', pct(110, 120, 135)),
      A('sunder-arrow', 3),
      V0('sylvie-snare-up', '破甲強化', 'sunder-arrow', '強化破甲箭的威力，並加深防禦削弱', deepen(115, 130, 150)),
      A('hunters-mark', 1),
    ] },
    { name: '箭雨', nodes: [
      A('arrow-rain', 3),
      V0('sylvie-rain-up', '箭雨強化', 'arrow-rain', '強化箭雨的威力', pct(110, 120, 135)),
      A('scatter-shot', 3),
      V0('sylvie-fire-up', '散射強化', 'scatter-shot', '強化散射的威力', pct(115, 130, 150)),
      A('deluge-volley', 1),
    ] },
  ] },
  scarlet: { branches: [
    { name: '守護', nodes: [
      A('provoke', 1),
      V0('scarlet-provoke-up', '挑釁延長', 'provoke', '延長挑釁的持續回合', turns(4, 5, 6)),
      A('cover', 3),
      V0('scarlet-roar-up', '代受延長', 'cover', '延長代受的持續回合', turns(4, 5, 6)),
      A('unbreakable', 1),
    ] },
    { name: '烈焰', nodes: [
      A('flame-burst', 3),
      V0('scarlet-burst-up', '爆炎強化', 'flame-burst', '強化爆炎斬的威力', pct(110, 120, 135)),
      A('blaze-ring', 3),
      V0('scarlet-ring-up', '炎環節制', 'blaze-ring', '降低炎環斬的 HP 消耗', hp(0.08, 0.06, 0.04)),
      A('crimson-end', 1),
    ] },
    { name: '鐵壁', nodes: [
      A('iron-wall', 3),
      V0('scarlet-wall-up', '鐵壁延長', 'iron-wall', '延長鐵壁的持續回合', turns(4, 5, 6)),
      A('shield-bash', 3),
      V0('scarlet-bash-up', '盾擊強化', 'shield-bash', '強化盾擊的威力', pct(115, 130, 150)),
      A('atoning-flame', 1),
    ] },
  ] },
  selene: { branches: [
    { name: '月光', nodes: [
      A('moonlight', 3),
      V0('selene-moon-up', '月光強化', 'moonlight', '強化月光的回復量', pct(110, 120, 135)),
      A('moon-rain', 3),
      V0('selene-rain-up', '月光雨強化', 'moon-rain', '強化月光雨的回復量', pct(115, 130, 150)),
      A('full-moon', 1),
    ] },
    { name: '祈禱', nodes: [
      A('cleanse', 1),
      A('rebirth', 1),
      V0('selene-rebirth-up', '再生節流', 'rebirth', '降低月之再生的 TP 消耗', tp(-2, -4, -5)),
      { ...A('moon-recall', 3), rank: 'turns' },
      A('full-moon-night', 1),
    ] },
    { name: '夢境', nodes: [
      A('dream', 1),
      V0('selene-dream-up', '安眠節流', 'dream', '降低夢境的 TP 消耗', tp(-1, -2, -3)),
      A('moon-arrow', 3),
      V0('selene-arrow-up', '月影強化', 'moon-arrow', '強化月影箭的威力', pct(115, 130, 150)),
      A('lunar-eclipse', 1),
    ] },
  ] },
  safira: { branches: [
    { name: '刃舞', nodes: [
      A('blade-dance', 3),
      V0('safira-dance-up', '刃舞強化', 'blade-dance', '強化刃舞的威力', pct(110, 120, 135)),
      A('sand-cyclone', 3),
      V0('safira-cyclone-up', '旋舞強化', 'sand-cyclone', '強化沙暴旋舞的威力', pct(115, 130, 150)),
      A('thousand-shadows', 1),
    ] },
    { name: '戰舞', nodes: [
      A('war-dance', 3),
      V0('safira-war-up', '戰舞強化', 'war-dance', '提高戰舞的攻擊提升幅度', buff(115, 130, 150)),
      A('clap', 3),
      V0('safira-veil-up', '戰舞延長', 'war-dance', '延長戰舞的持續回合', turns(4, 5, 6)),
      A('desert-festival', 1),
    ] },
    { name: '幻步', nodes: [
      A('mirage', 3),
      V0('safira-mirage-up', '幻步延長', 'mirage', '延長幻步的持續回合', turns(4, 5, 6)),
      A('shadow-step', 3),
      V0('safira-shadow-up', '影步強化', 'shadow-step', '強化影步斬的威力', pct(115, 130, 150)),
      A('mirage-step', 1),
    ] },
  ] },
  bobby: { branches: [
    { name: '砲台', nodes: [
      A('turret', 3),
      V0('bobby-turret-up', '砲台強化', 'turret', '強化砲台的威力', pct(110, 120, 135)),
      A('cannon', 3),
      V0('bobby-cannon-up', '加農強化', 'cannon', '強化加農砲的威力', pct(115, 130, 150)),
      V0('twin-turret', '雙砲台', 'turret', '砲台威力再 +60%，持續回合 +1', [{ powerDelta: 60, turnsDelta: 1 }]),
    ] },
    { name: '整備', nodes: [
      A('tinker', 1),
      A('repair-drone', 3),
      V0('bobby-repair-up', '無人機強化', 'repair-drone', '強化修理無人機的回復量', pct(115, 130, 150)),
      A('overclock', 3),
      A('emergency-repair', 1),
    ] },
    { name: '護盾', nodes: [
      A('barrier', 3),
      V0('bobby-barrier-up', '護盾延長', 'barrier', '延長護盾產生器的持續回合', turns(4, 5, 6)),
      A('shock-mine', 3),
      V0('bobby-mine-up', '地雷強化', 'shock-mine', '強化電擊地雷的威力', pct(115, 130, 150)),
      A('tesla-coil', 1),
    ] },
  ] },
  rin: { branches: [
    { name: '暗器', nodes: [
      A('rin-needle', 3),
      V0('rin-needle-up', '飛針強化', 'rin-needle', '強化飛針的威力', pct(110, 120, 135)),
      A('rin-fan', 3),
      A('rin-venom-needle', 3),
      A('rin-storm', 1),
    ] },
    { name: '背刺', nodes: [
      A('rin-backstab', 3),
      V0('rin-backstab-up', '背刺強化', 'rin-backstab', '強化背刺的威力', pct(110, 120, 135)),
      { ...A('rin-veil', 3), rank: 'turns' },
      V0('rin-veil-up', '隱匿節流', 'rin-veil', '降低隱匿的 TP 消耗', tp(-1, -2, -3)),
      A('rin-shadowless', 1),
    ] },
    { name: '處決', nodes: [
      A('rin-mark', 3),
      V0('rin-mark-up', '暗記節流', 'rin-mark', '降低暗記的 TP 消耗', tp(-1, -2, -3)),
      A('rin-execute', 3),
      V0('rin-execute-up', '處決強化', 'rin-execute', '強化處決的威力', pct(115, 130, 150)),
      A('rin-deathblow', 1),
    ] },
  ] },
  hero: { branches: [
    { name: '劍技', nodes: [
      A('hero-slash', 5),
      V0('hero-sword-up', '劍技精通', 'hero-slash', '強化斬擊的威力', pct(104, 108, 112, 116, 120)),
      A('hero-cleave', 5),
      A('hero-sunder', 5),
      A('abyss-sword', 1),
    ] },
    { name: '守護', nodes: [
      A('hero-guard', 5),
      V0('hero-guard-up', '堅守精通', 'hero-guard', '提高守勢的防禦提升幅度', buff(104, 108, 112, 116, 120)),
      A('hero-aegis', 5),
      A('hero-rally', 5),
      A('abyss-guard', 1),
    ] },
    { name: '星術', nodes: [
      A('hero-flare', 5),
      A('hero-frost', 5),
      V0('hero-star-up', '星術精通', 'hero-frost', '強化星霜的威力', pct(104, 108, 112, 116, 120)),
      A('hero-spark', 5),
      A('abyss-star', 1),
    ] },
    { name: '祈光', nodes: [
      A('hero-mend', 5),
      V0('hero-light-up', '祈光精通', 'hero-mend', '強化治癒的回復量', pct(103, 106, 109, 112, 115)),
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
export const DEFAULT_FIRST: Partial<Record<CharacterId, string[]>> = {};

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
