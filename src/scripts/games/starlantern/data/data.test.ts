import { describe, it, expect } from 'vitest';
import { CHARACTERS, CHARACTER_IDS } from './characters';
import { SKILLS } from './skills';
import { ENEMIES } from './enemies';
import { ITEMS } from './items';
import { EQUIPMENT } from './equipment';
import { slotsFor } from '../engine/party';
import { GEAR_SLOTS } from './gear';
import { MATERIALS } from './materials';
import { FLOORS } from './floors';
import { ULTIMATES } from './ultimates';

describe('data integrity', () => {
  it('matches the spec content counts', () => {
    expect(CHARACTER_IDS).toHaveLength(9);
    const enemies = Object.values(ENEMIES);
    expect(enemies.filter((e) => !e.boss)).toHaveLength(8);
    expect(enemies.filter((e) => e.boss).map((e) => e.id)).toEqual(['lanterneater']);
    expect(Object.keys(EQUIPMENT)).toHaveLength(25);
    expect(Object.keys(MATERIALS)).toHaveLength(22);
    expect(FLOORS.map((f) => f.id)).toEqual([1, 2, 3]);
  });

  it('keeps skill ids keyed by their own id and passives effect-free', () => {
    for (const [k, s] of Object.entries(SKILLS)) {
      expect(s.id).toBe(k);
      if (s.passive) { expect(s.effects).toEqual([]); expect(s.tp).toBe(0); }
      else expect(s.effects.length).toBeGreaterThan(0);
    }
  });

  it('only Selene revives', () => {
    const revivers = Object.values(SKILLS).filter((s) => s.effects.some((e) => e.kind === 'revive'));
    expect(new Set(revivers.map((s) => s.owner))).toEqual(new Set(['selene']));
  });

  it('heals belong to the healers', () => {
    const healers = Object.values(SKILLS).filter((s) => s.effects.some((e) => e.kind === 'heal'));
    for (const s of healers) expect(['selene', 'chizuru', 'bobby', 'hero']).toContain(s.owner);
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

describe('equipment bases', () => {
  it('every base has a known GearSlot and an ilvl >= 1', () => {
    for (const e of Object.values(EQUIPMENT)) {
      expect(GEAR_SLOTS, e.id).toContain(e.slot);
      expect(e.ilvl, e.id).toBeGreaterThanOrEqual(1);
    }
    expect(EQUIPMENT['gear-ring']).toMatchObject({ slot: 'ring', ilvl: 10 });
    expect(EQUIPMENT['moss-charm']).toMatchObject({ slot: 'neck', ilvl: 2 });
    expect(EQUIPMENT['scale-mail']).toMatchObject({ slot: 'body', ilvl: 7 });
    expect(EQUIPMENT['crystal-aegis']).toMatchObject({ slot: 'offhand', ilvl: 8, bonus: { def: 5, res: 3 }, unlock: [{ mat: 'crystal-shell', qty: 4 }] });
  });
  it('every base can be worn somewhere, rings in either ring slot', () => {
    for (const e of Object.values(EQUIPMENT)) expect(slotsFor(e.slot).length, e.id).toBeGreaterThan(0);
    expect(slotsFor('ring')).toEqual(['ring1', 'ring2']);
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
    expect(new Set(CHARACTER_IDS.map((id) => ULTIMATES[id].id)).size).toBe(CHARACTER_IDS.length);
  });
});

describe('affinity', () => {
  it('every character has an affinity', () => {
    const keys = ['str', 'int', 'agi', 'wil'];
    const want = { noel: 'int', chizuru: 'str', liz: 'agi', sylvie: 'agi', scarlet: 'str', selene: 'wil', safira: 'agi', bobby: 'int', rin: 'agi' };
    for (const id of CHARACTER_IDS) {
      expect(keys).toContain(CHARACTERS[id].affinity);
      expect(CHARACTERS[id].affinity).toBe(want[id as keyof typeof want]);
    }
  });
});
