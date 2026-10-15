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
];

export const ULTIMATES = Object.fromEntries(LIST.map((u) => [u.owner, u])) as Record<CharacterId, UltimateDef>;
