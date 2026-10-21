import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { castField, fieldCost, fieldSkills, fieldTargets, noDraw, packEquip, packUnequip } from './field';
import { createBattle, fromMember, skillCost, skillFor } from './battle';
import { applyEffect, healAmount, patchSkill, type EffectContext } from './skills';
import { pctMod } from './progression';
import { abyssPct } from './scaling';
import { activeIds, statsOf, STANDARD_LINEUP } from './party';
import { newGame, type GameState } from './state';
import { fullParty, plainItem } from './testing';
import { mulberry32 } from './rng';
import { BAG_SIZE } from './loot/bag';
import { SKILLS } from '../data/skills';
import { T } from '../data/text.zh-TW';
import { MEMORY_KEYSTONES, MEMORY_KEYSTONE_VALUES } from '../data/talents';
import { chainLength } from '../data/story/chains';
import type { Combatant } from './combatant';
import type { CharacterId, ItemInstance, Member } from './types';

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

  it('the whole-party heal never reaches a wounded member on the bench', () => {
    const s = game();
    set(s, 'selene', { tree: { 'moon-rain': 1 } });
    s.party.grid = s.party.grid.map((id) => (id === 'chizuru' ? null : id));   // Chizuru waits in town
    expect(s.party.recruited).toContain('chizuru');
    expect(activeIds(s.party)).not.toContain('chizuru');
    set(s, 'chizuru', { hp: 1 });
    set(s, 'noel', { hp: 1 });
    const r = castField(s, { caster: 'selene', skill: 'moon-rain', depth: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(member(r.state, 'noel').hp).toBeGreaterThan(1);                  // the cast landed on the field
    expect(member(r.state, 'chizuru').hp).toBe(1);
    expect(r.gains.map((g) => g.id)).not.toContain('chizuru');
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

describe('gear from the run pack', () => {
  /** The uids a member wears and the pack holds, together: a change of gear never makes or loses a piece. */
  const held = (s: GameState, id: CharacterId, pack: ItemInstance[]) =>
    [...Object.values(member(s, id).equip).map((it) => it!.uid), ...pack.map((it) => it.uid)].sort((a, b) => a - b);

  it('wearing from the pack swaps with what was worn', () => {
    const s = game();
    set(s, 'hero', { equip: { weapon: plainItem('iron-sword', 1) } });
    const pack = [plainItem('iron-sword', 2), plainItem('leather-cap', 3)];
    const before = structuredClone(s);
    const r = packEquip(s, pack, 'hero', 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(member(r.state, 'hero').equip.weapon?.uid).toBe(2);
    expect(r.pack.map((it) => it.uid).sort()).toEqual([1, 3]);
    expect(r.pack).toHaveLength(pack.length);
    expect(held(r.state, 'hero', r.pack)).toEqual(held(s, 'hero', pack));
    // Nothing handed in is touched.
    expect(s).toEqual(before);
    expect(pack.map((it) => it.uid)).toEqual([2, 3]);
    // An empty slot: the pack is one piece lighter.
    const r2 = packEquip(r.state, r.pack, 'hero', 3);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(member(r2.state, 'hero').equip.head?.uid).toBe(3);
    expect(r2.pack.map((it) => it.uid)).toEqual([1]);
    expect(held(r2.state, 'hero', r2.pack)).toEqual(held(s, 'hero', pack));
    // A piece not in the pack, or a slot it does not fit.
    expect(packEquip(s, pack, 'hero', 99)).toEqual({ ok: false, reason: 'stock' });
    expect(packEquip(s, pack, 'hero', 3, 'weapon')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('a ring goes to the first empty ring slot like in town', () => {
    const s = game();
    const pack = [plainItem('copper-ring', 1), plainItem('copper-ring', 2), plainItem('copper-ring', 3)];
    const a = packEquip(s, pack, 'noel', 1);
    if (!a.ok) throw new Error(a.reason);
    expect(member(a.state, 'noel').equip.ring1?.uid).toBe(1);
    const b = packEquip(a.state, a.pack, 'noel', 2);
    if (!b.ok) throw new Error(b.reason);
    expect(member(b.state, 'noel').equip.ring2?.uid).toBe(2);
    // Both full: ring1, and the ring it replaced goes to the pack.
    const c = packEquip(b.state, b.pack, 'noel', 3);
    if (!c.ok) throw new Error(c.reason);
    expect([member(c.state, 'noel').equip.ring1?.uid, member(c.state, 'noel').equip.ring2?.uid]).toEqual([3, 2]);
    expect(c.pack.map((it) => it.uid)).toEqual([1]);
    // A chosen ring slot is honoured.
    const d = packEquip(s, pack, 'noel', 1, 'ring2');
    if (!d.ok) throw new Error(d.reason);
    expect(member(d.state, 'noel').equip.ring2?.uid).toBe(1);
  });

  it('taking off puts the piece in the pack, unless the bag and the pack are full', () => {
    const s = game();
    set(s, 'hero', { equip: { weapon: plainItem('iron-sword', 1) } });
    const pack = [plainItem('leather-cap', 2)];
    s.bag = Array.from({ length: BAG_SIZE - pack.length - 1 }, (_, i) => plainItem('leather-cap', 100 + i));
    const r = packUnequip(s, pack, 'hero', 'weapon');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(member(r.state, 'hero').equip.weapon).toBeUndefined();
    expect(r.pack.map((it) => it.uid)).toEqual([2, 1]);
    expect(r.state.bag).toEqual(s.bag);
    expect(held(r.state, 'hero', r.pack)).toEqual(held(s, 'hero', pack));
    // One more in the bag: bag and pack hold BAG_SIZE, and the piece would be lost on the way home.
    s.bag.push(plainItem('leather-cap', 999));
    expect(s.bag.length + pack.length).toBe(BAG_SIZE);
    const before = structuredClone(s);
    expect(packUnequip(s, pack, 'hero', 'weapon')).toEqual({ ok: false, reason: 'full' });
    expect(s).toEqual(before);
    // Nothing in the slot.
    expect(packUnequip(game(), [], 'hero', 'head')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('wearing clamps HP and TP to the new maximum', () => {
    const s = game();
    set(s, 'hero', { equip: { neck: plainItem('moss-charm', 1), ring1: plainItem('gear-ring', 2) } });
    const full = statsOf(member(s, 'hero'));
    set(s, 'hero', { hp: full.hp, tp: full.tp });
    // Swapping the HP charm for a speed earring lowers the max HP.
    const a = packEquip(s, [plainItem('bat-earring', 3)], 'hero', 3);
    if (!a.ok) throw new Error(a.reason);
    const sheetA = statsOf(member(a.state, 'hero'));
    expect(sheetA.hp).toBeLessThan(full.hp);
    expect(member(a.state, 'hero').hp).toBe(sheetA.hp);
    // Taking off the TP ring lowers the max TP.
    const b = packUnequip(a.state, a.pack, 'hero', 'ring1');
    if (!b.ok) throw new Error(b.reason);
    const sheetB = statsOf(member(b.state, 'hero'));
    expect(sheetB.tp).toBeLessThan(full.tp);
    expect(member(b.state, 'hero').tp).toBe(sheetB.tp);
    expect(member(b.state, 'hero').hp).toBeLessThanOrEqual(sheetB.hp);
  });

  it('every refusal of a field action or gear change has words for the player', () => {
    for (const r of ['invalid', 'down', 'not-learned', 'tp', 'no-effect', 'stock', 'full', 'heavy', 'lineup', 'phase']) {
      expect(T.reasons[r], r).toMatch(/\S/);
    }
    expect([T.reasons.heavy, T.reasons.lineup]).toEqual(['太重了，冒險背包裝不下', '迷宮裡只能調整站位，不能換人']);
  });

  it('a member on the bench cannot change gear in the field', () => {
    const s = game(['hero', 'rin']);
    expect(activeIds(s.party)).not.toContain('selene');
    set(s, 'selene', { equip: { head: plainItem('leather-cap', 1) } });
    const pack = [plainItem('leather-cap', 2)];
    expect(packEquip(s, pack, 'selene', 2)).toEqual({ ok: false, reason: 'invalid' });
    expect(packUnequip(s, pack, 'selene', 'head')).toEqual({ ok: false, reason: 'invalid' });
    expect(packEquip(s, pack, 'nobody' as CharacterId, 2)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('runes in the field (plan 8e Task 3)', () => {
  it('a spread moonlight heals the whole party in the field', () => {
    const s = game();
    set(s, 'selene', { tree: { moonlight: 1 }, sockets: { moonlight: [{ id: 'spread', tier: 'magic' }] } });
    for (const id of activeIds(s.party)) set(s, id, { hp: 1 });
    expect(fieldTargets(s.party, 'selene', 'moonlight')).toEqual([]);
    const each = healAmount(combatant(s, 'selene'), 72);
    const r = castField(s, { caster: 'selene', skill: 'moonlight', depth: 1 });
    if (!r.ok) throw new Error(r.reason);
    expect(r.gains.map((g) => g.id)).toEqual(activeIds(s.party));
    for (const g of r.gains) expect(g.hp).toBe(Math.min(each, maxHp(s, g.id) - 1));
    expect(r.cost).toBe(SKILLS.moonlight.tp);
  });
});
