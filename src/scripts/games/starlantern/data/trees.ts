import type { CharacterId } from '../engine/types';
import type { SkillMod } from './gear';
import { SKILLS } from './skills';

/**
 * Skill trees. A branch holds five nodes and the array index is the tier (0-4; tier 4 is the ultimate node).
 * An active node is a skill (`id === skill`; name and desc come from SKILLS). A mod node rewrites a skill of the same
 * tree: `mods[r - 1]` is the complete rewrite at rank r, never stacked on the rank before it.
 *
 * Rules (Task 5 builds them): a node at tier t >= 1 needs at least 1 rank in the same branch's tier t - 1 node; and it
 * needs the ranks in the branch's tiers below t to total at least TIER_GATE[t]. Branch 0's free first rank of its tier-0
 * node does not count. A character holds ranks in at most one ultimate node.
 */
export interface TreeNode {
  id: string; kind: 'active' | 'mod'; skill: string; maxRank: 1 | 2 | 3; name?: string; desc?: string; mods?: SkillMod[];
}
export interface TreeBranch { name: string; nodes: TreeNode[] }
export interface TreeDef { branches: TreeBranch[] }

/** Power multiplier of an active node at rank 1-3; rank 1 is the skill as written. */
export const ACTIVE_RANK_PCT = [100, 110, 120];
/** Ranks already put into the branch's lower tiers before a node of tier t can take its first rank. */
export const TIER_GATE = [0, 0, 2, 4, 7];

const A = (skill: string, maxRank: 1 | 2 | 3): TreeNode => ({ id: skill, kind: 'active', skill, maxRank });
const M = (id: string, name: string, skill: string, desc: string, mods: SkillMod[]): TreeNode =>
  ({ id, kind: 'mod', skill, maxRank: mods.length as 1 | 2 | 3, name, desc, mods });
const pct = (...v: number[]): SkillMod[] => v.map((powerPct) => ({ powerPct }));
const turns = (...v: number[]): SkillMod[] => v.map((t) => ({ turns: t }));
const chance = (...v: number[]): SkillMod[] => v.map((c) => ({ chance: c }));
const hp = (...v: number[]): SkillMod[] => v.map((hpCost) => ({ hpCost }));
const tp = (...v: number[]): SkillMod[] => v.map((tpDelta) => ({ tpDelta }));

export const TREES: Record<CharacterId, TreeDef> = {
  noel: { branches: [
    { name: '火', nodes: [
      A('fire-star', 3),
      M('noel-fire-up', '火星強化', 'fire-star', '強化火之星彈的威力', pct(110, 120, 135)),
      A('flame-wave', 3),
      M('noel-wave-up', '炎波節流', 'flame-wave', '降低炎之波的 TP 消耗', tp(-1, -2, -3)),
      A('inferno', 1),
    ] },
    { name: '冰', nodes: [
      A('ice-star', 3),
      M('noel-ice-up', '冰星強化', 'ice-star', '強化冰之星彈的威力', pct(110, 120, 135)),
      A('frost-bind', 3),
      M('noel-bind-up', '寒縛強化', 'frost-bind', '強化冰縛的威力', pct(115, 130, 150)),
      A('blizzard', 1),
    ] },
    { name: '雷咒', nodes: [
      A('hex', 3),
      A('thunder-star', 3),
      M('noel-hex-up', '劇毒咒', 'hex', '提高衰弱咒的中毒機率', chance(0.6, 0.7, 0.8)),
      M('noel-thunder-up', '雷星強化', 'thunder-star', '強化雷之星彈的威力', pct(115, 130, 150)),
      A('judgement', 1),
    ] },
  ] },
  chizuru: { branches: [
    { name: '槍舞', nodes: [
      A('sweep', 3),
      M('chizuru-sweep-up', '橫掃強化', 'sweep', '強化橫掃的威力', pct(110, 120, 135)),
      A('spiral-spear', 3),
      M('chizuru-spiral-up', '旋槍節流', 'spiral-spear', '降低旋槍的 TP 消耗', tp(-1, -2, -3)),
      A('thousand-spear', 1),
    ] },
    { name: '結界', nodes: [
      A('ward', 3),
      M('chizuru-ward-up', '結界延長', 'ward', '延長結界的持續回合', turns(4, 5, 6)),
      A('sacred-sake', 3),
      M('chizuru-sake-up', '神酒強化', 'sacred-sake', '強化御神酒的回復量', pct(115, 130, 150)),
      A('great-barrier', 1),
    ] },
    { name: '突刺', nodes: [
      A('pierce', 3),
      M('chizuru-pierce-up', '貫槍強化', 'pierce', '強化貫槍的威力', pct(110, 120, 135)),
      A('thunder-thrust', 3),
      M('chizuru-thrust-up', '雷突強化', 'thunder-thrust', '強化雷神突的威力', pct(115, 130, 150)),
      A('heaven-spear', 1),
    ] },
  ] },
  liz: { branches: [
    { name: '雙刃', nodes: [
      A('twin-slash', 3),
      A('triple-slash', 3),
      M('liz-twin-up', '雙刃強化', 'twin-slash', '強化雙刃的威力', pct(110, 120, 135)),
      M('liz-triple-up', '三連刃強化', 'triple-slash', '強化三連刃的威力', pct(115, 130, 150)),
      A('shadow-flurry', 1),
    ] },
    { name: '尋寶', nodes: [
      A('stealth', 1),
      A('treasure-sense', 1),
      A('smoke-bomb', 3),
      M('liz-smoke-up', '濃煙', 'smoke-bomb', '加深煙霧彈的攻擊削弱', pct(120, 140, 160)),
      A('fortune-strike', 1),
    ] },
    { name: '身法', nodes: [
      A('quickstep', 3),
      M('liz-quick-up', '疾步延長', 'quickstep', '延長疾步的持續回合', turns(4, 5, 6)),
      A('venom-edge', 3),
      M('liz-venom-up', '劇毒刃', 'venom-edge', '提高毒刃的中毒機率', chance(0.6, 0.75, 0.9)),
      A('phantom-step', 1),
    ] },
  ] },
  sylvie: { branches: [
    { name: '狙擊', nodes: [
      A('aimed-shot', 3),
      M('sylvie-aim-up', '瞄準強化', 'aimed-shot', '強化瞄準射擊的威力', pct(110, 120, 135)),
      A('heart-shot', 3),
      M('sylvie-heart-up', '穿心節流', 'heart-shot', '降低穿心箭的 TP 消耗', tp(-1, -2, -3)),
      A('starfall-arrow', 1),
    ] },
    { name: '牽制', nodes: [
      A('pin-shot', 3),
      M('sylvie-pin-up', '釘足延長', 'pin-shot', '延長釘足箭的減速回合', turns(4, 5, 6)),
      A('snare-shot', 3),
      M('sylvie-snare-up', '絆索強化', 'snare-shot', '強化絆索箭的威力', pct(115, 130, 150)),
      A('hunters-mark', 1),
    ] },
    { name: '箭雨', nodes: [
      A('arrow-rain', 3),
      M('sylvie-rain-up', '箭雨強化', 'arrow-rain', '強化箭雨的威力', pct(110, 120, 135)),
      A('fire-arrow', 3),
      M('sylvie-fire-up', '火矢強化', 'fire-arrow', '強化火矢雨的威力', pct(115, 130, 150)),
      A('storm-volley', 1),
    ] },
  ] },
  scarlet: { branches: [
    { name: '守護', nodes: [
      A('provoke', 1),
      M('scarlet-provoke-up', '挑釁延長', 'provoke', '延長挑釁的持續回合', turns(4, 5, 6)),
      A('guardian-roar', 3),
      M('scarlet-roar-up', '咆哮強化', 'guardian-roar', '提高守護咆哮的防禦提升幅度', pct(120, 140, 160)),
      A('unbreakable', 1),
    ] },
    { name: '烈焰', nodes: [
      A('flame-burst', 3),
      M('scarlet-burst-up', '爆炎強化', 'flame-burst', '強化爆炎斬的威力', pct(110, 120, 135)),
      A('blaze-ring', 3),
      M('scarlet-ring-up', '炎環節制', 'blaze-ring', '降低炎環斬的 HP 消耗', hp(0.08, 0.06, 0.04)),
      A('crimson-end', 1),
    ] },
    { name: '鐵壁', nodes: [
      A('iron-wall', 3),
      M('scarlet-wall-up', '鐵壁延長', 'iron-wall', '延長鐵壁的持續回合', turns(4, 5, 6)),
      A('shield-bash', 3),
      M('scarlet-bash-up', '盾擊強化', 'shield-bash', '強化盾擊的威力，並加深攻擊削弱', pct(115, 130, 150)),
      A('fortress', 1),
    ] },
  ] },
  selene: { branches: [
    { name: '月光', nodes: [
      A('moonlight', 3),
      M('selene-moon-up', '月光強化', 'moonlight', '強化月光的回復量', pct(110, 120, 135)),
      A('moon-rain', 3),
      M('selene-rain-up', '月光雨強化', 'moon-rain', '強化月光雨的回復量', pct(115, 130, 150)),
      A('full-moon', 1),
    ] },
    { name: '祈禱', nodes: [
      A('cleanse', 1),
      A('rebirth', 1),
      M('selene-rebirth-up', '再生節流', 'rebirth', '降低月之再生的 TP 消耗', tp(-2, -4, -5)),
      A('blessing', 3),
      A('sanctuary', 1),
    ] },
    { name: '夢境', nodes: [
      A('dream', 1),
      M('selene-dream-up', '安眠節流', 'dream', '降低夢境的 TP 消耗', tp(-1, -2, -3)),
      A('moon-arrow', 3),
      M('selene-arrow-up', '月影強化', 'moon-arrow', '強化月影箭的威力', pct(115, 130, 150)),
      A('lunar-eclipse', 1),
    ] },
  ] },
  safira: { branches: [
    { name: '刃舞', nodes: [
      A('blade-dance', 3),
      M('safira-dance-up', '刃舞強化', 'blade-dance', '強化刃舞的威力', pct(110, 120, 135)),
      A('sand-cyclone', 3),
      M('safira-cyclone-up', '旋舞強化', 'sand-cyclone', '強化沙暴旋舞的威力', pct(115, 130, 150)),
      A('thousand-shadows', 1),
    ] },
    { name: '戰舞', nodes: [
      A('war-dance', 3),
      M('safira-war-up', '戰舞強化', 'war-dance', '提高戰舞的攻擊提升幅度', pct(115, 130, 150)),
      A('veil-dance', 3),
      M('safira-veil-up', '紗舞延長', 'veil-dance', '延長紗之舞的持續回合', turns(4, 5, 6)),
      A('desert-festival', 1),
    ] },
    { name: '幻步', nodes: [
      A('mirage', 3),
      M('safira-mirage-up', '幻步延長', 'mirage', '延長幻步的持續回合', turns(4, 5, 6)),
      A('shadow-step', 3),
      M('safira-shadow-up', '影步強化', 'shadow-step', '強化影步斬的威力', pct(115, 130, 150)),
      A('sirocco', 1),
    ] },
  ] },
  bobby: { branches: [
    { name: '砲台', nodes: [
      A('turret', 3),
      M('bobby-turret-up', '砲台強化', 'turret', '強化砲台的威力', pct(110, 120, 135)),
      A('cannon', 3),
      M('bobby-cannon-up', '加農強化', 'cannon', '強化加農砲的威力', pct(115, 130, 150)),
      M('twin-turret', '雙砲台', 'turret', '砲台威力提高至 160%，持續 4 回合', [{ powerPct: 160, turns: 4 }]),
    ] },
    { name: '整備', nodes: [
      A('tinker', 1),
      A('repair-kit', 3),
      M('bobby-repair-up', '修理強化', 'repair-kit', '強化修理包的回復量', pct(115, 130, 150)),
      A('overclock', 3),
      A('emergency-repair', 1),
    ] },
    { name: '護盾', nodes: [
      A('barrier', 3),
      M('bobby-barrier-up', '護盾延長', 'barrier', '延長護盾裝置的持續回合', turns(4, 5, 6)),
      A('shock-mine', 3),
      M('bobby-mine-up', '地雷強化', 'shock-mine', '強化電擊地雷的威力', pct(115, 130, 150)),
      A('tesla-coil', 1),
    ] },
  ] },
};

/** Which branch's ultimate the default build aims for (read by the auto-allocation of skill points). */
export const DEFAULT_CAPSTONE: Record<CharacterId, 0 | 1 | 2> = {
  noel: 0, chizuru: 0, liz: 0, sylvie: 0, scarlet: 1, selene: 0, safira: 0, bobby: 0,
};

export const NODES: Record<string, { node: TreeNode; owner: CharacterId; branch: number; tier: number }> = {};
for (const [owner, tree] of Object.entries(TREES) as [CharacterId, TreeDef][]) {
  tree.branches.forEach((b, branch) => b.nodes.forEach((node, tier) => { NODES[node.id] = { node, owner, branch, tier }; }));
}

/** The old kit's learn levels, recorded here when the skills' own `learnLevel` field was removed. */
export const LEGACY_LEARN_LEVEL: Record<string, number> = {
  'fire-star': 1, 'ice-star': 2, hex: 4, 'thunder-star': 6,
  sweep: 1, ward: 3, pierce: 5,
  'twin-slash': 1, stealth: 2, 'treasure-sense': 4, 'triple-slash': 6,
  'aimed-shot': 1, 'pin-shot': 3, 'arrow-rain': 6,
  provoke: 1, 'flame-burst': 3, 'iron-wall': 5,
  moonlight: 1, cleanse: 2, dream: 4, rebirth: 6,
  'blade-dance': 1, 'war-dance': 3, mirage: 5,
  turret: 1, tinker: 2, barrier: 4,
};

export const nodeName = (id: string): string => NODES[id].node.name ?? SKILLS[NODES[id].node.skill].name;
export const nodeDesc = (id: string): string => NODES[id].node.desc ?? SKILLS[NODES[id].node.skill].desc;
