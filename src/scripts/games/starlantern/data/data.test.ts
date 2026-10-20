import { describe, it, expect } from 'vitest';
import { CHARACTERS, CHARACTER_IDS } from './characters';
import { SKILLS } from './skills';
import { ENEMIES } from './enemies';
import { ITEMS } from './items';
import { EQUIPMENT, WEAPON_KINDS, weaponKindOf } from './equipment';
import { slotsFor } from '../engine/party';
import { GEAR_SLOTS, SPECIALS } from './gear';
import { MATERIALS } from './materials';
import { NODES } from './trees';
import { FLOORS } from './floors';
import { ULTIMATES } from './ultimates';
import { MEETINGS } from './meetings';
import { STORY } from './story.zh-TW';

describe('meeting copy', () => {
  it('every companion has meeting copy', () => {
    for (const m of MEETINGS) {
      const t = STORY.meet[m.id];
      expect(t, m.id).toBeDefined();
      expect(t.before.length).toBeGreaterThanOrEqual(1);
      for (const l of [...t.before, ...t.after]) expect(l.text.trim()).not.toBe('');
    }
    expect(Object.keys(STORY.meet).sort()).toEqual(MEETINGS.map((m) => m.id).sort());
  });
});

describe('data integrity', () => {
  it('matches the spec content counts', () => {
    expect(CHARACTER_IDS).toHaveLength(10);
    const enemies = Object.values(ENEMIES);
    expect(enemies.filter((e) => !e.boss && !e.story)).toHaveLength(8);
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

  it('field skills are exactly the party heals and revives', () => {
    for (const s of Object.values(SKILLS)) {
      const recovers = !s.passive && !s.hpCost && ['ally', 'allies', 'deadAlly'].includes(s.target)
        && s.effects.some((e) => e.kind === 'heal' || e.kind === 'revive');
      expect(!!s.field, s.id).toBe(recovers);
    }
  });

  it('the field list is the nine recovery skills (plan 8c: the purifying barrier is a battle skill)', () => {
    const field = Object.values(SKILLS).filter((s) => s.field).map((s) => s.id);
    expect(new Set(field)).toEqual(new Set([
      'hero-mend', 'hero-prayer', 'abyss-light',
      'moonlight', 'moon-rain', 'full-moon', 'rebirth',
      'repair-kit', 'emergency-repair',
    ]));
  });

  it('cure-only skills are not field skills', () => {
    for (const id of ['cleanse', 'hero-purify', 'purify-ward']) expect(SKILLS[id].field, id).toBeUndefined();
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
    for (const e of Object.values(ENEMIES)) if (!e.boss && !e.story) expect(used.has(e.id), e.id).toBe(true);
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

describe('weapon kinds', () => {
  it('every weapon base has a kind and every kind grants the hero mastery somewhere', () => {
    for (const e of Object.values(EQUIPMENT)) {
      if (e.slot === 'weapon') expect(WEAPON_KINDS[e.weaponKind!], e.id).toBeDefined();
      else expect(e.weaponKind, e.id).toBeUndefined();
    }
    const branches = new Set(Object.values(NODES).filter((n) => n.owner === 'hero').map((n) => n.branch));
    for (const [kind, def] of Object.entries(WEAPON_KINDS)) {
      expect(def.mastery.length, kind).toBeGreaterThan(0);
      for (const b of def.mastery) expect(branches.has(b), kind).toBe(true);
    }
    expect(Object.fromEntries(Object.values(EQUIPMENT).filter((e) => e.slot === 'weapon').map((e) => [e.id, e.weaponKind]))).toEqual({
      'iron-sword': 'sword', 'crystal-blade': 'dagger', 'star-saber': 'scimitar', 'thorn-spear': 'spear',
      'hunter-bow': 'bow', 'wooden-staff': 'staff', 'frost-staff': 'staff',
    });
  });
});

describe('every weapon-slot def has a kind', () => {
  it('bases, legendaries, uniques and set weapons alike', () => {
    for (const e of Object.values(EQUIPMENT)) if (e.slot === 'weapon') expect(WEAPON_KINDS[e.weaponKind!], e.id).toBeDefined();
    const weapons = Object.values(SPECIALS).filter((s) => s.slot === 'weapon');
    expect(weapons.length).toBeGreaterThanOrEqual(10);
    for (const s of weapons) expect(WEAPON_KINDS[s.weaponKind!], s.id).toBeDefined();
    for (const s of Object.values(SPECIALS)) if (s.slot !== 'weapon') expect(s.weaponKind, s.id).toBeUndefined();
    expect(Object.fromEntries(weapons.filter((s) => !s.set).map((s) => [s.id, s.weaponKind]))).toEqual({
      'lg-chizuru': 'spear', 'lg-liz': 'spear', 'blaze-heart-sword': 'sword', 'frost-winter-staff': 'staff',
      'storm-thunder-bow': 'bow', 'shade-silent-blade': 'dagger',
    });
    for (const s of weapons.filter((s) => s.set)) expect(s.weaponKind, s.id).toBe('sword');
  });
  it('weaponKindOf prefers the special over its generic base', () => {
    expect(weaponKindOf({ base: 'iron-sword' })).toBe('sword');
    expect(weaponKindOf({ base: 'iron-sword', special: 'frost-winter-staff' })).toBe('staff');
    expect(weaponKindOf({ base: 'moss-charm' })).toBeUndefined();
    expect(weaponKindOf(undefined)).toBeUndefined();
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
    const keys = ['str', 'int', 'agi', 'wil', 'all'];
    const want = { noel: 'int', chizuru: 'str', liz: 'agi', sylvie: 'agi', scarlet: 'str', selene: 'wil', safira: 'agi', bobby: 'int', rin: 'agi', hero: 'all' };
    for (const id of CHARACTER_IDS) {
      expect(keys).toContain(CHARACTERS[id].affinity);
      expect(CHARACTERS[id].affinity).toBe(want[id as keyof typeof want]);
    }
  });
});
