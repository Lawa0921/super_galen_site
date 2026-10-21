import { describe, it, expect } from 'vitest';
import { STORY_FIGHT_ROUNDS, LIMIT_MAX, LIMIT_PER_ACTION, LIMIT_PER_HIT_SCALE, createBattle, escapeChance, intentLabel, resolveRound, rewards, skillCost, skillFor, turnOrder, writeBack } from './battle';
import { WEAPON_MASTERY_PCT } from '../data/equipment';
import { RIN_DAWN, SKY_LANTERN, ULTIMATES, skyForm, HERO_ULTIMATES } from '../data/ultimates';
import { ENEMIES } from '../data/enemies';
import { activeIds, powersOf, sheetOf, LEGACY_LINEUP } from './party';
import { applyEffect } from './skills';
import { BOSS_PARTY_SCALE, FIRST_DEPTH_CAP, GROUP_CAP, PARTY_SCALE, bossPartyScale, depthLevel, encounterTable, homeLevel, mul, partyScale } from './scaling';
import { SECONDARY_KEYS } from './stats';
import { choose, partyAt } from './sim';
import { dealDamage, stat, type BattleEvent, type Combatant } from './combatant';
import { inflictAilment } from './ailments';
import type { EffectContext } from './skills';
import { constRng, makeBattle, makeCombatant, plainItem, fullParty } from './testing';
import { KEYSTONE_GATE, KEYSTONE_VALUES as V, MAX_KEYSTONES, MEMORY_KEYSTONE_VALUES, type KeystoneId } from '../data/talents';
import { chainLength } from '../data/story/chains';
import { SKILLS } from '../data/skills';
import { keystonesOf } from './progression';
import { mulberry32 } from './rng';
import { ABYSS } from '../data/hero';

// Re-captured (CAPTURE=1) in plan 6a Task 19c for its ENEMY_POWER retune (amount 0.3, amount2 0.26, ramp 0.002). Task 20 then moved the ramp to 0.0012; the replays below did not change.
// Re-captured in plan 8c Task 5 for Scarlet's mechanic (embers, cover, 贖火, 盾擊's challenge): 1:1, 1:2, 1:3 and 3:2 moved.
// Re-captured in plan 8d Task 3 for Noel's and Rin's nodes and Rin's innate, striking mark: every run moved (1:3 now 3 rounds).
// Re-captured in plan 8d Task 5 for Chizuru's and Selene's nodes: all but 0:2 and 2:3 moved (1:3 back to 2 rounds).
// Re-captured in plan 8d Task 6 for Liz's and Sylvie's nodes (大手筆 from Lv3): all but 1:3 moved.
// Re-captured in plan 8d Task 7 for Scarlet's nodes (爆炎斬 260 at 20% HP): 0:3, 1:1, 1:3, 2:1, 2:2, 2:3, 3:2, 3:3 moved.
const BASELINE: Record<string, [string, number, number]> = {"0:1":["win",2,2273561440],"0:2":["win",2,2117482776],"0:3":["win",2,3852993709],"1:1":["win",2,3298871120],"1:2":["win",2,2100695979],"1:3":["win",2,3779446041],"2:1":["win",1,3911781680],"2:2":["win",1,3311963584],"2:3":["win",1,660301701],"3:1":["win",2,1026183619],"3:2":["win",2,1034134533],"3:3":["win",2,3002320086]};
const rng = constRng(0.5); // enemies never use skills (all chances < 0.5), variance 1.0
const P = (key: string, over = {}) => makeCombatant({ key, side: 'party', ...over });
const E = (key: string, over = {}) => makeCombatant({ key, side: 'enemy', ...over });

describe('createBattle', () => {
  it('builds rows from the formation and letters duplicate enemies', () => {
    const party = fullParty(LEGACY_LINEUP);
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
    const party = fullParty(LEGACY_LINEUP);
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
    expect(s.party[0].hp).toBe(80);   // 爆炎斬 costs 20% HP since plan 8d Task 7
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
      makeBattle([P('p', { buffs: [{ stat: 'atk', pct: 50, turns: 1 }], mech: { kind: 'devices', devices: [{ skill: 'turret', kind: 'turret', power: 100, level: 1, turns: 1 }], cap: 2 } })], [E('e0', { sleep: 3 })]),
      { p: { kind: 'defend' } }, rng,
    );
    expect(s.party[0].buffs).toEqual([]);
    expect(s.party[0].mech).toEqual({ kind: 'devices', devices: [], cap: 2 });
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
    expect(rewards(s, constRng(0), false)).toEqual({ exp: 9, gold: 9, drops: { moss: 1, 'bat-wing': 1 }, coinGold: 0 });
    expect(rewards(s, constRng(0.99), false).drops).toEqual({});
    expect(rewards(s, constRng(0.7), false).drops).toEqual({});
    expect(rewards(s, constRng(0.7), true).drops).toEqual({ moss: 1, 'bat-wing': 1 });
    // A drop-rate multiplier: the whole part always comes, the fraction is rolled (never floored away).
    expect(rewards(s, constRng(0), false, 1.5).drops).toEqual({ moss: 2, 'bat-wing': 2 });
    expect(rewards(s, seq([0, 0.9, 0, 0.9]), false, 1.5).drops).toEqual({ moss: 1, 'bat-wing': 1 });
    expect(rewards(s, constRng(0), false, 2).drops).toEqual({ moss: 2, 'bat-wing': 2 });
  });
  it('writes HP and TP back to the roster', () => {
    const party = fullParty(LEGACY_LINEUP);
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
    const party = fullParty(LEGACY_LINEUP);
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
    expect(rewards(makeBattle([P('p')], foes), constRng(0), false)).toEqual({ exp: 9, gold: 9, drops: { moss: 1, 'bat-wing': 1 }, coinGold: 0 });
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
    const party = partyAt(1, { ids: LEGACY_LINEUP });
    const s = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    const noel = s.party.find((c) => c.key === 'noel')!;
    noel.tp = 2;
    expect(choose(s, party).noel.kind).toBe('attack');                 // 火之星彈 costs 4
    noel.x.tpCost = 50;
    expect(choose(s, party).noel).toEqual({ kind: 'skill', skill: 'fire-star', target: 'e0' });
    // At level 6 順手牽羊 (55 x 3) is 莉茲's strongest (大手筆 waits for four coins, and she starts with none); 三叉刃 makes 雙刃 (60 x 3 at its rank) outrank it.
    const lv6 = partyAt(6, { ids: LEGACY_LINEUP });
    const s6 = createBattle({ party: lv6, enemyIds: ['slime'], inventory: {}, revealed: {} });
    expect(choose(s6, lv6).liz).toMatchObject({ kind: 'skill', skill: 'pickpocket' });
    s6.party.find((c) => c.key === 'liz')!.powers = ['lg-liz'];
    expect(choose(s6, lv6).liz).toMatchObject({ kind: 'skill', skill: 'twin-slash' });
  });
});

describe('skills from the tree (Task 8)', () => {
  it('a member fights with a copy of their tree ranks', () => {
    const party = fullParty(LEGACY_LINEUP);
    const s = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    const noel = s.party.find((c) => c.key === 'noel')!;
    expect(noel.ranks).toEqual(party.roster.noel.tree);
    expect(noel.ranks).not.toBe(party.roster.noel.tree);
    expect(s.enemies[0].ranks).toBeUndefined();
  });

  it('a member cannot cast a skill whose node is unlearned', () => {
    const party = fullParty(LEGACY_LINEUP);
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
    // 殺價 (plan 8d Task 6): 雙刃 for 2 TP less.
    const ranks = { 'twin-slash': 1, 'liz-twin-haggle': 1 };
    const p = P('p', { tp: 20, ranks });
    const s = makeBattle([p], [E('e0', { max: { hp: 999 } as never })]);
    const r = resolveRound(s, { p: { kind: 'skill', skill: 'twin-slash', target: 'e0' } }, rng);
    expect(r.party[0].tp).toBe(20 - skillCost(p, 'twin-slash'));
    expect(skillCost(p, 'twin-slash')).toBeLessThan(skillCost(P('q'), 'twin-slash'));
  });
});

describe('keystones in battle', () => {
  it("the hero carries his build's keystones into the fight, up to three", () => {
    const held = (build: 'tank' | 'balanced') => {
      const party = partyAt(50, { heroBuild: build });
      const hero = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} }).party.find((c) => c.key === 'hero')!;
      expect(hero.keystones, build).toEqual(keystonesOf(party.roster.hero));
      return new Set(hero.keystones);
    };
    const tank = held('tank');
    expect(tank).toEqual(new Set(['regen', 'taunt-guard', 'last-stand']));
    const balanced = held('balanced');
    expect(balanced.size).toBe(3);
    expect(balanced).not.toEqual(tank);
  });
  it('opening-gauge starts the gauge at least at openingGauge, never stacking on what it carries', () => {
    // Enough talent points for both default keystones; selene's are regen and opening-gauge.
    const party = partyAt(2 * (KEYSTONE_GATE + MAX_KEYSTONES) + 4, { ids: LEGACY_LINEUP });
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
    const p = P('p', { tp: 0, keystones: ['crit-tp'], x: { crit: 100 }, mech: { kind: 'devices', devices: [{ skill: 'turret', kind: 'turret', power: 50, level: 1, turns: 2 }], cap: 2 } });
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
    // enemies. Re-recorded again in plan 6a Task 19c for its ENEMY_POWER retune (amount 0.3, amount2 0.26, ramp 0.002; scarlet 72 -> 65); Task 20's ramp 0.0012 left it as it was.
    // Re-recorded in plan 8d Task 3 (Noel's new nodes in her standard tree: 連星, 冷靜, 擴咒, 雙響 replace the plan 8c ones).
    // Re-recorded in plan 8d Task 5 (Chizuru's 雙月, 久護, 連突 and Selene's 凝光, 深眠 replace the plan 8c ones).
    // Re-recorded in plan 8d Task 6 (Liz learns 大手筆 at Lv3 and 分期 by Lv20; now 4 rounds, and Chizuru falls).
    // Re-recorded in plan 8d Task 7 (爆炎斬 260 at 20% HP, 赤心 for 爆炎強化: Scarlet ends on 81 HP, was 111).
    // A keystone reaching this fight changes TP, damage or heals, and so the replay.
    const party = partyAt(20, { ids: LEGACY_LINEUP });
    // The fighters only: the hero (Lv20, 15 talent points) holds one on the bench, and never enters this fight.
    expect(activeIds(party).every((id) => keystonesOf(party.roster[id]).length === 0)).toBe(true);
    const base = mulberry32(7919);
    let draws = 0;
    const counted = () => { draws++; return base(); };
    let s = createBattle({ party, enemyIds: ['golem', 'shade'], inventory: {}, revealed: {}, scale: { depth: 5, region: 'mainline' } });
    let rounds = 0;
    while (s.outcome === 'ongoing' && rounds < 60) { s = resolveRound(s, choose(s, party), counted); rounds++; }
    expect({ outcome: s.outcome, rounds, draws, hp: Object.fromEntries(s.party.map((c) => [c.key, c.hp])) })
      .toEqual({ outcome: 'win', rounds: 4, draws: 99, hp: { scarlet: 81, chizuru: 0, liz: 0, noel: 104, selene: 0 } });
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
    const deep = createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['slime'], inventory: {}, revealed: {}, depth: 50 });
    expect(deep.abyss).toBe(ABYSS.cap);
    expect(createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['slime'], inventory: {}, revealed: {}, depth: 7 }).abyss).toBe(7);
    expect(createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['slime'], inventory: {}, revealed: {}, scale: { depth: 12, region: 'mainline' } }).abyss).toBe(12);
    expect(createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['slime'], inventory: {}, revealed: {}, depth: 3, abyss: 30 }).abyss).toBe(30);
  });
  it('abyss leaves other skills alone', () => {
    expect(cast('hero-slash', 30)).toBe(cast('hero-slash', 0));
  });
  it('every abyss capstone grows with depth: damage, heals and buffs alike', () => {
    const logOf = (skill: string, abyss: number) => {
      const foe = E('e0', { sleep: 3, max: { hp: 100000, def: 20 } as never });
      const ally = P('q', { hp: 10, max: { hp: 100000 } as never });
      const s = resolveRound(makeBattle([P('p', { max: { tp: 99 } as never, tp: 99 }), ally], [foe], { abyss }), { p: { kind: 'skill', skill, target: 'e0' } }, rng);
      return s.log;
    };
    const sum = (log: BattleEvent[], type: 'damage' | 'heal') => log.reduce((n, e) => (e.type === type ? n + (e as unknown as { amount: number }).amount : n), 0);
    const buffs = (log: BattleEvent[]) => log.flatMap((e) => (e.type === 'buff' ? [e.pct] : []));
    expect(sum(logOf('abyss-star', 30), 'damage')).toBeGreaterThan(sum(logOf('abyss-star', 0), 'damage'));
    expect(sum(logOf('abyss-light', 30), 'heal')).toBeGreaterThan(sum(logOf('abyss-light', 0), 'heal'));
    // buffPct scales the size of a buff and keeps its sign: a boost climbs, a curse deepens.
    expect(buffs(logOf('abyss-guard', 0))).toEqual([25, 25, 25, 25]);
    expect(buffs(logOf('abyss-guard', 30))).toEqual([33, 33, 33, 33]);
    expect(buffs(logOf('abyss-chain', 0))).toEqual([-20, -20]);
    expect(buffs(logOf('abyss-chain', 30))).toEqual([-26, -26]);
  });
});

describe('weapon kinds in battle', () => {
  const heroAt = (cell: number, weapon?: string, noel?: string) => {
    const party = fullParty(LEGACY_LINEUP);
    party.grid = party.grid.map(() => null) as typeof party.grid;
    party.grid[cell] = 'hero';
    if (weapon) party.roster.hero.equip = { weapon: plainItem(weapon, 1) };
    if (noel) { party.grid[8] = 'noel'; party.roster.noel.equip = { weapon: plainItem(noel, 2) }; }
    return party;
  };
  const start = (party: ReturnType<typeof fullParty>) => createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
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
    const party = partyAt(depthLevel(4), { ids: LEGACY_LINEUP });
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

describe('enemies scale with the party size', () => {
  const withMembers = (n: number, hurt = 0) => {
    const p = partyAt(depthLevel(4));
    let kept = 0;
    p.grid = p.grid.map((id) => (id && kept++ < n ? id : null));
    activeIds(p).slice(0, hurt).forEach((id) => { p.roster[id].hp = 0; });
    return p;
  };
  const fight = (party: ReturnType<typeof partyAt>, enemyIds: string[], extra: Record<string, unknown> = {}) =>
    createBattle({ party, enemyIds, boss: false, inventory: {}, revealed: {}, scale: { depth: 4, region: 'mainline' }, ...extra });
  const group4 = ['wolf', 'wolf', 'wolf', 'wolf'];

  it('two members face weaker enemies', () => {
    const k = partyScale(2);
    const full = fight(withMembers(5), ['wolf', 'wolf']);
    const two = fight(withMembers(2), ['wolf', 'wolf']);
    expect(two.partyScale).toBe(k);
    expect(full.partyScale).toBeUndefined();
    for (const key of Object.keys(full.enemyDefs!)) {
      expect(two.enemyDefs![key].stats).toEqual(mul(full.enemyDefs![key].stats, { hp: k, atk: k, mag: k }));
    }
    expect(two.enemies[0].max.hp).toBe(two.enemyDefs!.e0.stats.hp);
  });

  it('three and four members read their own rows, and the group is trimmed to their caps', () => {
    for (const n of [3, 4] as const) {
      expect(fight(withMembers(n), ['wolf']).partyScale, `${n} members`).toBe(PARTY_SCALE[n]);
      expect(fight(withMembers(n), [...group4, ...group4]).enemies, `${n} members`).toHaveLength(GROUP_CAP[n]);
    }
    expect(PARTY_SCALE[3]).not.toBe(PARTY_SCALE[2]);
    expect(PARTY_SCALE[4]).not.toBe(PARTY_SCALE[3]);
  });

  it('a smaller party faces weaker enemies but earns the same exp and gold from them', () => {
    expect(partyScale(2)).toBeLessThan(1);
    const full = fight(withMembers(5), ['wolf']);
    const two = fight(withMembers(2), ['wolf']);
    expect(two.enemyDefs!.e0.stats.hp).toBeLessThan(full.enemyDefs!.e0.stats.hp);
    expect(two.enemyDefs!.e0.exp).toBe(full.enemyDefs!.e0.exp);
    expect(two.enemyDefs!.e0.gold).toBe(full.enemyDefs!.e0.gold);
  });

  it('FIRST_DEPTH_CAP trims the first depth only, through createBattle', () => {
    const before = FIRST_DEPTH_CAP[2];
    FIRST_DEPTH_CAP[2] = 2;
    try {
      expect(fight(withMembers(2), group4, { depth: 1 }).enemies).toHaveLength(2);
      expect(fight(withMembers(2), group4, { depth: 2 }).enemies).toHaveLength(GROUP_CAP[2]);
      expect(fight(withMembers(3), group4, { depth: 1 }).enemies).toHaveLength(GROUP_CAP[3]);
    } finally {
      if (before === undefined) delete FIRST_DEPTH_CAP[2]; else FIRST_DEPTH_CAP[2] = before;
    }
  });

  it('a downed member still counts', () => {
    expect(fight(withMembers(2, 1), ['wolf']).partyScale).toBe(partyScale(2));
  });

  it('a lone hero reads the two-member row', () => {
    expect(fight(withMembers(1), ['wolf']).partyScale).toBe(partyScale(2));
  });

  it('the group is trimmed to groupCap', () => {
    expect(fight(withMembers(2), group4).enemies).toHaveLength(GROUP_CAP[2]);
    expect(fight(withMembers(2), group4, { extra: 1 }).enemies).toHaveLength(GROUP_CAP[2] + 1);
    expect(fight(withMembers(5), group4).enemies).toHaveLength(4);
  });

  it('a boss fight is scaled but never trimmed', () => {
    const ids = ['lanterneater', 'wolf', 'wolf', 'wolf'];
    const full = createBattle({ party: withMembers(5), enemyIds: ids, boss: true, inventory: {}, revealed: {}, depth: 3 });
    const two = createBattle({ party: withMembers(2), enemyIds: ids, boss: true, inventory: {}, revealed: {}, depth: 3 });
    expect(two.enemies).toHaveLength(4);
    expect(two.enemies[0].max.hp).toBe(mul(full.enemies[0].max, { hp: bossPartyScale(2) }).hp);
  });

  it('a boss fight reads BOSS_PARTY_SCALE and a normal fight reads PARTY_SCALE', () => {
    const before = BOSS_PARTY_SCALE[3];
    BOSS_PARTY_SCALE[3] = 0.5;
    try {
      const boss = (n: number) => createBattle({ party: withMembers(n), enemyIds: ['lanterneater'], boss: true, inventory: {}, revealed: {}, depth: 3 });
      const full = boss(5);
      expect(boss(3).partyScale).toBe(0.5);
      expect(boss(3).enemies[0].max.hp).toBe(mul(full.enemies[0].max, { hp: 0.5 }).hp);
      expect(fight(withMembers(3), ['wolf']).partyScale).toBe(PARTY_SCALE[3]);
    } finally {
      BOSS_PARTY_SCALE[3] = before;
    }
  });
});

describe('memory keystones in battle', () => {
  const MV = MEMORY_KEYSTONE_VALUES;
  /** The Lv1 legacy party, with `id` holding every piece of her chain. */
  const awake = (id: 'noel' | 'liz' | 'chizuru') => {
    const party = fullParty(LEGACY_LINEUP);
    party.roster[id] = { ...party.roster[id], memories: chainLength(id) };
    return party;
  };
  const start = (party: ReturnType<typeof fullParty>) => createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });

  it('small-shrine guards the party at the start', () => {
    const s = start(awake('chizuru'));
    for (const c of s.party) expect(c.buffs, c.key).toEqual([{ stat: 'def', pct: MV.shrineDefPct, turns: MV.shrineTurns, src: 'chizuru' }]);
    expect(s.enemies.every((e) => e.buffs.length === 0)).toBe(true);
    expect(start(fullParty(LEGACY_LINEUP)).party.every((c) => c.buffs.length === 0)).toBe(true);
    expect(s.party.find((c) => c.key === 'chizuru')!.keystones).toContain('small-shrine');
  });

  it('small-shrine and the unrung bell credit their holder', () => {
    const s = start(awake('chizuru'));
    for (const c of s.party) expect(c.buffs.map((b) => b.src), c.key).toEqual(['chizuru']);
    const hero = P('hero', { hp: 1 });
    const rin = P('rin', { keystones: ['unrung-bell'] });
    const foe = E('e0', { max: { atk: 999, spd: 99, hp: 99999 } as never });
    const rang = resolveRound(makeBattle([hero, rin], [foe], { intents: { e0: { kind: 'attack', target: 'hero' } } }), {}, rng);
    expect(rang.party.find((c) => c.key === 'rin')!.buffs).toContainEqual(expect.objectContaining({ stat: 'atk', pct: MV.bellAtkPct, src: 'rin' }));
  });

  it('teachers-gift costs less TP', () => {
    const noel = (party: ReturnType<typeof fullParty>) => start(party).party.find((c) => c.key === 'noel')!;
    const plain = noel(fullParty(LEGACY_LINEUP)), held = noel(awake('noel'));
    expect(held.x.tpCost ?? 0).toBe((plain.x.tpCost ?? 0) + MV.tpCostPct);
    const tp = SKILLS['flame-wave'].tp;
    expect(skillCost(plain, 'flame-wave')).toBe(tp);
    expect(skillCost(held, 'flame-wave')).toBe(Math.max(1, Math.ceil((tp * (100 - MV.tpCostPct)) / 100)));
    expect(skillCost(held, 'flame-wave')).toBeLessThan(tp);
  });

  it('fathers-face finds more materials', () => {
    const liz = (party: ReturnType<typeof fullParty>) => start(party).party.find((c) => c.key === 'liz')!;
    expect(liz(awake('liz')).x.matFind ?? 0).toBe((liz(fullParty(LEGACY_LINEUP)).x.matFind ?? 0) + MV.matFind);
    // A roll just over the plain chance misses without her and hits with her.
    const chance = ENEMIES.slime.drops[0].chance;
    const drops = (party: ReturnType<typeof fullParty>) => {
      const s = start(party);
      s.enemies.forEach((e) => { e.alive = false; });
      return Object.values(rewards(s, constRng(chance * (1 + MV.matFind / 200)), false).drops).reduce((a, b) => a + b, 0);
    };
    expect(drops(awake('liz'))).toBeGreaterThan(drops(fullParty(LEGACY_LINEUP)));
  });

  it('blueprint turrets hit harder', () => {
    const shot = (keystones: KeystoneId[]) => {
      const p = P('p', { keystones, max: { mag: 400 } as never, mech: { kind: 'devices', devices: [{ skill: 'turret', kind: 'turret', power: 100, level: 1, turns: 2 }], cap: 2 } });
      const s = resolveRound(makeBattle([p], [E('e0', { sleep: 5, max: { hp: 99999 } as never })]), {}, rng);
      const d = s.log.find((e) => e.type === 'damage');
      return d && d.type === 'damage' ? d.amount : -1;
    };
    const plain = shot([]), held = shot(['blueprint']);
    expect(Math.abs(held - plain * (1 + MV.devicePct / 100))).toBeLessThanOrEqual(1);
    expect(held).toBeGreaterThan(plain);
  });

  describe('the unrung bell', () => {
    /** The foe strikes the hero first; Rin stands behind him. */
    const fall = (over: { rin?: Partial<Combatant>; hero?: Partial<Combatant>; foe?: Partial<Combatant> } = {}) => {
      const hero = P('hero', { hp: 1, ...over.hero });
      const rin = P('rin', { keystones: ['unrung-bell'], ...over.rin });
      const foe = E('e0', { max: { atk: 999, spd: 99, hp: 99999 } as never, ...over.foe });
      const s = makeBattle([hero, rin], [foe], { intents: { e0: { kind: 'attack', target: 'hero' } } });
      return resolveRound(s, {}, rng);
    };

    it("answers the hero's fall at once", () => {
      const s = fall();
      const ko = s.log.findIndex((e) => e.type === 'ko' && e.target === 'hero');
      expect(ko).toBeGreaterThanOrEqual(0);
      const after = s.log.slice(ko + 1);
      expect(after.find((e) => e.type === 'act')).toMatchObject({ type: 'act', actor: 'rin' });
      expect(after.find((e) => e.type === 'damage')).toMatchObject({ target: 'e0' });
      const rin = s.party.find((c) => c.key === 'rin')!;
      expect(rin.buffs).toContainEqual(expect.objectContaining({ stat: 'atk', pct: MV.bellAtkPct }));
      expect(s.enemies[0].hp).toBeLessThan(99999);
    });

    it('does not ring while the hero stands, without the keystone, or with Rin down', () => {
      const answered = (s: ReturnType<typeof fall>) => s.log.some((e) => e.type === 'act' && e.actor === 'rin');
      expect(answered(fall({ hero: { hp: 99999, max: { hp: 99999 } as never }, foe: { max: { atk: 1, spd: 99, hp: 99999 } as never } }))).toBe(false);
      expect(answered(fall({ rin: { keystones: [] } }))).toBe(false);
      expect(answered(fall({ rin: { hp: 0, alive: false } }))).toBe(false);
      expect(fall({ rin: { keystones: [] } }).party.find((c) => c.key === 'rin')!.buffs).toEqual([]);
    });

    it("rings once when poison takes the hero at the round's end", () => {
      const hero = P('hero', { hp: 1, poison: true });
      const rin = P('rin', { keystones: ['unrung-bell'] });
      const s = resolveRound(makeBattle([hero, rin], [E('e0', { sleep: 5, max: { hp: 99999 } as never })]), {}, rng);
      expect(s.log.filter((e) => e.type === 'act' && e.actor === 'rin')).toHaveLength(1);
      expect(s.party[1].buffs).toContainEqual(expect.objectContaining({ stat: 'atk', pct: MV.bellAtkPct }));
    });
  });
});

describe('the Sky Lantern and the dawn blade', () => {
  const sleeper = (key: string, hp = 99999) => E(key, { max: { hp, atk: 1, spd: 1 } as never, sleep: 5 });
  const dawn = (over: Partial<Combatant> = {}) => P('rin', { defId: 'rin', limit: 100, oath: true, ...over });

  it('the dawn blade always crits and gives back half the gauge on a kill', () => {
    const killed = resolveRound(makeBattle([dawn()], [sleeper('e0', 1)]), { rin: { kind: 'ultimate', target: 'e0' } }, rng);
    expect(killed.log).toContainEqual({ type: 'act', actor: 'rin', label: RIN_DAWN.name, ultimate: RIN_DAWN.id });
    expect(killed.log.find((e) => e.type === 'damage' && e.target === 'e0')).toMatchObject({ crit: true });
    expect(killed.enemies[0].alive).toBe(false);
    expect(killed.party[0].limit).toBe((LIMIT_MAX * RIN_DAWN.refundOnKill!) / 100);
    // no kill, no refund: the gauge empties (plus this round's ordinary gain, which an ultimate does not take)
    const spared = resolveRound(makeBattle([dawn()], [sleeper('e0')]), { rin: { kind: 'ultimate', target: 'e0' } }, rng);
    expect(spared.enemies[0].alive).toBe(true);
    expect(spared.party[0].limit).toBeLessThan(LIMIT_PER_ACTION);
    // without the oath she still throws the plain ultimate
    const plain = resolveRound(makeBattle([P('rin', { defId: 'rin', limit: 100 })], [sleeper('e0', 1)]), { rin: { kind: 'ultimate', target: 'e0' } }, rng);
    expect(plain.log).toContainEqual({ type: 'act', actor: 'rin', label: ULTIMATES.rin.name, ultimate: ULTIMATES.rin.id });
    expect(plain.party[0].limit).toBeLessThan(LIMIT_PER_ACTION);
  });

  it('the dawn blade guards the hero for the fight', () => {
    const run = (hero: Partial<Combatant>) =>
      resolveRound(makeBattle([P('hero', { defId: 'hero', ...hero }), dawn()], [sleeper('e0')]), { rin: { kind: 'ultimate', target: 'e0' } }, rng);
    const s = run({});
    const guard = s.party.find((c) => c.key === 'hero')!.buffs.find((b) => b.stat === 'def');
    expect(guard).toMatchObject({ pct: 30 });
    expect(guard!.turns).toBeGreaterThanOrEqual(99 - 1);
    expect(s.party.find((c) => c.key === 'rin')!.buffs.some((b) => b.stat === 'def')).toBe(false);
    // a fallen hero gets nothing
    const down = run({ hp: 0, alive: false });
    expect(down.party.find((c) => c.key === 'hero')!.buffs).toEqual([]);
    expect(down.log.some((e) => e.type === 'buff')).toBe(false);
  });

  it('the sky lantern heals the party after its blow', () => {
    const lit = (memories: number) => P('hero', { defId: 'hero', limit: 100, memories, ranks: {} });
    const hurt = (key: string, hp: number) => P(key, { defId: key, hp, alive: hp > 0, max: { hp: 100 } as never });
    const go = (memories: number) => resolveRound(makeBattle([lit(memories), hurt('noel', 10), hurt('liz', 0)], [sleeper('e0')]), { hero: { kind: 'ultimate', target: 'e0' } }, rng);
    const sky = go(SKY_LANTERN.memories);
    const noel = sky.party.find((c) => c.key === 'noel')!;
    expect(noel.hp).toBeGreaterThan(10);
    expect(sky.enemies[0].hp).toBeLessThan(99999);
    expect(sky.party.find((c) => c.key === 'liz')!.hp).toBe(0);   // the fallen are not woken
    expect(sky.log.filter((e) => e.type === 'heal' && e.target === 'noel')).toHaveLength(1);
    // one memory short, the same blow heals no one
    const plain = go(SKY_LANTERN.memories - 1);
    expect(plain.party.find((c) => c.key === 'noel')!.hp).toBeLessThanOrEqual(10);   // the woken foe may still scratch her
    expect(plain.log.some((e) => e.type === 'heal')).toBe(false);
    expect(HERO_ULTIMATES.map(skyForm)[0].follow).toBeDefined();
  });
});

describe('survive fights', () => {
  const defendAll = (s: ReturnType<typeof createBattle>) => Object.fromEntries(s.party.map((c) => [c.key, { kind: 'defend' as const }]));
  const survival = () => createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['scarlet-foe', 'slime'], inventory: {}, revealed: {}, depth: 5, extra: 1, survive: STORY_FIGHT_ROUNDS });
  it('a survive fight ends in a win after its rounds', () => {
    let s = survival();
    expect(s.survive).toBe(STORY_FIGHT_ROUNDS);
    for (let r = 1; r <= STORY_FIGHT_ROUNDS; r++) {
      expect(s.outcome).toBe('ongoing');
      s = resolveRound(s, defendAll(s), rng);
    }
    expect(s.round).toBe(STORY_FIGHT_ROUNDS);
    expect(s.outcome).toBe('win');
    expect(s.log.some((e) => e.type === 'survived')).toBe(true);
  });
  it('a plain fight has no survive and does not win by waiting', () => {
    let s = createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['golem'], inventory: {}, revealed: {}, depth: 5 });
    expect(s.survive).toBeUndefined();
    for (let r = 1; r <= STORY_FIGHT_ROUNDS; r++) s = resolveRound(s, defendAll(s), rng);
    expect(s.outcome).not.toBe('win');
  });
  it('nobody falls in a survive fight', () => {
    let s = survival();
    for (const e of s.enemies) e.max.atk = 99999;
    for (const c of s.party) c.max.atk = 99999;
    expect(s.enemies[0].defId).toBe('scarlet-foe');
    for (let r = 1; r <= STORY_FIGHT_ROUNDS; r++) {
      s = resolveRound(s, Object.fromEntries(s.party.map((c) => [c.key, { kind: 'attack' as const, target: 'e0' }])), constRng(0.1));
      for (const c of s.party) { expect(c.alive, c.key).toBe(true); expect(c.hp, c.key).toBeGreaterThanOrEqual(1); }
      expect(s.enemies[0].alive).toBe(true);
      expect(s.enemies[0].hp).toBeGreaterThanOrEqual(1);
    }
    expect(s.outcome).toBe('win');
    // The claim is only worth something if hits really landed on both sides.
    const hits = s.log.filter((e): e is Extract<BattleEvent, { type: 'damage' }> => e.type === 'damage');
    expect(hits.some((e) => e.target === 'e0')).toBe(true);
    expect(hits.some((e) => s.party.some((c) => c.key === e.target))).toBe(true);
  });
  it('an undying target logs and fills the gauge for what it really lost', () => {
    const t = P('p', { undying: true, hp: 11, limit: 0 });
    expect(dealDamage(t, 5000)).toBe(10);
    expect(t.hp).toBe(1);
    expect(t.limit).toBe(Math.max(1, Math.floor((10 / t.max.hp) * 40)));
    const before = t.limit;
    expect(dealDamage(t, 5000)).toBe(0);
    expect(t.limit).toBe(before);
    // A plain target is unchanged: the whole amount, and it can fall.
    const plain = P('q', { hp: 11 });
    expect(dealDamage(plain, 50)).toBe(50);
    expect(plain.alive).toBe(false);
  });
  it('the poison tick under undying stops at 1 and logs the real amount', () => {
    const s = resolveRound(makeBattle([P('p', { undying: true, poison: true, hp: 6 })], [E('e0', { sleep: 3 })]), { p: { kind: 'defend' } }, rng);
    expect(s.party[0].hp).toBe(1);
    expect(s.party[0].alive).toBe(true);
    expect(s.log).toContainEqual({ type: 'poison-tick', target: 'p', amount: 5 });
    expect(s.log.some((e) => e.type === 'ko')).toBe(false);
  });
  it('a hit on an undying foe logs the HP it really took', () => {
    const s = resolveRound(makeBattle([P('p')], [E('e0', { undying: true, hp: 6, sleep: 3 })]), { p: { kind: 'attack', target: 'e0' } }, rng);
    expect(s.enemies[0].hp).toBe(1);
    expect(s.log).toContainEqual(expect.objectContaining({ type: 'damage', target: 'e0', amount: 5 }));
  });
  it('a foe that is undying only stays so inside a survive fight', () => {
    const plain = createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['scarlet-foe'], inventory: {}, revealed: {}, depth: 5 });
    expect(plain.enemies[0].undying).toBeUndefined();
    expect(survival().enemies[0].undying).toBe(true);
  });
  it('a survive win pays only for the enemies knocked out', () => {
    const s = createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['scarlet-foe', 'slime', 'bat'], inventory: {}, revealed: {}, depth: 5, extra: 2, survive: STORY_FIGHT_ROUNDS });
    expect(s.enemies.map((e) => e.defId)).toEqual(['scarlet-foe', 'slime', 'bat']);
    s.enemies[1].hp = 0; s.enemies[1].alive = false;
    const r = rewards(s, constRng(0), false);
    expect(r.exp).toBe(ENEMIES.slime.exp);
    expect(r.gold).toBe(ENEMIES.slime.gold);
    expect(Object.keys(r.drops)).toEqual(ENEMIES.slime.drops.map((d) => d.mat));
  });
});

describe('names and boss power', () => {
  const fight = (o: { names?: Record<string, string>; bossPower?: number } = {}) =>
    createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['lanterneater'], boss: true, inventory: {}, revealed: {}, depth: 30, ...o });
  it('names and boss power change only that fight', () => {
    const plain = fight();
    const mother = fight({ names: { lanterneater: '燈喰之母' }, bossPower: 1.5 });
    const [a, b] = [plain.enemies[0], mother.enemies[0]];
    expect(b.name).toBe('燈喰之母');
    expect(a.name).toBe(ENEMIES.lanterneater.name);
    for (const k of ['hp', 'atk', 'mag'] as const) expect(b.max[k]).toBe(Math.round(a.max[k] * 1.5));
    for (const k of ['tp', 'def', 'res', 'spd'] as const) expect(b.max[k]).toBe(a.max[k]);
    expect(b.hp).toBe(b.max.hp);
    // The next fight, with no options, is the plain one again.
    const again = fight().enemies[0];
    expect([again.name, again.max]).toEqual([a.name, a.max]);
  });
  it('a power of one and no names are the plain fight', () => {
    expect(fight({ bossPower: 1 }).enemies[0]).toEqual(fight().enemies[0]);
  });
});

describe('ailments at round end and on their turn (plan 8b)', () => {
  const counting = (v: number) => {
    const f = Object.assign(() => { f.n += 1; return v; }, { n: 0 });
    return f;
  };
  const fx = (r: () => number = constRng(0)): EffectContext => ({ rng: r, itemBoost: false, revealed: {}, log: [] });
  const all = { poison: true, sleep: 2, burn: { tick: 5, turns: 3, src: 'p' }, bleed: [{ tick: 2, turns: 2, src: 'p' }], shock: 2, frozen: true as const, freezeGuard: 1, chill: 2 };

  it('burn and bleed tick at round end, then wear off', () => {
    let s = makeBattle([P('p')], [E('e0', { burn: { tick: 12, turns: 3, src: 'p' }, bleed: [{ tick: 5, turns: 1, src: 'p' }] })]);
    s = resolveRound(s, { p: { kind: 'defend' } }, rng);
    expect(s.enemies[0].hp).toBe(83);
    expect(s.log.filter((e) => e.type === 'dot-tick')).toEqual([
      { type: 'dot-tick', target: 'e0', amount: 12, status: 'burn' },
      { type: 'dot-tick', target: 'e0', amount: 5, status: 'bleed' },
    ]);
    expect(s.enemies[0].bleed).toBeUndefined();
    expect(s.enemies[0].burn).toEqual({ tick: 12, turns: 2, src: 'p' });
    s = resolveRound(s, { p: { kind: 'defend' } }, rng);
    s = resolveRound(s, { p: { kind: 'defend' } }, rng);
    expect(s.enemies[0].hp).toBe(59);
    expect(s.enemies[0].burn).toBeUndefined();
  });

  it('a tick that fells logs the fall and stops the rest', () => {
    const s = resolveRound(makeBattle([P('p')], [E('e0', { hp: 3, burn: { tick: 12, turns: 3, src: 'p' }, bleed: [{ tick: 5, turns: 1, src: 'p' }] }), E('e1', { sleep: 3 })]), { p: { kind: 'defend' } }, rng);
    expect(s.log.filter((e) => e.type === 'dot-tick' || e.type === 'ko')).toEqual([
      { type: 'dot-tick', target: 'e0', amount: 12, status: 'burn' }, { type: 'ko', target: 'e0' },
    ]);
    expect(s.enemies[0].burn).toBeUndefined();
  });

  it('shock raises every hit and every tick by 20%', () => {
    const hit = (shock?: number) => {
      const t = E('e0', shock ? { shock } : {});
      applyEffect(P('p'), t, { kind: 'damage', power: 100, element: 'phys', scale: 'atk', melee: true }, fx(constRng(0.5)));
      return 100 - t.hp;
    };
    expect(hit()).toBe(20);
    expect(hit(2)).toBe(24);   // Math.floor(20 x 1 x 1.2 x 1.0)
    const poisoned = resolveRound(makeBattle([P('p', { poison: true, shock: 2 })], [E('e0', { sleep: 3 })]), { p: { kind: 'defend' } }, rng);
    expect(poisoned.log).toContainEqual({ type: 'poison-tick', target: 'p', amount: 12 });
    const burnt = resolveRound(makeBattle([P('p')], [E('e0', { shock: 2, burn: { tick: 12, turns: 3, src: 'p' }, bleed: [{ tick: 1, turns: 2, src: 'p' }] })]), { p: { kind: 'defend' } }, rng);
    expect(burnt.log.filter((e) => e.type === 'dot-tick').map((e) => (e as { amount: number }).amount)).toEqual([14, 1]);
    expect(burnt.enemies[0].shock).toBe(1);
  });

  it('a frozen foe loses its next action, then is guarded for two rounds', () => {
    let s = makeBattle([P('p')], [E('e0', { frozen: true })]);
    s = resolveRound(s, { p: { kind: 'defend' } }, rng);
    expect(s.log).toContainEqual({ type: 'frozen', actor: 'e0' });
    expect(s.log.some((e) => e.type === 'act' && e.actor === 'e0')).toBe(false);
    expect(s.party[0].hp).toBe(100);
    expect(s.enemies[0].frozen).toBeUndefined();
    expect(s.enemies[0].freezeGuard).toBe(2);
    for (const guard of [2, 1]) {
      expect(s.enemies[0].freezeGuard).toBe(guard);
      const r = counting(0);
      inflictAilment(s.party[0], s.enemies[0], 'freeze', 1, fx(r));
      expect(s.enemies[0].frozen).toBeUndefined();
      expect(r.n).toBe(0);
      s = resolveRound(s, { p: { kind: 'defend' } }, rng);
    }
    expect(s.enemies[0].freezeGuard).toBeUndefined();
    inflictAilment(s.party[0], s.enemies[0], 'freeze', 1, fx());
    expect(s.enemies[0].frozen).toBe(true);
  });

  it('the freeze takes the turn before sleep does', () => {
    const s = resolveRound(makeBattle([P('p')], [E('e0', { frozen: true, sleep: 2 })]), { p: { kind: 'defend' } }, rng);
    expect(s.log.filter((e) => e.type === 'frozen' || e.type === 'asleep')).toEqual([{ type: 'frozen', actor: 'e0' }]);
    expect(s.enemies[0].sleep).toBe(2);
  });

  it('a frozen member loses the turn too', () => {
    const s = resolveRound(makeBattle([P('p', { frozen: true })], [E('e0', { sleep: 3 })]), { p: { kind: 'attack', target: 'e0' } }, rng);
    expect(s.log).toContainEqual({ type: 'frozen', actor: 'p' });
    expect(s.enemies[0].hp).toBe(100);
  });

  it('chill slows a boss by 30%', () => {
    const boss = E('b', { boss: true, chill: 2, max: { spd: 20 } as never });
    expect(stat(boss, 'spd')).toBe(14);
    let s = makeBattle([P('p')], [boss]);
    s = resolveRound(s, { p: { kind: 'defend' } }, rng);
    expect(s.enemies[0].chill).toBe(1);
    s = resolveRound(s, { p: { kind: 'defend' } }, rng);
    expect(s.enemies[0].chill).toBeUndefined();
    expect(stat(s.enemies[0], 'spd')).toBe(20);
  });

  it('a frozen boss does not exist: its turn is never skipped', () => {
    const s0 = makeBattle([P('p')], [E('b', { boss: true })]);
    inflictAilment(s0.party[0], s0.enemies[0], 'freeze', 1, fx());
    expect(s0.enemies[0].frozen).toBeUndefined();
    const s = resolveRound(s0, { p: { kind: 'defend' } }, rng);
    expect(s.log.some((e) => e.type === 'frozen')).toBe(false);
    expect(s.log).toContainEqual({ type: 'act', actor: 'b', label: '攻擊' });
  });

  it('a sleeper keeps sleeping through every tick', () => {
    const s = resolveRound(makeBattle([P('p')], [E('e0', { sleep: 3, poison: true, burn: { tick: 4, turns: 3, src: 'p' }, bleed: [{ tick: 2, turns: 3, src: 'p' }] })]), { p: { kind: 'defend' } }, rng);
    expect(s.log.filter((e) => e.type === 'poison-tick' || e.type === 'dot-tick').map((e) => e.type)).toEqual(['poison-tick', 'dot-tick', 'dot-tick']);
    expect(s.enemies[0].hp).toBe(100 - 10 - 4 - 2);
    expect(s.enemies[0].sleep).toBe(2);   // only its own slept turn took a round off
  });

  it('a turret hit still wakes a sleeper', () => {
    const s = resolveRound(makeBattle([P('p', { mech: { kind: 'devices', devices: [{ skill: 'turret', kind: 'turret', power: 100, level: 1, turns: 2 }], cap: 2 } })], [E('e0', { sleep: 3 })]), { p: { kind: 'defend' } }, rng);
    expect(s.log).toContainEqual({ type: 'act', actor: 'p', label: '砲台' });
    expect(s.enemies[0].sleep).toBe(0);
  });

  it('a frozen foe shows 凍結中 as its intent', () => {
    const s = makeBattle([P('p')], [E('e0', { frozen: true }), E('e1')], { intents: { e0: { kind: 'attack', target: 'p' }, e1: { kind: 'attack', target: 'p' } } });
    expect(intentLabel(s, 'e0')).toBe('凍結中');
    expect(intentLabel(s, 'e1')).toBe('攻擊 → p');
  });

  it('death and cure clear every ailment', () => {
    const fallen = E('e0', { ...all, bleed: [...all.bleed] });
    dealDamage(fallen, 999);
    for (const k of ['burn', 'bleed', 'shock', 'frozen', 'freezeGuard', 'chill', 'poisonSrc'] as const) expect(fallen[k], k).toBeUndefined();
    expect(fallen.poison).toBe(false);
    expect(fallen.sleep).toBe(0);
    const cured = P('q', { ...all, bleed: [...all.bleed], poisonSrc: 'e0' });
    applyEffect(P('s'), cured, { kind: 'cure' }, fx());
    for (const k of ['burn', 'bleed', 'shock', 'frozen', 'chill', 'poisonSrc'] as const) expect(cured[k], k).toBeUndefined();
    expect(cured.poison).toBe(false);
    expect(cured.sleep).toBe(0);
    expect(cured.freezeGuard).toBe(1);
  });
});

describe('character mechanics (plan 8c)', () => {
  it('every fight starts from a fresh mechanic', () => {
    const party = fullParty(['hero', 'noel', 'rin', 'chizuru', 'selene']);
    const open = () => createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    const first = open();
    const by = (s: ReturnType<typeof open>) => Object.fromEntries(s.party.map((c) => [c.key, c.mech]));
    expect(by(first)).toEqual({ hero: undefined, noel: { kind: 'heat', heat: 0 }, rin: { kind: 'mark', marks: [], cap: 1 }, chizuru: { kind: 'barrier' }, selene: undefined });
    expect(first.barriers).toBeUndefined();
    expect(first.moon).toEqual({ phase: 'first' });
    // A fight that heats Noel up and marks a foe leaves nothing for the next one from the same party.
    const after = resolveRound(first, { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' }, rin: { kind: 'skill', skill: 'rin-mark', target: 'e0' } }, mulberry32(1));
    expect(after.party.find((c) => c.key === 'noel')?.mech).not.toEqual({ kind: 'heat', heat: 0 });
    expect(by(open())).toEqual(by(first));
    expect(open().moon).toEqual({ phase: 'first' });
    expect(open().barriers).toBeUndefined();
    for (const c of first.enemies) expect(c.mech).toBeUndefined();
    // Liz and Sylvie (plan 8c Task 4): no coins, no aim, at every fight's start.
    const other = fullParty(['hero', 'liz', 'sylvie', 'chizuru', 'selene']);
    const two = () => createBattle({ party: other, enemyIds: ['slime'], inventory: {}, revealed: {} });
    const t1 = two();
    expect(t1.party.find((c) => c.key === 'liz')?.mech).toEqual({ kind: 'coins', coins: 0 });
    expect(t1.party.find((c) => c.key === 'sylvie')?.mech).toEqual({ kind: 'aim', target: null, stacks: 0 });
    resolveRound(t1, { liz: { kind: 'attack', target: 'e0' }, sylvie: { kind: 'attack', target: 'e0' } }, mulberry32(1));
    expect(Object.fromEntries(two().party.map((c) => [c.key, c.mech]))).toEqual(Object.fromEntries(t1.party.map((c) => [c.key, c.mech])));
    for (const c of t1.enemies) expect([c.appraised, c.delay]).toEqual([undefined, undefined]);
    // Scarlet and Safira (Task 5): no embers, no beat, nothing standing in, at every fight's start.
    const third = fullParty(['hero', 'scarlet', 'safira', 'chizuru', 'selene']);
    const t3 = createBattle({ party: third, enemyIds: ['slime'], inventory: {}, revealed: {} });
    expect(t3.party.find((c) => c.key === 'scarlet')?.mech).toEqual({ kind: 'embers', embers: 0 });
    expect(t3.party.find((c) => c.key === 'safira')?.mech).toEqual({ kind: 'beat', beat: 0, last: null });
    for (const c of t3.party) expect([c.cover, c.riposte], c.key).toEqual([undefined, undefined]);
    // Bobby (Task 6): no devices; and no echo for the hero to repeat.
    const fourth = fullParty(['hero', 'bobby', 'noel', 'chizuru', 'selene']);
    const t4 = () => createBattle({ party: fourth, enemyIds: ['slime'], inventory: {}, revealed: {} });
    const f4 = t4();
    expect(f4.party.find((c) => c.key === 'bobby')?.mech).toEqual({ kind: 'devices', devices: [], cap: 2 });
    expect(f4.echo).toBeUndefined();
    const played = resolveRound(f4, { bobby: { kind: 'skill', skill: 'turret' }, noel: { kind: 'skill', skill: 'fire-star', target: 'e0' } }, mulberry32(1));
    expect(played.echo).toBeDefined();
    expect(t4().party.find((c) => c.key === 'bobby')?.mech).toEqual({ kind: 'devices', devices: [], cap: 2 });
    expect(t4().echo).toBeUndefined();
    for (const c of f4.party) expect('turret' in c, c.key).toBe(false);
  });
});
