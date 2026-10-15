import type { EnemyDef } from '../engine/types';

const s = (hp: number, atk: number, def: number, mag: number, res: number, spd: number) => ({ hp, tp: 0, atk, def, mag, res, spd });

const LIST: EnemyDef[] = [
  { id: 'slime', name: '苔蘚史萊姆', floor: 1, stats: s(60, 18, 5, 10, 5, 5), weak: ['fire'], resist: [], exp: 5, gold: 4,
    drops: [{ mat: 'moss', chance: 0.6 }],
    skills: [{ name: '酸液', chance: 0.3, target: 'enemy', effects: [{ kind: 'inflict', status: 'poison', chance: 0.4 }] }] },
  { id: 'bat', name: '遺跡蝙蝠', floor: 1, stats: s(44, 20, 4, 6, 4, 14), weak: ['thunder'], resist: [], exp: 4, gold: 5,
    drops: [{ mat: 'bat-wing', chance: 0.5 }], skills: [] },
  { id: 'wolf', name: '荊棘狼', floor: 1, stats: s(80, 26, 7, 6, 5, 11), weak: ['fire'], resist: ['ice'], exp: 9, gold: 8,
    drops: [{ mat: 'thorn-fang', chance: 0.5 }],
    skills: [{ name: '咆哮', chance: 0.2, target: 'self', effects: [{ kind: 'buff', stat: 'atk', pct: 25, turns: 3 }] }] },
  { id: 'beetle', name: '晶殼甲蟲', floor: 2, stats: s(140, 32, 18, 8, 6, 6), weak: ['thunder'], resist: ['phys'], exp: 18, gold: 14,
    drops: [{ mat: 'crystal-shell', chance: 0.5 }], skills: [] },
  { id: 'wisp', name: '冰晶精靈', floor: 2, stats: s(100, 16, 6, 36, 16, 13), weak: ['fire'], resist: ['ice'], exp: 20, gold: 15,
    drops: [{ mat: 'ice-crystal', chance: 0.5 }],
    skills: [{ name: '冰霧', chance: 0.5, target: 'enemies', effects: [{ kind: 'damage', power: 70, element: 'ice', scale: 'mag', melee: false }] }] },
  { id: 'lizard', name: '洞窟蜥蜴', floor: 2, stats: s(170, 40, 12, 8, 8, 10), weak: ['ice'], resist: [], exp: 22, gold: 16,
    drops: [{ mat: 'lizard-scale', chance: 0.5 }],
    skills: [{ name: '甩尾', chance: 0.3, target: 'enemies', effects: [{ kind: 'damage', power: 60, element: 'phys', scale: 'atk', melee: true }] }] },
  { id: 'golem', name: '神殿石像', floor: 3, stats: s(280, 65, 24, 10, 10, 5), weak: ['thunder'], resist: ['phys'], exp: 40, gold: 30,
    drops: [{ mat: 'star-stone', chance: 0.5 }], skills: [] },
  { id: 'shade', name: '暮影法師', floor: 3, stats: s(180, 30, 10, 70, 20, 15), weak: ['phys'], resist: ['fire'], exp: 42, gold: 32,
    drops: [{ mat: 'dusk-cloth', chance: 0.5 }],
    skills: [
      { name: '暮色搖籃曲', chance: 0.25, target: 'enemies', effects: [{ kind: 'inflict', status: 'sleep', chance: 0.4 }] },
      { name: '影炎', chance: 0.4, target: 'enemy', effects: [{ kind: 'damage', power: 130, element: 'fire', scale: 'mag', melee: false }] },
    ] },
  { id: 'lanterneater', name: '燈喰之獸', floor: 3, boss: true, stats: s(1100, 36, 20, 30, 20, 12), weak: ['ice'], resist: ['fire'], exp: 300, gold: 0,
    drops: [],
    skills: [
      { name: '吞光', chance: 0.35, target: 'enemies', effects: [{ kind: 'damage', power: 110, element: 'fire', scale: 'mag', melee: false }] },
      { name: '碾壓', chance: 0.3, target: 'enemy', effects: [{ kind: 'damage', power: 160, element: 'phys', scale: 'atk', melee: true }] },
    ] },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(LIST.map((e) => [e.id, e]));
