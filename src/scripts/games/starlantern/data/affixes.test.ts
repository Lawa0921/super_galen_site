import { describe, expect, it } from 'vitest';
import { AFFIXES, AFFIX_IDS } from './affixes';

describe('the affixes (difficulty plan Task 3)', () => {
  it('six affixes, each said in one line', () => {
    expect(AFFIX_IDS).toEqual(['scorch', 'frostbind', 'thunder', 'rend', 'tough', 'swift']);
    expect(AFFIX_IDS.map((id) => AFFIXES[id].name)).toEqual(['灼熱', '霜縛', '雷霆', '裂刃', '堅韌', '迅捷']);
    for (const id of AFFIX_IDS) {
      const { line } = AFFIXES[id];
      expect(line.length, id).toBeGreaterThan(0);
      expect(line, id).not.toMatch(/[0-9０-９]/);
      expect(line.split('。').length - 1, id).toBe(1);
      expect(line.endsWith('。'), id).toBe(true);
      expect(line, id).not.toContain('……');
    }
    // The skill each brings and the ailment it inflicts (spec §5.3).
    const inflicts = (id: (typeof AFFIX_IDS)[number]) => AFFIXES[id].skill?.effects.flatMap((e) => (e.kind === 'inflict' ? [[e.status, e.chance]] : []));
    expect(AFFIXES.scorch.skill).toMatchObject({ name: '灼擊', chance: 0.35, target: 'enemy' });
    expect(inflicts('scorch')).toEqual([['burn', 0.35]]);
    expect(AFFIXES.frostbind.skill).toMatchObject({ name: '霜縛', chance: 0.3, target: 'row' });
    expect(inflicts('frostbind')).toEqual([['freeze', 0.5]]);
    expect(AFFIXES.thunder.skill).toMatchObject({ name: '雷霆', chance: 0.3, target: 'cross' });
    expect(inflicts('thunder')).toEqual([['shock', 0.4]]);
    expect(AFFIXES.rend.skill).toMatchObject({ name: '裂刃', chance: 0.35, target: 'enemy' });
    expect(inflicts('rend')).toEqual([['bleed', 0.5]]);
    expect(AFFIXES.tough).toMatchObject({ hp: 1.4, bossHp: 1.25 });
    expect(AFFIXES.tough.skill).toBeUndefined();
    expect(AFFIXES.swift).toMatchObject({ spd: 1.25 });
    expect(AFFIXES.swift.skill).toBeUndefined();
  });
});
