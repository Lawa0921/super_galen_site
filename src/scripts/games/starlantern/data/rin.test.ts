import { describe, expect, it } from 'vitest';
import type { CharacterId } from '../engine/types';
import { CHARACTERS, CHARACTER_IDS } from './characters';
import { SKILLS } from './skills';
import { TREES } from './trees';

const FRONT: CharacterId[] = ['chizuru', 'liz', 'scarlet', 'safira'];
const avg = (pick: (id: CharacterId) => number) => FRONT.reduce((n, id) => n + pick(id), 0) / FRONT.length;
const rinSkills = () => TREES.rin.branches.flatMap((b) => b.nodes).filter((n) => n.kind === 'active').map((n) => SKILLS[n.skill]);
const rinDamage = () => rinSkills().flatMap((sk) => sk.effects).filter((e) => e.kind === 'damage');

describe('rin', () => {
  it("rin's HP and DEF are about 15% above the front line", () => {
    for (const stat of ['hp', 'def'] as const) {
      for (const part of ['base', 'growth'] as const) {
        const ratio = CHARACTERS.rin[part][stat] / avg((id) => CHARACTERS[id][part][stat]);
        expect(ratio, `${part}.${stat}`).toBeGreaterThanOrEqual(1.1);
        expect(ratio, `${part}.${stat}`).toBeLessThanOrEqual(1.25);
      }
    }
  });

  it('rin is the fastest', () => {
    for (const id of CHARACTER_IDS.filter((x) => x !== 'rin')) expect(CHARACTERS.rin.base.spd, id).toBeGreaterThan(CHARACTERS[id].base.spd);
  });

  it("rin's kit has her execution and backstab", () => {
    const dmg = rinDamage();
    expect(dmg.some((e) => e.crit === 'always')).toBe(true);
    expect(dmg.some((e) => e.execute !== undefined)).toBe(true);
    expect(dmg.some((e) => e.wounded !== undefined)).toBe(true);
  });

  it('rin is ninth, leads the id list and is a melee front-liner of agility', () => {
    expect(CHARACTER_IDS).toEqual(['rin', 'noel', 'chizuru', 'liz', 'sylvie', 'scarlet', 'selene', 'safira', 'bobby']);
    expect(CHARACTERS.rin).toMatchObject({ name: '凜', title: '失憶的短刃使', row: 'front', melee: true, affinity: 'agi' });
  });

  it('every rin skill is owned by her and has the stated tp cost', () => {
    const cost = { 'rin-needle': 3, 'rin-fan': 6, 'rin-venom-needle': 5, 'rin-storm': 13, 'rin-backstab': 4, 'rin-veil': 4, 'rin-shadowless': 12, 'rin-mark': 4, 'rin-execute': 8, 'rin-deathblow': 14 };
    for (const sk of rinSkills()) expect(sk.owner).toBe('rin');
    for (const [id, tp] of Object.entries(cost)) expect(SKILLS[id].tp, id).toBe(tp);
  });
});
