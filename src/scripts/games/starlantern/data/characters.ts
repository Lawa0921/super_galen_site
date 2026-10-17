import type { CharacterDef, CharacterId, GrowthRules } from '../engine/types';

export const CHARACTER_IDS: CharacterId[] = ['rin', 'noel', 'chizuru', 'liz', 'sylvie', 'scarlet', 'selene', 'safira', 'bobby'];

/** The eight characters before Rin, in their old order. Balance baselines (enemy scaling) and kitParty's gear draws stay on them. */
export const LEGACY_CHARACTER_IDS: CharacterId[] = ['noel', 'chizuru', 'liz', 'sylvie', 'scarlet', 'selene', 'safira', 'bobby'];

const s = (hp: number, tp: number, atk: number, def: number, mag: number, res: number, spd: number) => ({ hp, tp, atk, def, mag, res, spd });

/** The growth rules every character follows unless its CharacterDef.rules says otherwise. */
export const DEFAULT_RULES: GrowthRules = { curve: 'companion', branches: 3, capstones: 1, boardCols: 4, maxKeystones: 2 };

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  noel: { id: 'noel', title: '見習魔女', name: '諾艾兒', row: 'back', melee: false,
    base: s(28, 30, 6, 5, 14, 10, 9), growth: s(4, 4, 1, 1, 3, 2, 1), affinity: 'int' },
  chizuru: { id: 'chizuru', title: '巫女槍兵', name: '千鶴', row: 'front', melee: true,
    base: s(42, 16, 12, 11, 5, 7, 8), growth: s(6, 2, 2, 2, 1, 1, 1), affinity: 'str' },
  liz: { id: 'liz', title: '尋寶獵人', name: '莉茲', row: 'front', melee: true,
    base: s(34, 14, 11, 8, 4, 6, 13), growth: s(5, 2, 2, 1, 1, 1, 2), affinity: 'agi' },
  sylvie: { id: 'sylvie', title: '森林遊俠', name: '希爾薇', row: 'back', melee: false,
    base: s(30, 16, 12, 6, 5, 7, 12), growth: s(4, 2, 2, 1, 1, 1, 2), affinity: 'agi' },
  scarlet: { id: 'scarlet', title: '火焰騎士', name: '絲嘉蕾', row: 'front', melee: true,
    base: s(48, 14, 13, 13, 6, 6, 7), growth: s(7, 2, 2, 2, 1, 1, 1), affinity: 'str' },
  selene: { id: 'selene', title: '月之法師', name: '瑟蕾', row: 'back', melee: false,
    base: s(26, 32, 5, 5, 13, 12, 9), growth: s(4, 4, 1, 1, 3, 2, 1), affinity: 'wil' },
  safira: { id: 'safira', title: '沙漠舞劍士', name: '莎菲拉', row: 'front', melee: true,
    base: s(36, 16, 12, 8, 5, 7, 14), growth: s(5, 2, 2, 1, 1, 1, 2), affinity: 'agi' },
  bobby: { id: 'bobby', title: '技師', name: '波比', row: 'back', melee: false,
    base: s(32, 22, 9, 8, 10, 8, 8), growth: s(5, 3, 1, 1, 2, 1, 1), affinity: 'int' },
  rin: { id: 'rin', title: '失憶的短刃使', name: '凜', row: 'front', melee: true,
    base: s(46, 16, 13, 12, 4, 7, 15), growth: s(6.7, 2, 2, 1.8, 1, 1, 2), affinity: 'agi' },
  // The hero joins CHARACTER_IDS (and the roster) in plan 6a Task 5.
  hero: { id: 'hero', title: '歸來者', name: '洛恩', row: 'front', melee: true, affinity: 'all', weaponMaster: true,
    rules: { curve: 'hero', branches: 5, capstones: 2, boardCols: 6, maxKeystones: 3 },
    base: s(44, 20, 12, 10, 9, 8, 10), growth: s(6.3, 3, 2, 1.8, 2, 1.5, 1.5) },
};

/** The growth rules of `id`: DEFAULT_RULES with the character's own overrides on top. */
export const rulesOf = (id: CharacterId): GrowthRules => ({ ...DEFAULT_RULES, ...CHARACTERS[id].rules });
