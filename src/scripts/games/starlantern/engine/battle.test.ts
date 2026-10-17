import { describe, it, expect } from 'vitest';
import { LIMIT_MAX, LIMIT_PER_ACTION, LIMIT_PER_HIT_SCALE, createBattle, escapeChance, resolveRound, rewards, skillCost, skillFor, turnOrder, writeBack } from './battle';
import { WEAPON_MASTERY_PCT } from '../data/equipment';
import { ULTIMATES } from '../data/ultimates';
import { ENEMIES } from '../data/enemies';
import { activeIds, newParty, powersOf, sheetOf } from './party';
import { applyEffect } from './skills';
import { depthLevel, encounterTable, homeLevel } from './scaling';
import { SECONDARY_KEYS } from './stats';
import { choose, partyAt } from './sim';
import { dealDamage, type BattleEvent } from './combatant';
import { constRng, makeBattle, makeCombatant, plainItem } from './testing';
import { KEYSTONE_GATE, KEYSTONE_VALUES as V, MAX_KEYSTONES, type KeystoneId } from '../data/talents';
import { keystonesOf } from './progression';
import { mulberry32 } from './rng';
import { ABYSS } from '../data/hero';

const BASELINE: Record<string, [string, number, number]> = {"0:1":["win",1,3947545226],"0:2":["win",1,2430863389],"0:3":["win",2,3891662608],"1:1":["win",2,2360026799],"1:2":["win",2,1284742253],"1:3":["win",2,226460977],"2:1":["win",1,3087643812],"2:2":["win",1,113512203],"2:3":["win",1,693828139],"3:1":["win",2,1417030887],"3:2":["win",2,3218793396],"3:3":["win",2,1205089542]};
const rng = constRng(0.5); // enemies never use skills (all chances < 0.5), variance 1.0
const P = (key: string, over = {}) => makeCombatant({ key, side: 'party', ...over });
const E = (key: string, over = {}) => makeCombatant({ key, side: 'enemy', ...over });

describe('createBattle', () => {
  it('builds rows from the formation and letters duplicate enemies', () => {
    const party = newParty();
    party.roster.liz.hp = 0;
    const s = createBattle({ party, enemyIds: ['slime', 'slime', 'bat'], inventory: { potion: 2 }, revealed: {} });
    expect(s.party.map((c) => [c.key, c.row, c.cell])).toEqual([
      ['scarlet', 'front', 0], ['chizuru', 'front', 1], ['liz', 'front', 2], ['noel', 'back', 6], ['selene', 'back', 8],
    ]);
    expect(s.party.find((c) => c.key === 'liz')!.alive).toBe(false);
    expect(s.enemies.map((e) => [e.key, e.name])).toEqual([['e0', '苔蘚史萊姆 A'], ['e1', '苔蘚史萊姆 B'], ['e2', '遺跡蝙蝠']]);
    expect(s.outcome).toBe('ongoing');
  });
});

describe('derived stats in battle', () => {
  it("members fight with their sheet's secondaries and level; enemies with the fight's depth level", () => {
    const party = newParty();
    const ring = { ...plainItem('copper-ring', 1), affixes: [{ key: 'crit' as const, value: 12 }, { key: 'armor' as const, value: 30 }] };
    const neck = { ...plainItem('moss-charm', 2), rarity: 'legendary' as const, special: 'lg-scarlet' };
    party.roster.scarlet = { ...party.roster.scarlet, level: 7, equip: { ring1: ring, neck } };
    const s = createBattle({ party, enemyIds: ['slime', 'lanterneater'], inventory: {}, revealed: {}, scale: { depth: 3, region: 'mainline' } });
    const sc = s.party.find((c) => c.key === 'scarlet')!;
    const sheet = sheetOf(party.roster.scarlet);
    expect(sc.level).toBe(7);
    expect(sc.x.crit).toBe(12);
    expect(sc.x.critDmg).toBe(50);
    for (const k of SECONDARY_KEYS) expect(sc.x[k] ?? 0, k).toBe(sheet[k]);
    expect(sc.powers).toEqual(powersOf(party.roster.scarlet));
    expect(sc.powers).toEqual(['lg-scarlet']);
    expect(s.party.find((c) => c.key === 'noel')!.level).toBe(1);
    // The slime is met 8 levels over its home and carries that depth's secondaries; the boss is below its home and carries none.
    const slimeSec = { crit: 2, evasion: 1.6, fireRes: 4, iceRes: 4, thunderRes: 4 };
    expect(s.enemies.map((e) => [e.level, e.x, e.powers])).toEqual([[depthLevel(3), slimeSec, []], [depthLevel(3), {}, []]]);
    // Without a scale, an enemy is met at its home level.
    const plain = createBattle({ party, enemyIds: ['slime', 'lanterneater'], inventory: {}, revealed: {} });
    expect(plain.enemies.map((e) => e.level)).toEqual([homeLevel(ENEMIES.slime), homeLevel(ENEMIES.lanterneater)]);
  });

  it('multi adds one hit only to single-hit effects', () => {
    const hits = (eff: { hits?: number }, multi: number) => {
      const log: BattleEvent[] = [];
      const foe = E('e0', { max: { hp: 9999 } as never });
      applyEffect(P('p', { x: { multi } }), foe, { kind: 'damage', power: 100, element: 'phys', scale: 'atk', melee: true, ...eff }, { rng: constRng(0.5), itemBoost: false, revealed: {}, log });
      return log.filter((e) => e.type === 'damage').length;
    };
    expect(hits({}, 100)).toBe(2);
    expect(hits({ hits: 1 }, 100)).toBe(2);
    expect(hits({ hits: 2 }, 100)).toBe(2);
    expect(hits({ hits: 3 }, 100)).toBe(3);
    expect(hits({}, 40)).toBe(1);   // 0.5 is not under 0.4
    expect(hits({}, 0)).toBe(1);
  });
});

describe('turnOrder', () => {
  it('sorts by speed and keeps input order on ties', () => {
    const order = turnOrder([P('slow', { max: { spd: 5 } as never }), E('e0'), P('fast', { max: { spd: 30 } as never }), P('tie')], rng);
    expect(order.map((c) => c.key)).toEqual(['fast', 'e0', 'tie', 'slow']);
  });
});

describe('resolveRound', () => {
  it('does not mutate the previous state and logs only this round', () => {
    const prev = makeBattle([P('p')], [E('e0')]);
    const next = resolveRound(prev, { p: { kind: 'attack', target: 'e0' } }, rng);
    expect(prev.enemies[0].hp).toBe(100);
    expect(next.enemies[0].hp).toBe(80);
    expect(next.round).toBe(1);
  });
  it('wins when the last enemy falls, before it can act', () => {
    const s = resolveRound(makeBattle([P('p')], [E('e0', { hp: 1 })]), { p: { kind: 'attack', target: 'e0' } }, rng);
    expect(s.outcome).toBe('win');
    expect(s.party[0].hp).toBe(100);
  });
  it('loses when the party falls', () => {
    const s = resolveRound(makeBattle([P('p', { hp: 5 })], [E('e0', { max: { spd: 20 } as never })]), { p: { kind: 'defend' } }, rng);
    expect(s.outcome).toBe('lose');
  });
  it('halves enemy damage on a defending member', () => {
    const s = resolveRound(makeBattle([P('p')], [E('e0')]), { p: { kind: 'defend' } }, rng);
    expect(s.party[0].hp).toBe(90);
  });
  it('retargets when the chosen enemy is already down', () => {
    const s = resolveRound(makeBattle([P('p')], [E('e0', { hp: 0, alive: false }), E('e1', { sleep: 3 })]), { p: { kind: 'attack', target: 'e0' } }, rng);
    expect(s.enemies[1].hp).toBe(80);
  });
  it('refuses a skill without enough TP', () => {
    const s = resolveRound(makeBattle([P('p', { tp: 0 })], [E('e0', { sleep: 3 })]), { p: { kind: 'skill', skill: 'twin-slash', target: 'e0' } }, rng);
    expect(s.log).toContainEqual({ type: 'no-tp', actor: 'p' });
    expect(s.enemies[0].hp).toBe(100);
  });
  it('spends TP and the HP cost of skills', () => {
    // the faster sleeper skips its turn first, so the hit that wakes it lands after it would have acted
    const s = resolveRound(makeBattle([P('p')], [E('e0', { sleep: 3, max: { spd: 20 } as never })]), { p: { kind: 'skill', skill: 'flame-burst', target: 'e0' } }, rng);
    expect(s.party[0].tp).toBe(17);
    expect(s.party[0].hp).toBe(85);
  });
  it('skips sleeping actors, and damage wakes them', () => {
    const asleep = resolveRound(makeBattle([P('p')], [E('e0', { sleep: 2 })]), { p: { kind: 'defend' } }, rng);
    expect(asleep.log).toContainEqual({ type: 'asleep', actor: 'e0' });
    expect(asleep.enemies[0].sleep).toBe(1);
    expect(asleep.party[0].hp).toBe(100);
    const woken = resolveRound(makeBattle([P('p')], [E('e0', { sleep: 2 })]), { p: { kind: 'attack', target: 'e0' } }, rng);
    expect(woken.party[0].hp).toBe(80);
  });
  it('ticks poison at round end', () => {
    const s = resolveRound(makeBattle([P('p', { poison: true })], [E('e0', { sleep: 3 })]), { p: { kind: 'defend' } }, rng);
    expect(s.party[0].hp).toBe(90);
    expect(s.log).toContainEqual({ type: 'poison-tick', target: 'p', amount: 10 });
  });
  it('expires buffs and fires turrets at round end', () => {
    const s = resolveRound(
      makeBattle([P('p', { buffs: [{ stat: 'atk', pct: 50, turns: 1 }], turret: { power: 100, turns: 1 } })], [E('e0', { sleep: 3 })]),
      { p: { kind: 'defend' } }, rng,
    );
    expect(s.party[0].buffs).toEqual([]);
    expect(s.party[0].turret).toBeNull();
    expect(s.enemies[0].hp).toBe(80);
  });
  it('consumes items and ignores empty stock', () => {
    const used = resolveRound(makeBattle([P('p', { hp: 50 })], [E('e0', { sleep: 3 })], { inventory: { potion: 1 } }), { p: { kind: 'item', item: 'potion', target: 'p' } }, rng);
    expect([used.party[0].hp, used.inventory.potion]).toEqual([100, 0]);
    const empty = resolveRound(used, { p: { kind: 'item', item: 'potion', target: 'p' } }, rng);
    expect(empty.inventory.potion).toBe(0);
  });
  it('sends single-target enemy attacks at a taunting member', () => {
    const s = resolveRound(makeBattle([P('p1', { taunt: 2 }), P('p2')], [E('e0')]), { p1: { kind: 'defend' }, p2: { kind: 'defend' } }, rng);
    expect(s.party[0].hp).toBe(90);
    expect(s.party[1].hp).toBe(100);
  });
  it('makes a taunt cast this round pull the slower enemy at once', () => {
    const s = resolveRound(
      makeBattle([P('p1', { max: { spd: 20 } as never }), P('p2', { max: { spd: 20 } as never })], [E('e0')]),
      { p1: { kind: 'skill', skill: 'provoke' }, p2: { kind: 'defend' } }, rng,
    );
    expect(s.party[0].hp).toBe(80);
    expect(s.party[1].hp).toBe(100);
  });
  it('flees on a good roll but never from a boss', () => {
    const fled = resolveRound(makeBattle([P('p')], [E('e0')]), { p: { kind: 'escape' } }, constRng(0.1));
    expect(fled.outcome).toBe('fled');
    const boss = resolveRound(makeBattle([P('p')], [E('e0')], { boss: true }), { p: { kind: 'escape' } }, constRng(0.1));
    expect(boss.outcome).toBe('ongoing');
    expect(boss.log[0]).toEqual({ type: 'escape', success: false });
  });
  it('clamps escape chance', () => {
    expect(escapeChance(makeBattle([P('p', { max: { spd: 1 } as never })], [E('e0', { max: { spd: 999 } as never })]))).toBe(0.1);
  });
});

describe('after battle', () => {
  const seq = (vs: number[]) => { let i = 0; return () => vs[i++ % vs.length]; };
  it('sums rewards and rolls drops, doubled by dropBoost', () => {
    const s = makeBattle([P('p')], [E('e0', { defId: 'slime' }), E('e1', { defId: 'bat' })]);
    expect(rewards(s, constRng(0), false)).toEqual({ exp: 9, gold: 9, drops: { moss: 1, 'bat-wing': 1 } });
    expect(rewards(s, constRng(0.99), false).drops).toEqual({});
    expect(rewards(s, constRng(0.7), false).drops).toEqual({});
    expect(rewards(s, constRng(0.7), true).drops).toEqual({ moss: 1, 'bat-wing': 1 });
    // A drop-rate multiplier: the whole part always comes, the fraction is rolled (never floored away).
    expect(rewards(s, constRng(0), false, 1.5).drops).toEqual({ moss: 2, 'bat-wing': 2 });
    expect(rewards(s, seq([0, 0.9, 0, 0.9]), false, 1.5).drops).toEqual({ moss: 1, 'bat-wing': 1 });
    expect(rewards(s, constRng(0), false, 2).drops).toEqual({ moss: 2, 'bat-wing': 2 });
  });
  it('writes HP and TP back to the roster', () => {
    const party = newParty();
    const s = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    s.party[0].hp = 7; s.party[0].tp = 1;
    const p = writeBack(party, s);
    expect([p.roster.scarlet.hp, p.roster.scarlet.tp]).toEqual([7, 1]);
    expect(party.roster.scarlet.hp).toBe(48);
  });
});

describe('ultimate gauge', () => {
  const weakFoe = () => E('e0', { max: { hp: 999, atk: 1, spd: 1 } as never, sleep: 5 }); // asleep: never hits back
  it('fills by 12 per action and by damage taken, capped at 100', () => {
    const s = makeBattle([P('scarlet', { max: { hp: 100, spd: 50 } as never })], [E('e0', { max: { hp: 999, atk: 40, spd: 1 } as never })]);
    const r = resolveRound(s, { scarlet: { kind: 'attack', target: 'e0' } }, rng);
    const hit = r.log.find((e) => e.type === 'damage' && e.target === 'scarlet') as { amount: number };
    expect(r.party[0].limit).toBe(LIMIT_PER_ACTION + Math.max(1, Math.floor((hit.amount / 100) * LIMIT_PER_HIT_SCALE)));
    const full = resolveRound(makeBattle([P('scarlet', { limit: 95 })], [weakFoe()]), { scarlet: { kind: 'defend' } }, rng);
    expect(full.party[0].limit).toBe(LIMIT_MAX);
  });
  it('refuses the ultimate until the gauge is full', () => {
    const r = resolveRound(makeBattle([P('noel', { defId: 'noel', limit: 99 })], [weakFoe()]), { noel: { kind: 'ultimate' } }, rng);
    expect(r.log).toContainEqual({ type: 'no-limit', actor: 'noel' });
    expect(r.enemies[0].hp).toBe(999);
    expect(r.party[0].limit).toBe(99);
  });
  it('spends a full gauge on the character ultimate', () => {
    const s = makeBattle([P('noel', { defId: 'noel', limit: 100 })], [weakFoe(), E('e1', { max: { hp: 999, atk: 1, spd: 1 } as never, sleep: 5 })]);
    const r = resolveRound(s, { noel: { kind: 'ultimate' } }, rng);
    expect(r.log).toContainEqual({ type: 'act', actor: 'noel', label: ULTIMATES.noel.name, ultimate: ULTIMATES.noel.id });
    expect(r.enemies.every((e) => e.hp < 999)).toBe(true);
    // reset to 0 with no action bonus; the woken enemies may hit back for a point or two
    expect(r.party[0].limit).toBeLessThan(LIMIT_PER_ACTION);
  });
  it("the hero's ultimate is the form of his ranks", () => {
    const ranks = { 'hero-slash': 1, 'hero-flare': 3 };
    const s = makeBattle([P('hero', { defId: 'hero', limit: 100, ranks })], [weakFoe()]);
    const r = resolveRound(s, { hero: { kind: 'ultimate' } }, rng);
    expect(r.log).toContainEqual({ type: 'act', actor: 'hero', label: '燈鑰・星', ultimate: 'ult-hero-star' });
    expect(r.enemies[0].hp).toBeLessThan(999);
  });
  it('carries the gauge between battles through the party', () => {
    const party = newParty();
    party.roster.liz.limit = 70;
    const s = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    expect(s.party.find((c) => c.key === 'liz')!.limit).toBe(70);
    expect(s.party.find((c) => c.key === 'noel')!.limit).toBe(0);
    s.party.find((c) => c.key === 'liz')!.limit = 100;
    expect(writeBack(party, s).roster.liz.limit).toBe(100);
  });
});

describe('resource hooks', () => {
  const sleeper = () => E('e0', { sleep: 3, max: { hp: 999 } as never });
  it('tpRegen restores TP at the end of the round', () => {
    const s = resolveRound(makeBattle([P('p', { tp: 5, x: { tpRegen: 3 } }), P('q', { tp: 19, x: { tpRegen: 3 } }), P('r', { tp: 5 })], [sleeper()]),
      { p: { kind: 'defend' }, q: { kind: 'defend' }, r: { kind: 'defend' } }, rng);
    expect(s.party.map((c) => c.tp)).toEqual([8, 20, 5]);
    expect(s.log).toContainEqual({ type: 'tp', target: 'p', amount: 3, regen: true });
    expect(s.log.filter((e) => e.type === 'tp' && e.target === 'r')).toEqual([]);
    // The fallen regain nothing.
    const dead = resolveRound(makeBattle([P('p', { tp: 5, x: { tpRegen: 3 } }), P('d', { tp: 0, hp: 0, alive: false, x: { tpRegen: 3 } })], [sleeper()]), { p: { kind: 'defend' } }, rng);
    expect(dead.party[1].tp).toBe(0);
  });

  it('tpCost lowers the cost but never to zero', () => {
    expect(skillCost(P('p'), 'twin-slash')).toBe(4);
    expect(skillCost(P('p', { x: { tpCost: 50 } }), 'twin-slash')).toBe(2);
    expect(skillCost(P('p', { x: { tpCost: 50 } }), 'provoke')).toBe(2);           // ceil(1.5)
    expect(skillCost(P('p', { x: { tpCost: 10 } }), 'rebirth')).toBe(9);           // no float creep past 9
    expect(skillCost(P('p', { x: { tpCost: 99 } }), 'twin-slash')).toBe(1);
    expect(skillCost(P('p', { x: { tpCost: 50 } }), 'stealth')).toBe(0);           // a free skill stays free
    // The round spends the reduced cost, and a member who can pay only the reduced cost may cast.
    const s = resolveRound(makeBattle([P('p', { tp: 2, x: { tpCost: 50 } })], [sleeper()]), { p: { kind: 'skill', skill: 'twin-slash', target: 'e0' } }, rng);
    expect(s.party[0].tp).toBe(0);
    expect(s.log).not.toContainEqual({ type: 'no-tp', actor: 'p' });
  });

  it('gold and exp find raise rewards', () => {
    const foes = [E('e0', { defId: 'slime' }), E('e1', { defId: 'bat' })];   // exp 9, gold 9
    const s = makeBattle([P('p', { x: { goldFind: 50, expBonus: 20 } }), P('dead', { alive: false, hp: 0, x: { goldFind: 100 } })], foes);
    const r = rewards(s, constRng(0), false);
    expect([r.gold, r.exp]).toEqual([14, 11]);   // round(13.5), round(10.8)
    // Each find sums over the living party and stops at 100.
    const capped = makeBattle([P('p', { x: { goldFind: 80 } }), P('q', { x: { goldFind: 80 } })], foes);
    expect(rewards(capped, constRng(0), false).gold).toBe(18);
    // matFind raises each drop chance: 0.7 misses both (0.6, 0.5) until doubled.
    expect(rewards(makeBattle([P('p', { x: { matFind: 100 } })], foes), constRng(0.7), false).drops).toEqual({ moss: 1, 'bat-wing': 1 });
    expect(rewards(makeBattle([P('p', { x: { matFind: 30 } })], foes), constRng(0.7), false).drops).toEqual({ moss: 1 });   // 0.78 and 0.65
    expect(rewards(makeBattle([P('p')], foes), constRng(0), false)).toEqual({ exp: 9, gold: 9, drops: { moss: 1, 'bat-wing': 1 } });
  });

  it('sleep resistance lowers the chance', () => {
    const cast = (x: Record<string, number>, status: 'sleep' | 'poison') => {
      const t = P('t', { x });
      applyEffect(E('e0'), t, { kind: 'inflict', status, chance: 0.6 }, { rng: constRng(0.5), itemBoost: false, revealed: {}, log: [] });
      return status === 'sleep' ? t.sleep > 0 : t.poison;
    };
    expect(cast({}, 'sleep')).toBe(true);                    // 0.5 < 0.6
    expect(cast({ sleepRes: 20 }, 'sleep')).toBe(false);     // 0.5 >= 0.48
    expect(cast({ sleepRes: 10 }, 'sleep')).toBe(true);      // 0.5 < 0.54
    expect(cast({ poisonRes: 20 }, 'sleep')).toBe(true);     // the other resistance does not apply
    expect(cast({ poisonRes: 20 }, 'poison')).toBe(false);
  });

  it('gauge multiplies each gain of the ultimate gauge, rounded down', () => {
    const hit = P('p', { x: { gauge: 50 } });
    dealDamage(hit, 10);                                      // floor(10/100*40) = 4, then floor(4 * 1.5)
    expect(hit.limit).toBe(6);
    const s = resolveRound(makeBattle([P('p', { x: { gauge: 50 } })], [sleeper()]), { p: { kind: 'defend' } }, rng);
    expect(s.party[0].limit).toBe(Math.floor(LIMIT_PER_ACTION * 1.5));
  });
});

describe('the sim player', () => {
  it('reads the TP a member actually pays and the skill as a power rewrites it', () => {
    const party = partyAt(1);
    const s = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    const noel = s.party.find((c) => c.key === 'noel')!;
    noel.tp = 2;
    expect(choose(s, party).noel.kind).toBe('attack');                 // 火之星彈 costs 4
    noel.x.tpCost = 50;
    expect(choose(s, party).noel).toEqual({ kind: 'skill', skill: 'fire-star', target: 'e0' });
    // 三叉刃 makes 雙刃 (60 x 3 = 180) outrank 三連刃 (55 x 3 = 165) for 莉茲 at level 6.
    const lv6 = partyAt(6);
    const s6 = createBattle({ party: lv6, enemyIds: ['slime'], inventory: {}, revealed: {} });
    expect(choose(s6, lv6).liz).toMatchObject({ kind: 'skill', skill: 'triple-slash' });
    s6.party.find((c) => c.key === 'liz')!.powers = ['lg-liz'];
    expect(choose(s6, lv6).liz).toMatchObject({ kind: 'skill', skill: 'twin-slash' });
  });
});

describe('skills from the tree (Task 8)', () => {
  it('a member fights with a copy of their tree ranks', () => {
    const party = newParty();
    const s = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    const noel = s.party.find((c) => c.key === 'noel')!;
    expect(noel.ranks).toEqual(party.roster.noel.tree);
    expect(noel.ranks).not.toBe(party.roster.noel.tree);
    expect(s.enemies[0].ranks).toBeUndefined();
  });

  it('a member cannot cast a skill whose node is unlearned', () => {
    const party = newParty();
    expect(party.roster.noel.tree).toEqual({ 'fire-star': 1 });
    const s = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    const tp = s.party.find((c) => c.key === 'noel')!.tp;
    const r = resolveRound(s, { noel: { kind: 'skill', skill: 'ice-star' } }, rng);
    expect(r.party.find((c) => c.key === 'noel')!.tp).toBe(tp);
    expect(r.log.some((e) => e.type === 'act' && e.actor === 'noel')).toBe(false);
    expect(r.log).not.toContainEqual({ type: 'no-tp', actor: 'noel' });
    // The turn is not lost in silence: like a cast short of TP, it says why.
    expect(r.log).toContainEqual({ type: 'no-skill', actor: 'noel' });
  });

  it('a combatant without ranks still casts any skill', () => {
    const p = P('p', { tp: 20 });
    const s = makeBattle([p], [E('e0', { max: { hp: 999 } as never })]);
    const r = resolveRound(s, { p: { kind: 'skill', skill: 'ice-star', target: 'e0' } }, rng);
    expect(r.log.some((e) => e.type === 'act' && e.actor === 'p')).toBe(true);
    expect(r.party[0].tp).toBe(20 - skillCost(p, 'ice-star'));
  });

  it('a modifier node lowers the TP a cast pays', () => {
    const ranks = { 'flame-wave': 1, 'noel-wave-up': 3 };
    const p = P('p', { tp: 20, ranks });
    const s = makeBattle([p], [E('e0', { max: { hp: 999 } as never })]);
    const r = resolveRound(s, { p: { kind: 'skill', skill: 'flame-wave' } }, rng);
    expect(r.party[0].tp).toBe(20 - skillCost(p, 'flame-wave'));
    expect(skillCost(p, 'flame-wave')).toBeLessThan(skillCost(P('q'), 'flame-wave'));
  });
});

describe('keystones in battle', () => {
  it('opening-gauge starts the gauge at least at openingGauge, never stacking on what it carries', () => {
    // Enough talent points for both default keystones; selene's are regen and opening-gauge.
    const party = partyAt(2 * (KEYSTONE_GATE + MAX_KEYSTONES) + 4);
    expect(keystonesOf(party.roster.selene)).toContain('opening-gauge');
    expect(keystonesOf(party.roster.scarlet)).not.toContain('opening-gauge');
    const start = (limit: number) => {
      party.roster.selene = { ...party.roster.selene, limit };
      party.roster.scarlet = { ...party.roster.scarlet, limit };
      const s = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
      const c = (k: string) => s.party.find((x) => x.key === k)!;
      expect(c('selene').keystones).toEqual(keystonesOf(party.roster.selene));
      return [c('selene').limit, c('scarlet').limit];
    };
    for (const carried of [0, V.openingGauge - 1, V.openingGauge, V.openingGauge + 1, LIMIT_MAX - 1, LIMIT_MAX]) {
      const [holder, other] = start(carried);
      expect(holder, `carried ${carried}`).toBe(Math.max(carried, V.openingGauge));
      expect(other, `carried ${carried}`).toBe(carried);
    }
    // The gauge carries over between fights: fight after fight it stays at the floor, it never climbs.
    expect(start(start(start(0)[0])[0])[0]).toBe(V.openingGauge);
  });

  it('regen heals regenPct of max HP at the end of each round', () => {
    const run = (keystones: KeystoneId[]) => {
      let draws = 0;
      const counted = () => { draws++; return 0.5; };
      const party = [
        P('p', { hp: 50, max: { hp: 200 } as never, keystones }),
        P('full', { hp: 99, keystones }),
        P('down', { hp: 0, alive: false, keystones }),
      ];
      const s = resolveRound(makeBattle(party, [E('e0', { sleep: 5 })]), {}, counted);   // the enemy sleeps; nobody acts
      return { s, draws };
    };
    const { s, draws } = run(['regen']);
    const gain = Math.floor((200 * V.regenPct) / 100);
    expect(s.party.map((c) => c.hp)).toEqual([50 + gain, 100, 0]);
    expect(s.log).toContainEqual({ type: 'heal', target: 'p', amount: gain });
    expect(s.log).toContainEqual({ type: 'heal', target: 'full', amount: 1 });
    expect(s.log.some((e) => e.type === 'heal' && e.target === 'down')).toBe(false);
    const plain = run([]);
    expect(plain.s.party.map((c) => c.hp)).toEqual([50, 99, 0]);
    expect(draws).toBe(plain.draws);
  });

  it('regen does not raise a holder the poison tick knocked out in the same round', () => {
    const p = P('p', { hp: 1, poison: true, keystones: ['regen'] });
    const s = resolveRound(makeBattle([p, P('q')], [E('e0', { sleep: 5 })]), {}, rng);
    expect(s.party[0]).toMatchObject({ hp: 0, alive: false });
    expect(s.log).toContainEqual({ type: 'ko', target: 'p' });
    expect(s.log.some((e) => e.type === 'heal' && e.target === 'p')).toBe(false);
  });

  it("a holder's turret shot triggers the holder's TP keystones (the turret is the holder's skill)", () => {
    const p = P('p', { tp: 0, keystones: ['crit-tp'], x: { crit: 100 }, turret: { power: 50, turns: 2 } });
    const s = resolveRound(makeBattle([p], [E('e0', { sleep: 5, max: { hp: 9999 } as never })]), {}, rng);
    const shot = s.log.findIndex((e) => e.type === 'act' && e.label === '砲台');
    expect(shot).toBeGreaterThanOrEqual(0);
    expect(s.log.slice(shot)).toContainEqual({ type: 'tp', target: 'p', amount: V.critTp });
    expect(s.party[0].tp).toBe(V.critTp);
  });

  it('a fight with no keystones replays the pre-change baseline', () => {
    // Recorded at 625b4e16, before keystones reached the battle code (plan 5b Task 10, Step 0). Lv20 has 8 talent points,
    // under KEYSTONE_GATE, so nobody holds a keystone. Re-recorded 2026-10-17 in 21867eb3, under the ENEMY_POWER shape that
    // plan 5c Task 4 settled on there (a deep step from Lv12 plus a small ramp; the d5 enemies are Lv18): the same no-keystone code path against stronger
    // enemies. A keystone reaching this fight changes TP, damage or heals, and so the replay.
    const party = partyAt(20);
    // The fighters only: the hero (Lv20, 15 talent points) holds one on the bench, and never enters this fight.
    expect(activeIds(party).every((id) => keystonesOf(party.roster[id]).length === 0)).toBe(true);
    const base = mulberry32(7919);
    let draws = 0;
    const counted = () => { draws++; return base(); };
    let s = createBattle({ party, enemyIds: ['golem', 'shade'], inventory: {}, revealed: {}, scale: { depth: 5, region: 'mainline' } });
    let rounds = 0;
    while (s.outcome === 'ongoing' && rounds < 60) { s = resolveRound(s, choose(s, party), counted); rounds++; }
    expect({ outcome: s.outcome, rounds, draws, hp: Object.fromEntries(s.party.map((c) => [c.key, c.hp])) })
      .toEqual({ outcome: 'win', rounds: 4, draws: 83, hp: { scarlet: 72, chizuru: 166, liz: 0, noel: 0, selene: 0 } });
  });
});

describe('abyss skills', () => {
  const cast = (skill: string, abyss: number) => {
    const foe = E('e0', { sleep: 3, max: { hp: 100000, def: 20 } as never });
    const s = resolveRound(makeBattle([P('p', { max: { tp: 99 } as never, tp: 99 })], [foe], { abyss }), { p: { kind: 'skill', skill, target: 'e0' } }, rng);
    return 100000 - s.enemies[0].hp;
  };
  it('an abyss skill grows with depth and stops at the cap', () => {
    const base = cast('abyss-sword', 0);
    expect(base).toBeGreaterThan(0);
    expect(Math.abs(cast('abyss-sword', 10) - base * 1.1)).toBeLessThanOrEqual(1);
    const deep = createBattle({ party: newParty(), enemyIds: ['slime'], inventory: {}, revealed: {}, depth: 50 });
    expect(deep.abyss).toBe(ABYSS.cap);
    expect(createBattle({ party: newParty(), enemyIds: ['slime'], inventory: {}, revealed: {}, depth: 7 }).abyss).toBe(7);
    expect(createBattle({ party: newParty(), enemyIds: ['slime'], inventory: {}, revealed: {}, scale: { depth: 12, region: 'mainline' } }).abyss).toBe(12);
    expect(createBattle({ party: newParty(), enemyIds: ['slime'], inventory: {}, revealed: {}, depth: 3, abyss: 30 }).abyss).toBe(30);
  });
  it('abyss leaves other skills alone', () => {
    expect(cast('hero-slash', 30)).toBe(cast('hero-slash', 0));
  });
});

describe('weapon kinds in battle', () => {
  const heroAt = (cell: number, weapon?: string, noel?: string) => {
    const party = newParty();
    party.grid = party.grid.map(() => null) as typeof party.grid;
    party.grid[cell] = 'hero';
    if (weapon) party.roster.hero.equip = { weapon: plainItem(weapon, 1) };
    if (noel) { party.grid[8] = 'noel'; party.roster.noel.equip = { weapon: plainItem(noel, 2) }; }
    return party;
  };
  const start = (party: ReturnType<typeof newParty>) => createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
  const hit = (s: ReturnType<typeof start>, key: string, patch: (c: ReturnType<typeof start>['party'][number]) => void = () => {}) => {
    patch(s.party.find((c) => c.key === key)!);
    const foe = s.enemies[0];
    foe.max.def = 0; foe.max.res = 0; foe.max.hp = 100000; foe.hp = 100000; foe.sleep = 3;
    const r = resolveRound(s, { [key]: { kind: 'attack', target: foe.key } }, rng);
    return 100000 - r.enemies[0].hp;
  };

  it('the hero with a staff attacks from range with MAG', () => {
    const s = start(heroAt(6, 'wooden-staff'));
    const h = s.party[0];
    expect([h.melee, h.attackScale, h.weaponKind]).toEqual([false, 'mag', 'staff']);
    const base = hit(start(heroAt(6, 'wooden-staff')), 'hero');
    const doubled = hit(start(heroAt(6, 'wooden-staff')), 'hero', (c) => { c.max.mag *= 2; });
    expect(base).toBeGreaterThan(0);
    expect(doubled / base).toBeGreaterThan(1.8);
    expect(doubled / base).toBeLessThan(2.2);
    // ATK does not move it
    expect(hit(start(heroAt(6, 'wooden-staff')), 'hero', (c) => { c.max.atk *= 2; })).toBe(base);
  });

  it('the hero with a sword attacks in melee with ATK', () => {
    const h = start(heroAt(0, 'iron-sword')).party[0];
    expect([h.melee, h.attackScale, h.weaponKind]).toEqual([true, 'atk', 'sword']);
    const base = hit(start(heroAt(0, 'iron-sword')), 'hero');
    expect(hit(start(heroAt(0, 'iron-sword')), 'hero', (c) => { c.max.mag *= 2; })).toBe(base);
    expect(hit(start(heroAt(0, 'iron-sword')), 'hero', (c) => { c.max.atk *= 2; })).toBeGreaterThan(base * 1.8);
  });

  it('the hero with a bow shoots from range with ATK; with no weapon he is a melee ATK fighter without mastery', () => {
    const bow = start(heroAt(6, 'hunter-bow')).party[0];
    expect([bow.melee, bow.attackScale, bow.weaponKind]).toEqual([false, 'atk', 'bow']);
    const bare = start(heroAt(0)).party[0];
    expect([bare.melee, bare.attackScale, bare.weaponKind]).toEqual([true, 'atk', undefined]);
  });

  it("the hero holding a legendary weapon gets that weapon's kind", () => {
    const party = heroAt(6);
    party.roster.hero.equip = { weapon: { ...plainItem('iron-sword', 1), rarity: 'legendary', special: 'storm-thunder-bow' } };
    const h = start(party).party[0];
    expect([h.melee, h.attackScale, h.weaponKind]).toEqual([false, 'atk', 'bow']);
    party.roster.hero.equip = { weapon: { ...plainItem('iron-sword', 1), rarity: 'legendary', special: 'frost-winter-staff' } };
    expect(start(party).party[0].weaponKind).toBe('staff');
  });

  it('companions ignore their weapon', () => {
    const n = start(heroAt(0, undefined, 'iron-sword')).party.find((c) => c.key === 'noel')!;
    expect(n.melee).toBe(false);
    expect(n.attackScale).toBeUndefined();
    expect(n.weaponKind).toBeUndefined();
  });

  it('mastery adds WEAPON_MASTERY_PCT to the matching branch only', () => {
    const mend = (c: Parameters<typeof skillFor>[0]) => skillFor(c, 'hero-mend')!.effects.find((e) => e.kind === 'heal')!;
    const slash = (c: Parameters<typeof skillFor>[0]) => skillFor(c, 'hero-slash')!.effects.find((e) => e.kind === 'damage')!;
    const none = { powers: [], ranks: {} };
    const staff = { powers: [], ranks: {}, weaponKind: 'staff' as const };
    const power = (e: { power?: number }) => e.power!;
    expect(power(mend(staff))).toBeCloseTo(power(mend(none)) * (1 + WEAPON_MASTERY_PCT / 100), 5);
    expect(power(slash(staff))).toBe(power(slash(none)));
    // a sword masters the sword branch, not the light branch
    expect(power(slash({ ...none, weaponKind: 'sword' as const }))).toBeCloseTo(power(slash(none)) * (1 + WEAPON_MASTERY_PCT / 100), 5);
    expect(power(mend({ ...none, weaponKind: 'sword' as const }))).toBe(power(mend(none)));
    // a companion's skill is never mastered
    expect(skillFor(staff, 'fire-star')).toBe(skillFor(none, 'fire-star'));
  });
});

describe('a full party fights exactly as before', () => {
  const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const playOut = (enemyIds: string[], seed: number) => {
    const party = partyAt(depthLevel(4));
    const r = mulberry32(seed);
    let s = createBattle({ party, enemyIds, boss: false, inventory: {}, revealed: {}, scale: { depth: 4, region: 'mainline' } });
    let rounds = 0;
    while (s.outcome === 'ongoing' && rounds < 60) { s = resolveRound(s, choose(s, party), r); rounds++; }
    return { outcome: s.outcome, rounds, hash: hash(JSON.stringify(s.log)) };
  };
  const runs = () => encounterTable('mainline', 4).flatMap((g, gi) => [1, 2, 3].map((seed) => ({ key: `${gi}:${seed}`, ...playOut(g, seed) })));

  it('matches the baseline captured before party scaling', () => {
    const got = Object.fromEntries(runs().map((r) => [r.key, [r.outcome, r.rounds, r.hash]]));
    if (process.env.CAPTURE) console.log('BASELINE=' + JSON.stringify(got));
    expect(got).toEqual(BASELINE);
  });
});
