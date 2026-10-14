import type { SkillDef } from '../engine/types';

const LIST: SkillDef[] = [
  { id: 'fire-star', name: '火之星彈', owner: 'noel', learnLevel: 1, tp: 4, target: 'enemy', desc: '火屬性魔法攻擊',
    effects: [{ kind: 'damage', power: 140, element: 'fire', scale: 'mag', melee: false }] },
  { id: 'ice-star', name: '冰之星彈', owner: 'noel', learnLevel: 2, tp: 4, target: 'enemy', desc: '冰屬性魔法攻擊',
    effects: [{ kind: 'damage', power: 140, element: 'ice', scale: 'mag', melee: false }] },
  { id: 'hex', name: '衰弱咒', owner: 'noel', learnLevel: 4, tp: 5, target: 'enemy', desc: '降低攻擊並可能中毒',
    effects: [{ kind: 'buff', stat: 'atk', pct: -25, turns: 3 }, { kind: 'inflict', status: 'poison', chance: 0.5 }] },
  { id: 'thunder-star', name: '雷之星彈', owner: 'noel', learnLevel: 6, tp: 4, target: 'enemy', desc: '雷屬性魔法攻擊',
    effects: [{ kind: 'damage', power: 140, element: 'thunder', scale: 'mag', melee: false }] },

  { id: 'sweep', name: '橫掃', owner: 'chizuru', learnLevel: 1, tp: 5, target: 'enemies', desc: '攻擊全體敵人',
    effects: [{ kind: 'damage', power: 80, element: 'phys', scale: 'atk', melee: true }] },
  { id: 'ward', name: '結界', owner: 'chizuru', learnLevel: 3, tp: 6, target: 'allies', desc: '我方全體防禦提升',
    effects: [{ kind: 'buff', stat: 'def', pct: 30, turns: 3 }] },
  { id: 'pierce', name: '貫槍', owner: 'chizuru', learnLevel: 5, tp: 5, target: 'enemy', desc: '單體強力突刺',
    effects: [{ kind: 'damage', power: 170, element: 'phys', scale: 'atk', melee: true }] },

  { id: 'twin-slash', name: '雙刃', owner: 'liz', learnLevel: 1, tp: 4, target: 'enemy', desc: '連砍 2 次',
    effects: [{ kind: 'damage', power: 60, element: 'phys', scale: 'atk', melee: true, hits: 2 }] },
  { id: 'stealth', name: '潛行', owner: 'liz', learnLevel: 2, tp: 0, target: 'self', desc: '被動：遇敵率減半', effects: [], passive: 'encounterDown' },
  { id: 'treasure-sense', name: '尋寶直覺', owner: 'liz', learnLevel: 4, tp: 0, target: 'self', desc: '被動：素材掉落率加倍', effects: [], passive: 'dropBoost' },
  { id: 'triple-slash', name: '三連刃', owner: 'liz', learnLevel: 6, tp: 7, target: 'enemy', desc: '連砍 3 次',
    effects: [{ kind: 'damage', power: 55, element: 'phys', scale: 'atk', melee: true, hits: 3 }] },

  { id: 'aimed-shot', name: '瞄準射擊', owner: 'sylvie', learnLevel: 1, tp: 5, target: 'enemy', desc: '單體高傷害射擊',
    effects: [{ kind: 'damage', power: 170, element: 'phys', scale: 'atk', melee: false }] },
  { id: 'pin-shot', name: '釘足箭', owner: 'sylvie', learnLevel: 3, tp: 4, target: 'enemy', desc: '射擊並降低速度',
    effects: [{ kind: 'damage', power: 90, element: 'phys', scale: 'atk', melee: false }, { kind: 'buff', stat: 'spd', pct: -30, turns: 3 }] },
  { id: 'arrow-rain', name: '箭雨', owner: 'sylvie', learnLevel: 6, tp: 7, target: 'enemies', desc: '射擊全體敵人',
    effects: [{ kind: 'damage', power: 75, element: 'phys', scale: 'atk', melee: false }] },

  { id: 'provoke', name: '挑釁', owner: 'scarlet', learnLevel: 1, tp: 3, target: 'self', desc: '3 回合內吸引敵人單體攻擊',
    effects: [{ kind: 'taunt', turns: 3 }] },
  { id: 'flame-burst', name: '爆炎斬', owner: 'scarlet', learnLevel: 3, tp: 3, hpCost: 0.15, target: 'enemy', desc: '消耗 15% HP 的火屬性重擊',
    effects: [{ kind: 'damage', power: 220, element: 'fire', scale: 'atk', melee: true }] },
  { id: 'iron-wall', name: '鐵壁', owner: 'scarlet', learnLevel: 5, tp: 4, target: 'self', desc: '自身防禦大幅提升',
    effects: [{ kind: 'buff', stat: 'def', pct: 40, turns: 3 }] },

  { id: 'moonlight', name: '月光', owner: 'selene', learnLevel: 1, tp: 5, target: 'ally', desc: '回復一名隊友 HP',
    effects: [{ kind: 'heal', power: 120 }] },
  { id: 'cleanse', name: '淨化', owner: 'selene', learnLevel: 2, tp: 3, target: 'ally', desc: '解除毒與睡眠', effects: [{ kind: 'cure' }] },
  { id: 'dream', name: '夢境', owner: 'selene', learnLevel: 4, tp: 6, target: 'enemies', desc: '可能使全體敵人睡眠',
    effects: [{ kind: 'inflict', status: 'sleep', chance: 0.6 }] },
  { id: 'rebirth', name: '月之再生', owner: 'selene', learnLevel: 6, tp: 10, target: 'deadAlly', desc: '復活倒下的隊友',
    effects: [{ kind: 'revive', hpPct: 0.3 }] },

  { id: 'blade-dance', name: '刃舞', owner: 'safira', learnLevel: 1, tp: 5, target: 'enemy', desc: '連砍 3 次',
    effects: [{ kind: 'damage', power: 50, element: 'phys', scale: 'atk', melee: true, hits: 3 }] },
  { id: 'war-dance', name: '戰舞', owner: 'safira', learnLevel: 3, tp: 7, target: 'allies', desc: '我方全體攻擊提升',
    effects: [{ kind: 'buff', stat: 'atk', pct: 25, turns: 3 }] },
  { id: 'mirage', name: '幻步', owner: 'safira', learnLevel: 5, tp: 5, target: 'allies', desc: '我方全體速度提升',
    effects: [{ kind: 'buff', stat: 'spd', pct: 30, turns: 3 }] },

  { id: 'turret', name: '設置砲台', owner: 'bobby', learnLevel: 1, tp: 8, target: 'self', desc: '3 回合內每回合結束時砲擊一名敵人',
    effects: [{ kind: 'turret', power: 70, turns: 3 }] },
  { id: 'tinker', name: '改造', owner: 'bobby', learnLevel: 2, tp: 0, target: 'self', desc: '被動：戰鬥中道具效果加倍', effects: [], passive: 'itemBoost' },
  { id: 'barrier', name: '護盾裝置', owner: 'bobby', learnLevel: 4, tp: 6, target: 'allies', desc: '我方全體防禦提升',
    effects: [{ kind: 'buff', stat: 'def', pct: 25, turns: 3 }] },
];

export const SKILLS: Record<string, SkillDef> = Object.fromEntries(LIST.map((s) => [s.id, s]));
