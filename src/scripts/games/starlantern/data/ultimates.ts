import type { CharacterId, UltimateDef } from '../engine/types';

const LIST: UltimateDef[] = [
  { id: 'ult-noel', owner: 'noel', name: '流星燈火', target: 'enemies', desc: '降下燃燒的星燈，火屬性全體大傷害',
    effects: [{ kind: 'damage', power: 230, element: 'fire', scale: 'mag', melee: false }] },
  { id: 'ult-chizuru', owner: 'chizuru', name: '千鳥神樂', target: 'enemies', desc: '舞槍橫掃戰場，物理全體大傷害',
    effects: [{ kind: 'damage', power: 190, element: 'phys', scale: 'atk', melee: false }] },
  { id: 'ult-liz', owner: 'liz', name: '寶光亂舞', target: 'enemy', desc: '雙刃連斬 5 段',
    effects: [{ kind: 'damage', power: 85, element: 'phys', scale: 'atk', melee: true, hits: 5 }] },
  { id: 'ult-sylvie', owner: 'sylvie', name: '星穿一矢', target: 'enemy', desc: '貫穿星光的一箭，單體超高傷害',
    effects: [{ kind: 'damage', power: 420, element: 'phys', scale: 'atk', melee: false }] },
  { id: 'ult-scarlet', owner: 'scarlet', name: '紅蓮劫火', target: 'enemies', desc: '燃起紅蓮，火屬性全體大傷害',
    effects: [{ kind: 'damage', power: 220, element: 'fire', scale: 'atk', melee: false }] },
  { id: 'ult-selene', owner: 'selene', name: '滿月之祈', target: 'allies', desc: '全隊大幅回復並解毒',
    effects: [{ kind: 'heal', power: 220 }, { kind: 'cure' }] },
  { id: 'ult-safira', owner: 'safira', name: '沙漠蜃樓', target: 'allies', desc: '全隊攻擊與速度大幅提升',
    effects: [{ kind: 'buff', stat: 'atk', pct: 40, turns: 4 }, { kind: 'buff', stat: 'spd', pct: 40, turns: 4 }] },
  { id: 'ult-bobby', owner: 'bobby', name: '全彈發射', target: 'enemies', desc: '所有砲管齊射，全體 2 段',
    effects: [{ kind: 'damage', power: 110, element: 'phys', scale: 'mag', melee: false, hits: 2 }] },
  { id: 'ult-rin', owner: 'rin', name: '無聲一刺', target: 'enemy', desc: '無聲的一刺，必定暴擊',
    effects: [{ kind: 'damage', power: 300, element: 'phys', scale: 'atk', melee: true, crit: 'always' }] },
];

/** Rin's second-form ultimate, thrown once she has sworn her oath: the same blow, harder, and it steadies the hero for the fight. */
export const RIN_DAWN: UltimateDef = {
  id: 'ult-rin-dawn', owner: 'rin', name: '破鐘・黎明之刃', target: 'enemy',
  desc: '必定暴擊的一刺；擊倒目標時返還一半量表，這場戰鬥中洛恩受到的傷害降低',
  effects: [{ kind: 'damage', power: 320, element: 'phys', scale: 'atk', melee: true, crit: 'always' }],
  refundOnKill: 50,
  follow: { who: 'hero', effects: [{ kind: 'buff', stat: 'def', pct: 30, turns: 99 }] },
};

/**
 * The hero's Lantern Key: one form per branch, in branch order (劍技, 守護, 星術, 祈光, 枷鎖); engine/progression `ultimateFor`
 * picks the form of his deepest branch. Each form stays below the matching companion's ultimate.
 */
export const HERO_ULTIMATES: UltimateDef[] = [
  { id: 'ult-hero-sword', owner: 'hero', name: '燈鑰・斬', target: 'enemy', desc: '以燈鑰斬向一名敵人，物理單體大傷害',
    effects: [{ kind: 'damage', power: 340, element: 'phys', scale: 'atk', melee: true }] },
  { id: 'ult-hero-guard', owner: 'hero', name: '燈鑰・守', target: 'allies', desc: '燈鑰的光護住全隊，防禦與魔防提升',
    effects: [{ kind: 'buff', stat: 'def', pct: 30, turns: 4 }, { kind: 'buff', stat: 'res', pct: 30, turns: 4 }] },
  { id: 'ult-hero-star', owner: 'hero', name: '燈鑰・星', target: 'enemies', desc: '燈鑰引下星雷，雷屬性全體傷害',
    effects: [{ kind: 'damage', power: 190, element: 'thunder', scale: 'mag', melee: false }] },
  { id: 'ult-hero-light', owner: 'hero', name: '燈鑰・光', target: 'allies', desc: '燈鑰照亮全隊，回復並解毒',
    effects: [{ kind: 'heal', power: 180 }, { kind: 'cure' }] },
  { id: 'ult-hero-chain', owner: 'hero', name: '燈鑰・鎖', target: 'enemies', desc: '燈鑰鎖住全體敵人，攻擊與防禦下降',
    effects: [{ kind: 'buff', stat: 'atk', pct: -25, turns: 4 }, { kind: 'buff', stat: 'def', pct: -25, turns: 4 }] },
];

/** The Lantern Key at full memory: `memories` pieces turn it into the Sky Lantern, which also heals the party by `heal`. */
export const SKY_LANTERN = { heal: 25, memories: 10 };

/** A Lantern Key form lit by every memory: its own effects, then a small heal for the whole party. */
export const skyForm = (u: UltimateDef): UltimateDef => ({
  ...u, id: `${u.id}-sky`, name: '燈鑰・天燈', desc: `${u.desc}，並為全隊點亮少量回復`,
  follow: { who: 'allies', effects: [{ kind: 'heal', power: SKY_LANTERN.heal }] },
});

export const ULTIMATES = {
  ...Object.fromEntries(LIST.map((u) => [u.owner, u])),
  hero: HERO_ULTIMATES[0],
} as Record<CharacterId, UltimateDef>;
