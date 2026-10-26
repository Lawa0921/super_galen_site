import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createBattle, intentLabel, planEnemies, resolveRound, rewards, type Action, type BattleState } from './battle';
import { constRng, fullParty, makeBattle, makeCombatant } from './testing';
import { LEGACY_LINEUP } from './party';
import { mulberry32, type Rng } from './rng';
import { applyEffect } from './skills';
import { ENEMIES } from '../data/enemies';
import { LEGACY_ENEMY_IDS } from '../data/monsters';
import type { Effect, EnemyDef, EnemySkill } from './types';
import type { Combatant } from './combatant';

/** Roster plan B2–B4 (spec §6.2): the foes' mechanics, each named as the spec's test duties name it. */

const P = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', ...over });
const E = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'enemy', ...over });
const hit = (power: number): Effect => ({ kind: 'damage', power, element: 'phys', scale: 'atk', melee: true });
/** A foe definition: the slime's numbers with these skills. */
const def = (skills: EnemySkill[], over: Partial<EnemyDef> = {}): EnemyDef => ({ ...ENEMIES.slime, skills, ...over });
/** Everyone in the party defends. */
const defend = (s: BattleState): Record<string, Action> => Object.fromEntries(s.party.map((c) => [c.key, { kind: 'defend' as const }]));
/** A counting rng: always `v`, and how many times it was drawn. */
const counted = (v = 0.5) => { const r = { n: 0, rng: (() => { r.n++; return v; }) as Rng }; return r; };
const acted = (s: BattleState, key: string) => s.log.filter((e) => e.type === 'act' && e.actor === key).map((e) => (e as { label: string }).label);
const hitsOn = (s: BattleState, key: string) => s.log.filter((e) => e.type === 'damage' && e.target === key).length;

describe('old foes act as before (roster plan B2)', () => {
  it('old foes act as before', () => {
    // The ten legacy definitions' plans and first round, 200 seeds each, hashed before the roster mechanics went in.
    const party = fullParty(LEGACY_LINEUP);
    const all: unknown[] = [];
    for (const id of LEGACY_ENEMY_IDS) {
      for (let seed = 1; seed <= 200; seed++) {
        const rng = mulberry32(seed);
        const s = createBattle({ party, enemyIds: [id, id, 'slime'], boss: !!ENEMIES[id].boss, inventory: {}, revealed: {}, scale: { depth: 12, region: 'mainline' } });
        planEnemies(s, rng);
        const after = resolveRound(s, defend(s), rng);
        all.push([id, seed, s.intents, after.intents, after.log.length, after.party.map((c) => c.hp)]);
      }
    }
    expect(createHash('sha256').update(JSON.stringify(all)).digest('hex')).toBe('9c6cdc2f9b9aff1b73f7310a29c91e7554340861ee8279f509360c6306f47151');
  });
});

describe('M1 wind-up (roster plan B2)', () => {
  /** A hound that winds up 伏低 before 撲咬, and a member it hits. */
  const hound = (skills: EnemySkill[] = [{ name: '撲咬', chance: 1, target: 'enemy', windup: '伏低', effects: [hit(230)] }]) =>
    makeBattle([P('scarlet')], [E('e0', { name: '霧根獵犬' })], { enemyDefs: { e0: def(skills) } });

  it('lands the round after its wind-up', () => {
    const r1 = resolveRound(hound(), defend(hound()), constRng(0.5));
    expect(acted(r1, 'e0')).toEqual(['伏低']);
    expect(hitsOn(r1, 'scarlet')).toBe(0);
    expect(r1.enemies[0].winding).toBe(0);
    const r2 = resolveRound(r1, defend(r1), constRng(0.5));
    expect(acted(r2, 'e0')).toEqual(['撲咬']);
    expect(hitsOn(r2, 'scarlet')).toBe(1);
    expect(r2.enemies[0].winding).toBeUndefined();
    // And then it winds up again.
    const r3 = resolveRound(r2, defend(r2), constRng(0.5));
    expect(acted(r3, 'e0')).toEqual(['伏低']);
  });

  it('sleep breaks a charge', () => {
    const r1 = resolveRound(hound(), defend(hound()), constRng(0.5));
    // Asleep at its blow: the turn is lost and the charge with it.
    const slept = structuredClone(r1);
    slept.enemies[0].sleep = 1;
    const r2 = resolveRound(slept, defend(slept), constRng(0.5));
    expect(acted(r2, 'e0')).toEqual([]);
    expect(hitsOn(r2, 'scarlet')).toBe(0);
    expect(r2.enemies[0].winding).toBeUndefined();
    // A sleep that lands on it breaks the charge even when a hit wakes it before it acts: it attacks plainly.
    const s = structuredClone(r1);
    const ctx = { rng: constRng(0), itemBoost: false, revealed: {}, log: [], battle: s };
    applyEffect(s.party[0], s.enemies[0], { kind: 'inflict', status: 'sleep', chance: 1 }, ctx);
    expect(s.enemies[0].winding).toBeUndefined();
    s.enemies[0].sleep = 0;
    const r3 = resolveRound(s, defend(s), constRng(0.5));
    expect(acted(r3, 'e0')).toEqual(['攻擊']);
  });

  it('freeze breaks a charge', () => {
    const r1 = resolveRound(hound(), defend(hound()), constRng(0.5));
    const s = structuredClone(r1);
    const ctx = { rng: constRng(0), itemBoost: false, revealed: {}, log: [], battle: s };
    applyEffect(s.party[0], s.enemies[0], { kind: 'inflict', status: 'freeze', chance: 1 }, ctx);
    expect(s.enemies[0].frozen).toBe(true);
    expect(s.enemies[0].winding).toBeUndefined();
    const r2 = resolveRound(s, defend(s), constRng(0.5));
    expect(acted(r2, 'e0')).toEqual([]);
    expect(hitsOn(r2, 'scarlet')).toBe(0);
  });

  it('shows in intentLabel', () => {
    const s = hound();
    planEnemies(s, constRng(0.5));
    expect(intentLabel(s, 'e0')).toBe('蓄力：撲咬');
    const r1 = resolveRound(s, defend(s), constRng(0.5));
    expect(intentLabel(r1, 'e0')).toBe('撲咬 → scarlet');
  });

  it('draws nothing while winding', () => {
    // Two skills: the first never comes (chance 0), so a free foe's findIndex draws twice; a winding one draws neither.
    const two: EnemySkill[] = [{ name: '空', chance: 0, target: 'enemy', effects: [hit(100)] }, { name: '撲咬', chance: 1, target: 'enemy', windup: '伏低', effects: [hit(230)] }];
    const free = counted(), wound = counted();
    planEnemies(hound(two), free.rng);
    const s = hound(two);
    s.enemies[0].winding = 1;
    planEnemies(s, wound.rng);
    expect(free.n - wound.n).toBe(2);
    expect(s.intents!.e0).toEqual({ kind: 'enemy-skill', index: 1, target: 'scarlet', charged: true });
  });
});

describe('M2 guard (roster plan B2)', () => {
  const field = (over: Partial<Combatant> = {}) =>
    makeBattle([P('scarlet', { max: { atk: 60 } as never })], [E('e0', { name: '錫兵', cover: { ally: 'e1', turns: 2 }, ...over }), E('e1', { name: '幽影' })]);

  it('takes single-target hits', () => {
    const r = resolveRound(field(), { scarlet: { kind: 'attack', target: 'e1' } }, constRng(0.5));
    expect(hitsOn(r, 'e0')).toBe(1);
    expect(hitsOn(r, 'e1')).toBe(0);
    // A sleeping guard guards no one.
    const asleep = resolveRound(field({ sleep: 3 }), { scarlet: { kind: 'attack', target: 'e1' } }, constRng(0.5));
    expect(hitsOn(asleep, 'e1')).toBe(1);
    // A skill on one foe is turned as an attack is.
    const s2 = field();
    s2.party[0].tp = 50;
    const r2 = resolveRound(s2, { scarlet: { kind: 'skill', skill: 'fire-star', target: 'e1' } }, constRng(0.5));
    expect(hitsOn(r2, 'e0')).toBe(1);
    expect(hitsOn(r2, 'e1')).toBe(0);
  });

  it('area ignores a guard', () => {
    const s = field();
    s.party[0].tp = 50;
    const r = resolveRound(s, { scarlet: { kind: 'skill', skill: 'sweep' } }, constRng(0.5));
    expect(hitsOn(r, 'e0')).toBe(1);
    expect(hitsOn(r, 'e1')).toBe(1);
  });

  it('ends after its turns', () => {
    // 列隊 guards the ally most hurt but itself, for two rounds.
    const s = makeBattle([P('scarlet')], [E('e0'), E('e1', { hp: 50 }), E('e2', { hp: 90 })], {
      enemyDefs: { e0: def([{ name: '列隊', chance: 1, target: 'ally', effects: [{ kind: 'cover', turns: 2 }] }]) },
    });
    s.enemies[0].hp = 10;   // the most hurt is itself: it guards the next most hurt
    const r1 = resolveRound(s, defend(s), constRng(0.5));
    expect(acted(r1, 'e0')).toEqual(['列隊']);
    expect(r1.enemies[0].cover).toEqual({ ally: 'e1', turns: 1 });
    const quiet = structuredClone(r1);
    quiet.enemies[0].sleep = 9;
    const r2 = resolveRound(quiet, defend(quiet), constRng(0.5));
    expect(r2.enemies[0].cover).toBeUndefined();
  });
});

describe('M24 hunt (roster plan B2)', () => {
  const field = (noel: Partial<Combatant> = {}, scarlet: Partial<Combatant> = {}) => {
    const s = makeBattle([P('scarlet', scarlet), P('noel', noel)], [E('e0')], { round: 1 });
    s.intents = { e0: { kind: 'attack', target: 'scarlet' } };
    return s;
  };
  const both: Record<string, Action> = { scarlet: { kind: 'attack', target: 'e0' }, noel: { kind: 'attack', target: 'e0' } };

  it('focuses the hunted member', () => {
    const r = resolveRound(field({ hunted: 2 }), both, constRng(0.5));
    expect(hitsOn(r, 'noel')).toBe(1);
    expect(hitsOn(r, 'scarlet')).toBe(0);
    // The hunt goes with the round.
    expect(r.party[1].hunted).toBeUndefined();
    // The skill that calls a hunt marks its target for the next round, and the plan shows the blow on it.
    const caller = makeBattle([P('scarlet'), P('noel')], [E('e0'), E('e1')], {
      enemyDefs: { e0: def([{ name: '宣告', chance: 1, target: 'enemy', effects: [{ kind: 'hunt' }] }]), e1: def([]) },
    });
    caller.intents = { e0: { kind: 'enemy-skill', index: 0, target: 'noel' }, e1: { kind: 'attack', target: 'scarlet' } };
    const r1 = resolveRound(caller, defend(caller), constRng(0.5));
    expect(r1.party[1].hunted).toBe(2);
    expect(r1.intents!.e1.shownTarget ?? r1.intents!.e1.target).toBe('noel');
  });

  it('taunt overrides', () => {
    const r = resolveRound(field({ hunted: 2 }, { taunt: 2 }), both, constRng(0.5));
    expect(hitsOn(r, 'scarlet')).toBe(1);
    expect(hitsOn(r, 'noel')).toBe(0);
  });

  it('defending lifts the hunt', () => {
    const r = resolveRound(field({ hunted: 2 }), { scarlet: { kind: 'attack', target: 'e0' }, noel: { kind: 'defend' } }, constRng(0.5));
    expect(hitsOn(r, 'scarlet')).toBe(1);
    expect(hitsOn(r, 'noel')).toBe(0);
    expect(r.party[1].hunted).toBeUndefined();
  });
});

describe('M3 flee (roster plan B3)', () => {
  /** A treasure foe that flees after `n` rounds, beside a slime; the party only defends. */
  const field = (n: number) => makeBattle([P('scarlet')], [E('e0', { name: '拾憶鼠' }), E('e1')], { enemyDefs: { e0: def([], { fleeAfter: n }) } });

  it('flees at the end of round N', () => {
    let s = field(3);
    for (let r = 1; r <= 2; r++) {
      s = resolveRound(s, defend(s), constRng(0.5));
      expect(s.enemies[0].alive, `round ${r}`).toBe(true);
    }
    s = resolveRound(s, defend(s), constRng(0.5));
    expect(s.enemies[0]).toMatchObject({ alive: false, left: true });
    expect(s.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'flee' });
    // Gone, it is no one's target and makes no plan.
    expect(s.intents!.e0).toBeUndefined();
    expect(s.outcome).toBe('ongoing');
  });

  it('a fled foe pays nothing and takes no loot or rune draw', () => {
    let s = field(1);
    s = resolveRound(s, defend(s), constRng(0.5));
    s.enemies[1].hp = 0;
    s.enemies[1].alive = false;
    const solo = { ...s, enemies: [s.enemies[1]], enemyDefs: {} };
    expect(rewards(s, constRng(0), false)).toEqual(rewards(solo, constRng(0), false));
  });

  it('a foe that falls before its round does not flee', () => {
    let s = field(1);
    s.enemies[0].hp = 1;
    s = resolveRound(s, { scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(s.enemies[0].left).toBeUndefined();
    expect(s.log.some((e) => e.type === 'foe' && e.cue === 'flee')).toBe(false);
  });
});

describe('M13 steal (roster plan B3)', () => {
  const steal = (perDepth = 5): EnemySkill => ({ name: '順手牽羊', chance: 1, target: 'enemy', effects: [hit(50), { kind: 'steal', perDepth }] });
  /** A thief beside a slime; the party's run pack holds `gold` at depth 4 (cap 20 a steal). */
  const field = (gold: number, over: Partial<EnemyDef> = {}) =>
    makeBattle([P('scarlet', { max: { hp: 999 } as never })], [E('e0', { name: '吆喝聲' }), E('e1')], { enemyDefs: { e0: def([steal()], over) }, purse: { gold, depth: 4 } });

  it('takes from the pack, up to depth × perDepth', () => {
    const r = resolveRound(field(100), defend(field(100)), constRng(0.5));
    expect(r.purse).toEqual({ gold: 80, depth: 4 });
    expect(r.enemies[0].stolen).toBe(20);
    expect(r.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'steal', target: 'scarlet', amount: 20 });
  });

  it('never below zero', () => {
    let s = field(3);
    s = resolveRound(s, defend(s), constRng(0.5));
    expect(s.purse!.gold).toBe(0);
    expect(s.enemies[0].stolen).toBe(3);
    s = resolveRound(s, defend(s), constRng(0.5));
    expect(s.purse!.gold).toBe(0);
    expect(s.enemies[0].stolen).toBe(3);
  });

  it('only a landed hit steals', () => {
    const s = field(100);
    s.party[0].x = { evasion: 100000 };
    const r = resolveRound(s, defend(s), constRng(0.1));
    expect(r.purse!.gold).toBe(100);
    expect(r.enemies[0].stolen).toBeUndefined();
  });

  it('returns on a kill', () => {
    const s = resolveRound(field(100), defend(field(100)), constRng(0.5));
    for (const e of s.enemies) { e.hp = 0; e.alive = false; }
    s.outcome = 'win';
    const paid = rewards(s, constRng(0.99), false);
    const none = rewards({ ...s, enemies: s.enemies.map((e) => ({ ...e, stolen: undefined })) }, constRng(0.99), false);
    expect(paid.returned).toBe(20);
    expect(paid.gold).toBe(none.gold + 20);
    expect(none.returned).toBeUndefined();
  });

  it('a warden returns twice', () => {
    const s = resolveRound(field(100, { rank: 'warden' }), defend(field(100)), constRng(0.5));
    for (const e of s.enemies) { e.hp = 0; e.alive = false; }
    s.outcome = 'win';
    expect(rewards(s, constRng(0.99), false).returned).toBe(40);
  });

  it('lost on a flee', () => {
    const s = resolveRound(field(100), defend(field(100)), constRng(0.5));
    s.enemies[0].alive = false;
    s.enemies[0].left = true;
    s.enemies[1].hp = 0;
    s.enemies[1].alive = false;
    s.outcome = 'win';
    expect(rewards(s, constRng(0.99), false).returned).toBeUndefined();
  });

  it('the sim steals nothing', () => {
    // A fight with no purse (the sim has no run): the hit lands and nothing is taken.
    const s = makeBattle([P('scarlet', { max: { hp: 999 } as never })], [E('e0')], { enemyDefs: { e0: def([steal()]) } });
    const r = resolveRound(s, defend(s), constRng(0.5));
    expect(hitsOn(r, 'scarlet')).toBe(1);
    expect(r.enemies[0].stolen).toBeUndefined();
    expect(r.log.some((e) => e.type === 'foe')).toBe(false);
  });
});

describe('M14 openers (roster plan B3)', () => {
  const party = () => fullParty(LEGACY_LINEUP);
  /** A fight with one roster-shaped foe whose definition opens its own way. */
  const open = (opener: NonNullable<EnemyDef['opener']>, skills: EnemySkill[] = []) => {
    const was = ENEMIES.slime;
    try {
      (ENEMIES as Record<string, EnemyDef>).slime = { ...was, opener, skills, stats: { ...was.stats, hp: 9999, spd: 1 } };
      return createBattle({ party: party(), enemyIds: ['slime'], inventory: {}, revealed: {} });
    } finally {
      (ENEMIES as Record<string, EnemyDef>).slime = was;
    }
  };
  const defendAll = (s: BattleState) => Object.fromEntries(s.party.filter((c) => c.alive).map((c) => [c.key, { kind: 'defend' as const }]));

  it('asleep wakes on a hit or by round three', () => {
    let s = open('asleep');
    expect(s.enemies[0].sleep).toBe(2);
    // Left alone it sleeps two rounds and wakes in the third, angrier.
    s = resolveRound(s, defendAll(s), constRng(0.5));
    s = resolveRound(s, defendAll(s), constRng(0.5));
    expect(acted(s, 'e0')).toEqual([]);
    s = resolveRound(s, defendAll(s), constRng(0.5));
    expect(acted(s, 'e0')).toEqual(['攻擊']);
    expect(s.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'wake' });
    expect(s.enemies[0].buffs).toContainEqual(expect.objectContaining({ stat: 'atk', pct: 50 }));
    // A hit wakes it at once: slower than the party, it acts in that very round, angrier.
    const h = open('asleep');
    const r1 = resolveRound(h, { ...defendAll(h), scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(r1.enemies[0].sleep).toBe(0);
    expect(acted(r1, 'e0')).toEqual(['攻擊']);
    expect(r1.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'wake' });
  });

  it('ambush acts first only in round one', () => {
    let s = open('ambush');
    s = resolveRound(s, defendAll(s), constRng(0.5));
    const order = (b: BattleState) => b.log.filter((e) => e.type === 'act').map((e) => (e as { actor: string }).actor);
    expect(order(s)[0]).toBe('e0');
    s = resolveRound(s, defendAll(s), constRng(0.5));
    expect(order(s).at(-1)).toBe('e0');   // the slowest, as it is
  });

  it('disguise lifts on the first hit', () => {
    let s = open('disguise');
    const foe = () => s.enemies[0];
    expect(foe().name).toBe('寶箱？');
    expect(foe().disguised).toBe(ENEMIES.slime.name);
    expect(foe().buffs).toContainEqual(expect.objectContaining({ stat: 'atk', pct: 50, turns: 1 }));
    // It springs first in round one, still in disguise while no hit lands on it.
    s = resolveRound(s, defendAll(s), constRng(0.5));
    expect(s.log.find((e) => e.type === 'act')).toMatchObject({ actor: 'e0' });
    expect(foe().name).toBe('寶箱？');
    expect(foe().buffs.some((b) => b.stat === 'atk')).toBe(false);   // the first round's bite only
    s = resolveRound(s, { ...defendAll(s), scarlet: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(foe().name).toBe(ENEMIES.slime.name);
    expect(foe().disguised).toBeUndefined();
    expect(s.log).toContainEqual({ type: 'foe', actor: 'e0', cue: 'reveal' });
  });
});
