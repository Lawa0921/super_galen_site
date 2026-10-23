/**
 * The elite and boss affixes of the higher difficulties (spec §5.3, difficulty plan Task 3): six, each said in one line.
 * Every one is told with existing fields: a skill the foe learns (it leads its skills, at its own chance), or an HP or
 * speed multiplier applied with the tier's (before compensation; a boss takes `bossHp`). Drawn by the spot
 * (engine/tiers.ts), applied by the fight (engine/battle.ts createBattle); Normal has none. The spec's 雷殛 is 雷霆 here:
 * 殛 is not in the Cubic 11 font (data/glyphs.test.ts).
 */
import type { EnemySkill } from '../engine/types';

export type AffixId = 'scorch' | 'frostbind' | 'thunder' | 'rend' | 'tough' | 'swift';
/** The affixes in the order they are drawn from. */
export const AFFIX_IDS: readonly AffixId[] = ['scorch', 'frostbind', 'thunder', 'rend', 'tough', 'swift'];

/** One affix: its name and line (the battle's tag and target note), and what it does. */
export interface AffixDef { name: string; line: string; skill?: EnemySkill; hp?: number; bossHp?: number; spd?: number }

export const AFFIXES: Record<AffixId, AffixDef> = {
  scorch: {
    name: '灼熱', line: '多一招灼擊，打中的人會燒起來。',
    skill: { name: '灼擊', chance: 0.35, target: 'enemy', effects: [{ kind: 'damage', power: 100, element: 'phys', scale: 'atk', melee: true }, { kind: 'inflict', status: 'burn', chance: 0.35 }] },
  },
  frostbind: {
    name: '霜縛', line: '多一招霜縛，寒氣掃過整排，被掃到的人動作會變慢。',
    skill: { name: '霜縛', chance: 0.3, target: 'row', effects: [{ kind: 'damage', power: 60, element: 'ice', scale: 'mag', melee: false }, { kind: 'inflict', status: 'freeze', chance: 0.5 }] },
  },
  thunder: {
    name: '雷霆', line: '多一招雷霆，十字落雷會讓人觸電。',
    skill: { name: '雷霆', chance: 0.3, target: 'cross', effects: [{ kind: 'damage', power: 60, element: 'thunder', scale: 'mag', melee: false }, { kind: 'inflict', status: 'shock', chance: 0.4 }] },
  },
  rend: {
    name: '裂刃', line: '多一招裂刃，砍中就血流不止。',
    skill: { name: '裂刃', chance: 0.35, target: 'enemy', effects: [{ kind: 'damage', power: 90, element: 'phys', scale: 'atk', melee: true }, { kind: 'inflict', status: 'bleed', chance: 0.5 }] },
  },
  tough: { name: '堅韌', line: '皮又粗又厚，得多打好幾下才會倒。', hp: 1.4, bossHp: 1.25 },
  swift: { name: '迅捷', line: '腳步飛快，常常搶在大家前面出手。', spd: 1.25 },
};
