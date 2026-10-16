import { describe, it, expect } from 'vitest';
import { LIMIT_MAX, LIMIT_PER_ACTION, LIMIT_PER_HIT_SCALE, createBattle, escapeChance, resolveRound, rewards, skillCost, turnOrder, writeBack } from './battle';
import { ULTIMATES } from '../data/ultimates';
import { ENEMIES } from '../data/enemies';
import { newParty, powersOf, sheetOf } from './party';
import { applyEffect } from './skills';
import { depthLevel, homeLevel } from './scaling';
import { SECONDARY_KEYS } from './stats';
import { choose, partyAt } from './sim';
import { dealDamage, type BattleEvent } from './combatant';
import { constRng, makeBattle, makeCombatant, plainItem } from './testing';

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
    expect(s.log).toContainEqual({ type: 'tp', target: 'p', amount: 3 });
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
