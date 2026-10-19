import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { castField, fieldCost, fieldSkills, fieldTargets, noDraw } from './field';
import { createBattle, fromMember, skillCost, skillFor } from './battle';
import { applyEffect, patchSkill, type EffectContext } from './skills';
import { pctMod } from './progression';
import { abyssPct } from './scaling';
import { activeIds, statsOf, STANDARD_LINEUP } from './party';
import { newGame, type GameState } from './state';
import { fullParty, plainItem } from './testing';
import { mulberry32 } from './rng';
import { SKILLS } from '../data/skills';
import { MEMORY_KEYSTONES, MEMORY_KEYSTONE_VALUES } from '../data/talents';
import { chainLength } from '../data/story/chains';
import type { Combatant } from './combatant';
import type { CharacterId, Member } from './types';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A game with `ids` on the field (default the standard five), everyone at level 1 and full. */
function game(ids: CharacterId[] = STANDARD_LINEUP): GameState {
  return { ...newGame(mulberry32(0), 0, ids), party: fullParty(ids) };
}
const member = (s: GameState, id: CharacterId): Member => s.party.roster[id];
const set = (s: GameState, id: CharacterId, over: Partial<Member>) => { s.party.roster[id] = { ...s.party.roster[id], ...over }; };
const maxHp = (s: GameState, id: CharacterId) => statsOf(member(s, id)).hp;
const cellOf = (s: GameState, id: CharacterId) => s.party.grid.indexOf(id);
const ctx = (): EffectContext => ({ rng: noDraw, itemBoost: false, revealed: {}, log: [] });
/** The battle's own combatant for a member: fromMember at the member's cell. */
const combatant = (s: GameState, id: CharacterId): Combatant => fromMember(member(s, id), cellOf(s, id));

describe('field skills', () => {
  it('lists the learned field skills in learned order', () => {
    const s = game();
    set(s, 'selene', { tree: { moonlight: 1, rebirth: 1, cleanse: 1, dream: 1 } });
    expect(fieldSkills(member(s, 'selene'))).toEqual(['moonlight', 'rebirth']);
  });

  it('a learned heal restores HP by the battle formula and costs its battle TP', () => {
    const s = game();
    const half = Math.floor(maxHp(s, 'selene') / 2);
    set(s, 'selene', { tree: { moonlight: 1 }, hp: half });
    // The expected values: the battle's own heal and price on the same combatant.
    const c = combatant(s, 'selene');
    const def = skillFor(c, 'moonlight')!;
    const cost = skillCost(c, 'moonlight');
    for (const eff of def.effects) applyEffect(c, c, eff, ctx());
    const r = castField(s, { caster: 'selene', skill: 'moonlight', target: 'selene', depth: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(c.hp).toBeGreaterThan(half);
    expect(member(r.state, 'selene').hp).toBe(c.hp);
    expect(r.cost).toBe(cost);
    expect(r.cost).toBe(SKILLS.moonlight.tp);
    expect(member(r.state, 'selene').tp).toBe(member(s, 'selene').tp - cost);
    expect(r.gains).toEqual([{ id: 'selene', hp: c.hp - half, revived: false }]);
    // The input state is never touched.
    expect(member(s, 'selene').hp).toBe(half);
  });

  it('a revive raises a fallen member on the field', () => {
    const s = game();
    set(s, 'selene', { tree: { moonlight: 1, rebirth: 1 } });
    set(s, 'noel', { hp: 0 });
    expect(fieldTargets(s.party, 'selene', 'rebirth')).toEqual(['noel']);
    const r = castField(s, { caster: 'selene', skill: 'rebirth', target: 'noel', depth: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const want = Math.floor(maxHp(s, 'noel') * 0.3);
    expect(member(r.state, 'noel').hp).toBe(want);
    expect(r.gains).toEqual([{ id: 'noel', hp: want, revived: true }]);
    expect(member(r.state, 'selene').tp).toBe(member(s, 'selene').tp - SKILLS.rebirth.tp);
  });

  it('single-target heals choose among the standing, revives among the fallen, in field order', () => {
    const s = game();
    set(s, 'selene', { tree: { moonlight: 1, rebirth: 1, 'moon-rain': 1 } });
    set(s, 'noel', { hp: 0 });
    const order = activeIds(s.party);
    expect(fieldTargets(s.party, 'selene', 'moonlight')).toEqual(order.filter((id) => id !== 'noel'));
    expect(fieldTargets(s.party, 'selene', 'rebirth')).toEqual(['noel']);
    expect(fieldTargets(s.party, 'selene', 'moon-rain')).toEqual([]);
  });

  it('the whole-party heal skips nobody standing and lowers nobody', () => {
    const s = game();
    set(s, 'selene', { tree: { moonlight: 1, 'moon-rain': 1 } });
    // Everyone else at half; the hero above his sheet's max, as an altar leaves him after a fight.
    for (const id of activeIds(s.party)) if (id !== 'selene') set(s, id, { hp: Math.floor(maxHp(s, id) / 2) });
    const over = maxHp(s, 'hero') + 20;
    set(s, 'hero', { hp: over });
    const r = castField(s, { caster: 'selene', skill: 'moon-rain', depth: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(member(r.state, 'hero').hp).toBe(over);
    expect(r.gains.map((g) => g.id)).toEqual(activeIds(s.party).filter((id) => id !== 'hero' && id !== 'selene'));
    for (const g of r.gains) {
      expect(member(r.state, g.id).hp).toBe(member(s, g.id).hp + g.hp);
      expect(g.hp).toBeGreaterThan(0);
    }
  });

  it('a worn power that turns moonlight on the whole party is honoured', () => {
    const s = game();
    const crown = { ...plainItem('leather-cap', 77), rarity: 'legendary' as const, special: 'lg-selene' };
    set(s, 'selene', { tree: { moonlight: 1 }, equip: { head: crown } });
    for (const id of activeIds(s.party)) set(s, id, { hp: 1 });
    expect(fieldTargets(s.party, 'selene', 'moonlight')).toEqual([]);
    const r = castField(s, { caster: 'selene', skill: 'moonlight', depth: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gains.map((g) => g.id)).toEqual(activeIds(s.party));
  });

  it('refusals spend nothing', () => {
    const cases: [string, (s: GameState) => void, Parameters<typeof castField>[1], string][] = [
      ['not learned', (s) => set(s, 'selene', { tree: {}, hp: 1 }), { caster: 'selene', skill: 'moonlight', target: 'selene', depth: 1 }, 'not-learned'],
      ['short of TP', (s) => set(s, 'selene', { tp: 0, hp: 1 }), { caster: 'selene', skill: 'moonlight', target: 'selene', depth: 1 }, 'tp'],
      ['everyone full', () => {}, { caster: 'selene', skill: 'moonlight', target: 'hero', depth: 1 }, 'no-effect'],
      ['caster down', (s) => { set(s, 'selene', { hp: 0 }); set(s, 'hero', { hp: 1 }); }, { caster: 'selene', skill: 'moonlight', target: 'hero', depth: 1 }, 'down'],
      ['caster waiting', (s) => { s.party.grid = s.party.grid.map((id) => (id === 'selene' ? null : id)); set(s, 'hero', { hp: 1 }); },
        { caster: 'selene', skill: 'moonlight', target: 'hero', depth: 1 }, 'invalid'],
      ['target waiting', (s) => { s.party.grid = s.party.grid.map((id) => (id === 'noel' ? null : id)); set(s, 'noel', { hp: 1 }); },
        { caster: 'selene', skill: 'moonlight', target: 'noel', depth: 1 }, 'invalid'],
      ['not a field skill', (s) => { set(s, 'noel', { tree: { hex: 1 } }); set(s, 'hero', { hp: 1 }); }, { caster: 'noel', skill: 'hex', target: 'hero', depth: 1 }, 'invalid'],
      ['unknown skill', (s) => set(s, 'hero', { hp: 1 }), { caster: 'selene', skill: 'no-such-skill', target: 'hero', depth: 1 }, 'invalid'],
      ['heal on the fallen', (s) => set(s, 'noel', { hp: 0 }), { caster: 'selene', skill: 'moonlight', target: 'noel', depth: 1 }, 'invalid'],
    ];
    for (const [name, arrange, o, reason] of cases) {
      const s = game();
      set(s, 'selene', { tree: { moonlight: 1 } });
      arrange(s);
      const before = structuredClone(s);
      expect(castField(s, o), name).toEqual({ ok: false, reason });
      expect(s, name).toEqual(before);
    }
  });

  it('the gauge and the targets\' TP are untouched', () => {
    const s = game();
    set(s, 'selene', { tree: { moonlight: 1, 'moon-rain': 1 }, limit: 40 });
    for (const id of activeIds(s.party)) if (id !== 'selene') set(s, id, { hp: 1, tp: 2, limit: 55 });
    const r = castField(s, { caster: 'selene', skill: 'moon-rain', depth: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(member(r.state, 'selene').limit).toBe(40);
    for (const id of activeIds(s.party)) if (id !== 'selene') {
      expect(member(r.state, id).tp, id).toBe(2);
      expect(member(r.state, id).limit, id).toBe(55);
    }
  });

  it('the field cost is the battle cost, teacher\'s gift included', () => {
    // Selene's memory keystone is opened as teachers-gift for this test only (it is Noel's in the game).
    const own = MEMORY_KEYSTONES.selene;
    MEMORY_KEYSTONES.selene = 'teachers-gift';
    try {
      const s = game();
      set(s, 'selene', { tree: { moonlight: 1 }, hp: 1 });
      const plain = fieldCost(member(s, 'selene'), 'moonlight');
      set(s, 'selene', { memories: chainLength('selene') });
      const gifted = fieldCost(member(s, 'selene'), 'moonlight');
      expect(gifted).toBe(skillCost(combatant(s, 'selene'), 'moonlight'));
      const tp = SKILLS.moonlight.tp;
      expect(plain).toBe(tp);
      expect(gifted).toBe(Math.max(1, Math.ceil((tp * (100 - MEMORY_KEYSTONE_VALUES.tpCostPct)) / 100)));
      expect(gifted).toBeLessThan(plain);
      const r = castField(s, { caster: 'selene', skill: 'moonlight', target: 'selene', depth: 1 });
      expect(r.ok && r.cost).toBe(gifted);
    } finally {
      MEMORY_KEYSTONES.selene = own;
    }
  });

  it('the abyss light grows with the depth like in battle', () => {
    const healAt = (depth: number) => {
      const s = game();
      set(s, 'hero', { tree: { 'abyss-light': 1 } });
      for (const id of activeIds(s.party)) set(s, id, { hp: 1 });
      // The battle's bonus for a fight at this depth, applied to the battle's own combatants.
      const b = createBattle({ party: s.party, enemyIds: ['slime'], inventory: {}, revealed: {}, depth });
      expect(b.abyss).toBe(abyssPct(depth));
      const hero = b.party.find((c) => c.key === 'hero')!;
      let def = skillFor(hero, 'abyss-light')!;
      const bonus = pctMod('abyss-light', 100 + b.abyss!);
      if (bonus) def = patchSkill(def, bonus);
      const want = new Map<CharacterId, number>();
      for (const c of b.party) {
        for (const eff of def.effects) if (eff.kind === 'heal') applyEffect(hero, c, eff, ctx());
        want.set(c.key as CharacterId, c.hp);
      }
      const r = castField(s, { caster: 'hero', skill: 'abyss-light', depth });
      expect(r.ok).toBe(true);
      if (!r.ok) return [];
      for (const id of activeIds(s.party)) expect(member(r.state, id).hp, `${id} at ${depth}`).toBe(want.get(id));
      return activeIds(s.party).map((id) => member(r.state, id).hp);
    };
    const shallow = healAt(1);
    const deep = healAt(30);
    expect(deep.some((hp, i) => hp > shallow[i])).toBe(true);
  });

  it('field actions never draw', () => {
    expect(() => noDraw()).toThrow('field actions never draw');
    const s = game();
    set(s, 'selene', { tree: { moonlight: 1, 'moon-rain': 1, rebirth: 1 } });
    for (const id of activeIds(s.party)) if (id !== 'selene') set(s, id, { hp: 1 });
    set(s, 'noel', { hp: 0 });
    expect(() => castField(s, { caster: 'selene', skill: 'moon-rain', depth: 1 })).not.toThrow();
    expect(() => castField(s, { caster: 'selene', skill: 'rebirth', target: 'noel', depth: 1 })).not.toThrow();
    expect(castField(s, { caster: 'selene', skill: 'rebirth', target: 'noel', depth: 1 }).ok).toBe(true);
  });

  it('neither the simulation nor battle imports the field module', () => {
    const balance = readdirSync(HERE).filter((f) => /^balance.*\.test\.ts$/.test(f));
    expect(balance.length).toBeGreaterThanOrEqual(4);
    for (const f of ['sim.ts', 'battle.ts', ...balance]) {
      expect(readFileSync(join(HERE, f), 'utf8'), f).not.toContain("from './field'");
    }
  });
});
