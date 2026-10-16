import { describe, it, expect } from 'vitest';
import { CHARACTERS, CHARACTER_IDS } from './characters';
import { SKILLS } from './skills';
import { ENEMIES } from './enemies';
import { ITEMS } from './items';
import { EQUIPMENT } from './equipment';
import { MATERIALS } from './materials';
import { FLOORS } from './floors';
import { ULTIMATES } from './ultimates';

describe('data integrity', () => {
  it('matches the spec content counts', () => {
    expect(CHARACTER_IDS).toHaveLength(8);
    const enemies = Object.values(ENEMIES);
    expect(enemies.filter((e) => !e.boss)).toHaveLength(8);
    expect(enemies.filter((e) => e.boss).map((e) => e.id)).toEqual(['lanterneater']);
    expect(Object.keys(EQUIPMENT)).toHaveLength(15);
    expect(Object.keys(MATERIALS)).toHaveLength(16);
    expect(FLOORS.map((f) => f.id)).toEqual([1, 2, 3]);
  });

  it('gives every character 3–4 owned skills with one usable at level 1', () => {
    for (const id of CHARACTER_IDS) {
      const c = CHARACTERS[id];
      expect(c.id).toBe(id);
      expect(c.skills.length).toBeGreaterThanOrEqual(3);
      expect(c.skills.length).toBeLessThanOrEqual(4);
      for (const s of c.skills) {
        expect(SKILLS[s], `${id}:${s}`).toBeDefined();
        expect(SKILLS[s].owner).toBe(id);
      }
      expect(c.skills.some((s) => SKILLS[s].learnLevel === 1 && !SKILLS[s].passive)).toBe(true);
    }
  });

  it('keeps skill ids keyed by their own id and passives effect-free', () => {
    for (const [k, s] of Object.entries(SKILLS)) {
      expect(s.id).toBe(k);
      if (s.passive) { expect(s.effects).toEqual([]); expect(s.tp).toBe(0); }
      else expect(s.effects.length).toBeGreaterThan(0);
    }
  });

  it('only Selene heals or revives', () => {
    const healers = Object.values(SKILLS).filter((s) => s.effects.some((e) => e.kind === 'heal' || e.kind === 'revive'));
    expect(new Set(healers.map((s) => s.owner))).toEqual(new Set(['selene']));
  });

  it('never reuses an id across items, materials and equipment', () => {
    const ids = [...Object.keys(ITEMS), ...Object.keys(MATERIALS), ...Object.keys(EQUIPMENT)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves every cross reference', () => {
    for (const e of Object.values(ENEMIES)) for (const d of e.drops) expect(MATERIALS[d.mat], `${e.id} drop ${d.mat}`).toBeDefined();
    for (const q of Object.values(EQUIPMENT)) for (const u of q.unlock ?? []) expect(MATERIALS[u.mat], `${q.id} unlock ${u.mat}`).toBeDefined();
    for (const f of FLOORS) {
      for (const group of f.encounters) for (const id of group) {
        expect(ENEMIES[id], `floor ${f.id} enemy ${id}`).toBeDefined();
        expect(ENEMIES[id].boss).toBeFalsy();
        expect(ENEMIES[id].floor).toBe(f.id);
      }
      for (const l of f.chestLoot) expect(ITEMS[l.item] ?? MATERIALS[l.item] ?? EQUIPMENT[l.item], `floor ${f.id} chest ${l.item}`).toBeDefined();
    }
  });

  it('places every normal enemy in some encounter group', () => {
    const used = new Set(FLOORS.flatMap((f) => f.encounters.flat()));
    for (const e of Object.values(ENEMIES)) if (!e.boss) expect(used.has(e.id), e.id).toBe(true);
  });
});

describe('ultimates', () => {
  it('gives every character one ultimate with a valid target', () => {
    for (const id of CHARACTER_IDS) {
      const u = ULTIMATES[id];
      expect(u.owner).toBe(id);
      expect(['enemy', 'enemies', 'ally', 'allies', 'self']).toContain(u.target);
      expect(u.effects.length).toBeGreaterThan(0);
    }
    expect(new Set(CHARACTER_IDS.map((id) => ULTIMATES[id].id)).size).toBe(8);
  });
});
