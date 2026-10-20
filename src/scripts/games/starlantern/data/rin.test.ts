import { describe, expect, it } from 'vitest';
import type { CharacterId } from '../engine/types';
import { CHARACTERS, CHARACTER_IDS } from './characters';
import { SKILLS } from './skills';
import { ULTIMATES } from './ultimates';
import { TREES } from './trees';

const FRONT: CharacterId[] = ['chizuru', 'liz', 'scarlet', 'safira'];
const avg = (pick: (id: CharacterId) => number) => FRONT.reduce((n, id) => n + pick(id), 0) / FRONT.length;
const rinSkills = () => TREES.rin.branches.flatMap((b) => b.nodes).filter((n) => n.kind === 'active').map((n) => SKILLS[n.skill]);

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

  it('rin is strictly the fastest at every level from 1 to 50 (spec 9.3)', () => {
    const spd = (id: CharacterId, level: number) => CHARACTERS[id].base.spd + CHARACTERS[id].growth.spd * (level - 1);
    for (let level = 1; level <= 50; level++) {
      for (const id of CHARACTER_IDS.filter((x) => x !== 'rin')) expect(spd('rin', level), `${id} Lv${level}`).toBeGreaterThan(spd(id, level));
    }
  });

  it("rin's kit has her execution and backstab, each on the skills that name them", () => {
    const dmg = (id: string) => SKILLS[id].effects.flatMap((e) => (e.kind === 'damage' ? [e] : []));
    for (const id of ['rin-execute', 'rin-deathblow']) {
      expect(dmg(id).every((e) => e.crit === 'always' && (e.execute ?? 0) > 0), id).toBe(true);
    }
    for (const id of ['rin-backstab', 'rin-shadowless']) {
      expect(dmg(id).every((e) => (e.wounded ?? 0) > 0), id).toBe(true);
    }
    // the rest of her kit is plain damage, so a flag cannot drift onto the wrong skill unnoticed
    const flagged = new Set(['rin-execute', 'rin-deathblow', 'rin-backstab', 'rin-shadowless']);
    for (const sk of rinSkills().filter((s) => !flagged.has(s.id))) {
      for (const e of sk.effects) {
        if (e.kind === 'damage') expect(e.execute !== undefined || e.wounded !== undefined || e.crit === 'always', sk.id).toBe(false);
      }
    }
  });

  it('her ultimate always crits for 300 power', () => {
    expect(ULTIMATES.rin.effects).toEqual([{ kind: 'damage', power: 300, element: 'phys', scale: 'atk', melee: true, crit: 'always' }]);
  });

  it("pins rin's base stats and growth", () => {
    expect(CHARACTERS.rin.base).toEqual({ hp: 46, tp: 16, atk: 13, def: 12, mag: 4, res: 7, spd: 15 });
    expect(CHARACTERS.rin.growth).toEqual({ hp: 6.7, tp: 2, atk: 2, def: 1.8, mag: 1, res: 1, spd: 2 });
  });

  it('rin is ninth, follows the hero at the head of the id list and is a melee front-liner of agility', () => {
    expect(CHARACTER_IDS).toEqual(['hero', 'rin', 'noel', 'chizuru', 'liz', 'sylvie', 'scarlet', 'selene', 'safira', 'bobby']);
    expect(CHARACTERS.rin).toMatchObject({ name: '凜', title: '失憶的短刃使', row: 'front', melee: true, affinity: 'agi' });
  });

  it('every rin skill is owned by her and has the stated tp cost', () => {
    const cost = { 'rin-needle': 3, 'rin-fan': 6, 'rin-venom-needle': 5, 'rin-storm': 13, 'rin-backstab': 4, 'rin-veil': 4, 'rin-shadowless': 12, 'rin-mark': 6, 'rin-execute': 8, 'rin-deathblow': 14 };
    for (const sk of rinSkills()) expect(sk.owner).toBe('rin');
    for (const [id, tp] of Object.entries(cost)) expect(SKILLS[id].tp, id).toBe(tp);
  });
});
