import type { Element, EnemySkill } from '../engine/types';

export type RegionId = 'mainline' | 'blaze' | 'frost' | 'storm' | 'mire' | 'shade' | 'iron';

export interface RegionDef {
  id: RegionId; name: string;
  /** Floor tile theme: one of the three existing themes, or `cycle` to follow the depth. */
  terrain: 1 | 2 | 3 | 'cycle';
  element: Element | null;
  trait: 'burn' | 'chill' | 'swift' | 'poison' | 'evasive' | 'armored' | null;
  weak: Element[]; resist: Element[];
  /** The extra attack every monster of the region learns. */
  skill: EnemySkill | null;
  /** Region material id (see data/materials.ts). */
  material: string | null;
}

export const REGIONS: Record<RegionId, RegionDef> = {
  mainline: { id: 'mainline', name: '星燈迷宮・本道', terrain: 'cycle', element: null, trait: null, weak: [], resist: [], skill: null, material: null },
  blaze: {
    id: 'blaze', name: '熾焰之地', terrain: 3, element: 'fire', trait: 'burn', weak: ['ice'], resist: ['fire'], material: 'blaze-core',
    skill: { name: '烈焰吐息', chance: 0.3, target: 'row', effects: [{ kind: 'damage', power: 70, element: 'fire', scale: 'mag', melee: false }] },
  },
  frost: {
    id: 'frost', name: '霜凍之地', terrain: 2, element: 'ice', trait: 'chill', weak: ['fire'], resist: ['ice'], material: 'frost-heart',
    skill: { name: '凜冬吐息', chance: 0.3, target: 'column', effects: [{ kind: 'damage', power: 70, element: 'ice', scale: 'mag', melee: false }] },
  },
  storm: {
    id: 'storm', name: '雷鳴之地', terrain: 3, element: 'thunder', trait: 'swift', weak: ['phys'], resist: ['thunder'], material: 'storm-stone',
    skill: { name: '連環落雷', chance: 0.3, target: 'cross', effects: [{ kind: 'damage', power: 60, element: 'thunder', scale: 'mag', melee: false }] },
  },
  mire: {
    id: 'mire', name: '腐毒沼澤', terrain: 1, element: null, trait: 'poison', weak: ['fire'], resist: ['phys'], material: 'mire-gland',
    skill: { name: '瘴氣噴吐', chance: 0.3, target: 'cross', effects: [{ kind: 'inflict', status: 'poison', chance: 0.6 }] },
  },
  shade: {
    id: 'shade', name: '暗影迴廊', terrain: 3, element: null, trait: 'evasive', weak: ['thunder'], resist: [], material: 'shade-crystal',
    skill: { name: '影襲', chance: 0.3, target: 'enemy', effects: [{ kind: 'damage', power: 120, element: 'phys', scale: 'atk', melee: true }] },
  },
  iron: {
    id: 'iron', name: '鋼鐵要塞', terrain: 3, element: null, trait: 'armored', weak: ['thunder'], resist: ['phys'], material: 'iron-shard',
    skill: { name: '鐵壁重擊', chance: 0.3, target: 'row', effects: [{ kind: 'damage', power: 80, element: 'phys', scale: 'atk', melee: true }] },
  },
};
